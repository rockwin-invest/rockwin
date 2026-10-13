(function() {
    'use strict';

    const API_BASE = 'https://api.rockwininvestment.com';

    // ---------- DOM REFS ----------
    const form = document.getElementById('resetForm');
    const alertBox = document.getElementById('alertBox');
    const submitBtn = document.getElementById('submitBtn');
    const btnSpinner = document.getElementById('btnSpinner');
    const btnText = document.getElementById('btnText');
    const phoneInput = document.getElementById('phoneNumber');

    const resendTimer = document.getElementById('resendTimer');
    const resendLink = document.getElementById('resendLink');
    const countdownDisplay = document.getElementById('countdownDisplay');
    const countdownSec = document.getElementById('countdownSec');

    let countdownInterval = null;
    let countdownValue = 60;
    let canResend = false;

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
            }, 8000);
        }
    }

    // ---------- COUNTDOWN ----------
    function startCountdown(seconds) {
        countdownValue = seconds || 60;
        canResend = false;
        resendLink.style.display = 'none';
        countdownDisplay.style.display = 'inline';
        countdownSec.textContent = countdownValue;

        if (countdownInterval) clearInterval(countdownInterval);

        countdownInterval = setInterval(function() {
            countdownValue -= 1;
            countdownSec.textContent = countdownValue;

            if (countdownValue <= 0) {
                clearInterval(countdownInterval);
                countdownInterval = null;
                canResend = true;
                resendLink.style.display = 'inline';
                countdownDisplay.style.display = 'none';
            }
        }, 1000);
    }

    // ---------- RESEND ----------
    if (resendLink) {
        resendLink.addEventListener('click', function(e) {
            e.preventDefault();
            if (!canResend) return;

            if (phoneInput.value.trim().match(/^[0-9]{9}$/)) {
                form.dispatchEvent(new Event('submit'));
            } else {
                showAlert('Please enter a valid 9-digit phone number.', 'error');
            }
        });
    }

    // ---------- SUBMIT ----------
    if (form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            if (alertBox) alertBox.className = 'alert-box';

            const phoneRaw = phoneInput.value.trim();
            const phoneNumber = '+254' + phoneRaw.replace(/\s/g, '');

            if (!phoneRaw.match(/^[0-9]{9}$/)) {
                showAlert('Please enter a valid 9-digit phone number, e.g. 712345678.', 'error');
                return;
            }

            submitBtn.disabled = true;
            btnSpinner.style.display = 'block';
            btnText.textContent = 'Sending…';

            try {
                const response = await fetch(API_BASE + '/api/auth/forgot-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phoneNumber })
                });

                const data = await response.json();

                if (response.ok) {
                    showAlert(
                        'If this number is registered, a 6-digit reset code has been sent to the email address on your account.',
                        'success'
                    );
                    resendTimer.style.display = 'block';
                    startCountdown(60);
                } else {
                    throw new Error(data.error || 'Something went wrong. Please try again.');
                }
            } catch (err) {
                showAlert(err.message || 'Unable to connect. Check your network.', 'error');
            } finally {
                submitBtn.disabled = false;
                btnSpinner.style.display = 'none';
                btnText.textContent = 'Send reset code';
            }
        });
    }

    // ---------- INPUT CLEANUP ----------
    if (phoneInput) {
        phoneInput.addEventListener('input', function() {
            this.value = this.value.replace(/\D/g, '').slice(0, 9);
        });
        phoneInput.addEventListener('blur', function() {
            this.value = this.value.replace(/\s/g, '');
        });
    }

})();