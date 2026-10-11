(function() {
    'use strict';

    const API_BASE = 'https://rockwin.onrender.com';

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

    function handleLogout() {
        if (confirm('Are you sure you want to sign out?')) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = 'login.html';
        }
    }
    window.handleLogout = handleLogout;

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

    document.addEventListener('DOMContentLoaded', async function() {
        try {
            const user = await apiFetch('/api/user/profile');

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

            // Update avatar in header
            const headerAvatar = $('userAvatar');
            if (headerAvatar) headerAvatar.textContent = initials;

            // Profile card - find elements by their content patterns
            // Update the big avatar and name in profile card
            const profileAvatars = document.querySelectorAll('.balance-hero div[style*="border-radius:50%"]');
            profileAvatars.forEach(el => {
                if (el.textContent.trim().length <= 3) el.textContent = initials;
            });

            // Update name in profile card
            const nameEls = document.querySelectorAll('.balance-hero div');
            nameEls.forEach(el => {
                if (el.style.fontSize === '1.4rem' || el.getAttribute('style')?.includes('1.4rem')) {
                    el.textContent = user.fullName;
                }
            });

            // Update account number badge
            document.querySelectorAll('.balance-hero span').forEach(el => {
                if (el.textContent.includes('Account:')) {
                    el.textContent = 'Account: ' + user.accountNumber;
                }
            });

            // Update form inputs
            const inputs = document.querySelectorAll('.transactions-section input');
            inputs.forEach(input => {
                if (input.type === 'text' && input.value && input.value.length > 0 && !input.value.includes('@')) {
                    if (input.value.split(' ').length >= 2) input.value = user.fullName;
                }
                if (input.type === 'tel') input.value = user.phoneNumber || '';
                if (input.type === 'email') input.value = user.email || '';
                if (input.type === 'date' && user.dateOfBirth) {
                    input.value = new Date(user.dateOfBirth).toISOString().split('T')[0];
                }
            });

            // Update Next of Kin card
            if (user.nextOfKin) {
                document.querySelectorAll('.nok-card .nok-row').forEach(row => {
                    const label = row.querySelector('.label').textContent.trim();
                    const valueEl = row.querySelector('.value');
                    if (label === 'Full Name') valueEl.textContent = user.nextOfKin.name;
                    if (label === 'Phone Number') valueEl.textContent = user.nextOfKin.phone;
                    if (label === 'Relationship') valueEl.textContent = user.nextOfKin.relationship;
                });
            }

            // Update KYC & Compliance card
            document.querySelectorAll('.right-card').forEach(card => {
                const title = card.querySelector('.card-title');
                if (!title) return;

                if (title.textContent.includes('KYC')) {
                    card.querySelectorAll('.card-item').forEach(item => {
                        const label = item.querySelector('.label').textContent.trim();
                        const valueEl = item.querySelector('.value');
                        if (label === 'ID Number') valueEl.textContent = user.idNumber || '—';
                        if (label === 'KYC Status') {
                            const map = { active: 'Verified ✓', suspended: 'Suspended', pending: 'Pending' };
                            valueEl.textContent = map[user.status] || user.status;
                        }
                        if (label === 'KRA PIN') valueEl.textContent = user.kraPin || 'Not set';
                        if (label === 'Withholding Tax Consent') {
                            valueEl.textContent = user.kraConsent ? 'Accepted' : 'Not accepted';
                        }
                    });
                }

                if (title.textContent.includes('Investment Summary')) {
                    card.querySelectorAll('.card-item').forEach(item => {
                        const label = item.querySelector('.label').textContent.trim();
                        const valueEl = item.querySelector('.value');
                        if (label === 'Portfolio Value') valueEl.textContent = 'KES ' + formatKES(user.portfolioValue);
                        if (label === 'Units Held') valueEl.textContent = (user.unitsHeld || 0).toFixed(1);
                        if (label === 'Yield Rate') valueEl.textContent = (user.annualYield || 14.2).toFixed(2) + '% p.a.';
                        if (label === 'Interest YTD') valueEl.textContent = 'KES ' + formatKES(user.ytdInterestEarned);
                    });
                }
            });

        } catch (err) {
            console.error('Profile load error:', err);
            showToast('Failed to load profile data.', 'error');
        }
    });

})();