/* ============================================================
   ROCKWIN INVESTMENT — GOALS PAGE LOGIC
   ============================================================
   Handles: goal creation, editing, deletion, contributions,
            auto-invest toggles, and live projections.
   ============================================================ */

(function() {
    'use strict';

    // ============================================================
    // CONFIG
    // ============================================================
    const API_BASE = 'https://equin-bank-ltd.onrender.com';
    const ANNUAL_YIELD = 0.142; // 14.2% p.a.

    // ============================================================
    // STATE
    // ============================================================
    let goals = [];
    let selectedIcon = '🚨';

    // ============================================================
    // AUTH TOKEN
    // ============================================================
    function getToken() {
        return localStorage.getItem('token');
    }

    // ============================================================
    // API HELPER
    // ============================================================
    async function apiFetch(endpoint, options = {}) {
        const token = getToken();
        if (!token) {
            window.location.href = 'login.html';
            throw new Error('Not authenticated');
        }
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...(options.headers || {})
        };
        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers
        });
        if (!response.ok) {
            if (response.status === 401) {
                localStorage.removeItem('token');
                window.location.href = 'login.html';
            }
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || `HTTP ${response.status}`);
        }
        return response.json();
    }

    // ============================================================
    // FORMAT CURRENCY HELPERS
    // ============================================================
    function formatKES(num) {
        if (num >= 1000000) return 'KES ' + (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return 'KES ' + (num / 1000).toFixed(0) + 'K';
        return 'KES ' + num.toLocaleString('en-KE');
    }

    function formatFullKES(num) {
        return num.toLocaleString('en-KE', { maximumFractionDigits: 0 });
    }

    // ============================================================
    // MODAL CONTROLS
    // ============================================================
    function openModal(id) {
        const modal = document.getElementById(id);
        if (modal) {
            modal.classList.add('open');
            document.body.style.overflow = 'hidden';
        }
    }

    function closeModal(id) {
        const modal = document.getElementById(id);
        if (modal) {
            modal.classList.remove('open');
            document.body.style.overflow = '';
        }
    }

    // Close on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', function(e) {
            if (e.target === this) {
                this.classList.remove('open');
                document.body.style.overflow = '';
            }
        });
    });

    // Close on Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.open').forEach(modal => {
                modal.classList.remove('open');
                document.body.style.overflow = '';
            });
        }
    });

    // ============================================================
    // TOAST SYSTEM
    // ============================================================
    function showToast(message, type = 'success') {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type === 'error' ? 'error' : type === 'info' ? 'info' : ''}`;
        const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
        toast.innerHTML = `
            <span class="toast-icon">${icon}</span>
            <span class="toast-msg">${message}</span>
        `;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(20px)';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }
    window.showToast = showToast;

    // ============================================================
    // LOGOUT
    // ============================================================
    function handleLogout() {
        if (confirm('Are you sure you want to sign out?')) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = 'login.html';
        }
    }
    window.handleLogout = handleLogout;

    // ============================================================
    // WHATSAPP CONTACT
    // ============================================================
    function contactWhatsApp() {
        const phone = '+254700123456';
        const message = 'Hello RockWin Investment Support, I need assistance with my investment goals:';
        const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    }
    window.contactWhatsApp = contactWhatsApp;

    // ============================================================
    // LOAD GOALS FROM API
    // ============================================================
    async function loadGoals() {
        try {
            console.log('🔄 Loading goals...');
            const data = await apiFetch('/api/user/goals');
            goals = data.goals || [];
            console.log('✅ Goals loaded:', goals.length);
            renderGoals();
        } catch (err) {
            console.error('❌ Load goals error:', err);
            // Fall back to mock data for now (until backend is ready)
            goals = getMockGoals();
            renderGoals();
        }
    }

    // ============================================================
    // MOCK GOALS (fallback until backend has goals endpoint)
    // ============================================================
    function getMockGoals() {
        return [
            {
                id: 'g1',
                icon: '🚨',
                name: 'Emergency Fund',
                target: 200000,
                saved: 120000,
                deadline: '2027-06-30',
                monthly: 5000,
                autoInvest: true,
                completed: false
            },
            {
                id: 'g2',
                icon: '🎓',
                name: 'School Fees',
                target: 100000,
                saved: 84000,
                deadline: '2026-12-31',
                monthly: 8000,
                autoInvest: true,
                completed: false
            },
            {
                id: 'g3',
                icon: '🏠',
                name: 'House Deposit',
                target: 1000000,
                saved: 250000,
                deadline: '2029-12-31',
                monthly: 15000,
                autoInvest: false,
                completed: false
            },
            {
                id: 'g4',
                icon: '✈️',
                name: 'Maldives Vacation',
                target: 300000,
                saved: 300000,
                deadline: '2026-09-15',
                monthly: 0,
                autoInvest: false,
                completed: true
            }
        ];
    }

    // ============================================================
    // RENDER GOALS
    // ============================================================
    function renderGoals() {
        const container = document.getElementById('goalsList');
        if (!container) return;

        // Update overview stats
        const active = goals.filter(g => !g.completed);
        const completed = goals.filter(g => g.completed);
        const totalTargets = active.reduce((sum, g) => sum + g.target, 0);
        const totalSaved = active.reduce((sum, g) => sum + g.saved, 0);

        const activeEl = document.getElementById('activeGoalsCount');
        const targetsEl = document.getElementById('totalTargets');
        const savedEl = document.getElementById('totalSaved');
        const completedEl = document.getElementById('completedGoals');

        if (activeEl) activeEl.textContent = active.length;
        if (targetsEl) targetsEl.textContent = formatKES(totalTargets);
        if (savedEl) savedEl.textContent = formatKES(totalSaved);
        if (completedEl) completedEl.textContent = completed.length;

        // Empty state
        if (goals.length === 0) {
            container.innerHTML = `
                <div class="goals-empty">
                    <div class="icon">🎯</div>
                    <h3>No goals yet</h3>
                    <p>Create your first investment goal and start building toward your financial milestones.</p>
                    <button class="btn-create-goal" onclick="openModal('createGoalModal')" style="max-width:300px; margin:0 auto;">
                        Create Your First Goal
                    </button>
                </div>
            `;
            return;
        }

        // Sort: active first, then completed
        const sorted = [...goals].sort((a, b) => a.completed - b.completed);

        let html = '';
        sorted.forEach(goal => {
            const percentage = Math.min(100, Math.round((goal.saved / goal.target) * 100));
            const remaining = goal.target - goal.saved;
            const deadlineDate = new Date(goal.deadline).toLocaleDateString('en-KE', {
                month: 'short', day: 'numeric', year: 'numeric'
            });
            const daysLeft = Math.ceil((new Date(goal.deadline) - new Date()) / (1000 * 60 * 60 * 24));

            html += `
                <div class="goal-card ${goal.completed ? 'completed' : ''}">
                    <div class="goal-card-header">
                        <div class="goal-icon-title">
                            <div class="goal-icon">${goal.icon}</div>
                            <div>
                                <div class="goal-title">${goal.name}</div>
                                <div class="goal-deadline">
                                    ${goal.completed ?
                                        '✅ Completed' :
                                        `🎯 Target: ${deadlineDate} · ${daysLeft > 0 ? daysLeft + ' days left' : 'Overdue'}`}
                                </div>
                            </div>
                        </div>
                        <div class="goal-actions">
                            ${!goal.completed ? `
                                <button onclick="openContribute('${goal.id}')">+ Add</button>
                                <button onclick="openEdit('${goal.id}')">Edit</button>
                            ` : ''}
                            <button class="danger" onclick="deleteGoal('${goal.id}')">Delete</button>
                        </div>
                    </div>

                    <div class="goal-progress">
                        <div class="progress-header">
                            <div class="amounts">
                                KES ${formatFullKES(goal.saved)}
                                <span class="target">/ KES ${formatFullKES(goal.target)}</span>
                            </div>
                            <div class="percentage">${percentage}%</div>
                        </div>
                        <div class="progress-track">
                            <div class="progress-fill ${goal.completed ? 'completed' : ''}" style="width:${percentage}%;"></div>
                        </div>
                    </div>

                    <div class="goal-details">
                        <div class="detail-item">
                            <div class="label">Remaining</div>
                            <div class="value ${goal.completed ? 'green' : ''}">
                                ${goal.completed ? 'Complete!' : 'KES ' + formatFullKES(remaining)}
                            </div>
                        </div>
                        <div class="detail-item">
                            <div class="label">Monthly Target</div>
                            <div class="value">
                                ${goal.monthly > 0 ? 'KES ' + formatFullKES(goal.monthly) : '—'}
                            </div>
                        </div>
                        <div class="detail-item">
                            <div class="label">Interest Earned</div>
                            <div class="value green">
                                KES ${formatFullKES(Math.round(goal.saved * ANNUAL_YIELD * 0.5))}
                            </div>
                        </div>
                    </div>

                    ${!goal.completed ? `
                        <div class="goal-auto-invest">
                            <div class="left">
                                <span>⚡ Auto-Invest</span>
                                <strong>${goal.autoInvest ? 'Enabled' : 'Disabled'}</strong>
                            </div>
                            <label class="toggle-switch">
                                <input type="checkbox" ${goal.autoInvest ? 'checked' : ''}
                                       onchange="toggleAutoInvest('${goal.id}', this.checked)" />
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                    ` : ''}
                </div>
            `;
        });

        container.innerHTML = html;
    }

    // ============================================================
    // ICON PICKER
    // ============================================================
    const iconPickerButtons = document.querySelectorAll('#iconPicker button');
    iconPickerButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            iconPickerButtons.forEach(b => b.classList.remove('selected'));
            this.classList.add('selected');
            selectedIcon = this.dataset.icon;
        });
    });

    // ============================================================
    // PRESET GOAL TEMPLATES
    // ============================================================
    function presetGoal(type) {
        const presets = {
            emergency: { name: 'Emergency Fund', target: 200000, icon: '🚨' },
            education: { name: 'Education Fund', target: 500000, icon: '🎓' },
            home: { name: 'Home Deposit', target: 1000000, icon: '🏠' },
            retirement: { name: 'Retirement Fund', target: 5000000, icon: '💼' },
            vacation: { name: 'Dream Vacation', target: 300000, icon: '✈️' }
        };
        const preset = presets[type];
        if (!preset) return;

        const nameInput = document.getElementById('goalName');
        const targetInput = document.getElementById('goalTarget');

        if (nameInput) nameInput.value = preset.name;
        if (targetInput) targetInput.value = preset.target;

        // Select the matching icon
        iconPickerButtons.forEach(b => {
            b.classList.toggle('selected', b.dataset.icon === preset.icon);
            if (b.dataset.icon === preset.icon) selectedIcon = preset.icon;
        });

        updateProjection();
    }
    window.presetGoal = presetGoal;

    // ============================================================
    // PROJECTION CALCULATOR
    // ============================================================
    function updateProjection() {
        const targetInput = document.getElementById('goalTarget');
        const initialInput = document.getElementById('goalInitial');
        const deadlineInput = document.getElementById('goalDeadline');
        const box = document.getElementById('projectionBox');

        if (!targetInput || !deadlineInput || !box) return;

        const target = parseFloat(targetInput.value) || 0;
        const initial = parseFloat(initialInput?.value) || 0;
        const deadline = deadlineInput.value;

        if (!target || !deadline) {
            box.style.display = 'none';
            return;
        }

        const monthsLeft = Math.max(1, Math.round((new Date(deadline) - new Date()) / (1000 * 60 * 60 * 24 * 30)));
        const amountNeeded = target - initial;
        const monthlyNeeded = amountNeeded / monthsLeft;

        // Estimate interest (simple approximation)
        const avgBalance = initial + (amountNeeded / 2);
        const years = monthsLeft / 12;
        const interestEarned = avgBalance * ANNUAL_YIELD * years;

        const projMonthly = document.getElementById('projMonthly');
        const projInterest = document.getElementById('projInterest');
        const projTotal = document.getElementById('projTotal');

        if (projMonthly) projMonthly.textContent = 'KES ' + formatFullKES(Math.ceil(monthlyNeeded));
        if (projInterest) projInterest.textContent = 'KES ' + formatFullKES(Math.round(interestEarned));
        if (projTotal) projTotal.textContent = 'KES ' + formatFullKES(Math.round(target + interestEarned));

        box.style.display = 'block';
    }

    // Bind projection inputs
    ['goalTarget', 'goalInitial', 'goalDeadline'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateProjection);
    });

    // ============================================================
    // CREATE GOAL
    // ============================================================
    async function handleCreateGoal(e) {
        e.preventDefault();

        const name = document.getElementById('goalName').value.trim();
        const target = parseFloat(document.getElementById('goalTarget').value);
        const initial = parseFloat(document.getElementById('goalInitial').value) || 0;
        const deadline = document.getElementById('goalDeadline').value;
        const monthly = parseFloat(document.getElementById('goalMonthly').value) || 0;

        // Validation
        if (!name || !target || target < 1000) {
            showToast('⚠️ Please enter a valid goal name and target of at least KES 1,000.', 'error');
            return;
        }

        if (!deadline || new Date(deadline) <= new Date()) {
            showToast('⚠️ Please select a future target date.', 'error');
            return;
        }

        const newGoal = {
            id: 'g' + Date.now(),
            icon: selectedIcon,
            name,
            target,
            saved: initial,
            deadline,
            monthly,
            autoInvest: monthly > 0,
            completed: false
        };

        // Try to save to backend, fall back to local
        try {
            const result = await apiFetch('/api/user/goals', {
                method: 'POST',
                body: JSON.stringify(newGoal)
            });
            if (result.goal) newGoal.id = result.goal.id || newGoal.id;
        } catch (err) {
            console.warn('⚠️ Goal saved locally (backend not ready):', err.message);
        }

        goals.push(newGoal);
        renderGoals();
        closeModal('createGoalModal');

        // Reset form
        document.getElementById('createGoalForm').reset();
        const projectionBox = document.getElementById('projectionBox');
        if (projectionBox) projectionBox.style.display = 'none';
        selectedIcon = '🚨';
        iconPickerButtons.forEach((b, i) => b.classList.toggle('selected', i === 0));

        showToast(`🎯 Goal "${name}" created successfully!`, 'success');
    }
    window.handleCreateGoal = handleCreateGoal;

    // ============================================================
    // EDIT GOAL
    // ============================================================
    function openEdit(id) {
        const goal = goals.find(g => g.id === id);
        if (!goal) return;

        document.getElementById('editGoalId').value = goal.id;
        document.getElementById('editGoalName').value = goal.name;
        document.getElementById('editGoalTarget').value = goal.target;
        document.getElementById('editGoalDeadline').value = goal.deadline;

        openModal('editGoalModal');
    }
    window.openEdit = openEdit;

    async function handleEditGoal(e) {
        e.preventDefault();

        const id = document.getElementById('editGoalId').value;
        const goal = goals.find(g => g.id === id);
        if (!goal) return;

        goal.name = document.getElementById('editGoalName').value.trim();
        goal.target = parseFloat(document.getElementById('editGoalTarget').value);
        goal.deadline = document.getElementById('editGoalDeadline').value;
        goal.completed = goal.saved >= goal.target;

        // Try to sync with backend
        try {
            await apiFetch(`/api/user/goals/${id}`, {
                method: 'PUT',
                body: JSON.stringify(goal)
            });
        } catch (err) {
            console.warn('⚠️ Goal edited locally:', err.message);
        }

        renderGoals();
        closeModal('editGoalModal');
        showToast(`✅ Goal updated successfully!`, 'success');
    }
    window.handleEditGoal = handleEditGoal;

    // ============================================================
    // CONTRIBUTE TO GOAL
    // ============================================================
    function openContribute(id) {
        const goal = goals.find(g => g.id === id);
        if (!goal) return;

        document.getElementById('contributeGoalId').value = goal.id;
        document.getElementById('contributeGoalName').textContent = goal.icon + ' ' + goal.name;
        document.getElementById('contributeAmount').value = '';

        openModal('contributeModal');
    }
    window.openContribute = openContribute;

    async function handleContribute(e) {
        e.preventDefault();

        const id = document.getElementById('contributeGoalId').value;
        const goal = goals.find(g => g.id === id);
        if (!goal) return;

        const amount = parseFloat(document.getElementById('contributeAmount').value);
        if (!amount || amount < 100) {
            showToast('⚠️ Minimum contribution is KES 100.', 'error');
            return;
        }

        goal.saved += amount;

        if (goal.saved >= goal.target) {
            goal.completed = true;
            showToast(`🎉 Congratulations! You've reached your "${goal.name}" goal!`, 'success');
        } else {
            showToast(`✅ KES ${formatFullKES(amount)} added to "${goal.name}"!`, 'success');
        }

        // Sync with backend
        try {
            await apiFetch(`/api/user/goals/${id}/contribute`, {
                method: 'POST',
                body: JSON.stringify({ amount })
            });
        } catch (err) {
            console.warn('⚠️ Contribution saved locally:', err.message);
        }

        renderGoals();
        closeModal('contributeModal');
    }
    window.handleContribute = handleContribute;

    // ============================================================
    // DELETE GOAL
    // ============================================================
    async function deleteGoal(id) {
        const goal = goals.find(g => g.id === id);
        if (!goal) return;

        if (!confirm(`Delete "${goal.name}"? This cannot be undone.`)) return;

        // Sync deletion with backend
        try {
            await apiFetch(`/api/user/goals/${id}`, { method: 'DELETE' });
        } catch (err) {
            console.warn('⚠️ Goal deleted locally:', err.message);
        }

        goals = goals.filter(g => g.id !== id);
        renderGoals();
        showToast(`🗑️ Goal deleted.`, 'info');
    }
    window.deleteGoal = deleteGoal;

    // ============================================================
    // TOGGLE AUTO-INVEST
    // ============================================================
    async function toggleAutoInvest(id, enabled) {
        const goal = goals.find(g => g.id === id);
        if (!goal) return;

        goal.autoInvest = enabled;
        if (enabled && goal.monthly === 0) {
            goal.monthly = 1000;
        }

        // Sync with backend
        try {
            await apiFetch(`/api/user/goals/${id}/auto-invest`, {
                method: 'PUT',
                body: JSON.stringify({ enabled, monthly: goal.monthly })
            });
        } catch (err) {
            console.warn('⚠️ Auto-invest toggled locally:', err.message);
        }

        showToast(
            `⚡ Auto-Invest ${enabled ? 'enabled' : 'disabled'} for "${goal.name}"`,
            enabled ? 'success' : 'info'
        );
        renderGoals();
    }
    window.toggleAutoInvest = toggleAutoInvest;

    // ============================================================
    // NOTIFICATIONS BUTTON
    // ============================================================
    const notifBtn = document.getElementById('notifBtn');
    if (notifBtn) {
        notifBtn.addEventListener('click', function() {
            const badge = document.getElementById('notifBadge');
            if (badge) {
                badge.textContent = '0';
                badge.style.display = 'none';
            }
            showToast('📬 No new notifications', 'info');
        });
    }

    // ============================================================
    // SET LAST LOGIN TIME
    // ============================================================
    function setLastLoginTime() {
        const timeEl = document.getElementById('lastLoginTime');
        if (!timeEl) return;

        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const hour12 = hours % 12 || 12;
        timeEl.textContent = `${hour12}:${minutes} ${ampm}`;
    }

    // ============================================================
    // INIT
    // ============================================================
    document.addEventListener('DOMContentLoaded', async function() {
        console.log('🚀 Goals page initializing...');

        setLastLoginTime();
        await loadGoals();

        // Bind forms
        const createForm = document.getElementById('createGoalForm');
        const editForm = document.getElementById('editGoalForm');
        const contributeForm = document.getElementById('contributeForm');

        if (createForm) createForm.addEventListener('submit', handleCreateGoal);
        if (editForm) editForm.addEventListener('submit', handleEditGoal);
        if (contributeForm) contributeForm.addEventListener('submit', handleContribute);

        console.log('✅ RockWin Investment Goals page ready.');
    });

})();