 (function() {
            'use strict';

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
            const password = document.getElementById('password');
            const confirmPassword = document.getElementById('confirmPassword');
            const terms = document.getElementById('terms');

            const strengthFill = document.getElementById('strengthFill');
            const strengthLabel = document.getElementById('strengthLabel');
            const passwordMatch = document.getElementById('passwordMatch');

            // ---------- PASSWORD STRENGTH ----------
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

            password.addEventListener('input', function() {
                checkPasswordStrength(this.value);
                validatePasswordMatch();
                validateField(this, 'passwordError');
            });

            // ---------- CONFIRM PASSWORD MATCH ----------
            function validatePasswordMatch() {
                const pw = password.value;
                const confirm = confirmPassword.value;

                if (confirm.length === 0) {
                    passwordMatch.innerHTML = '';
                    passwordMatch.className = 'password-match';
                    return;
                }

                if (pw === confirm) {
                    passwordMatch.innerHTML = `
                        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                            <polyline points="22 4 12 14.01 9 11.01"/>
                        </svg>
                        Passwords match
                    `;
                    passwordMatch.className = 'password-match match';
                } else {
                    passwordMatch.innerHTML = `
                        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                        Passwords do not match
                    `;
                    passwordMatch.className = 'password-match no-match';
                }
            }

            confirmPassword.addEventListener('input', validatePasswordMatch);

            // ---------- FIELD VALIDATION ----------
            function validateField(input, errorId) {
                const error = document.getElementById(errorId);
                if (!error) return;

                if (input.value.trim().length === 0) {
                    input.classList.add('error');
                    error.classList.add('visible');
                    return false;
                }

                input.classList.remove('error');
                error.classList.remove('visible');
                return true;
            }

            // ---------- REAL-TIME VALIDATION ----------
            fullName.addEventListener('blur', function() {
                validateField(this, 'fullNameError');
            });

            idNumber.addEventListener('input', function() {
                this.value = this.value.replace(/\D/g, '').slice(0, 10);
                validateField(this, 'idError');
            });

            idNumber.addEventListener('blur', function() {
                if (this.value.length < 5) {
                    this.classList.add('error');
                    document.getElementById('idError').classList.add('visible');
                }
            });

            phoneNumber.addEventListener('input', function() {
                this.value = this.value.replace(/\D/g, '').slice(0, 9);
                validateField(this, 'phoneError');
            });

            phoneNumber.addEventListener('blur', function() {
                if (this.value.length !== 9) {
                    this.classList.add('error');
                    document.getElementById('phoneError').classList.add('visible');
                }
            });

            dob.addEventListener('blur', function() {
                const dobError = document.getElementById('dobError');
                if (!this.value) {
                    this.classList.add('error');
                    dobError.classList.add('visible');
                    return;
                }

                const birthDate = new Date(this.value);
                const today = new Date();
                let age = today.getFullYear() - birthDate.getFullYear();
                const monthDiff = today.getMonth() - birthDate.getMonth();
                if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                    age--;
                }

                if (age < 18) {
                    this.classList.add('error');
                    dobError.classList.add('visible');
                } else {
                    this.classList.remove('error');
                    dobError.classList.remove('visible');
                }
            });

            // ---------- FORM SUBMISSION ----------
            form.addEventListener('submit', async function(e) {
                e.preventDefault();

                // Reset alert
                alertBox.className = 'alert-box';

                // Gather data
                const name = fullName.value.trim();
                const id = idNumber.value.trim();
                const birthDate = dob.value;
                const phoneRaw = phoneNumber.value.trim();
                const phone = '+254' + phoneRaw.replace(/\s/g, '');
                const pass = password.value;
                const confirm = confirmPassword.value;
                const termsChecked = terms.checked;

                // ---- Validate all fields ----
                let hasError = false;

                if (!name || name.length < 2) {
                    validateField(fullName, 'fullNameError');
                    hasError = true;
                }

                if (!id || id.length < 5) {
                    document.getElementById('idError').classList.add('visible');
                    idNumber.classList.add('error');
                    hasError = true;
                }

                if (!birthDate) {
                    document.getElementById('dobError').classList.add('visible');
                    dob.classList.add('error');
                    hasError = true;
                } else {
                    const birth = new Date(birthDate);
                    const today = new Date();
                    let age = today.getFullYear() - birth.getFullYear();
                    const monthDiff = today.getMonth() - birth.getMonth();
                    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
                    if (age < 18) {
                        document.getElementById('dobError').classList.add('visible');
                        dob.classList.add('error');
                        hasError = true;
                    }
                }

                if (!phoneRaw || phoneRaw.length !== 9) {
                    document.getElementById('phoneError').classList.add('visible');
                    phoneNumber.classList.add('error');
                    hasError = true;
                }

                if (pass.length < 6) {
                    document.getElementById('passwordError').classList.add('visible');
                    password.classList.add('error');
                    hasError = true;
                }

                if (pass !== confirm) {
                    passwordMatch.className = 'password-match no-match';
                    passwordMatch.innerHTML = `
                        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                        Passwords do not match
                    `;
                    hasError = true;
                }

                if (!termsChecked) {
                    showAlert('You must agree to the Terms of Service to proceed.', 'error');
                    return;
                }

                if (hasError) {
                    showAlert('Please fix the highlighted fields before continuing.', 'error');
                    return;
                }

                // ---- UI: loading ----
                submitBtn.disabled = true;
                btnSpinner.style.display = 'block';
                btnText.textContent = 'Creating Account...';

                const payload = {
                    fullName: name,
                    idNumber: id,
                    dateOfBirth: birthDate,
                    phoneNumber: phone,
                    password: pass
                };

                try {
                  const response = await fetch('https://rockwin.onrender.com/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
});

                    const data = await response.json();

                    if (response.ok) {
                        showAlert(`✅ Account created! Acc No: ${data.accountNumber}. Check your phone for SMS verification.`, 'success');
                        form.reset();
                        strengthFill.style.width = '0%';
                        strengthFill.style.background = '#f87171';
                        strengthLabel.textContent = 'Weak';
                        passwordMatch.innerHTML = '';
                        passwordMatch.className = 'password-match';
                        submitBtn.disabled = false;
                        btnSpinner.style.display = 'none';
                        btnText.textContent = 'Create Your Account';
                    } else {
                        throw new Error(data.error || 'Registration failed. Please try again.');
                    }
                } catch (err) {
                    showAlert(err.message || 'Unable to connect to server. Check your network.', 'error');
                    submitBtn.disabled = false;
                    btnSpinner.style.display = 'none';
                    btnText.textContent = 'Create Your Account';
                }
            });

            // ---------- ALERT HELPER ----------
            function showAlert(message, type) {
                alertBox.className = 'alert-box';
                alertBox.classList.add(type);
                alertBox.textContent = message;
                if (type === 'success') {
                    clearTimeout(window.alertTimeout);
                    window.alertTimeout = setTimeout(() => {
                        alertBox.className = 'alert-box';
                    }, 7000);
                }
            }

            // ---------- PHONE TRIM ----------
            phoneNumber.addEventListener('blur', function() {
                this.value = this.value.replace(/\s/g, '');
            });

        })();