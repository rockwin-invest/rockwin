(function() {
    'use strict';

    const API_BASE = 'https://rockwin.onrender.com';
    let userData = null;

    function getToken() {
        return localStorage.getItem('token');
    }

    async function apiFetch(endpoint, options = {}) {
        const token = getToken();
        if (!token) {
            window.location.href = 'login.html';
            throw new Error('Not authenticated');
        }
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
            ...(options.headers || {})
        };
        const response = await fetch(API_BASE + endpoint, { ...options, headers });
        if (!response.ok) {
            if (response.status === 401) {
                localStorage.removeItem('token');
                window.location.href = 'login.html';
            }
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || 'HTTP ' + response.status);
        }
        return response.json();
    }

    const $ = (id) => document.getElementById(id);

    function formatKES(num) {
        return (num || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function renderUser(user) {
        userData = user;

        const firstName = user.fullName ? user.fullName.split(' ')[0] : 'Investor';
        const initials = user.fullName
            ? user.fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
            : 'U';

        // Greeting
        const greetingEl = document.querySelector('.greeting');
        if (greetingEl) {
            greetingEl.childNodes[0].nodeValue = '👋 Good Morning, ';
            const nameSpan = greetingEl.querySelector('span:not(.last-login)');
            if (nameSpan) nameSpan.textContent = firstName;
        }

        // Avatar
        const avatar = $('userAvatar');
        if (avatar) avatar.textContent = initials;

        // Portfolio value
        const portfolioEl = $('balanceFigure');
        if (portfolioEl) portfolioEl.textContent = formatKES(user.portfolioValue || 0);

        // Units + yield badge
        const unitsEl = $('unitsDisplay');
        if (unitsEl) {
            unitsEl.textContent = (user.unitsHeld || 0).toFixed(1) + ' units';
        }

        // Reward message
        const rewardEl = $('rewardMessage');
        if (rewardEl) {
            if ((user.portfolioValue || 0) === 0) {
                rewardEl.textContent = '💰 Welcome! Start investing from KES 1,000';
            } else {
                rewardEl.textContent = 'Interest accrues daily · 14.2% p.a.';
            }
        }

        // Context message
        const ctxEl = $('contextMessage');
        if (ctxEl) {
            const textEl = ctxEl.querySelector('.text');
            if (textEl) {
                if ((user.portfolioValue || 0) === 0) {
                    textEl.innerHTML = '<strong>Get started</strong> — make your first investment to begin earning interest.';
                } else {
                    textEl.innerHTML = '<strong>You\'ve earned KES ' + formatKES(user.ytdInterestEarned || 0) + '</strong> in interest this year.';
                }
            }
        }

        // Status badge if exists
        const statusBadge = $('userStatusBadge');
        if (statusBadge && user.status) {
            const map = { active: 'Active', suspended: 'Suspended', pending: 'Pending KYC' };
            const statusText = $('userStatusText');
            if (statusText) statusText.textContent = map[user.status] || user.status;
        }
    }

    function renderTransactions(transactions) {
        const container = $('transactionList');
        if (!container) return;

        if (!transactions || transactions.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:2rem 0;color:var(--text-muted);">' +
                '<div style="font-size:2rem;margin-bottom:0.5rem;">📭</div>' +
                '<p>No transactions yet.</p>' +
                '<p style="font-size:0.8rem;">Your activity will appear here once you start investing.</p>' +
                '</div>';
            return;
        }

        const recent = transactions.slice(0, 5);
        const groups = {};
        recent.forEach(t => {
            const date = new Date(t.date).toLocaleDateString('en-KE', { weekday: 'long', month: 'short', day: 'numeric' });
            if (!groups[date]) groups[date] = [];
            groups[date].push(t);
        });

        let html = '';
        Object.entries(groups).forEach(([date, items]) => {
            html += '<div class="transaction-group"><div class="group-date">' + date + '</div>';
            items.forEach(t => {
                const icon = t.category === 'interest' ? '📈' :
                             t.category === 'deposit' ? '💰' :
                             t.category === 'redemption' ? '💳' : '💼';
                const amountClass = t.type === 'credit' ? 'positive' : 'negative';
                html += '<div class="transaction-row">' +
                    '<div class="icon-wrap">' + icon + '</div>' +
                    '<div class="details">' +
                    '<div class="name">' + t.description + '</div>' +
                    '<div class="meta">' + (t.reference || 'Transaction') + '</div>' +
                    '</div>' +
                    '<div class="amount ' + amountClass + '">' + t.amount + '</div>' +
                    '</div>';
            });
            html += '</div>';
        });

        container.innerHTML = html;
    }

    function renderStats(stats) {
        const todayEl = document.querySelector('.stats-today');
        const monthEl = document.querySelector('.stats-month');
        const ytdEl = document.querySelector('.stats-ytd');
        const yieldEl = document.querySelector('.stats-yield');

        if (todayEl) todayEl.textContent = 'KES ' + formatKES(stats.interestToday || 0);
        if (monthEl) monthEl.textContent = 'KES ' + formatKES(stats.interestThisMonth || 0);
        if (ytdEl) ytdEl.textContent = 'KES ' + formatKES(stats.interestYTD || 0);
        if (yieldEl) yieldEl.textContent = (stats.currentYield || 14.2).toFixed(2) + '% p.a.';
    }

    function showToast(message, type) {
        type = type || 'success';
        const container = $('toastContainer');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = 'toast ' + (type === 'error' ? 'error' : type === 'info' ? 'info' : '');
        const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
        toast.innerHTML = '<span class="toast-icon">' + icon + '</span><span class="toast-msg">' + message + '</span>';
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }
    window.showToast = showToast;

    function handleLogout() {
        if (confirm('Are you sure you want to sign out?')) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = 'login.html';
        }
    }
    window.handleLogout = handleLogout;

    function contactWhatsApp() {
        window.open('https://wa.me/+254700123456?text=' + encodeURIComponent('Hello RockWin Support'), '_blank');
    }
    window.contactWhatsApp = contactWhatsApp;

    // ---------- INIT ----------
    document.addEventListener('DOMContentLoaded', async function() {
        // Update greeting time
        const now = new Date();
        const hour = now.getHours();
        let greeting = 'Good Morning';
        if (hour >= 12 && hour < 17) greeting = 'Good Afternoon';
        else if (hour >= 17) greeting = 'Good Evening';

        const greetingEl = document.querySelector('.greeting');
        if (greetingEl) {
            greetingEl.childNodes[0].nodeValue = '👋 ' + greeting + ', ';
        }

        // Load data
        try {
            const [profile, ledger, stats] = await Promise.all([
                apiFetch('/api/user/profile'),
                apiFetch('/api/user/ledger').catch(() => []),
                apiFetch('/api/user/stats').catch(() => ({ interestToday: 0, interestThisMonth: 0, interestYTD: 0, currentYield: 14.2 }))
            ]);

            renderUser(profile);
            renderTransactions(ledger);
            renderStats(stats);

            // Welcome toast
            setTimeout(() => {
                const name = profile.fullName ? profile.fullName.split(' ')[0] : 'Investor';
                showToast('👋 Welcome back, ' + name + '!', 'success');
            }, 500);

        } catch (err) {
            console.error('Dashboard load error:', err);
            showToast('Failed to load dashboard data. Please refresh.', 'error');
        }
    });

})();