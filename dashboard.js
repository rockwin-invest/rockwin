(function() {
    'use strict';

    const API_BASE = 'https://rockwin.onrender.com';
    let userData = null;
    let depositPoller = null;

    function getToken() { return localStorage.getItem('token'); }

    async function apiFetch(endpoint, options) {
        options = options || {};
        const token = getToken();
        if (!token) { window.location.href = 'login.html'; throw new Error('Not authenticated'); }
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

        // Update greeting
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

        // Units
        const unitsEl = $('unitsDisplay');
        if (unitsEl) {
            unitsEl.textContent = (user.unitsHeld || 0).toFixed(4) + ' units';
        }

        // Yield
        const yieldEl = $('yieldDisplay');
        if (yieldEl) yieldEl.textContent = (user.annualYield || 14.2).toFixed(2) + '% p.a.';

        // Reward message
        const rewardEl = $('rewardMessage');
        if (rewardEl) {
            if ((user.portfolioValue || 0) === 0) {
                rewardEl.textContent = 'Welcome! Start investing from KES 100';
            } else {
                rewardEl.textContent = 'Interest accrues daily · ' + (user.annualYield || 14.2).toFixed(2) + '% p.a.';
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

        // Update account number in deposit modal
        const depositAcc = $('depositAccountDisplay');
        if (depositAcc) depositAcc.textContent = user.accountNumber;
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
        Object.entries(groups).forEach(function(entry) {
            const date = entry[0];
            const items = entry[1];
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

    // ============================================================
    // MODAL CONTROLS
    // ============================================================
    function openModal(id) {
        const modal = $(id);
        if (modal) { modal.classList.add('open'); document.body.style.overflow = 'hidden'; }
    }
    function closeModal(id) {
        const modal = $(id);
        if (modal) { modal.classList.remove('open'); document.body.style.overflow = ''; }
        if (depositPoller) { clearInterval(depositPoller); depositPoller = null; }
    }
    window.openModal = openModal;
    window.closeModal = closeModal;

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', function(e) {
            if (e.target === this) {
                this.classList.remove('open');
                document.body.style.overflow = '';
                if (depositPoller) { clearInterval(depositPoller); depositPoller = null; }
            }
        });
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
            document.body.style.overflow = '';
            if (depositPoller) { clearInterval(depositPoller); depositPoller = null; }
        }
    });

    // ============================================================
    // DEPOSIT HANDLER — real STK Push flow
    // ============================================================
    window.handleDeposit = async function(e) {
        e.preventDefault();

        const method = $('depositMethod').value;
        const amount = parseFloat($('depositAmount').value);
        const phoneInput = $('depositPhone') ? $('depositPhone').value.trim() : '';

        if (!method) {
            showToast('Please select a payment method.', 'error');
            return;
        }

        if (!amount || amount < 100) {
            showToast('Minimum deposit is KES 100.', 'error');
            return;
        }

        if (method !== 'mpesa') {
            showToast('Only M-Pesa is available right now. Bank and card coming soon.', 'info');
            return;
        }

        // Use user's phone if no input field
        let phone = phoneInput;
        if (!phone && userData && userData.phoneNumber) {
            phone = userData.phoneNumber;
        }
        if (!phone) {
            showToast('Please enter your M-Pesa phone number.', 'error');
            return;
        }

        // Show loading state
        const submitBtn = e.target.querySelector('.btn-modal-primary');
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending prompt...';

        try {
            const result = await apiFetch('/api/payments/deposit', {
                method: 'POST',
                body: JSON.stringify({ amount, phoneNumber: phone })
            });

            // Show "waiting for PIN" state
            submitBtn.textContent = 'Waiting for your PIN...';

            // Replace modal content with waiting state
            const modalBody = e.target.parentElement;
            const waitingHtml =
                '<div style="text-align:center;padding:1.5rem 0;">' +
                '<div style="font-size:3rem;margin-bottom:0.8rem;">📱</div>' +
                '<h3 style="font-family:var(--font-display);font-size:1.1rem;margin-bottom:0.5rem;">Check your phone</h3>' +
                '<p style="color:var(--text-secondary);font-size:0.9rem;line-height:1.6;">' +
                'We sent an M-Pesa prompt to <strong style="color:var(--text-primary);">' + result.phoneNumber + '</strong>. ' +
                'Enter your PIN to complete the deposit of <strong style="color:var(--accent-green);">KES ' + formatKES(result.amount) + '</strong>.' +
                '</p>' +
                '<div id="depositStatusBox" style="margin-top:1.5rem;padding:0.8rem 1rem;background:rgba(255,255,255,0.03);border-radius:var(--radius-default);font-size:0.85rem;color:var(--text-muted);">' +
                '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--warning);margin-right:0.4rem;animation:pulse-load 1.5s ease-in-out infinite;"></span>' +
                'Waiting for confirmation...' +
                '</div>' +
                '<p style="font-size:0.7rem;color:var(--text-muted);margin-top:1rem;">Ref: ' + result.reference + '</p>' +
                '</div>';

            const formEl = e.target;
            formEl.innerHTML = waitingHtml;

            // Start polling
            startDepositPolling(result.paymentId);
        } catch (err) {
            showToast(err.message || 'Failed to initiate deposit.', 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    };

    function startDepositPolling(paymentId) {
        if (depositPoller) clearInterval(depositPoller);

        let attempts = 0;
        const maxAttempts = 40; // 40 * 3s = 120s

        depositPoller = setInterval(async function() {
            attempts++;
            try {
                const status = await apiFetch('/api/payments/status/' + paymentId);
                const box = $('depositStatusBox');

                if (status.status === 'completed') {
                    clearInterval(depositPoller);
                    depositPoller = null;

                    if (box) {
                        box.style.background = 'rgba(46, 204, 113, 0.15)';
                        box.style.color = 'var(--accent-green)';
                        box.innerHTML = '✅ Payment received! ' + status.unitsCredited.toFixed(4) + ' units added.';
                    }

                    showToast('Deposit successful! KES ' + formatKES(status.amount) + ' added.', 'success');

                    // Reload dashboard data
                    setTimeout(async function() {
                        closeModal('depositModal');
                        await loadDashboard();
                    }, 2000);
                } else if (status.status === 'failed' || status.status === 'cancelled' || status.status === 'timeout') {
                    clearInterval(depositPoller);
                    depositPoller = null;
                    if (box) {
                        box.style.background = 'rgba(248, 113, 113, 0.15)';
                        box.style.color = 'var(--error)';
                        box.innerHTML = '❌ ' + (status.failureReason || 'Payment failed.');
                    }
                    showToast(status.failureReason || 'Payment failed.', 'error');
                }

                if (attempts >= maxAttempts) {
                    clearInterval(depositPoller);
                    depositPoller = null;
                    if (box) {
                        box.style.background = 'rgba(251, 191, 36, 0.15)';
                        box.style.color = 'var(--warning)';
                        box.innerHTML = '⏱️ No response from your phone. Please try again.';
                    }
                }
            } catch (err) {
                console.warn('Poll error:', err.message);
            }
        }, 3000);
    }

    // ============================================================
    // OTHER HANDLERS
    // ============================================================
    window.handleWithdraw = function(e) {
        e.preventDefault();
        showToast('Withdrawals coming soon!', 'info');
    };

    window.downloadStatement = function() {
        showToast('Statement download coming soon!', 'info');
    };

    window.handleAction = function(action) {
        console.log('Action:', action);
    };

    // ============================================================
    // LOAD DASHBOARD
    // ============================================================
    async function loadDashboard() {
        try {
            const results = await Promise.all([
                apiFetch('/api/user/profile'),
                apiFetch('/api/user/ledger').catch(function() { return []; }),
                apiFetch('/api/user/stats').catch(function() { return {}; })
            ]);

            renderUser(results[0]);
            renderTransactions(results[1]);
            renderStats(results[2]);
        } catch (err) {
            console.error('Dashboard load error:', err);
            showToast('Failed to load dashboard.', 'error');
        }
    }

    document.addEventListener('DOMContentLoaded', async function() {
        const now = new Date();
        const hour = now.getHours();
        let greeting = 'Good Morning';
        if (hour >= 12 && hour < 17) greeting = 'Good Afternoon';
        else if (hour >= 17) greeting = 'Good Evening';

        const greetingEl = document.querySelector('.greeting');
        if (greetingEl) greetingEl.childNodes[0].nodeValue = '👋 ' + greeting + ', ';

        const mins = now.getMinutes().toString().padStart(2, '0');
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const h12 = hour % 12 || 12;
        if ($('lastLoginTime')) $('lastLoginTime').textContent = h12 + ':' + mins + ' ' + ampm;

        await loadDashboard();
    });

})();