(function() {
    'use strict';

    // ---------- CONFIG ----------
    const API_BASE = 'https://rockwin.onrender.com';

    // ---------- DOM REFS ----------
    const form = document.getElementById('loginForm');
    const alertBox = document.getElementById('alertBox');
    const submitBtn = document.getElementById('submitBtn');
    const btnSpinner = document.getElementById('btnSpinner');
    const btnText = document.getElementById('btnText');

    const phoneInput = document.getElementById('phoneNumber');
    const passwordInput = document.getElementById('password');

    // ---------- REAL-TIME VALIDATION ----------
    phoneInput.addEventListener('input', function() {
        this.value = this.value.replace(/\D/g, '').slice(0, 9);
        const error = document.getElementById('phoneError');
        if (this.value.length > 0 && this.value.length !== 9) {
            this.classList.add('error');
            error.classList.add('visible');
        } else {
            this.classList.remove('error');
            error.classList.remove('visible');
        }
    });

    phoneInput.addEventListener('blur', function() {
        const error = document.getElementById('phoneError');
        if (this.value.length > 0 && this.value.length !== 9) {
            this.classList.add('error');
            error.classList.add('visible');
        }
    });

    passwordInput.addEventListener('blur', function() {
        const error = document.getElementById('passwordError');
        if (this.value.length === 0) {
            this.classList.add('error');
            error.classList.add('visible');
        } else {
            this.classList.remove('error');
            error.classList.remove('visible');
        }
    });

    passwordInput.addEventListener('input', function() {
        const error = document.getElementById('passwordError');
        if (this.value.length > 0) {
            this.classList.remove('error');
            error.classList.remove('visible');
        }
    });

    // ---------- SHOW ALERT ----------
    function showAlert(message, type) {
        alertBox.className = 'alert-box';
        alertBox.classList.add(type);
        alertBox.textContent = message;
        if (type === 'success') {
            clearTimeout(window.alertTimeout);
            window.alertTimeout = setTimeout(() => {
                alertBox.className = 'alert-box';
            }, 5000);
        }
    }

    // ---------- FORM SUBMISSION ----------
    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        alertBox.className = 'alert-box';

        const phoneRaw = phoneInput.value.trim();
        const phoneNumber = '+254' + phoneRaw.replace(/\s/g, '');
        const password = passwordInput.value;

        // ---- Validation ----
        if (!phoneRaw || phoneRaw.length !== 9) {
            document.getElementById('phoneError').classList.add('visible');
            phoneInput.classList.add('error');
            return;
        }

        if (!password || password.length < 1) {
            document.getElementById('passwordError').classList.add('visible');
            passwordInput.classList.add('error');
            return;
        }

        // ---- Loading ----
        submitBtn.disabled = true;
        btnSpinner.style.display = 'block';
        btnText.textContent = 'Verifying...';

        const payload = { phoneNumber, password };

        try {
            const response = await fetch(`${API_BASE}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (response.ok) {
                // ✅ Store token for subsequent API calls
                if (data.token) {
                    localStorage.setItem('token', data.token);
                    // Store user info if needed
                    if (data.user) {
                        localStorage.setItem('user', JSON.stringify(data.user));
                    }
                }
                showAlert('✅ Access authorized! Redirecting...', 'success');
                setTimeout(() => {
                    window.location.href = 'dashboard.html';
                }, 1200);
            } else {
                throw new Error(data.error || 'Invalid credentials. Please try again.');
            }
        } catch (err) {
            showAlert(err.message || 'Unable to connect to server. Check your network.', 'error');
            submitBtn.disabled = false;
            btnSpinner.style.display = 'none';
            btnText.textContent = 'Sign In';
        }
    });

    // ---------- TRIM PHONE ON BLUR ----------
    phoneInput.addEventListener('blur', function() {
        this.value = this.value.replace(/\s/g, '');
    });

    // ---------- ENTER KEY SUPPORT ----------
    passwordInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            form.dispatchEvent(new Event('submit'));
        }
    });

})();