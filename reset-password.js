(function() {
    'use strict';

    // ---------- CONFIG ----------
    const API_BASE = 'https://equin-bank-ltd.onrender.com';

    // ----- DOM refs -----
    const form = document.getElementById('resetForm');
    const alertBox = document.getElementById('alertBox');
    const submitBtn = document.getElementById('submitBtn');
    const btnSpinner = document.getElementById('btnSpinner');
    const btnText = document.getElementById('btnText');

    const phoneInput = document.getElementById('phoneNumber');
    const otpInput = document.getElementById('otpCode');
    const newPassInput = document.getElementById('newPassword');
    const confirmPassInput = document.getElementById('confirmPassword');

    const strengthFill = document.getElementById('strengthFill');
    const strengthLabel = document.getElementById('strengthLabel');

    const phoneGroup = document.getElementById('phoneGroup');

    // ----- Auto-fill phone from URL query param (e.g., ?phone=+254712345678) -----
    (function autoFillPhone() {
        const params = new URLSearchParams(window.location.search);
        const phoneParam = params.get('phone');
        if (phoneParam) {
            // Strip '+254' if present to get raw 9-digit number
            let raw = phoneParam.replace(/^\+254/, '').replace(/\s/g, '');
            if (raw.match(/^[0-9]{9}$/)) {
                phoneInput.value = raw;
                // Hide the phone group since it's auto-filled
                phoneGroup.style.display = 'none';
            }
        }
    })();

    // ----- Password Strength Meter (live) -----
    function checkPasswordStrength(pw) {
        let score = 0;
        if (pw.length >= 6) score++;
        if (/[A-Z]/.test(pw)) score++;
        if (/[0-9]/.test(pw)) score++;
        if (/[^A-Za-z0-9]/.test(pw)) score++;

        const widthMap = ['0%', '25%', '50%', '75%', '100%'];
        const labelMap = ['Too Short', 'Weak', 'Medium', 'Good', 'Strong'];
        const colorMap = ['#f87171', '#f87171', '#fbbf24', '#60a5fa', '#2ecc71'];

        const index = Math.min(score, 4);
        strengthFill.style.width = widthMap[index];
        strengthFill.style.background = colorMap[index];
        strengthLabel.textContent = labelMap[index];
        return score;
    }

    newPassInput.addEventListener('input', function() {
        checkPasswordStrength(this.value);
        // Also validate confirm password live
        if (confirmPassInput.value.length > 0) {
            validateConfirmPassword();
        }
    });

    // ----- Confirm Password live validation -----
    function validateConfirmPassword() {
        const newPw = newPassInput.value;
        const confirmPw = confirmPassInput.value;
        if (confirmPw.length === 0) return true;
        if (newPw === confirmPw) {
            confirmPassInput.style.borderColor = 'var(--accent-green)';
            return true;
        } else {
            confirmPassInput.style.borderColor = 'var(--error)';
            return false;
        }
    }

    confirmPassInput.addEventListener('input', validateConfirmPassword);

    // ----- Helper: show alert -----
    function showAlert(message, type) {
        alertBox.className = 'alert-box';
        alertBox.classList.add(type);
        alertBox.textContent = message;
        if (type === 'success') {
            clearTimeout(window.alertTimeout);
            window.alertTimeout = setTimeout(() => {
                alertBox.className = 'alert-box';
            }, 6000);
        }
    }

    // ----- Form submission -----
    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        // Reset alert
        alertBox.className = 'alert-box';

        // Gather data
        const phoneRaw = phoneInput.value.trim();
        const phoneNumber = '+254' + phoneRaw.replace(/\s/g, '');
        const otp = otpInput.value.trim();
        const newPassword = newPassInput.value;
        const confirmPassword = confirmPassInput.value;

        // ---- Client-side validation ----
        if (!phoneRaw.match(/^[0-9]{9}$/)) {
            showAlert('Please enter a valid 9-digit phone number.', 'error');
            return;
        }

        if (!otp.match(/^[0-9]{6}$/)) {
            showAlert('Please enter the 6-digit verification code from your SMS.', 'error');
            return;
        }

        if (newPassword.length < 6) {
            showAlert('Password must be at least 6 characters long.', 'error');
            return;
        }

        if (newPassword !== confirmPassword) {
            showAlert('Passwords do not match. Please re-enter.', 'error');
            return;
        }

        // ---- UI: loading state ----
        submitBtn.disabled = true;
        btnSpinner.style.display = 'block';
        btnText.textContent = 'Updating...';

        // ---- Payload ----
        const payload = {
            phoneNumber,
            otp,
            newPassword
        };

        try {
            // ✅ Updated to use Render backend
            const response = await fetch(`${API_BASE}/api/auth/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (response.ok) {
                showAlert('✅ Password reset successful! Redirecting to login...', 'success');
                // Redirect to login after short delay
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 1800);
            } else {
                throw new Error(data.error || 'Invalid OTP or expired token. Please try again.');
            }
        } catch (err) {
            showAlert(err.message || 'Unable to connect to server. Check your network.', 'error');
            // Restore button
            submitBtn.disabled = false;
            btnSpinner.style.display = 'none';
            btnText.textContent = 'Reset Password';
        }
    });

    // ----- Trim spaces from phone on blur -----
    phoneInput.addEventListener('blur', function() {
        this.value = this.value.replace(/\s/g, '');
    });

    // ----- OTP input: only allow digits -----
    otpInput.addEventListener('input', function() {
        this.value = this.value.replace(/\D/g, '').slice(0, 6);
    });

})();