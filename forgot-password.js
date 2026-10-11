 (function() {
            'use strict';

            // ----- DOM refs -----
            const form = document.getElementById('resetForm');
            const alertBox = document.getElementById('alertBox');
            const submitBtn = document.getElementById('submitBtn');
            const btnSpinner = document.getElementById('btnSpinner');
            const btnText = document.getElementById('btnText');

            const resendTimer = document.getElementById('resendTimer');
            const resendLink = document.getElementById('resendLink');
            const countdownDisplay = document.getElementById('countdownDisplay');
            const countdownSec = document.getElementById('countdownSec');

            let countdownInterval = null;
            let countdownValue = 60;
            let canResend = false;

            // ----- Helper: show alert -----
            function showAlert(message, type) {
                alertBox.className = 'alert-box';
                alertBox.classList.add(type);
                alertBox.textContent = message;
                if (type === 'success') {
                    clearTimeout(window.alertTimeout);
                    window.alertTimeout = setTimeout(() => {
                        alertBox.className = 'alert-box';
                    }, 8000);
                }
            }

            // ----- Helper: start countdown -----
            function startCountdown(seconds) {
                countdownValue = seconds || 60;
                canResend = false;
                resendLink.style.display = 'none';
                countdownDisplay.style.display = 'inline';
                countdownSec.textContent = countdownValue;

                if (countdownInterval) clearInterval(countdownInterval);

                countdownInterval = setInterval(() => {
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

            // ----- Resend handler -----
            resendLink.addEventListener('click', function(e) {
                e.preventDefault();
                if (canResend) {
                    // Simulate resend: re-submit the form programmatically
                    const phoneInput = document.getElementById('phoneNumber');
                    if (phoneInput.value.trim().match(/^[0-9]{9}$/)) {
                        // Trigger the same flow as submit
                        form.dispatchEvent(new Event('submit'));
                    } else {
                        showAlert('Please enter a valid 9-digit phone number.', 'error');
                    }
                }
            });

            // ----- Form submission -----
            form.addEventListener('submit', async function(e) {
                e.preventDefault();

                // Reset alert
                alertBox.className = 'alert-box';

                // Gather data
                const phoneRaw = document.getElementById('phoneNumber').value.trim();
                const phoneNumber = '+254' + phoneRaw.replace(/\s/g, '');

                // ---- Client-side validation ----
                if (!phoneRaw.match(/^[0-9]{9}$/)) {
                    showAlert('Please enter a valid 9-digit phone number (e.g. 712345678).', 'error');
                    return;
                }

                // ---- UI: loading state ----
                submitBtn.disabled = true;
                btnSpinner.style.display = 'block';
                btnText.textContent = 'Sending...';

                // ---- Payload ----
                const payload = { phoneNumber };

                try {
                    const response = await fetch('https://equin-bank-ltd.onrender.com/api/auth/forgot-password', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });

                    const data = await response.json();

                    if (response.ok) {
                        showAlert('✅ Reset link sent via SMS to ' + phoneNumber + '. Check your phone.', 'success');
                        // Show resend timer
                        resendTimer.style.display = 'block';
                        startCountdown(60);
                        // Reset button
                        submitBtn.disabled = false;
                        btnSpinner.style.display = 'none';
                        btnText.textContent = 'Send Reset Link';
                    } else {
                        throw new Error(data.error || 'Phone number not found. Please try again.');
                    }
                } catch (err) {
                    showAlert(err.message || 'Unable to connect to server. Check your network.', 'error');
                    // Restore button
                    submitBtn.disabled = false;
                    btnSpinner.style.display = 'none';
                    btnText.textContent = 'Send Reset Link';
                }
            });

            // ----- Trim spaces from phone on blur -----
            document.getElementById('phoneNumber').addEventListener('blur', function() {
                this.value = this.value.replace(/\s/g, '');
            });

        })();