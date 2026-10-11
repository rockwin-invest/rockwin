(function() {
    'use strict';

    // ---------- CONFIG ----------
    const API_BASE = 'https://rockwin.onrender.com';

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
            passwordMatch.innerHTML = '✓ Passwords match';
            passwordMatch.className = 'password-match match';
        } else {
            passwordMatch.innerHTML = '✗ Passwords do not match';
            passwordMatch.className = 'password-match no-match';
        }
    }

    confirmPassword.addEventListener('input', validatePasswordMatch);

    // ---------- SHOW ALERT ----------
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

    // ---------- FORM SUBMISSION ----------
    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        alertBox.className = 'alert-box';

        // Gather data
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

        // ---- Validation ----
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
            showAlert('Please enter your Next of Kin full name.', 'error');
            hasError = true;
        }

        if (!nokPhoneRaw || nokPhoneRaw.length !== 9) {
            showAlert('Please enter a valid 9-digit Next of Kin phone number (e.g. 704005726).', 'error');
            hasError = true;
        }

        if (!nokRelVal) {
            showAlert('Please select your relationship to Next of Kin.', 'error');
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

        if (hasError) {
            return;
        }

        // ---- Loading ----
        submitBtn.disabled = true;
        btnSpinner.style.display = 'block';
        btnText.textContent = 'Creating Account...';

        // ---- Payload with ALL fields ----
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
                showAlert('✅ Account created! Acc No: ' + data.accountNumber + '. Check your email for confirmation.', 'success');
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
                showAlert(data.error || 'Registration failed. Please try again.', 'error');
                submitBtn.disabled = false;
                btnSpinner.style.display = 'none';
                btnText.textContent = 'Create Your Account';
            }
        } catch (err) {
            showAlert('Unable to connect to server. Check your network.', 'error');
            submitBtn.disabled = false;
            btnSpinner.style.display = 'none';
            btnText.textContent = 'Create Your Account';
        }
    });

    // ---------- PHONE TRIM ON BLUR ----------
    phoneNumber.addEventListener('blur', function() {
        this.value = this.value.replace(/\s/g, '');
    });

    nokPhone.addEventListener('blur', function() {
        this.value = this.value.replace(/\s/g, '');
    });

    // ---------- ID NUMBER: only digits ----------
    idNumber.addEventListener('input', function() {
        this.value = this.value.replace(/\D/g, '').slice(0, 10);
    });

    // ---------- PHONE NUMBERS: only digits, max 9 ----------
    phoneNumber.addEventListener('input', function() {
        this.value = this.value.replace(/\D/g, '').slice(0, 9);
    });

    nokPhone.addEventListener('input', function() {
        this.value = this.value.replace(/\D/g, '').slice(0, 9);
    });

})();