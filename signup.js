(function() {
    'use strict';

    // ---------- CONFIG ----------
    const API_BASE = 'https://api.rockwininvestment.com';

    // ---------- DOM REFS ----------
    const form = document.getElementById('signupForm');
    const alertBox = document.getElementById('alertBox');
    const submitBtn = document.getElementById('submitBtn');
    const btnSpinner = document.getElementById('btnSpinner');
    const btnText = document.getElementById('btnText');

    const fullName = document.getElementById('fullName');
    const idNumber = document.getElementById('idNumber');
    const dob = document.getElementById('dob');
    const phoneNumber = document.getElementById('phoneNumber');
    const emailInput = document.getElementById('email');
    const nokName = document.getElementById('nokName');
    const nokPhone = document.getElementById('nokPhone');
    const nokRelationship = document.getElementById('nokRelationship');
    const password = document.getElementById('password');
    const confirmPassword = document.getElementById('confirmPassword');
    const terms = document.getElementById('terms');

    const strengthFill = document.getElementById('strengthFill');
    const strengthLabel = document.getElementById('strengthLabel');
    const passwordMatch = document.getElementById('passwordMatch');

    // ---------- PASSWORD SHOW / HIDE ----------
    document.querySelectorAll('.password-toggle').forEach(function(btn) {
        btn.addEventListener('click', function() {
            const targetId = btn.dataset.target;
            const input = document.getElementById(targetId);
            if (!input) return;

            const reveal = input.type === 'password';
            input.type = reveal ? 'text' : 'password';
            btn.classList.toggle('revealed', reveal);
            btn.setAttribute('aria-pressed', String(reveal));
            btn.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
        });
    });

    // ---------- PASSWORD STRENGTH ----------
    function checkPasswordStrength(pw) {
        let score = 0;
        if (pw.length >= 6) score++;
        if (/[A-Z]/.test(pw)) score++;
        if (/[0-9]/.test(pw)) score++;
        if (/[^A-Za-z0-9]/.test(pw)) score++;

        const widthMap = ['0%', '25%', '50%', '75%', '100%'];
        const labelMap = ['Too short', 'Weak', 'Medium', 'Good', 'Strong'];
        const colorMap = ['#8A3A2E', '#8A3A2E', '#8A6A2E', '#1B4332', '#1B4332'];

        const index = Math.min(score, 4);
        if (strengthFill) {
            strengthFill.style.width = widthMap[index];
            strengthFill.style.background = colorMap[index];
        }
        if (strengthLabel) strengthLabel.textContent = labelMap[index];
        return score;
    }

    if (password) {
        password.addEventListener('input', function() {
            checkPasswordStrength(this.value);
            validatePasswordMatch();
        });
    }

    // ---------- CONFIRM PASSWORD MATCH ----------
    function validatePasswordMatch() {
        if (!passwordMatch || !password || !confirmPassword) return;

        const pw = password.value;
        const confirm = confirmPassword.value;

        if (confirm.length === 0) {
            passwordMatch.textContent = '';
            passwordMatch.className = 'password-match';
            return;
        }

        if (pw === confirm) {
            passwordMatch.textContent = '✓ Passwords match';
            passwordMatch.className = 'password-match match';
        } else {
            passwordMatch.textContent = '✗ Passwords do not match';
            passwordMatch.className = 'password-match no-match';
        }
    }

    if (confirmPassword) {
        confirmPassword.addEventListener('input', validatePasswordMatch);
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
            }, 7000);
        }
    }

    // ---------- FORM SUBMISSION ----------
    if (form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            if (alertBox) alertBox.className = 'alert-box';

            const name = fullName.value.trim();
            const id = idNumber.value.trim();
            const birthDate = dob.value;
            const phoneRaw = phoneNumber.value.trim().replace(/\s/g, '');
            const phone = '+254' + phoneRaw;
            const email = emailInput.value.trim();
            const nokNameVal = nokName.value.trim();
            const nokPhoneRaw = nokPhone.value.trim().replace(/\s/g, '');
            const nokPhoneVal = '+254' + nokPhoneRaw;
            const nokRelVal = nokRelationship.value;
            const pass = password.value;
            const confirm = confirmPassword.value;
            const termsChecked = terms.checked;

            let hasError = false;

            if (!name || name.length < 2) {
                showAlert('Please enter your full legal name.', 'error');
                hasError = true;
            }

            if (!id || id.length < 5) {
                showAlert('Please enter a valid National ID (at least 5 digits).', 'error');
                hasError = true;
            }

            if (!birthDate) {
                showAlert('Please enter your date of birth.', 'error');
                hasError = true;
            } else {
                const birth = new Date(birthDate);
                const today = new Date();
                let age = today.getFullYear() - birth.getFullYear();
                const monthDiff = today.getMonth() - birth.getMonth();
                if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
                if (age < 18) {
                    showAlert('You must be at least 18 years old.', 'error');
                    hasError = true;
                }
            }

            if (!phoneRaw || phoneRaw.length !== 9) {
                showAlert('Please enter a valid 9-digit phone number.', 'error');
                hasError = true;
            }

            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                showAlert('Please enter a valid email address.', 'error');
                hasError = true;
            }

            if (!nokNameVal || nokNameVal.length < 2) {
                showAlert('Please enter your next of kin full name.', 'error');
                hasError = true;
            }

            if (!nokPhoneRaw || nokPhoneRaw.length !== 9) {
                showAlert('Please enter a valid 9-digit next of kin phone number.', 'error');
                hasError = true;
            }

            if (!nokRelVal) {
                showAlert('Please select your relationship to next of kin.', 'error');
                hasError = true;
            }

            if (pass.length < 6) {
                showAlert('Password must be at least 6 characters.', 'error');
                hasError = true;
            }

            if (pass !== confirm) {
                showAlert('Passwords do not match.', 'error');
                hasError = true;
            }

            if (!termsChecked) {
                showAlert('You must agree to the Terms of Service to proceed.', 'error');
                return;
            }

            if (hasError) return;

            submitBtn.disabled = true;
            btnSpinner.style.display = 'block';
            btnText.textContent = 'Creating account…';

            const payload = {
                fullName: name,
                phoneNumber: phone,
                email: email,
                idNumber: id,
                dateOfBirth: birthDate,
                password: pass,
                nextOfKin: {
                    name: nokNameVal,
                    phone: nokPhoneVal,
                    relationship: nokRelVal
                }
            };

            try {
                const response = await fetch(API_BASE + '/api/auth/signup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await response.json();

                if (response.ok) {
                    showAlert('Account created. Your account number is ' + data.accountNumber + '. Check your email for confirmation.', 'success');
                    form.reset();
                    if (strengthFill) {
                        strengthFill.style.width = '0%';
                        strengthFill.style.background = '#8A3A2E';
                    }
                    if (strengthLabel) strengthLabel.textContent = 'Weak';
                    if (passwordMatch) {
                        passwordMatch.textContent = '';
                        passwordMatch.className = 'password-match';
                    }
                    submitBtn.disabled = false;
                    btnSpinner.style.display = 'none';
                    btnText.textContent = 'Create account';
                } else {
                    showAlert(data.error || 'Registration failed. Please try again.', 'error');
                    submitBtn.disabled = false;
                    btnSpinner.style.display = 'none';
                    btnText.textContent = 'Create account';
                }
            } catch (err) {
                showAlert('Unable to connect to server. Check your network.', 'error');
                submitBtn.disabled = false;
                btnSpinner.style.display = 'none';
                btnText.textContent = 'Create account';
            }
        });
    }

    // ---------- INPUT CLEANUP ----------
    if (phoneNumber) {
        phoneNumber.addEventListener('blur', function() {
            this.value = this.value.replace(/\s/g, '');
        });
        phoneNumber.addEventListener('input', function() {
            this.value = this.value.replace(/\D/g, '').slice(0, 9);
        });
    }

    if (nokPhone) {
        nokPhone.addEventListener('blur', function() {
            this.value = this.value.replace(/\s/g, '');
        });
        nokPhone.addEventListener('input', function() {
            this.value = this.value.replace(/\D/g, '').slice(0, 9);
        });
    }

    if (idNumber) {
        idNumber.addEventListener('input', function() {
            this.value = this.value.replace(/\D/g, '').slice(0, 10);
        });
    }

})();