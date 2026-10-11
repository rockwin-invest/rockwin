(function() {
    'use strict';

    const API_BASE = 'https://rockwin.onrender.com';
    let currentUser = null;

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
        }, 3500);
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
    // RENDER USER DATA
    // ============================================================
    function renderUser(user) {
        currentUser = user;

        const firstName = user.fullName ? user.fullName.split(' ')[0] : 'Investor';
        const initials = user.fullName
            ? user.fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
            : 'U';

        // Header
        $('userFirstName').textContent = firstName;
        $('userAvatar').textContent = initials;

        // Profile card
        $('profileAvatar').textContent = initials;
        $('profileFullName').textContent = user.fullName;
        $('profileAccountBadge').textContent = 'Account: ' + user.accountNumber;

        // Member since
        if (user.createdAt) {
            const created = new Date(user.createdAt);
            const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
            $('profileMemberSince').textContent = 'Investor since ' + months[created.getMonth()] + ' ' + created.getFullYear();
        }

        // KYC badge
        const kycMap = { active: 'Verified', pending: 'Pending KYC', suspended: 'Suspended' };
        $('profileKycBadge').textContent = '● ' + (kycMap[user.status] || user.status);

        // Personal Info inputs
        $('settingsFullName').value = user.fullName || '';
        $('settingsPhone').value = user.phoneNumber || '';
        $('settingsEmail').value = user.email || '';
        if (user.dateOfBirth) {
            $('settingsDob').value = new Date(user.dateOfBirth).toISOString().split('T')[0];
        }

        // Next of Kin
        if (user.nextOfKin) {
            $('nokName').textContent = user.nextOfKin.name || '—';
            $('nokPhone').textContent = user.nextOfKin.phone || '—';
            $('nokRelationship').textContent = user.nextOfKin.relationship || '—';
        }

        // Investment Summary
        $('summaryPortfolioValue').textContent = 'KES ' + formatKES(user.portfolioValue);
        $('summaryUnits').textContent = (user.unitsHeld || 0).toFixed(4);
        $('summaryYield').textContent = (user.annualYield || 14.2).toFixed(2) + '% p.a.';
        $('summaryInterestYTD').textContent = 'KES ' + formatKES(user.ytdInterestEarned);

        // KYC card
        $('kycIdNumber').textContent = user.idNumber || '—';
        $('kycStatus').textContent = (kycMap[user.status] || user.status) + ' ✓';
        $('kycKraPin').textContent = user.kraPin || 'Not set';
        $('kycTaxConsent').textContent = user.kraConsent ? 'Accepted' : 'Not accepted';
        $('kycCmaStatus').textContent = 'Active';
    }

    // ============================================================
    // SAVE PROFILE
    // ============================================================
    window.saveProfile = async function() {
        const fullName = $('settingsFullName').value.trim();
        const email = $('settingsEmail').value.trim();
        const phone = $('settingsPhone').value.trim();

        if (!fullName || fullName.length < 2) {
            showToast('Please enter your full name.', 'error');
            return;
        }
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            showToast('Please enter a valid email address.', 'error');
            return;
        }

        try {
            await apiFetch('/api/user/profile', {
                method: 'PUT',
                body: JSON.stringify({ fullName, email, phoneNumber: phone })
            });
            showToast('Profile updated successfully!', 'success');
            const user = await apiFetch('/api/user/profile');
            renderUser(user);
        } catch (err) {
            showToast(err.message || 'Failed to update profile.', 'error');
        }
    };

    // ============================================================
    // CHANGE PASSWORD
    // ============================================================
    window.changePassword = async function() {
        const current = $('currentPassword').value;
        const newPwd  = $('newPassword').value;
        const confirm = $('confirmNewPassword').value;
        const btn = document.querySelector('.btn-save-sm');

        if (!current || !newPwd || !confirm) return showToast('Please fill in all password fields.', 'error');
        if (newPwd.length < 8) return showToast('New password must be at least 8 characters.', 'error');
        if (!/[A-Z]/.test(newPwd) || !/[0-9]/.test(newPwd))
            return showToast('Include at least one uppercase letter and one number.', 'error');
        if (newPwd !== confirm) return showToast('Passwords do not match.', 'error');
        if (newPwd === current) return showToast('New password must differ from current.', 'error');

        btn.disabled = true;
        btn.textContent = 'Updating…';
        try {
            await apiFetch('/api/user/change-password', {
                method: 'POST',
                body: JSON.stringify({ currentPassword: current, newPassword: newPwd })
            });
            $('currentPassword').value = '';
            $('newPassword').value = '';
            $('confirmNewPassword').value = '';
            showToast('Password updated successfully.', 'success');
        } catch (err) {
            showToast(err.message || 'Failed to update password.', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Update Password';
        }
    };

    // ============================================================
    // TOGGLES
    // ============================================================
    window.handleToggle = function(key, enabled) {
        const statusMap = {
            '2fa': '2fa-status',
            'bio': 'bio-status',
            'email': 'email-status',
            'interest': 'interest-status',
            'login': 'login-status',
            'marketing': 'marketing-status'
        };

        const labelMap = {
            '2fa': 'Two-Factor Authentication',
            'bio': 'Biometric Login',
            'email': 'Email Alerts',
            'interest': 'Daily Interest Alerts',
            'login': 'Login Alerts',
            'marketing': 'Marketing Communications'
        };

        const statusEl = $(statusMap[key]);
        if (statusEl) {
            statusEl.textContent = enabled ? 'On' : 'Off';
            statusEl.classList.toggle('on', enabled);
        }

        showToast((labelMap[key] || key) + ' ' + (enabled ? 'enabled' : 'disabled'), 'success');
    };

    // ============================================================
    // CLOSE ACCOUNT
    // ============================================================
    window.handleCloseAccount = function() {
        const confirmText = prompt(
            'To confirm account closure, type "CLOSE" below:\n\n' +
            '⚠️ All units will be redeemed to your registered M-PESA or bank account within 3 business days.'
        );

        if (confirmText === 'CLOSE') {
            showToast('Account closure request submitted. Our team will contact you within 24 hours.', 'error');
        } else if (confirmText !== null) {
            showToast('Account closure cancelled — confirmation text did not match.', 'info');
        }
    };

    // ============================================================
    // NOTIFICATIONS
    // ============================================================
    const notifBtn = $('notifBtn');
    if (notifBtn) {
        notifBtn.addEventListener('click', function() {
            const badge = $('notifBadge');
            if (badge) { badge.textContent = '0'; badge.style.display = 'none'; }
            showToast('No new notifications', 'info');
        });
    }

    // ============================================================
    // INIT
    // ============================================================
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

        try {
            const user = await apiFetch('/api/user/profile');
            renderUser(user);
        } catch (err) {
            console.error('Settings load error:', err);
            showToast('Failed to load account data.', 'error');
        }
    });

})();