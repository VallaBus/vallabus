/* Descubrimiento contextual del seguimiento, mostrado una sola vez. */
(function () {
    'use strict';

    const STORAGE_KEY = 'vallabus.rideTrackingOnboarding.v1';
    const forceOnboarding = new URLSearchParams(window.location.search).get('rideOnboarding') === '1';
    let activeTarget = null;
    let spotlight = null;
    let dialog = null;
    let previousFocus = null;
    let repositionTimer = null;

    function hasSeenOnboarding() {
        if (forceOnboarding) return false;
        try {
            return localStorage.getItem(STORAGE_KEY) === 'seen';
        } catch (_error) {
            return false;
        }
    }

    function markSeen() {
        if (forceOnboarding) return;
        try {
            localStorage.setItem(STORAGE_KEY, 'seen');
        } catch (_error) {
            // El onboarding sigue funcionando aunque el almacenamiento esté bloqueado.
        }
    }

    function positionSpotlight() {
        if (!activeTarget || !spotlight || !document.body.contains(activeTarget)) return;
        const rect = activeTarget.getBoundingClientRect();
        spotlight.style.left = `${Math.max(6, rect.left - 6)}px`;
        spotlight.style.top = `${Math.max(6, rect.top - 6)}px`;
        spotlight.style.width = `${Math.min(window.innerWidth - 12, rect.width + 12)}px`;
        spotlight.style.height = `${rect.height + 12}px`;
    }

    function destroy(options = {}) {
        if (!dialog) return;
        if (options.mark !== false) markSeen();
        window.removeEventListener('resize', positionSpotlight);
        window.removeEventListener('scroll', positionSpotlight, true);
        if (repositionTimer !== null) window.clearTimeout(repositionTimer);
        repositionTimer = null;
        dialog.remove();
        spotlight?.remove();
        dialog = null;
        spotlight = null;
        activeTarget = null;
        if (options.restoreFocus !== false) previousFocus?.focus?.();
        previousFocus = null;
    }

    function createDialog(target) {
        previousFocus = document.activeElement;
        activeTarget = target;

        spotlight = document.createElement('div');
        spotlight.className = 'ride-onboarding-spotlight';
        spotlight.setAttribute('aria-hidden', 'true');

        dialog = document.createElement('section');
        dialog.className = 'ride-onboarding';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-labelledby', 'rideOnboardingTitle');
        dialog.innerHTML = `
            <div class="ride-onboarding-icon" aria-hidden="true">
                <span class="ride-follow-icon"></span>
            </div>
            <p class="ride-onboarding-eyebrow">Nuevo · seguimiento en directo</p>
            <h2 id="rideOnboardingTitle">Tu viaje, parada a parada</h2>
            <p>Consulta por dónde va el bus y recibe un aviso antes de llegar a tu destino.</p>
            <div class="ride-onboarding-actions">
                <button class="ride-onboarding-primary" type="button">Seguir este bus</button>
                <button class="ride-onboarding-secondary" type="button">Ahora no</button>
            </div>`;

        document.body.append(spotlight, dialog);
        positionSpotlight();
        // El panel de próximos buses entra con una transición horizontal.
        // Recalculamos al terminar para que el foco quede sobre el botón real.
        repositionTimer = window.setTimeout(positionSpotlight, 560);

        dialog.querySelector('.ride-onboarding-primary').addEventListener('click', () => {
            const selectedTarget = activeTarget;
            destroy({ restoreFocus: false });
            selectedTarget?.click();
        });
        dialog.querySelector('.ride-onboarding-secondary').addEventListener('click', () => destroy());
        dialog.addEventListener('keydown', event => {
            if (event.key === 'Escape') destroy();
            if (event.key !== 'Tab') return;
            const buttons = [...dialog.querySelectorAll('button')];
            if (!buttons.length) return;
            const currentIndex = buttons.indexOf(document.activeElement);
            const nextIndex = event.shiftKey
                ? (currentIndex <= 0 ? buttons.length - 1 : currentIndex - 1)
                : (currentIndex === buttons.length - 1 ? 0 : currentIndex + 1);
            event.preventDefault();
            buttons[nextIndex].focus();
        });
        window.addEventListener('resize', positionSpotlight);
        window.addEventListener('scroll', positionSpotlight, true);
        dialog.querySelector('.ride-onboarding-primary').focus();
    }

    function consider(target) {
        if (!target || dialog || hasSeenOnboarding()) return;
        requestAnimationFrame(() => {
            if (dialog || hasSeenOnboarding() || !target.isConnected || target.hidden) return;
            const rect = target.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            createDialog(target);
        });
    }

    function complete() {
        markSeen();
        destroy({ mark: false, restoreFocus: false });
    }

    window.rideTrackingOnboarding = { consider, complete, reset: () => {
        try { localStorage.removeItem(STORAGE_KEY); } catch (_error) { /* noop */ }
        destroy({ mark: false });
    } };
})();
