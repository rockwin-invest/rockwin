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

    // ---------- PASSWORD SHOW / HIDE ----------
    document.querySelectorAll('.password-toggle').forEach(function(btn) {
        btn.addEventListener('click', function() {
            const input = document.getElementById(btn.dataset.target);
            if (!input) return;

            const reveal = input.type === 'password';
            input.type = reveal ? 'text' : 'password';
            btn.classList.toggle('revealed', reveal);
            btn.setAttribute('aria-pressed', String(reveal));
            btn.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
        });
    });

    // ---------- REAL-TIME VALIDATION ----------
    if (phoneInput) {
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
            this.value = this.value.replace(/\s/g, '');
            const error = document.getElementById('phoneError');
            if (this.value.length > 0 && this.value.length !== 9) {
                this.classList.add('error');
                error.classList.add('visible');
            }
        });
    }

    if (passwordInput) {
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

        // Enter key submits
        passwordInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                form.dispatchEvent(new Event('submit'));
            }
        });
    }

    // ---------- SHOW ALERT ----------
    function showAlert(message, type) {
        if (!alertBox) return;
        alertBox.className = 'alert-box';
        alertBox.classList.add(type);
        alertBox.textContent = message;
        if (type === 'success') {
            clearTimeout(window.alertTimeout);
            window.alertTimeout = setTimeout(function() {
                alertBox.className = 'alert-box';
            }, 5000);
        }
    }

    // ---------- FORM SUBMISSION ----------
    if (form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            if (alertBox) alertBox.className = 'alert-box';

            const phoneRaw = phoneInput.value.trim();
            const phoneNumber = '+254' + phoneRaw.replace(/\s/g, '');
            const password = passwordInput.value;

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

            submitBtn.disabled = true;
            btnSpinner.style.display = 'block';
            btnText.textContent = 'Signing in…';

            try {
                const response = await fetch(API_BASE + '/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phoneNumber, password })
                });

                const data = await response.json();

                if (response.ok) {
                    if (data.token) {
                        localStorage.setItem('token', data.token);
                        if (data.user) {
                            localStorage.setItem('user', JSON.stringify(data.user));
                        }
                    }
                    showAlert('Signed in. Redirecting…', 'success');
                    setTimeout(function() {
                        window.location.href = 'dashboard.html';
                    }, 900);
                } else {
                    throw new Error(data.error || 'Invalid credentials. Please try again.');
                }
            } catch (err) {
                showAlert(err.message || 'Unable to connect to server. Check your network.', 'error');
                submitBtn.disabled = false;
                btnSpinner.style.display = 'none';
                btnText.textContent = 'Sign in';
            }
        });
    }

})();