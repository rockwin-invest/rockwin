(function() {
    'use strict';

    // ---------- MASTHEAD: subtle background on scroll ----------
    const masthead = document.getElementById('masthead');
    if (masthead) {
        const setScrolled = () => {
            masthead.classList.toggle('scrolled', window.scrollY > 12);
        };
        setScrolled();
        window.addEventListener('scroll', setScrolled, { passive: true });
    }

    // ---------- MOBILE MENU ----------
    const navToggle = document.getElementById('navToggle');
    const mobileMenu = document.getElementById('mobileMenu');

    function closeMenu() {
        if (!mobileMenu || !navToggle) return;
        mobileMenu.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
        navToggle.setAttribute('aria-label', 'Open menu');
    }

    if (navToggle && mobileMenu) {
        navToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = mobileMenu.classList.toggle('open');
            navToggle.setAttribute('aria-expanded', String(isOpen));
            navToggle.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
        });

        mobileMenu.querySelectorAll('a').forEach((link) => {
            link.addEventListener('click', closeMenu);
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.masthead')) closeMenu();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeMenu();
        });
    }

    // ---------- CALCULATOR ----------
    const ANNUAL_YIELD = 0.1062;
    const WITHHOLDING_TAX = 0.15;
    const DAYS_PER_YEAR = 365;

    const amountInput = document.getElementById('calcAmount');
    const sliderInput = document.getElementById('calcSlider');
    const termButtons = document.querySelectorAll('#calculator .term-selector button');

    const interestEl = document.getElementById('calcInterest');
    const taxEl      = document.getElementById('calcTax');
    const netEl      = document.getElementById('calcNet');
    const totalEl    = document.getElementById('calcTotal');

    let selectedMonths = 12;

    function formatKES(num) {
        return 'KES ' + Math.round(num).toLocaleString('en-KE');
    }

    function calculate() {
        if (!amountInput) return;

        const principal = Math.max(1000, parseFloat(amountInput.value) || 0);
        const years = selectedMonths / 12;
        const dailyRate = ANNUAL_YIELD / DAYS_PER_YEAR;

        // Daily compounding
        const grossValue    = principal * Math.pow(1 + dailyRate, years * DAYS_PER_YEAR);
        const grossInterest = grossValue - principal;

        // 15% withholding tax on interest only
        const tax            = grossInterest * WITHHOLDING_TAX;
        const netInterest    = grossInterest - tax;
        const netTotalValue  = principal + netInterest;

        if (interestEl) interestEl.textContent = formatKES(grossInterest);
        if (taxEl)      taxEl.textContent      = '− ' + formatKES(tax);
        if (netEl)      netEl.textContent      = formatKES(netInterest);
        if (totalEl)    totalEl.textContent    = formatKES(netTotalValue);
    }

    if (amountInput) {
        amountInput.addEventListener('input', () => {
            let val = Math.max(1000, Math.min(2000000, parseFloat(amountInput.value) || 0));
            if (sliderInput) sliderInput.value = val;
            calculate();
        });
    }

    if (sliderInput) {
        sliderInput.addEventListener('input', () => {
            if (amountInput) amountInput.value = sliderInput.value;
            calculate();
        });
    }

    termButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            termButtons.forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            selectedMonths = parseInt(btn.dataset.months, 10);
            calculate();
        });
    });

    calculate();

    // ---------- FAQ: close others when one opens ----------
    document.querySelectorAll('.faq-item').forEach((item) => {
        item.addEventListener('toggle', () => {
            if (item.open) {
                document.querySelectorAll('.faq-item[open]').forEach((other) => {
                    if (other !== item) other.open = false;
                });
            }
        });
    });

})();