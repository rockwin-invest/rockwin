(function() {
    'use strict';

    const API_BASE = 'https://api.rockwininvestment.com';
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

    // ============================================================
    // TX ICONS — inline SVG, category-matched
    // ============================================================
    function txIcon(category) {
        if (category === 'interest') {
            return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                '<polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/>' +
                '</svg>';
        }
        if (category === 'deposit') {
            return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                '<path d="M12 5v14"/><polyline points="19 12 12 19 5 12"/>' +
                '</svg>';
        }
        if (category === 'redemption') {
            return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                '<path d="M12 19V5"/><polyline points="5 12 12 5 19 12"/>' +
                '</svg>';
        }
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<circle cx="12" cy="12" r="4"/>' +
            '</svg>';
    }

    // ============================================================
    // RENDER USER DATA
    // ============================================================
    function renderUser(user) {
        userData = user;
        const firstName = user.fullName ? user.fullName.split(' ')[0] : 'Investor';
        const initials = user.fullName
            ? user.fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
            : 'U';

        const nameEl = $('userFirstName');
        if (nameEl) nameEl.textContent = firstName;

        const avatarEl = $('userAvatar');
        if (avatarEl) avatarEl.textContent = initials;

        const portfolioEl = $('balanceFigure');
        if (portfolioEl) portfolioEl.textContent = formatKES(user.portfolioValue || 0);

        const unitsEl = $('unitsDisplay');
        if (unitsEl) unitsEl.textContent = (user.unitsHeld || 0).toFixed(4) + ' units';

        const yieldEl = $('yieldDisplay');
        if (yieldEl) yieldEl.textContent = (user.annualYield || 10.62).toFixed(2) + '% p.a.';

        const rewardEl = $('rewardMessage');
        if (rewardEl) {
            if ((user.portfolioValue || 0) === 0) {
                rewardEl.textContent = 'Welcome — start investing from KES 100.';
            } else {
                rewardEl.textContent = 'Interest accrues daily at ' + (user.annualYield || 10.62).toFixed(2) + '% p.a.';
            }
        }

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
    }

    // ============================================================
    // RENDER TRANSACTIONS
    // ============================================================
    function renderTransactions(transactions) {
        const container = $('transactionList');
        if (!container) return;

        if (!transactions || transactions.length === 0) {
            container.innerHTML =
                '<div class="empty-state">' +
                '<p>No transactions yet.</p>' +
                '<p style="font-size:0.82rem;margin-top:0.35rem;">Your activity will appear here once you start investing.</p>' +
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
                const amountClass = t.type === 'credit' ? 'positive' : 'negative';
                html += '<div class="transaction-row">' +
                    '<div class="icon-wrap">' + txIcon(t.category) + '</div>' +
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

    // ============================================================
    // RENDER STATS
    // ============================================================
    function renderStats(stats) {
        const todayEl = document.querySelector('.stats-today');
        const monthEl = document.querySelector('.stats-month');
        const ytdEl = document.querySelector('.stats-ytd');
        const yieldEl = document.querySelector('.stats-yield');

        if (todayEl) todayEl.textContent = 'KES ' + formatKES(stats.interestToday || 0);
        if (monthEl) monthEl.textContent = 'KES ' + formatKES(stats.interestThisMonth || 0);
        if (ytdEl) ytdEl.textContent = 'KES ' + formatKES(stats.interestYTD || 0);
        if (yieldEl) yieldEl.textContent = (stats.currentYield || 10.62).toFixed(2) + '% p.a.';
    }

    // ============================================================
    // RENDER PENDING WITHDRAWALS BANNER
    // ============================================================
    function renderPendingWithdrawals(withdrawals) {
        const banner = $('pendingBanner');
        const text = $('pendingBannerText');
        if (!banner || !text) return;

        const pending = (withdrawals || []).filter(function(w) {
            return w.status === 'pending' || w.status === 'approved';
        });

        if (!pending.length) {
            banner.style.display = 'none';
            return;
        }

        const total = pending.reduce(function(sum, w) { return sum + (w.amount || 0); }, 0);
        const count = pending.length;

        text.textContent = count === 1
            ? 'KES ' + formatKES(total) + ' — awaiting review'
            : count + ' requests totalling KES ' + formatKES(total) + ' — awaiting review';

        banner.style.display = 'flex';
    }

    // ============================================================
    // TOAST
    // ============================================================
    function showToast(message, type) {
        type = type || 'success';
        const container = $('toastContainer');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = 'toast ' + (type === 'error' ? 'error' : type === 'info' ? 'info' : '');
        const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';

        const iconEl = document.createElement('span');
        iconEl.className = 'toast-icon';
        iconEl.textContent = icon;

        const msgEl = document.createElement('span');
        msgEl.className = 'toast-msg';
        msgEl.textContent = message;

        toast.appendChild(iconEl);
        toast.appendChild(msgEl);
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }
    window.showToast = showToast;

    // ============================================================
    // LOGOUT / SUPPORT
    // ============================================================
    function handleLogout() {
        if (confirm('Are you sure you want to sign out?')) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = 'login.html';
        }
    }
    window.handleLogout = handleLogout;

    function contactWhatsApp() {
        window.open('https://wa.me/255760355866?text=' + encodeURIComponent('Hello RockWin Support'), '_blank');
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
    // NOTIFICATION DRAWER
    // ============================================================
    function openNotifDrawer() {
        const overlay = $('notifOverlay');
        const drawer = $('notifDrawer');
        if (overlay) overlay.classList.add('open');
        if (drawer) drawer.classList.add('open');
    }
    function closeNotifDrawer() {
        const overlay = $('notifOverlay');
        const drawer = $('notifDrawer');
        if (overlay) overlay.classList.remove('open');
        if (drawer) drawer.classList.remove('open');
    }
    window.openNotifDrawer = openNotifDrawer;
    window.closeNotifDrawer = closeNotifDrawer;

    const notifBtn = $('notifBtn');
    if (notifBtn) {
        notifBtn.addEventListener('click', function() {
            const badge = $('notifBadge');
            if (badge) { badge.textContent = '0'; badge.style.display = 'none'; }
            openNotifDrawer();
        });
    }

    // ============================================================
    // FAB
    // ============================================================
    const fabBtn = $('fabBtn');
    const fabMenu = $('fabMenu');
    if (fabBtn && fabMenu) {
        fabBtn.addEventListener('click', function() {
            fabMenu.classList.toggle('open');
        });
        document.addEventListener('click', function(e) {
            if (!e.target.closest('#fabBtn') && !e.target.closest('#fabMenu')) {
                fabMenu.classList.remove('open');
            }
        });
    }

    // ============================================================
    // DEPOSIT HANDLER
    // ============================================================
    window.handleDeposit = async function(e) {
        e.preventDefault();

        const amount = parseFloat($('depositAmount').value);
        const phoneInput = $('depositPhone') ? $('depositPhone').value.trim() : '';

        if (!amount || amount < 100) {
            showToast('Minimum deposit is KES 100.', 'error');
            return;
        }

        let phone = phoneInput;
        if (!phone && userData && userData.phoneNumber) {
            phone = userData.phoneNumber;
        }
        if (!phone) {
            showToast('Please enter your M-PESA phone number.', 'error');
            return;
        }

        const submitBtn = e.target.querySelector('.btn-modal-primary');
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending prompt…';

        try {
            const result = await apiFetch('/api/payments/deposit', {
                method: 'POST',
                body: JSON.stringify({ amount, phoneNumber: phone })
            });

            const waitingHtml =
                '<div style="text-align:center;padding:1.25rem 0;">' +
                '<h3 style="font-family:var(--font-display);font-size:1.15rem;font-weight:500;margin-bottom:0.75rem;letter-spacing:-0.012em;">Check your phone</h3>' +
                '<p style="color:var(--text-secondary);font-size:0.9rem;line-height:1.6;max-width:32ch;margin:0 auto;">' +
                'We sent an M-PESA prompt to <strong style="color:var(--text-primary);">' + result.phoneNumber + '</strong>. ' +
                'Enter your PIN to deposit <strong style="color:var(--accent-green);">KES ' + formatKES(result.amount) + '</strong>.' +
                '</p>' +
                '<div id="depositStatusBox" style="margin-top:1.5rem;padding:0.85rem 1rem;background:var(--forest-soft);border:1px solid rgba(27,67,50,0.12);border-radius:6px;font-size:0.85rem;color:var(--text-secondary);">' +
                '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--forest);margin-right:0.5rem;animation:pulse-load 1.5s ease-in-out infinite;"></span>' +
                'Waiting for confirmation…' +
                '</div>' +
                '<p style="font-size:0.72rem;color:var(--text-muted);margin-top:1rem;">Ref: ' + result.reference + '</p>' +
                '</div>';

            e.target.innerHTML = waitingHtml;
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
        const maxAttempts = 40;

        depositPoller = setInterval(async function() {
            attempts++;
            try {
                const status = await apiFetch('/api/payments/status/' + paymentId);
                const box = $('depositStatusBox');

                if (status.status === 'completed') {
                    clearInterval(depositPoller);
                    depositPoller = null;

                    if (box) {
                        box.style.background = 'var(--forest-soft)';
                        box.style.color = 'var(--forest)';
                        box.style.borderColor = 'rgba(27,67,50,0.2)';
                        box.textContent = 'Payment received. ' + status.unitsCredited.toFixed(4) + ' units added.';
                    }

                    showToast('Deposit confirmed — KES ' + formatKES(status.amount) + ' added.', 'success');

                    setTimeout(async function() {
                        closeModal('depositModal');
                        await loadDashboard();
                    }, 2000);
                } else if (status.status === 'failed' || status.status === 'cancelled' || status.status === 'timeout') {
                    clearInterval(depositPoller);
                    depositPoller = null;
                    if (box) {
                        box.style.background = 'var(--error-bg)';
                        box.style.color = 'var(--error)';
                        box.style.borderColor = 'rgba(138,58,46,0.2)';
                        box.textContent = status.failureReason || 'Payment failed.';
                    }
                    showToast(status.failureReason || 'Payment failed.', 'error');
                }

                if (attempts >= maxAttempts) {
                    clearInterval(depositPoller);
                    depositPoller = null;
                    if (box) {
                        box.style.background = 'rgba(138,106,46,0.06)';
                        box.style.color = 'var(--warning)';
                        box.style.borderColor = 'rgba(138,106,46,0.2)';
                        box.textContent = 'No response from your phone. Please try again.';
                    }
                }
            } catch (err) {
                console.warn('Poll error:', err.message);
            }
        }, 3000);
    }

    // ============================================================
    // WITHDRAW HANDLER
    // ============================================================
    window.handleWithdraw = async function(e) {
        e.preventDefault();

        const destination = $('withdrawDestination').value;
        const account = $('withdrawAccount').value.trim();
        const amount = parseFloat($('withdrawAmount').value);

        if (!destination) return showToast('Please select a destination.', 'error');
        if (!account) return showToast('Please enter the account or phone number.', 'error');
        if (!amount || amount < 1000) return showToast('Minimum redemption is KES 1,000.', 'error');

        const available = userData ? (userData.portfolioValue || 0) : 0;
        if (amount > available) {
            return showToast('Amount exceeds your available balance of KES ' + formatKES(available) + '.', 'error');
        }

        const submitBtn = e.target.querySelector('.btn-modal-primary');
        const original = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting…';

        try {
            const result = await apiFetch('/api/withdrawals/request', {
                method: 'POST',
                body: JSON.stringify({ amount, destination, account })
            });

            showToast('Redemption requested. Ref ' + result.reference + '. Funds typically sent within 24–48 hours.', 'success');
            closeModal('withdrawModal');
            e.target.reset();
            await loadDashboard();
        } catch (err) {
            showToast(err.message || 'Could not submit request.', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = original;
        }
    };

    // ============================================================
    // STATEMENT — PDF download (jsPDF + autoTable)
    // ============================================================
    window.downloadStatement = async function() {
        if (!userData) {
            showToast('Account details not loaded yet. Please wait a moment.', 'error');
            return;
        }

        const jsPDFCtor = window.jspdf && window.jspdf.jsPDF;
        if (!jsPDFCtor) {
            showToast('Statement library failed to load. Check your connection.', 'error');
            return;
        }

        showToast('Generating statement…', 'info');

        try {
            const transactions = await apiFetch('/api/user/ledger').catch(function() { return []; });

            const doc = new jsPDFCtor({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();

            // ---------- HEADER ----------
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(20);
            doc.setTextColor(15, 26, 20);
            doc.text('RockWin Investment', 14, 20);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.setTextColor(74, 83, 77);
            doc.text('Statement of Account', 14, 27);

            doc.setFontSize(8);
            doc.text('Generated: ' + new Date().toLocaleString('en-KE'), pageWidth - 14, 20, { align: 'right' });
            doc.text('Reference: ' + (userData.accountNumber || '—'), pageWidth - 14, 25, { align: 'right' });

            // ---------- ACCOUNT SUMMARY ----------
            doc.setDrawColor(232, 227, 214);
            doc.setLineWidth(0.3);
            doc.line(14, 34, pageWidth - 14, 34);

            doc.setFontSize(9);
            doc.setTextColor(74, 83, 77);
            const leftCol = 14;
            const rightCol = pageWidth / 2 + 5;

            doc.text('Account holder', leftCol, 42);
            doc.text('Account number', leftCol, 48);
            doc.text('Email', leftCol, 54);
            doc.text('Portfolio value', rightCol, 42);
            doc.text('Units held', rightCol, 48);
            doc.text('Gross yield', rightCol, 54);

            doc.setFont('helvetica', 'bold');
            doc.setTextColor(15, 26, 20);
            doc.text(userData.fullName || '—', leftCol + 32, 42);
            doc.text(userData.accountNumber || '—', leftCol + 32, 48);
            doc.text(userData.email || '—', leftCol + 32, 54);
            doc.text('KES ' + formatKES(userData.portfolioValue || 0), rightCol + 30, 42);
            doc.text((userData.unitsHeld || 0).toFixed(4), rightCol + 30, 48);
            doc.text((userData.annualYield || 10.62).toFixed(2) + '% p.a.', rightCol + 30, 54);

            // ---------- TRANSACTIONS TABLE ----------
            const tableData = (transactions || []).map(function(t) {
                const date = t.date
                    ? new Date(t.date).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })
                    : '—';
                return [
                    date,
                    t.description || '—',
                    t.reference || '—',
                    (t.type === 'credit' ? '+ ' : '− ') + (t.amount || '0.00')
                ];
            });

            if (tableData.length === 0) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(10);
                doc.setTextColor(138, 144, 137);
                doc.text('No transactions on this account yet.', pageWidth / 2, 80, { align: 'center' });
            } else {
                doc.autoTable({
                    startY: 65,
                    head: [['Date', 'Description', 'Reference', 'Amount (KES)']],
                    body: tableData,
                    theme: 'grid',
                    headStyles: {
                        fillColor: [27, 67, 50],
                        textColor: [245, 241, 232],
                        fontStyle: 'bold',
                        fontSize: 9
                    },
                    bodyStyles: {
                        fontSize: 9,
                        textColor: [74, 83, 77]
                    },
                    alternateRowStyles: {
                        fillColor: [237, 231, 218]
                    },
                    columnStyles: {
                        0: { cellWidth: 30 },
                        1: { cellWidth: 65 },
                        2: { cellWidth: 45 },
                        3: { cellWidth: 40, halign: 'right' }
                    },
                    margin: { left: 14, right: 14 }
                });
            }

            // ---------- FOOTER ON EVERY PAGE ----------
            const pageCount = doc.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setDrawColor(232, 227, 214);
                doc.line(14, pageHeight - 18, pageWidth - 14, pageHeight - 18);

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7.5);
                doc.setTextColor(138, 144, 137);
                doc.text('RockWin Investment Ltd · info@rockwininvestment.com', 14, pageHeight - 12);
                doc.text('Page ' + i + ' of ' + pageCount, pageWidth - 14, pageHeight - 12, { align: 'right' });

                doc.setFontSize(6.5);
                doc.text(
                    'This statement is for information purposes. Past performance is not a guarantee of future returns.',
                    pageWidth / 2, pageHeight - 7, { align: 'center' }
                );
            }

            // ---------- SAVE ----------
            const filename =
                'RockWin-Statement-' +
                (userData.accountNumber || 'account') +
                '-' +
                new Date().toISOString().slice(0, 10) +
                '.pdf';

            doc.save(filename);
            showToast('Statement downloaded.', 'success');
        } catch (err) {
            console.error('Statement generation error:', err);
            showToast('Could not generate statement: ' + (err.message || 'unknown error'), 'error');
        }
    };

    // ============================================================
    // LOAD DASHBOARD
    // ============================================================
    async function loadDashboard() {
        try {
            const results = await Promise.all([
                apiFetch('/api/user/profile'),
                apiFetch('/api/user/ledger').catch(function() { return []; }),
                apiFetch('/api/user/stats').catch(function() { return {}; }),
                apiFetch('/api/withdrawals/mine').catch(function() { return { withdrawals: [] }; })
            ]);

            renderUser(results[0]);
            renderTransactions(results[1]);
            renderStats(results[2]);
            renderPendingWithdrawals(results[3].withdrawals || []);
        } catch (err) {
            console.error('Dashboard load error:', err);
            showToast('Failed to load dashboard.', 'error');
        }
    }

    // ============================================================
    // INIT
    // ============================================================
    document.addEventListener('DOMContentLoaded', async function() {
        const now = new Date();
        const hour = now.getHours();
        let greeting = 'Good morning';
        if (hour >= 12 && hour < 17) greeting = 'Good afternoon';
        else if (hour >= 17) greeting = 'Good evening';

        const greetingTextEl = $('greetingText');
        if (greetingTextEl) greetingTextEl.textContent = greeting;

        const mins = now.getMinutes().toString().padStart(2, '0');
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const h12 = hour % 12 || 12;
        if ($('lastLoginTime')) $('lastLoginTime').textContent = h12 + ':' + mins + ' ' + ampm;

        await loadDashboard();

        // Auto-fill the withdrawal account when M-PESA is selected
        const destSelect = $('withdrawDestination');
        if (destSelect) {
            destSelect.addEventListener('change', function() {
                const acct = $('withdrawAccount');
                if (!acct) return;
                if (this.value === 'mpesa' && userData && userData.phoneNumber) {
                    acct.value = userData.phoneNumber;
                } else if (this.value === 'bank') {
                    acct.value = '';
                }
            });
        }
    });

})();