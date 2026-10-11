  (function() {
            'use strict';

            // ---------- CONFIG ----------
            const API_BASE = 'https://rockwin.onrender.com';
            let currentFilter = 'all';
            let selectedUserId = null;
            let pendingSaveData = null;
            let currentRole = 'super_admin';

            // ---------- AUTH TOKEN (from localStorage) ----------
            function getToken() {
                return localStorage.getItem('token');
            }

            // ---------- HELPER: API REQUEST ----------
            async function apiFetch(endpoint, options = {}) {
                const token = getToken();
                if (!token) {
                    // If no token, redirect to login
                    window.location.href = 'login.html';
                    throw new Error('No authentication token');
                }
                const headers = {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    ...(options.headers || {})
                };
                const response = await fetch(`${API_BASE}${endpoint}`, {
                    ...options,
                    headers
                });
                if (!response.ok) {
                    const data = await response.json().catch(() => ({}));
                    throw new Error(data.error || `HTTP ${response.status}`);
                }
                return response.json();
            }

            // ---------- DOM REFS ----------
            const tbody = document.getElementById('userTableBody');
            const searchInput = document.getElementById('searchInput');
            const drawer = document.getElementById('drawer');
            const drawerOverlay = document.getElementById('drawerOverlay');
            const modal = document.getElementById('confirmModal');
            const toastContainer = document.getElementById('toastContainer');
            const broadcastModal = document.getElementById('broadcastModal');

            // ---------- ROLE SELECTOR ----------
            document.getElementById('roleSelector').addEventListener('change', function() {
                currentRole = this.value;
                showToast(`🔑 Switched to ${currentRole.replace('_', ' ')} role`, 'info');
            });

            // ---------- SHOW TOAST ----------
            function showToast(message, type = 'success') {
                const toast = document.createElement('div');
                toast.className = `toast ${type}`;
                const iconMap = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
                toast.innerHTML = `
                    <span class="toast-icon">${iconMap[type] || 'ℹ️'}</span>
                    <span class="toast-msg">${message}</span>
                `;
                toastContainer.appendChild(toast);
                setTimeout(() => {
                    toast.style.opacity = '0';
                    toast.style.transform = 'translateX(20px)';
                    setTimeout(() => toast.remove(), 300);
                }, 4000);
            }
            window.showToast = showToast;

            // ---------- LOAD STATS ----------
            async function loadStats() {
                try {
                    const data = await apiFetch('/api/admin/stats');
                    document.getElementById('totalUsers').textContent = data.totalUsers || 0;
                    document.getElementById('totalBalance').textContent = 'KES ' + (data.totalBalance || 0).toLocaleString(
                        'en-KE', { minimumFractionDigits: 0 });
                    document.getElementById('activeUsers').textContent = data.activeUsers || 0;
                    document.getElementById('suspendedUsers').textContent = data.suspendedUsers || 0;
                    document.getElementById('todayDeposits').textContent = data.todayDeposits || 0;
                    document.getElementById('todayWithdrawals').textContent = data.todayWithdrawals || 0;
                    document.getElementById('pendingKyc').textContent = data.pendingUsers || 0;
                    document.getElementById('newAccountsToday').textContent = data.newAccountsToday || 0;
                } catch (err) {
                    console.error('Stats error:', err);
                    // Show placeholder values
                }
            }

            // ---------- LOAD USERS ----------
            let allUsers = [];

            async function loadUsers() {
                try {
                    const data = await apiFetch('/api/admin/users');
                    allUsers = data.users || [];
                    renderTable();
                } catch (err) {
                    console.error('Load users error:', err);
                    showToast('Failed to load users. Please refresh.', 'error');
                }
            }

            // ---------- RENDER TABLE ----------
            function renderTable() {
                const searchTerm = searchInput.value.toLowerCase().trim();
                const filtered = allUsers.filter(u => {
                    const match = u.fullName.toLowerCase().includes(searchTerm) ||
                        u.phoneNumber.includes(searchTerm) ||
                        u.idNumber.includes(searchTerm) ||
                        u.accountNumber.toLowerCase().includes(searchTerm);
                    if (!match) return false;
                    if (currentFilter === 'all') return true;
                    if (currentFilter === 'high_risk') return u.risk === 'high';
                    return u.status === currentFilter;
                });

                if (filtered.length === 0) {
                    tbody.innerHTML = `
                        <tr>
                            <td colspan="8">
                                <div class="empty-state">
                                    <div class="icon">🔍</div>
                                    <p>No users match your search or filter.</p>
                                </div>
                            </td>
                        </tr>
                    `;
                } else {
                    tbody.innerHTML = filtered.map(u => {
                        const initials = u.fullName.split(' ').map(n => n[0]).join('').toUpperCase();
                        const avatarColor = u.status === 'active' ? 'green' : u.status === 'suspended' ? 'red' :
                            'yellow';
                        const lastLoginDisplay = u.lastLogin ? formatLastLogin(u.lastLogin) :
                            '<span class="never">Never</span>';
                        const riskLabel = u.risk.charAt(0).toUpperCase() + u.risk.slice(1);

                        return `
                        <tr>
                            <td>
                                <div class="user-cell">
                                    <div class="avatar ${avatarColor}">${initials}</div>
                                    <div>
                                        <div class="name">${u.fullName}</div>
                                        <div class="user-meta">${u.accountNumber}</div>
                                    </div>
                                </div>
                            </td>
                            <td class="phone">${u.phoneNumber}</td>
                            <td class="acc-num">${u.accountNumber}</td>
                            <td style="font-weight:600; color:var(--accent-green);">
                                KES ${u.balance.toLocaleString('en-KE', {minimumFractionDigits:2})}
                            </td>
                            <td>
                                <span class="status-badge ${u.status}">
                                    <span class="dot"></span> ${u.status}
                                </span>
                            </td>
                            <td>
                                <span class="risk-badge ${u.risk}">${riskLabel}</span>
                            </td>
                            <td class="last-login ${u.lastLogin ? 'recent' : 'never'}">${lastLoginDisplay}</td>
                            <td style="text-align:center;">
                                <div class="action-dropdown">
                                    <button class="dropdown-toggle" onclick="toggleDropdown(event, '${u.id}')">Actions ▾</button>
                                    <div class="dropdown-menu" id="dropdown-${u.id}">
                                        <button onclick="openDrawer('${u.id}')">✏️ Edit Profile</button>
                                        <button onclick="openDrawer('${u.id}'); switchTab('transactions')">📊 Transactions</button>
                                        <button onclick="openDrawer('${u.id}'); switchTab('activity')">📋 Activity</button>
                                        <button class="danger" onclick="freezeUser('${u.id}')">🔒 Freeze Account</button>
                                    </div>
                                </div>
                            </td>
                        </tr>
                    `}).join('');
                }

                // Re-apply stats after rendering (they are already loaded)
            }

            // ---------- FORMAT LAST LOGIN ----------
            function formatLastLogin(dateStr) {
                if (!dateStr) return 'Never';
                const date = new Date(dateStr);
                const now = new Date();
                const diff = now - date;
                const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                if (days === 0) return 'Today';
                if (days === 1) return 'Yesterday';
                if (days < 7) return `${days} days ago`;
                return date.toLocaleDateString('en-KE');
            }

            // ---------- FILTERS ----------
            window.setFilter = function(filter, btn) {
                currentFilter = filter;
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderTable();
            };

            window.filterTable = function() {
                renderTable();
            };

            // ---------- DROPDOWN ----------
            window.toggleDropdown = function(event, userId) {
                event.stopPropagation();
                const menu = document.getElementById(`dropdown-${userId}`);
                const isOpen = menu.classList.contains('open');
                document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('open'));
                if (!isOpen) menu.classList.add('open');
            };

            document.addEventListener('click', function() {
                document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('open'));
            });

            // ---------- DRAWER ----------
            window.openDrawer = async function(userId) {
                try {
                    const data = await apiFetch(`/api/admin/users/${userId}`);
                    const user = data.user;
                    const transactions = data.transactions || [];

                    selectedUserId = userId;
                    document.getElementById('drawerUserId').value = userId;
                    document.getElementById('drawerUserName').innerHTML = `
                        ${user.fullName}
                        <small id="drawerUserAcc">${user.accountNumber}</small>
                    `;
                    document.getElementById('drawerFullName').value = user.fullName;
                    document.getElementById('drawerPhone').value = user.phoneNumber;
                    document.getElementById('drawerIdNumber').value = user.idNumber;
                    document.getElementById('drawerStatus').value = user.status;
                    document.getElementById('drawerRisk').value = user.risk || 'low';
                    document.getElementById('drawerCurrentBalance').textContent = 'KES ' + user.balance.toLocaleString(
                        'en-KE', { minimumFractionDigits: 2 });
                    document.getElementById('drawerAdjustmentAmount').value = '';
                    document.getElementById('drawerAdjustmentReason').value = '';
                    document.getElementById('drawerNewBalancePreview').textContent = 'KES ' + user.balance.toLocaleString(
                        'en-KE', { minimumFractionDigits: 2 });

                    // Update transaction tab
                    const txList = document.getElementById('drawerTransactionList');
                    if (transactions.length === 0) {
                        txList.innerHTML =
                            '<div style="text-align:center;color:var(--text-muted);padding:1rem;">No transactions found.</div>';
                    } else {
                        txList.innerHTML = transactions.map(t => `
                            <div class="timeline-item">
                                <div class="time">${new Date(t.createdAt).toLocaleDateString('en-KE')}</div>
                                <div class="content">
                                    <div class="action">${t.description}</div>
                                    <div class="detail">${t.type === 'credit' ? '+' : '-'} KES ${t.amount.toFixed(2)} · Balance: KES ${t.balanceAfter.toFixed(2)}</div>
                                    <span class="badge-timeline ${t.type}">${t.type}</span>
                                </div>
                            </div>
                        `).join('');
                    }

                    // Update activity tab (mock or from audit log? We'll leave placeholder)
                    // You can fetch activity from a separate endpoint if available
                    const activityList = document.getElementById('drawerActivityList');
                    activityList.innerHTML = `
                        <div class="timeline-item">
                            <div class="time">Now</div>
                            <div class="content">
                                <div class="action">🔄 User details loaded</div>
                                <div class="detail">Admin viewed profile</div>
                            </div>
                        </div>
                        <div class="timeline-item">
                            <div class="time">${new Date(user.createdAt).toLocaleString('en-KE')}</div>
                            <div class="content">
                                <div class="action">📝 Account Created</div>
                                <div class="detail">User registered on the platform</div>
                            </div>
                        </div>
                    `;

                    switchTab('profile');
                    drawer.classList.add('open');
                    drawerOverlay.classList.add('open');
                } catch (err) {
                    console.error('Open drawer error:', err);
                    showToast('Failed to load user details.', 'error');
                }
            };

            window.closeDrawer = function() {
                drawer.classList.remove('open');
                drawerOverlay.classList.remove('open');
                pendingSaveData = null;
            };

            // ---------- TAB SWITCHING ----------
            window.switchTab = function(tabId) {
                document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.getElementById(`tab-${tabId}`).classList.add('active');
                document.querySelector(`.tab-btn[data-tab="${tabId}"]`).classList.add('active');
            };

            // ---------- LIVE BALANCE PREVIEW ----------
            document.getElementById('drawerAdjustmentAmount').addEventListener('input', function() {
                const userId = document.getElementById('drawerUserId').value;
                const user = allUsers.find(u => u.id === userId);
                if (!user) return;
                const amount = parseFloat(this.value);
                const type = document.getElementById('drawerAdjustmentType').value;
                const previewEl = document.getElementById('drawerNewBalancePreview');
                if (isNaN(amount) || amount <= 0) {
                    previewEl.textContent = 'KES ' + user.balance.toLocaleString('en-KE', { minimumFractionDigits: 2 });
                    return;
                }
                let newBalance = user.balance;
                if (type === 'credit') newBalance = user.balance + amount;
                else if (type === 'debit') newBalance = Math.max(0, user.balance - amount);
                else if (type === 'override') newBalance = amount;
                previewEl.textContent = 'KES ' + newBalance.toLocaleString('en-KE', { minimumFractionDigits: 2 });
            });

            document.getElementById('drawerAdjustmentType').addEventListener('change', function() {
                document.getElementById('drawerAdjustmentAmount').dispatchEvent(new Event('input'));
            });

            // ---------- SAVE DRAWER ----------
            window.saveDrawerChanges = function() {
                const userId = document.getElementById('drawerUserId').value;
                const user = allUsers.find(u => u.id === userId);
                if (!user) return;

                const newStatus = document.getElementById('drawerStatus').value;
                const newRisk = document.getElementById('drawerRisk').value;
                const adjustmentType = document.getElementById('drawerAdjustmentType').value;
                const adjustmentAmount = parseFloat(document.getElementById('drawerAdjustmentAmount').value);
                const adjustmentReason = document.getElementById('drawerAdjustmentReason').value.trim();

                const statusChanged = newStatus !== user.status;
                const riskChanged = newRisk !== (user.risk || 'low');
                const hasAdjustment = !isNaN(adjustmentAmount) && adjustmentAmount > 0;

                if (!statusChanged && !riskChanged && !hasAdjustment) {
                    showToast('No changes detected. Update something before saving.', 'warning');
                    return;
                }

                let newBalance = user.balance;
                if (hasAdjustment) {
                    if (adjustmentType === 'credit') newBalance = user.balance + adjustmentAmount;
                    else if (adjustmentType === 'debit') newBalance = Math.max(0, user.balance - adjustmentAmount);
                    else if (adjustmentType === 'override') newBalance = adjustmentAmount;
                }

                // Build confirmation detail
                let detailHtml = '';
                if (hasAdjustment) {
                    detailHtml +=
                        `<span class="old">KES ${user.balance.toLocaleString('en-KE', {minimumFractionDigits:2})}</span> → <span class="new">KES ${newBalance.toLocaleString('en-KE', {minimumFractionDigits:2})}</span>`;
                    if (adjustmentReason) detailHtml += `<br><small>Reason: ${adjustmentReason}</small>`;
                } else {
                    detailHtml += `Balance unchanged (KES ${user.balance.toLocaleString('en-KE', {minimumFractionDigits:2})})`;
                }
                if (statusChanged) detailHtml += `<br><small>Status: ${user.status} → ${newStatus}</small>`;
                if (riskChanged) detailHtml += `<br><small>Risk: ${user.risk || 'low'} → ${newRisk}</small>`;

                document.getElementById('modalChangeDetail').innerHTML = detailHtml;

                pendingSaveData = {
                    userId,
                    newBalance,
                    newStatus,
                    newRisk,
                    adjustmentType,
                    adjustmentAmount,
                    adjustmentReason,
                    hasAdjustment
                };
                modal.classList.add('open');
            };

            // ---------- CONFIRM SAVE ----------
            window.confirmSave = async function() {
                if (!pendingSaveData) return;
                const {
                    userId,
                    newBalance,
                    newStatus,
                    newRisk,
                    adjustmentType,
                    adjustmentAmount,
                    adjustmentReason,
                    hasAdjustment
                } = pendingSaveData;

                try {
                    // Update status/risk if changed
                    const user = allUsers.find(u => u.id === userId);
                    if (!user) return;

                    // If balance changed, call balance endpoint
                    if (hasAdjustment) {
                        await apiFetch(`/api/admin/users/${userId}/balance`, {
                            method: 'PUT',
                            body: JSON.stringify({
                                adjustmentType,
                                adjustmentAmount,
                                reason: adjustmentReason || 'Admin adjustment',
                                sendSms: true
                            })
                        });
                    }

                    // If status changed
                    if (newStatus !== user.status) {
                        await apiFetch(`/api/admin/users/${userId}/status`, {
                            method: 'PUT',
                            body: JSON.stringify({ status: newStatus })
                        });
                    }

                    // If risk changed (optional - you may need to add an endpoint for risk)
                    // For now, we'll just update in the local array and assume backend updates risk if supported
                    // You can add a PUT /api/admin/users/:id/risk if needed

                    showToast(`✅ Changes saved for ${user.fullName}!`, 'success');
                    closeModal();
                    closeDrawer();
                    // Reload users and stats
                    await loadUsers();
                    await loadStats();
                } catch (err) {
                    console.error('Save error:', err);
                    showToast(`❌ Failed to save: ${err.message}`, 'error');
                }
                pendingSaveData = null;
            };

            // ---------- FREEZE USER ----------
            window.freezeUser = async function(userId) {
                const user = allUsers.find(u => u.id === userId);
                if (!user) return;
                if (!confirm(`Are you sure you want to FREEZE ${user.fullName}'s account?`)) return;

                try {
                    await apiFetch(`/api/admin/users/${userId}/freeze`, {
                        method: 'PUT'
                    });
                    showToast(`🔒 ${user.fullName}'s account has been frozen.`, 'warning');
                    await loadUsers();
                    await loadStats();
                } catch (err) {
                    console.error('Freeze error:', err);
                    showToast(`❌ Failed to freeze: ${err.message}`, 'error');
                }
            };

            // ---------- BROADCAST SMS ----------
            window.openBroadcastModal = function() {
                broadcastModal.classList.add('open');
                document.getElementById('broadcastMessage').value = '';
                document.getElementById('broadcastRecipient').value = 'all';
                document.getElementById('specificPhoneGroup').style.display = 'none';
            };

            window.closeBroadcastModal = function() {
                broadcastModal.classList.remove('open');
            };

            document.getElementById('broadcastRecipient').addEventListener('change', function() {
                document.getElementById('specificPhoneGroup').style.display = this.value === 'specific' ? 'block' :
                    'none';
            });

            window.sendBroadcast = async function() {
                const message = document.getElementById('broadcastMessage').value.trim();
                const recipient = document.getElementById('broadcastRecipient').value;
                let recipients = [];
                if (recipient === 'all') {
                    // Send to all active users
                    recipients = allUsers.filter(u => u.status === 'active').map(u => u.phoneNumber);
                } else {
                    const phone = document.getElementById('broadcastPhone').value.trim();
                    if (!phone) {
                        showToast('Please enter a phone number.', 'error');
                        return;
                    }
                    recipients = [phone];
                }
                if (!message) {
                    showToast('Please enter a message.', 'error');
                    return;
                }

                try {
                    await apiFetch('/api/admin/broadcast-email', {
                        method: 'POST',
                        body: JSON.stringify({
                            recipients,
                            message,
                            targetAll: recipient === 'all'
                        })
                    });
                    showToast(`📢 Broadcast sent to ${recipients.length} recipient(s).`, 'success');
                    closeBroadcastModal();
                    await loadAudit(); // refresh audit log
                } catch (err) {
                    console.error('Broadcast error:', err);
                    showToast(`❌ Failed to send: ${err.message}`, 'error');
                }
            };

            // ---------- LOAD AUDIT LOG ----------
            async function loadAudit() {
                try {
                    const data = await apiFetch('/api/admin/audit-log');
                    const logs = data.logs || [];
                    const tbodyAudit = document.getElementById('auditTableBody');
                    if (logs.length === 0) {
                        tbodyAudit.innerHTML =
                            `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);">No admin actions logged yet.</td></tr>`;
                    } else {
                        tbodyAudit.innerHTML = logs.slice(0, 20).map(log => `
                            <tr>
                                <td class="audit-time">${new Date(log.createdAt).toLocaleString('en-KE', {hour12:false})}</td>
                                <td>${log.adminName}</td>
                                <td><strong>${log.action}</strong></td>
                                <td style="color:var(--text-secondary);">${log.details}</td>
                            </tr>
                        `).join('');
                    }
                } catch (err) {
                    console.error('Audit load error:', err);
                }
            }

            // ---------- AUDIT TOGGLE ----------
            window.toggleAudit = function() {
                const body = document.getElementById('auditBody');
                const icon = document.getElementById('auditToggleIcon');
                body.classList.toggle('open');
                icon.textContent = body.classList.contains('open') ? '▲' : '▼';
                if (body.classList.contains('open')) {
                    loadAudit();
                }
            };

            // ---------- EXPORT CSV ----------
            window.exportCSV = function() {
                // Simple CSV export
                const headers = ['Full Name', 'Phone', 'ID Number', 'Account Number', 'Balance', 'Status', 'Risk',
                    'Last Login'
                ];
                const rows = allUsers.map(u => [
                    u.fullName,
                    u.phoneNumber,
                    u.idNumber,
                    u.accountNumber,
                    u.balance,
                    u.status,
                    u.risk || 'low',
                    u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : 'Never'
                ]);
                const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
                const blob = new Blob([csvContent], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `equin-bank-users-${new Date().toISOString().slice(0,10)}.csv`;
                a.click();
                URL.revokeObjectURL(url);
                showToast('📊 CSV exported successfully.', 'success');
            };

            // ---------- LOGOUT ----------
            window.handleLogout = function() {
                if (confirm('Exit Admin Console?')) {
                    localStorage.removeItem('token');
                    window.location.href = 'login.html';
                }
            };

            // ---------- MODAL CONTROLS ----------
            window.closeModal = function() {
                modal.classList.remove('open');
                pendingSaveData = null;
            };
            modal.addEventListener('click', function(e) { if (e.target === this) closeModal(); });

            // ---------- ESCAPE KEY ----------
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    if (modal.classList.contains('open')) closeModal();
                    if (drawer.classList.contains('open')) closeDrawer();
                    if (broadcastModal.classList.contains('open')) closeBroadcastModal();
                }
            });

            // ---------- CHECK AUTH ----------
            async function checkAuth() {
                const token = getToken();
                if (!token) {
                    window.location.href = 'login.html';
                    return false;
                }
                return true;
            }

            // ---------- INIT ----------
            (async function init() {
                if (!await checkAuth()) return;
                try {
                    await loadStats();
                    await loadUsers();
                    // Load audit only if open by default
                    const auditBody = document.getElementById('auditBody');
                    if (auditBody.classList.contains('open')) {
                        await loadAudit();
                    }
                    console.log('🔐 Equin Bank Admin Console loaded (connected to Render).');
                } catch (err) {
                    console.error('Init error:', err);
                    showToast('Failed to load initial data. Please refresh.', 'error');
                }
            })();

        })();