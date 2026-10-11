(function() {
    'use strict';

    // ---------- CONFIG ----------
    const API_BASE = 'https://equin-bank-ltd.onrender.com';
    let userData = null;
    let balanceVisible = true;

    // ---------- AUTH TOKEN ----------
    function getToken() {
        return localStorage.getItem('token');
    }

    // ---------- API HELPERS ----------
    async function apiFetch(endpoint, options = {}) {
        const token = getToken();
        if (!token) {
            window.location.href = 'login.html';
            throw new Error('Not authenticated');
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
            if (response.status === 401) {
                localStorage.removeItem('token');
                window.location.href = 'login.html';
            }
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || `HTTP ${response.status}`);
        }
        return response.json();
    }

    // ---------- DOM ELEMENTS (with safety checks) ----------
    const $ = (id) => document.getElementById(id);
    const $$ = (selector) => document.querySelector(selector);

    const userFirstName = $('userFirstName');
    const userFullName = $('userFullName');
    const userAccountNumber = $('userAccountNumber');
    const balanceFigure = $('balanceFigure');
    const availableBalanceEl = $('availableBalance');
    const bookBalanceEl = $('bookBalance');
    const userAvatar = $('userAvatar');
    const userStatusText = $('userStatusText');
    const userStatusBadge = $('userStatusBadge');
    const lastUpdatedEl = $('lastUpdated');
    const transactionList = $('transactionList');
    const ledgerList = $('ledgerList');
    const ledgerCount = $('ledgerCount');
    const guideAccountNumber = $('guideAccountNumber');
    const rewardMessage = $('rewardMessage');
    const contextMessage = $('contextMessage');
    const lastLoginTime = $('lastLoginTime');
    const toastContainer = $('toastContainer');
    const notifBadge = $('notifBadge');
    const hideBalanceBtn = $('hideBalanceBtn');
    const fabBtn = $('fabBtn');
    const fabMenu = $('fabMenu');
    const searchBtn = $('searchBtn');
    const searchInput = $('actionSearchInput');
    const actionSheet = $('actionSheet');
    const actionSheetOverlay = $('actionSheetOverlay');

    // ---------- RENDER USER ----------
    function renderUser(data) {
        if (!data) {
            console.warn('⚠️ No user data to render');
            return;
        }

        console.log('✅ Rendering user data:', data);
        userData = data;

        // ----- Update Greeting -----
        const firstName = data.fullName ? data.fullName.split(' ')[0] : 'User';
        if (userFirstName) {
            userFirstName.textContent = firstName;
        }
        if (userFullName) {
            userFullName.textContent = data.fullName;
        }

        // ----- Update Account Number -----
        if (userAccountNumber) {
            userAccountNumber.textContent = data.accountNumber || 'N/A';
        }
        if (guideAccountNumber) {
            guideAccountNumber.textContent = data.accountNumber || 'N/A';
        }

        // ----- Update Balance -----
        const formattedBalance = data.balance ? data.balance.toLocaleString('en-KE', { minimumFractionDigits: 2 }) : '0.00';
        if (balanceFigure) {
            balanceFigure.textContent = formattedBalance;
        }
        if (availableBalanceEl) {
            availableBalanceEl.textContent = 'KES ' + formattedBalance;
        }

        // ----- Update Book Balance -----
        const bookBalance = data.bookBalance || 0;
        if (bookBalanceEl) {
            bookBalanceEl.textContent = 'KES ' + bookBalance.toLocaleString('en-KE', { minimumFractionDigits: 2 });
        }

        // ----- Update Avatar Initials -----
        if (userAvatar) {
            const initials = data.fullName
                ? data.fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                : 'U';
            userAvatar.textContent = initials;
        }

        // ----- Update Status -----
        const statusMap = {
            active: { label: 'Active', class: 'active' },
            suspended: { label: 'Suspended', class: 'suspended' },
            pending: { label: 'Pending Verification', class: 'pending' }
        };
        const status = statusMap[data.status] || statusMap.pending;
        if (userStatusText) {
            userStatusText.textContent = status.label;
        }
        if (userStatusBadge) {
            userStatusBadge.className = 'status-badge ' + status.class;
            const dot = userStatusBadge.querySelector('.dot');
            if (dot) {
                const colors = {
                    active: 'var(--accent-green)',
                    suspended: 'var(--error)',
                    pending: '#fbbf24'
                };
                dot.style.background = colors[status.class] || '#fbbf24';
            }
        }

        // ----- Update Last Updated -----
        if (lastUpdatedEl) {
            const now = new Date();
            lastUpdatedEl.textContent = now.toLocaleString('en-KE', { hour12: false });
        }

        // ----- Update Last Login Time -----
        if (lastLoginTime) {
            const now = new Date();
            const hours = now.getHours();
            const minutes = now.getMinutes().toString().padStart(2, '0');
            const ampm = hours >= 12 ? 'PM' : 'AM';
            const hour12 = hours % 12 || 12;
            lastLoginTime.textContent = `${hour12}:${minutes} ${ampm}`;
        }

        // ----- Update Messages -----
        updateMessages(data);
    }

    // ---------- RENDER TRANSACTIONS ----------
    function renderTransactions(transactions) {
        const container = transactionList || ledgerList;
        if (!container) {
            console.warn('⚠️ No transaction container found');
            return;
        }

        if (!transactions || transactions.length === 0) {
            container.innerHTML = `
                <div class="empty-ledger" style="text-align:center;padding:2rem 0;">
                    <span class="icon" style="font-size:2rem;display:block;margin-bottom:0.5rem;">📭</span>
                    <p style="color:var(--text-muted);">No transactions yet.</p>
                    <p style="font-size:0.8rem; color:var(--text-muted);">Your transactions will appear here once you start using your account.</p>
                </div>
            `;
            if (ledgerCount) ledgerCount.textContent = '0 entries';
            return;
        }

        let html = '';
        const groups = {};
        transactions.forEach(t => {
            const date = new Date(t.createdAt).toLocaleDateString('en-KE', { 
                weekday: 'long', 
                month: 'short', 
                day: 'numeric' 
            });
            if (!groups[date]) groups[date] = [];
            groups[date].push(t);
        });

        for (const [date, items] of Object.entries(groups)) {
            html += `<div class="transaction-group" style="margin-bottom:0.8rem;">
                        <div class="group-date" style="font-size:0.6rem;text-transform:uppercase;color:var(--text-muted);font-weight:600;letter-spacing:0.04em;margin-bottom:0.3rem;">${date}</div>`;
            items.forEach(t => {
                const icon = t.icon || getTransactionIcon(t.type);
                const amountClass = t.type === 'credit' ? 'positive' : 'negative';
                const amountSign = t.type === 'credit' ? '+ ' : '- ';
                html += `
                    <div class="transaction-row" style="display:flex;align-items:center;padding:0.6rem 0;border-bottom:1px solid var(--border-light);gap:0.6rem;">
                        <div class="icon-wrap" style="width:36px;height:36px;border-radius:50%;background:var(--bg-primary-light);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:1rem;">${icon}</div>
                        <div class="details" style="flex:1;min-width:0;">
                            <div class="name" style="font-weight:500;font-size:0.85rem;color:var(--text-primary);">${t.description || t.type}</div>
                            <div class="meta" style="font-size:0.7rem;color:var(--text-muted);">
                                ${t.reference || 'Transaction'}
                                <span class="separator" style="color:var(--border-light);">·</span>
                                ${new Date(t.createdAt).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                        </div>
                        <div class="amount ${amountClass}" style="font-weight:600;font-size:0.85rem;flex-shrink:0;text-align:right;">${amountSign}KES ${t.amount ? t.amount.toFixed(2) : '0.00'}</div>
                    </div>
                `;
            });
            html += `</div>`;
        }
        container.innerHTML = html;
        if (ledgerCount) ledgerCount.textContent = transactions.length + ' entries';
    }

    // ---------- GET TRANSACTION ICON ----------
    function getTransactionIcon(type) {
        const icons = {
            credit: '💰',
            debit: '💳',
            deposit: '📥',
            withdrawal: '📤',
            transfer: '🔄',
            adjustment: '✏️'
        };
        return icons[type] || '💳';
    }

    // ---------- UPDATE MESSAGES ----------
    function updateMessages(data) {
        const balance = data.balance || 0;
        const status = data.status || 'pending';

        // Reward message
        if (rewardMessage) {
            if (balance === 0 && status === 'pending') {
                rewardMessage.textContent = '🎯 Welcome! Complete your verification to activate your account.';
            } else if (balance === 0) {
                rewardMessage.textContent = '💰 Your account is active. Start banking by making a deposit.';
            } else {
                rewardMessage.textContent = `💰 Balance: KES ${balance.toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
            }
        }

        // Context message
        if (contextMessage) {
            const icon = contextMessage.querySelector('.icon');
            const text = contextMessage.querySelector('.text');
            if (status === 'pending') {
                if (icon) icon.textContent = '📌';
                if (text) text.innerHTML = '<strong>Your account is pending verification.</strong> Complete your KYC to activate your account.';
            } else if (balance === 0) {
                if (icon) icon.textContent = '💡';
                if (text) text.innerHTML = '<strong>Get started with your first deposit.</strong> Your account is ready to receive funds.';
            } else {
                if (icon) icon.textContent = '📈';
                if (text) text.innerHTML = `<strong>Balance: KES ${balance.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</strong> · Your account is active.`;
            }
        }
    }
    function openModal(id) {
    document.getElementById(id).classList.add('open');
}
function closeModal(id) {
    document.getElementById(id).classList.remove('open');
}
// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', function(e) {
        if (e.target === this) this.classList.remove('open');
    });
});

    // ---------- LOAD DATA ----------
 async function loadDashboard() {
    try {
        const user = await apiFetch('/api/user/profile');
        renderUser(user);

        const ledger = await apiFetch('/api/user/ledger');
        renderTransactions(ledger);
        
        // 👇 Add this when stats endpoint is ready
        await loadStats();
        
        console.log('✅ Dashboard fully loaded');
    } catch (err) {
        console.error('❌ Dashboard load error:', err);
        showToast('Failed to load dashboard data. Please refresh.', 'error');
    }
}

    // Load stats
async function loadStats() {
    try {
        const stats = await apiFetch('/api/user/stats');
        renderStats(stats);
    } catch (err) {
        console.error('Stats load error:', err);
    }
}

function renderStats(stats) {
    const spentEl = document.querySelector('.stats-spent');
    const incomeEl = document.querySelector('.stats-income');
    const highestEl = document.querySelector('.stats-highest');
    const savingsEl = document.querySelector('.stats-savings');

    if (spentEl) spentEl.textContent = 'KES ' + stats.spent.toLocaleString('en-KE', { minimumFractionDigits: 0 });
    if (incomeEl) incomeEl.textContent = 'KES ' + stats.income.toLocaleString('en-KE', { minimumFractionDigits: 0 });
    if (highestEl) {
        if (stats.highestExpense.amount > 0) {
            highestEl.textContent = stats.highestExpense.description + ' · KES ' + stats.highestExpense.amount.toLocaleString('en-KE', { minimumFractionDigits: 0 });
        } else {
            highestEl.textContent = 'No expenses yet';
        }
    }
    if (savingsEl) savingsEl.textContent = stats.savingsGoal + '% complete';
}

    // ---------- TOAST SYSTEM ----------
    function showToast(message, type = 'success') {
        if (!toastContainer) {
            console.warn('⚠️ Toast container not found');
            return;
        }
        const toast = document.createElement('div');
        toast.className = `toast ${type === 'error' ? 'error' : type === 'info' ? 'info' : ''}`;
        const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
        toast.innerHTML = `
            <span class="toast-icon">${icon}</span>
            <span class="toast-msg">${message}</span>
        `;
        toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-12px) scale(0.96)';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }
    window.showToast = showToast;

    // ---------- HIDE BALANCE ----------
    if (hideBalanceBtn) {
        hideBalanceBtn.addEventListener('click', function() {
            if (!userData) return;
            balanceVisible = !balanceVisible;
            const figure = balanceFigure || availableBalanceEl;
            if (balanceVisible) {
                const formatted = userData.balance.toLocaleString('en-KE', { minimumFractionDigits: 2 });
                if (figure) figure.textContent = formatted;
                if (availableBalanceEl) availableBalanceEl.textContent = 'KES ' + formatted;
                this.textContent = '👁️ Hide';
            } else {
                if (figure) figure.textContent = '••••••••';
                if (availableBalanceEl) availableBalanceEl.textContent = '••••••••';
                this.textContent = '👁️ Show';
            }
        });
    }

    // ---------- FAB TOGGLE ----------
    if (fabBtn) {
        fabBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (fabMenu) fabMenu.classList.toggle('open');
            const icon = this.querySelector('.icon');
            if (icon) {
                icon.innerHTML = fabMenu && fabMenu.classList.contains('open') ?
                    '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>' :
                    '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>';
            }
        });

        document.addEventListener('click', function(e) {
            if (!e.target.closest('.fab') && !e.target.closest('.fab-menu')) {
                if (fabMenu) fabMenu.classList.remove('open');
                const icon = fabBtn.querySelector('.icon');
                if (icon) {
                    icon.innerHTML = '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>';
                }
            }
        });
    }

    // ---------- ACTION SHEET ----------
    function openActionSheet() {
        if (actionSheetOverlay) actionSheetOverlay.classList.add('open');
        if (actionSheet) actionSheet.classList.add('open');
        setTimeout(() => searchInput && searchInput.focus(), 300);
    }

    function closeActionSheet() {
        if (actionSheetOverlay) actionSheetOverlay.classList.remove('open');
        if (actionSheet) actionSheet.classList.remove('open');
        if (searchInput) searchInput.value = '';
    }

    if (searchBtn) {
        searchBtn.addEventListener('click', openActionSheet);
        if (actionSheetOverlay) actionSheetOverlay.addEventListener('click', closeActionSheet);
    }

    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const query = this.value.toLowerCase().trim();
            const items = document.querySelectorAll('.action-grid .item');
            items.forEach(item => {
                const label = item.textContent.trim().toLowerCase();
                item.style.display = query === '' || label.includes(query) ? 'flex' : 'none';
            });
        });
    }

    window.handleAction = function(action) {
        closeActionSheet();
        showToast(`🔍 ${action} — coming soon!`, 'info');
    };

    document.addEventListener('keydown', function(e) {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            openActionSheet();
        }
        if (e.key === 'Escape') {
            closeActionSheet();
        }
    });

    // ---------- SIDEBAR TOGGLE (mobile) ----------
    const menuBtn = document.createElement('button');
    menuBtn.className = 'btn-icon';
    menuBtn.setAttribute('aria-label', 'Toggle menu');
    menuBtn.innerHTML =
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>';
    menuBtn.onclick = function() {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.toggle('open');
    };
    const actionsContainer = document.querySelector('.top-header .actions');
    if (actionsContainer) {
        actionsContainer.prepend(menuBtn);
    }

    document.addEventListener('click', function(e) {
        const sidebar = document.getElementById('sidebar');
        if (window.innerWidth <= 768 && sidebar && !e.target.closest('.sidebar') && !e.target.closest('.btn-icon') &&
            sidebar.classList.contains('open')) {
            sidebar.classList.remove('open');
        }
    });

    // ---------- PRIMARY ACTION ----------
    const primaryBtn = document.getElementById('primaryActionBtn');
    if (primaryBtn) {
        primaryBtn.addEventListener('click', function() {
            showToast('💸 Transfer screen would open.', 'info');
        });
    }

    // ---------- NOTIFICATION BADGE ----------
    const notifBtn = document.getElementById('notifBtn');
    if (notifBtn) {
        notifBtn.addEventListener('click', function() {
            openActionSheet();
        });
    }

    // ---------- NOTIFICATION BADGE ----------
    if (notifBadge) {
        notifBadge.textContent = '0';
        notifBadge.style.display = 'none';
    }

    // ---------- INIT ----------
    (async function init() {
        console.log('🚀 Dashboard initializing...');
        
        const token = getToken();
        if (!token) {
            console.log('❌ No token found, redirecting to login');
            window.location.href = 'login.html';
            return;
        }
        
        console.log('✅ Token found, loading dashboard...');
        await loadDashboard();

        setTimeout(() => {
            if (userData) {
                const name = userData.fullName ? userData.fullName.split(' ')[0] : 'User';
                showToast(`👋 Welcome back, ${name}!`, 'success');
            }
        }, 800);

        console.log('✅ Equin Bank Dashboard initialized');
        console.log('💡 Press Cmd+K (Mac) or Ctrl+K (Windows) to open the action sheet.');
    })();
    // ====== CONTACT WHATSAPP ======
function contactWhatsApp() {
    const phone = '+254700123456';
    const message = 'Hello Equin Bank Support, I need assistance with:%0A%0A1. %0A2. %0A%0AThank you.';
    const url = `https://wa.me/${phone}?text=${message}`;
    window.open(url, '_blank');
}
window.contactWhatsApp = contactWhatsApp;

})();