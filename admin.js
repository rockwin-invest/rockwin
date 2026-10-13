(function() {
    'use strict';

    // ---------- CONFIG ----------
    const API_BASE = 'https://api.rockwininvestment.com';
    let currentFilter = 'all';
    let selectedUserId = null;
    let pendingSaveData = null;
    let currentRole = 'super_admin';
    let allUsers = [];

    // ---------- AUTH TOKEN ----------
    function getToken() {
        return localStorage.getItem('token');
    }

    // ---------- API REQUEST ----------
    async function apiFetch(endpoint, options = {}) {
        const token = getToken();
        if (!token) {
            window.location.href = 'login.html';
            throw new Error('No authentication token');
        }
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...(options.headers || {})
        };
        const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
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
    const roleSelector = document.getElementById('roleSelector');
    if (roleSelector) {
        roleSelector.addEventListener('change', function() {
            currentRole = this.value;
            showToast(`Switched to ${currentRole.replace('_', ' ')} role`, 'info');
        });
    }

    // ---------- BROADCAST RECIPIENT SELECT ----------
    const broadcastRecipientSelect = document.getElementById('broadcastRecipient');
    if (broadcastRecipientSelect) {
        broadcastRecipientSelect.addEventListener('change', function() {
            const grp = document.getElementById('specificPhoneGroup');
            if (grp) grp.style.display = this.value === 'specific' ? 'block' : 'none';
        });
    }

    // ---------- SHOW TOAST ----------
    function showToast(message, type = 'success') {
        if (!toastContainer) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const iconMap = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
        const iconEl = document.createElement('span');
        iconEl.className = 'toast-icon';
        iconEl.textContent = iconMap[type] || 'ℹ';
        const msgEl = document.createElement('span');
        msgEl.className = 'toast-msg';
        msgEl.textContent = message;
        toast.appendChild(iconEl);
        toast.appendChild(msgEl);
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
            const set = (id, val) => {
                const el = document.getElementById(id);
                if (el) el.textContent = val;
            };
            set('totalInvestors',       data.totalUsers || 0);
            set('totalAUM',            'KES ' + (data.totalBalance || 0).toLocaleString('en-KE', { maximumFractionDigits: 0 }));
            set('activeInvestors',      data.activeUsers || 0);
            set('suspendedAccounts',    data.suspendedUsers || 0);
            set('todayDeposits',        data.todayDeposits || 0);
            set('todayRedemptions',     data.todayWithdrawals || 0);
            set('pendingKyc',           data.pendingUsers || 0);
            set('interestAccruedToday','KES ' + (data.interestAccruedToday || 0).toLocaleString('en-KE', { maximumFractionDigits: 0 }));
        } catch (err) {
            console.error('Stats error:', err);
        }
    }

    // ---------- LOAD USERS ----------
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
        if (!tbody) return;
        const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';

        const filtered = allUsers.filter(u => {
            const match = (u.fullName || '').toLowerCase().includes(searchTerm) ||
                (u.phoneNumber || '').includes(searchTerm) ||
                (u.idNumber || '').includes(searchTerm) ||
                (u.accountNumber || '').toLowerCase().includes(searchTerm);
            if (!match) return false;
            if (currentFilter === 'all') return true;
            if (currentFilter === 'high_risk') return u.risk === 'high';
            return u.status === currentFilter;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="empty-cell">No investors match your search or filter.</td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = filtered.map(u => {
            const initials = (u.fullName || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
            const avatarColor = u.status === 'active' ? 'green' : u.status === 'suspended' ? 'red' : 'yellow';
            const lastLoginDisplay = u.lastLogin ? formatLastLogin(u.lastLogin) : '<span class="never">Never</span>';
            const riskLabel = (u.risk || 'low').charAt(0).toUpperCase() + (u.risk || 'low').slice(1);
            const portfolioValue = u.portfolioValue || 0;
            const unitsHeld = u.unitsHeld || 0;

            return `
            <tr>
                <td>
                    <div class="user-cell">
                        <div class="avatar ${avatarColor}">${initials}</div>
                        <div>
                            <div class="name">${u.fullName || '—'}</div>
                            <div class="user-meta">${u.accountNumber || ''}</div>
                        </div>
                    </div>
                </td>
                <td>${u.phoneNumber || '—'}</td>
                <td style="font-weight:500;color:var(--forest);font-family:var(--display);">
                    KES ${portfolioValue.toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                </td>
                <td>${unitsHeld.toFixed(4)}</td>
                <td>
                    <span class="status-badge ${u.status}">${u.status}</span>
                </td>
                <td>
                    <span class="risk-badge ${u.risk || 'low'}">${riskLabel}</span>
                </td>
                <td>${lastLoginDisplay}</td>
                <td class="align-right">
                    <button class="row-btn row-btn-neutral" onclick="openDrawer('${u.id}')" type="button">Open</button>
                </td>
            </tr>
            `;
        }).join('');
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

    // ---------- DRAWER ----------
    window.openDrawer = async function(userId) {
        try {
            const data = await apiFetch(`/api/admin/users/${userId}`);
            const user = data.user;
            const transactions = data.transactions || [];

            selectedUserId = userId;
            document.getElementById('drawerUserId').value = userId;
            document.getElementById('drawerUserName').textContent = user.fullName || 'Investor';
            document.getElementById('drawerUserAcc').textContent = user.accountNumber || '';

            document.getElementById('drawerFullName').value = user.fullName || '';
            document.getElementById('drawerPhone').value = user.phoneNumber || '';
            document.getElementById('drawerEmail').value = user.email || '';
            document.getElementById('drawerIdNumber').value = user.idNumber || '';
            document.getElementById('drawerStatus').value = user.status || 'active';
            document.getElementById('drawerRisk').value = user.risk || 'low';

            const portfolioValue = user.portfolioValue || 0;
            const unitsHeld = user.unitsHeld || 0;

            document.getElementById('drawerCurrentBalance').textContent = 'KES ' + portfolioValue.toLocaleString('en-KE', { minimumFractionDigits: 2 });
            document.getElementById('drawerUnits').textContent = unitsHeld.toFixed(4) + ' units';
            document.getElementById('drawerAdjustmentAmount').value = '';
            document.getElementById('drawerAdjustmentReason').value = '';
            document.getElementById('drawerNewBalancePreview').textContent = 'KES ' + portfolioValue.toLocaleString('en-KE', { minimumFractionDigits: 2 });

            // Transactions tab
            const txList = document.getElementById('drawerTransactionList');
            if (transactions.length === 0) {
                txList.innerHTML = '<div style="text-align:center;color:var(--ink-mute);padding:1.5rem 0;">No transactions found.</div>';
            } else {
                txList.innerHTML = transactions.map(t => {
                    const amt = Number(t.amount) || 0;
                    const after = Number(t.portfolioAfter || t.balanceAfter || 0);
                    const txDate = t.createdAt || t.date;
                    return `
                        <div class="timeline-item">
                            <div class="time">${new Date(txDate).toLocaleDateString('en-KE')}</div>
                            <div class="content">
                                <div class="action">${t.description || 'Transaction'}</div>
                                <div class="detail">${t.type === 'credit' ? '+' : '−'} KES ${amt.toFixed(2)} · Balance: KES ${after.toFixed(2)}</div>
                                <span class="badge-timeline ${t.type === 'credit' ? 'credit' : 'debit'}">${t.type || 'info'}</span>
                            </div>
                        </div>
                    `;
                }).join('');
            }

            // Audit tab
            const activityList = document.getElementById('drawerActivityList');
            activityList.innerHTML = `
                <div class="timeline-item">
                    <div class="time">Now</div>
                    <div class="content">
                        <div class="action">Profile viewed</div>
                        <div class="detail">Admin opened this investor's record</div>
                    </div>
                </div>
                <div class="timeline-item">
                    <div class="time">${user.createdAt ? new Date(user.createdAt).toLocaleString('en-KE') : '—'}</div>
                    <div class="content">
                        <div class="action">Account created</div>
                        <div class="detail">Investor registered on the platform</div>
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
        const pane = document.getElementById(`tab-${tabId}`);
        const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
        if (pane) pane.classList.add('active');
        if (btn) btn.classList.add('active');
    };

    // ---------- LIVE BALANCE PREVIEW ----------
    const adjAmountInput = document.getElementById('drawerAdjustmentAmount');
    if (adjAmountInput) {
        adjAmountInput.addEventListener('input', function() {
            const userId = document.getElementById('drawerUserId').value;
            const user = allUsers.find(u => u.id === userId);
            if (!user) return;
            const amount = parseFloat(this.value);
            const type = document.getElementById('drawerAdjustmentType').value;
            const previewEl = document.getElementById('drawerNewBalancePreview');
            const current = user.portfolioValue || 0;

            if (isNaN(amount) || amount <= 0) {
                previewEl.textContent = 'KES ' + current.toLocaleString('en-KE', { minimumFractionDigits: 2 });
                return;
            }

            let newBalance = current;
            if (type === 'credit') newBalance = current + amount;
            else if (type === 'debit') newBalance = Math.max(0, current - amount);
            else if (type === 'override') newBalance = amount;

            previewEl.textContent = 'KES ' + newBalance.toLocaleString('en-KE', { minimumFractionDigits: 2 });
        });
    }

    const adjTypeSelect = document.getElementById('drawerAdjustmentType');
    if (adjTypeSelect) {
        adjTypeSelect.addEventListener('change', function() {
            if (adjAmountInput) adjAmountInput.dispatchEvent(new Event('input'));
        });
    }

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
            showToast('No changes to save.', 'warning');
            return;
        }

        const current = user.portfolioValue || 0;
        let newBalance = current;
        if (hasAdjustment) {
            if (adjustmentType === 'credit') newBalance = current + adjustmentAmount;
            else if (adjustmentType === 'debit') newBalance = Math.max(0, current - adjustmentAmount);
            else if (adjustmentType === 'override') newBalance = adjustmentAmount;
        }

        let detailHtml = '';
        if (hasAdjustment) {
            detailHtml += `<span class="old">KES ${current.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</span> → <span class="new">KES ${newBalance.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</span>`;
            if (adjustmentReason) detailHtml += `<br><small>Reason: ${adjustmentReason}</small>`;
        } else {
            detailHtml += `Portfolio unchanged (KES ${current.toLocaleString('en-KE', { minimumFractionDigits: 2 })})`;
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
        const { userId, newStatus, newRisk, adjustmentType, adjustmentAmount, adjustmentReason, hasAdjustment } = pendingSaveData;

        try {
            const user = allUsers.find(u => u.id === userId);
            if (!user) return;

            if (hasAdjustment) {
                await apiFetch(`/api/admin/users/${userId}/balance`, {
                    method: 'PUT',
                    body: JSON.stringify({
                        adjustmentType,
                        adjustmentAmount,
                        reason: adjustmentReason || 'Admin adjustment',
                        sendEmail: true
                    })
                });
            }

            if (newStatus !== user.status) {
                await apiFetch(`/api/admin/users/${userId}/status`, {
                    method: 'PUT',
                    body: JSON.stringify({ status: newStatus })
                });
            }

            showToast(`Changes saved for ${user.fullName}.`, 'success');
            closeModal('confirmModal');
            closeDrawer();
            await loadUsers();
            await loadStats();
        } catch (err) {
            console.error('Save error:', err);
            showToast(`Failed to save: ${err.message}`, 'error');
        }
        pendingSaveData = null;
    };

    // ---------- FREEZE USER ----------
    window.freezeUser = async function(userId) {
        const user = allUsers.find(u => u.id === userId);
        if (!user) return;
        if (!confirm(`Freeze ${user.fullName}'s account?`)) return;

        try {
            await apiFetch(`/api/admin/users/${userId}/freeze`, { method: 'PUT' });
            showToast(`${user.fullName}'s account has been frozen.`, 'warning');
            await loadUsers();
            await loadStats();
        } catch (err) {
            console.error('Freeze error:', err);
            showToast(`Failed to freeze: ${err.message}`, 'error');
        }
    };

    // ---------- WITHDRAWALS ----------
    async function loadWithdrawals() {
        const body = document.getElementById('withdrawalsBody');
        const pendingEl = document.getElementById('pendingWithdrawalsCount');
        const approvedEl = document.getElementById('approvedWithdrawalsCount');
        if (!body) return;

        try {
            const data = await apiFetch('/api/withdrawals/admin/pending');
            const list = data.withdrawals || [];

            if (pendingEl) pendingEl.textContent = data.pendingCount || 0;
            if (approvedEl) approvedEl.textContent = data.approvedCount || 0;

            if (!list.length) {
                body.innerHTML = '<tr><td colspan="7" class="empty-cell">No pending withdrawals.</td></tr>';
                return;
            }

            body.innerHTML = list.map(function(w) {
                const user = w.userId || {};
                const date = new Date(w.requestedAt).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });
                const statusClass = w.status === 'approved' ? 'approved' : 'pending';

                const actions = w.status === 'pending'
                    ? '<button class="row-btn row-btn-approve wd-btn" data-id="' + w._id + '" data-action="approve" type="button">Approve</button>' +
                      '<button class="row-btn row-btn-reject wd-btn" data-id="' + w._id + '" data-action="reject" type="button">Reject</button>'
                    : '<button class="row-btn row-btn-paid wd-btn" data-id="' + w._id + '" data-action="paid" type="button">Mark as paid</button>';

                return '<tr>' +
                    '<td>' + date + '</td>' +
                    '<td>' +
                        '<div style="color:var(--ink);font-weight:500;">' + (user.fullName || '—') + '</div>' +
                        '<div style="font-size:0.72rem;color:var(--ink-mute);">' + (user.accountNumber || '') + '</div>' +
                    '</td>' +
                    '<td style="font-family:var(--display);font-weight:500;color:var(--ink);">KES ' + Number(w.amount).toLocaleString('en-KE', { minimumFractionDigits: 2 }) + '</td>' +
                    '<td>' +
                        '<div style="font-size:0.7rem;text-transform:uppercase;color:var(--ink-mute);letter-spacing:0.08em;">' + w.destination + '</div>' +
                        '<div>' + w.destinationAccount + '</div>' +
                    '</td>' +
                    '<td style="font-family:monospace;font-size:0.75rem;color:var(--ink-mute);">' + w.reference + '</td>' +
                    '<td><span class="status-badge ' + statusClass + '">' + w.status + '</span></td>' +
                    '<td>' + actions + '</td>' +
                    '</tr>';
            }).join('');

            body.querySelectorAll('.wd-btn').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    resolveWithdrawal(btn.dataset.id, btn.dataset.action);
                });
            });
        } catch (err) {
            console.error('Load withdrawals error:', err);
            body.innerHTML = '<tr><td colspan="7" class="empty-cell" style="color:var(--error);">Failed to load: ' + err.message + '</td></tr>';
        }
    }
    window.loadWithdrawals = loadWithdrawals;

    async function resolveWithdrawal(id, action) {
        let body = null;

        if (action === 'approve') {
            const note = prompt('Optional note for the audit log:');
            if (note === null) return;
            body = { note: note || null };
        } else if (action === 'reject') {
            const reason = prompt('Reason for rejection (the user will see this):');
            if (reason === null) return;
            if (!reason.trim()) { alert('A reason is required.'); return; }
            body = { reason: reason.trim() };
        } else if (action === 'paid') {
            const ref = prompt('Enter the M-PESA or bank confirmation code:');
            if (ref === null) return;
            if (!ref.trim()) { alert('A confirmation code is required.'); return; }
            body = { paidReference: ref.trim() };
        }

        try {
            await apiFetch('/api/withdrawals/admin/' + id + '/' + action, {
                method: 'POST',
                body: JSON.stringify(body)
            });
            await loadWithdrawals();
            await loadStats();
        } catch (err) {
            alert('Failed: ' + err.message);
        }
    }

    // ---------- YIELD RATE ----------
    window.handleSetYield = async function(e) {
        e.preventDefault();
        const newYield = parseFloat(document.getElementById('yieldRateInput').value);
        const reason = document.getElementById('yieldReason').value.trim();

        if (!newYield || newYield < 0 || newYield > 30) {
            showToast('Please enter a valid yield between 0 and 30%.', 'error');
            return;
        }
        if (!reason) {
            showToast('Please provide a reason for the yield change.', 'error');
            return;
        }

        const btn = e.target.querySelector('.btn-primary');
        const original = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Updating…';

        try {
            await apiFetch('/api/admin/yield', {
                method: 'POST',
                body: JSON.stringify({ annualYield: newYield, reason })
            });

            const rateEl = document.getElementById('currentYieldDisplay');
            if (rateEl) rateEl.innerHTML = newYield.toFixed(2) + '<span class="yield-pct">% p.a.</span>';

            closeModal('yieldModal');
            showToast('Yield rate updated to ' + newYield.toFixed(2) + '% p.a.', 'success');
            e.target.reset();
            await loadAudit();
        } catch (err) {
            showToast('Failed: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = original;
        }
    };

    // ---------- INTEREST ACCRUAL ----------
    window.runInterestAccrual = function() {
        const countEl = document.getElementById('accrualInvestorCount');
        if (countEl) countEl.textContent = allUsers.filter(u => u.status === 'active').length;
        openModal('accrualModal');
    };

    window.confirmAccrual = async function() {
        closeModal('accrualModal');
        showToast('Interest accrual running…', 'info');
        try {
            const result = await apiFetch('/api/admin/run-accrual', { method: 'POST' });
            showToast('Accrual complete. ' + (result.usersProcessed || 0) + ' investors credited.', 'success');
            await loadStats();
            await loadAudit();
        } catch (err) {
            showToast('Failed: ' + err.message, 'error');
        }
    };

    // ---------- BROADCAST ----------
    window.openBroadcastModal = function() {
        if (!broadcastModal) return;
        broadcastModal.classList.add('open');
        const msg = document.getElementById('broadcastMessage');
        const rec = document.getElementById('broadcastRecipient');
        const grp = document.getElementById('specificPhoneGroup');
        if (msg) msg.value = '';
        if (rec) rec.value = 'all';
        if (grp) grp.style.display = 'none';
    };

    window.closeBroadcastModal = function() {
        if (broadcastModal) broadcastModal.classList.remove('open');
    };

    window.sendBroadcast = async function() {
        const message = document.getElementById('broadcastMessage').value.trim();
        const recipient = document.getElementById('broadcastRecipient').value;

        if (!message) {
            showToast('Please enter a message.', 'error');
            return;
        }

        const payload = { message, targetAll: recipient === 'all' };
        if (recipient === 'specific') {
            const phone = document.getElementById('broadcastPhone').value.trim();
            if (!phone) {
                showToast('Please enter a phone number.', 'error');
                return;
            }
            payload.phone = phone;
        }

        try {
            const result = await apiFetch('/api/admin/broadcast-email', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            showToast('Broadcast sent to ' + (result.recipientCount || 0) + ' recipient(s).', 'success');
            closeBroadcastModal();
            await loadAudit();
        } catch (err) {
            showToast('Failed: ' + err.message, 'error');
        }
    };

    // ---------- LOAD AUDIT ----------
    async function loadAudit() {
        try {
            const data = await apiFetch('/api/admin/audit-log');
            const logs = data.logs || [];
            const auditBody = document.getElementById('auditTableBody');
            if (!auditBody) return;

            if (logs.length === 0) {
                auditBody.innerHTML = '<tr><td colspan="4" class="empty-cell">No admin actions logged yet.</td></tr>';
                return;
            }

            auditBody.innerHTML = logs.slice(0, 20).map(log => `
                <tr>
                    <td style="font-family:monospace;font-size:0.72rem;color:var(--ink-mute);">${new Date(log.createdAt).toLocaleString('en-KE', { hour12: false })}</td>
                    <td>${log.adminName || '—'}</td>
                    <td><strong style="color:var(--ink);">${log.action}</strong></td>
                    <td>${log.details || ''}</td>
                </tr>
            `).join('');
        } catch (err) {
            console.error('Audit load error:', err);
        }
    }

    // ---------- AUDIT TOGGLE ----------
    window.toggleAudit = function() {
        const body = document.getElementById('auditBody');
        const icon = document.getElementById('auditToggleIcon');
        if (!body) return;
        const isOpen = body.classList.toggle('open');
        if (icon) icon.textContent = isOpen ? 'Hide' : 'Show';
        if (isOpen) loadAudit();
    };

    // ---------- EXPORT CSV ----------
    window.exportCSV = function() {
        if (!allUsers.length) {
            showToast('No investors to export.', 'warning');
            return;
        }
        const headers = ['Full Name', 'Phone', 'ID Number', 'Account Number', 'Portfolio Value', 'Units Held', 'Status', 'Risk', 'Last Login'];
        const rows = allUsers.map(u => [
            u.fullName || '',
            u.phoneNumber || '',
            u.idNumber || '',
            u.accountNumber || '',
            u.portfolioValue || 0,
            u.unitsHeld || 0,
            u.status || '',
            u.risk || 'low',
            u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : 'Never'
        ]);
        const csvContent = [headers.join(','), ...rows.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'rockwin-investors-' + new Date().toISOString().slice(0, 10) + '.csv';
        a.click();
        URL.revokeObjectURL(url);
        showToast('CSV exported.', 'success');
    };

    // ---------- LOGOUT ----------
    window.handleLogout = function() {
        if (confirm('Exit the admin console?')) {
            localStorage.removeItem('token');
            window.location.href = 'login.html';
        }
    };

    // ---------- MODAL CONTROLS ----------
    window.openModal = function(id) {
        const m = document.getElementById(id);
        if (m) m.classList.add('open');
    };

    window.closeModal = function(id) {
        if (!id) {
            if (modal) modal.classList.remove('open');
            pendingSaveData = null;
            return;
        }
        const m = document.getElementById(id);
        if (m) m.classList.remove('open');
        if (id === 'confirmModal') pendingSaveData = null;
    };

    // Close modal when clicking overlay
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', function(e) {
            if (e.target === this) {
                this.classList.remove('open');
                if (this.id === 'confirmModal') pendingSaveData = null;
            }
        });
    });

    // ---------- ESCAPE KEY ----------
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
            if (drawer && drawer.classList.contains('open')) closeDrawer();
            if (broadcastModal && broadcastModal.classList.contains('open')) closeBroadcastModal();
            pendingSaveData = null;
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
            await loadWithdrawals();
        } catch (err) {
            console.error('Init error:', err);
            showToast('Failed to load initial data. Please refresh.', 'error');
        }
    })();

})();