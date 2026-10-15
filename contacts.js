(function() {
    'use strict';

    const API_BASE = 'https://api.rockwininvestment.com';

    // ---------- MASTHEAD ----------
    const masthead = document.getElementById('masthead');
    const navToggle = document.getElementById('navToggle');
    const mobileMenu = document.getElementById('mobileMenu');

    if (masthead) {
        const setScrolled = () => masthead.classList.toggle('scrolled', window.scrollY > 12);
        setScrolled();
        window.addEventListener('scroll', setScrolled, { passive: true });
    }

    function closeMenu() {
        if (!mobileMenu || !navToggle) return;
        mobileMenu.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
        navToggle.setAttribute('aria-label', 'Open menu');
    }

    if (navToggle && mobileMenu) {
        navToggle.addEventListener('click', function(e) {
            e.stopPropagation();
            const open = mobileMenu.classList.toggle('open');
            navToggle.setAttribute('aria-expanded', String(open));
            navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        });
        mobileMenu.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
        document.addEventListener('click', (e) => { if (!e.target.closest('.masthead')) closeMenu(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
    }

    // ---------- CONTACT FORM ----------
    const form = document.getElementById('contactForm');
    const alertBox = document.getElementById('contactAlert');
    const submitBtn = document.getElementById('contactSubmit');
    const submitText = document.getElementById('contactSubmitText');
    const spinner = document.getElementById('contactSpinner');
    const messageField = document.getElementById('contactMessage');
    const charCount = document.getElementById('charCount');

    function showAlert(message, type) {
        if (!alertBox) return;
        alertBox.className = 'contact-alert';
        alertBox.classList.add(type);
        alertBox.textContent = message;
    }

    // Character counter
    if (messageField && charCount) {
        messageField.addEventListener('input', function() {
            charCount.textContent = this.value.length;
        });
    }

    if (form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();

            if (alertBox) alertBox.className = 'contact-alert';

            const name = document.getElementById('contactName').value.trim();
            const email = document.getElementById('contactEmail').value.trim();
            const phone = document.getElementById('contactPhone').value.trim();
            const topic = document.getElementById('contactTopic').value;
            const message = document.getElementById('contactMessage').value.trim();
            const website = document.getElementById('contactWebsite').value;

            if (!name || name.length < 2) {
                showAlert('Please enter your name.', 'error');
                return;
            }
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                showAlert('Please enter a valid email address.', 'error');
                return;
            }
            if (!message || message.length < 10) {
                showAlert('Please write a message (at least 10 characters).', 'error');
                return;
            }

            submitBtn.disabled = true;
            if (submitText) submitText.textContent = 'Sending…';
            if (spinner) spinner.style.display = 'inline-block';

            try {
                const response = await fetch(API_BASE + '/api/contact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, phone, topic, message, website })
                });

                const data = await response.json().catch(() => ({}));

                if (response.ok) {
                    form.reset();
                    if (charCount) charCount.textContent = '0';
                    showAlert(
                        data.message || 'Message sent. We\'ll reply within 1 business day.',
                        'success'
                    );
                } else {
                    throw new Error(data.error || 'Could not send your message. Please try WhatsApp instead.');
                }
            } catch (err) {
                showAlert(err.message || 'Could not send your message. Please try WhatsApp instead.', 'error');
            } finally {
                submitBtn.disabled = false;
                if (submitText) submitText.textContent = 'Send message';
                if (spinner) spinner.style.display = 'none';
            }
        });
    }

})();