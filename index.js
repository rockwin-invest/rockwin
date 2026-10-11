 (function() {
            'use strict';

            // ---------- NAV TOGGLE ----------
            const toggle = document.getElementById('navToggle');
            const navLinks = document.getElementById('navLinks');

            toggle.addEventListener('click', function(e) {
                e.stopPropagation();
                navLinks.classList.toggle('open');
                const spans = this.querySelectorAll('span');
                if (navLinks.classList.contains('open')) {
                    spans[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
                    spans[1].style.opacity = '0';
                    spans[2].style.transform = 'rotate(-45deg) translate(5px, -5px)';
                } else {
                    spans[0].style.transform = 'none';
                    spans[1].style.opacity = '1';
                    spans[2].style.transform = 'none';
                }
            });

            navLinks.querySelectorAll('a, button').forEach(el => {
                el.addEventListener('click', function() {
                    navLinks.classList.remove('open');
                    const spans = toggle.querySelectorAll('span');
                    spans[0].style.transform = 'none';
                    spans[1].style.opacity = '1';
                    spans[2].style.transform = 'none';
                });
            });

            document.addEventListener('click', function(e) {
                if (!e.target.closest('.glass-nav')) {
                    navLinks.classList.remove('open');
                    const spans = toggle.querySelectorAll('span');
                    spans[0].style.transform = 'none';
                    spans[1].style.opacity = '1';
                    spans[2].style.transform = 'none';
                }
            });

            // ---------- NAVBAR SHRINK ON SCROLL ----------
            const nav = document.getElementById('glassNav');
            let lastScroll = 0;

            window.addEventListener('scroll', function() {
                const currentScroll = window.pageYOffset || document.documentElement.scrollTop;
                if (currentScroll > 60) {
                    nav.classList.add('scrolled');
                } else {
                    nav.classList.remove('scrolled');
                }
                lastScroll = currentScroll;
            });

            // ---------- ANIMATE MOCKUP BALANCE ----------
            const balanceEl = document.getElementById('mockupBalance');
            const target = 52480;
            let current = 0;
            const step = 180;

            function animateBalance() {
                if (current < target) {
                    current += step;
                    if (current > target) current = target;
                    balanceEl.textContent = current.toLocaleString();
                    requestAnimationFrame(animateBalance);
                }
            }
            setTimeout(animateBalance, 600);

            // ---------- SCROLL REVEAL (Intersection Observer) ----------
            const revealElements = document.querySelectorAll('.reveal');

            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('visible');
                    }
                });
            }, {
                threshold: 0.1,
                rootMargin: '0px 0px -40px 0px'
            });

            revealElements.forEach(el => observer.observe(el));

            // ---------- SMOOTH SCROLL ----------
            document.querySelector('.btn-hero-secondary')?.addEventListener('click', function(e) {
                const target = document.getElementById('features');
                if (target) {
                    e.preventDefault();
                    target.scrollIntoView({ behavior: 'smooth' });
                }
            });

            // ---------- GRAPH BARS ANIMATE ON SCROLL ----------
            const graphObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const bars = entry.target.querySelectorAll('.bar');
                        bars.forEach((bar, index) => {
                            setTimeout(() => {
                                bar.style.opacity = '1';
                                bar.style.height = ['40%', '65%', '30%', '80%', '55%', '90%', '45%'][
                                index] || '50%';
                            }, index * 80);
                        });
                    }
                });
            }, { threshold: 0.3 });

            const graph = document.querySelector('.mockup-graph');
            if (graph) {
                // Reset bars first
                graph.querySelectorAll('.bar').forEach(b => {
                    b.style.height = '10%';
                    b.style.opacity = '0.3';
                });
                graphObserver.observe(graph);
            }

            console.log('✅ Equin Bank · Premium Minimal');
            console.log('💡 Designed for a $100M fintech feel.');

        })();