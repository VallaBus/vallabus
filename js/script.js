import { isIOS } from './browser.js?v=20260809';

let deferredPrompt;

const EXTERNAL_INSTALL_BANNER_DISMISSED_KEY = 'externalInstallBannerDismissed';
const EXTERNAL_INSTALL_BANNER_INSTALLED_KEY = 'externalInstallBannerInstalled';

if (document.readyState === "loading") {  // Cargando aún no ha terminado
    document.addEventListener("DOMContentLoaded", main);
} else {  // `DOMContentLoaded` ya se ha disparado
    main();
}
function main() {
    console.log('🚍 ¡Te damos la bienvenida a VallaBus! Recuerda que puedes colaborar con el código en https://github.com/VallaBus/vallabus');

    // Objeto global para almacenar y acceder a intervalos
    window.globalState = window.globalState || {};

    // Verificar si hay paradas guardadas
    const busLines = JSON.parse(localStorage.getItem('busLines') || '[]');
    const hasStops = busLines.length > 0;

    // Mostrar mensaje de bienvenida o mostrar skeleton loader directamente si hay paradas
    if (hasStops) {
        document.getElementById('welcome-box').style.display = 'none';
        // Mostrar skeleton loader directamente sin placeholder intermedio
        showSkeletonLoader();
    } else {
        showWelcomeMessage();
    }

    // Limpieza de caché en localstorage obsoleto
    cleanObsoleteCache();

    // Eventos al banner con tips
    tipsBannerEvents();

    // Actualizar y pintar lista de paradas (carga inicial)
    updateBusList(true);
    // Actualizar la lista de forma recurrente (actualizaciones automáticas)
    iniciarIntervalo(() => updateBusList(false));

    // HOTFIX iOS: Ejecuta updateBusList 1 segundo después de abrir la página en iOS porque los recursos localstorage no está disponibles inmediatamente en iOS 17.4 :-( 
    if (isIOS()) {
        showIosInstallButton();
        setTimeout(() => updateBusList(true), 1000);
    }

    // Aviso de instalación para visitas marcadas desde una web externa.
    setupExternalInstallBanner();

    // Eventos para el manejo de URLs
    routersEvents();

    // Eventos y detección de theme
    themeEvents();

    // Eventos botones añadir y quitar
    addRemoveButtonsEvents();

    // Eventos del sidebar
    sidebarEvents();

    // Eventos para volver a la parte superior
    scrollTopEvents();

    // Eventos de clic a botones
    clickEvents();

    // Eventos para dialogo horarios programados
    scheduledBusesEvents();

    // Overlays
    // Al cerrar un overlay, guarda una preferencia en localStorage
    const overlays = document.getElementsByClassName('overlay');
    Array.from(overlays).forEach(overlay => {
        const closeButton = overlay.querySelector('.close-overlay');
        if (closeButton) {
            closeButton.addEventListener('click', function (event) {
                event.stopPropagation(); // Evita que el evento se propague al overlay padre
                closeOverlay(overlay.id);
            });
        }
    });
    // Mostramos los overlays definidos si no se cerraron antes
    Array.from(overlays).forEach(overlay => {
        showOverlayIfNotClosed(overlay.id);
    });

    // Mostrar advertencia si el usuario está accediendo desde un webview integrado de una app de social media
    socialBrowserWarning();

    // Verificar el estado de los servicios y mostrar banner si es necesario
    checkAndShowStatusBanner();

    // Configurar un intervalo para verificar el estado periódicamente
    setInterval(checkAndShowStatusBanner, 5 * 60 * 1000); // Cada 5 minutos

    // Detectar cuando la app vuelve a estar activa
    setupVisibilityHandlers();

    // Eventos del FAB de Guía VallaBus
    guiaFABEvents();
}

// Configurar manejadores de visibilidad para recargar datos al volver
function setupVisibilityHandlers() {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            // Al volver a ser visible, siempre mostrar estado de carga
            // porque los datos pueden estar obsoletos
            updateBusList(true);
            // NO verificar status aquí para evitar falsos positivos por problemas de conectividad temporal
        }
    });

    // También detectar cuando la ventana vuelve a tener foco
    window.addEventListener('focus', () => {
        updateBusList(true);
        // NO verificar status aquí para evitar falsos positivos por problemas de conectividad temporal
    });
}

// Escucha el evento 'beforeinstallprompt' para preparar la instalación de la aplicación como PWA.
// Guarda el evento para su uso posterior y muestra el botón de instalación.
window.addEventListener('beforeinstallprompt', (e) => {
    // Previene que Chrome 67 y anteriores muestren automáticamente el prompt de instalación
    e.preventDefault();
    // Guarda el evento para que pueda ser activado más tarde
    deferredPrompt = e;
    // Actualiza la interfaz para mostrar el botón de instalación
    showInstallButton();
});

window.addEventListener('appinstalled', () => {
    // iOS no expone este evento de forma fiable; allí medimos únicamente el
    // clic en "Añadir". En navegadores compatibles, este evento representa
    // la instalación completada.
    if (!isIOS()) {
        localStorage.setItem(EXTERNAL_INSTALL_BANNER_INSTALLED_KEY, 'true');
        trackExternalInstallEvent('installed');
    }

    const banner = document.getElementById('external-install-banner');
    if (banner) {
        banner.hidden = true;
    }
});

function getExternalInstallOrigin() {
    const pageParams = new URLSearchParams(window.location.search);
    const hashQueryIndex = window.location.hash.indexOf('?');
    const hashParams = hashQueryIndex >= 0
        ? new URLSearchParams(window.location.hash.slice(hashQueryIndex + 1))
        : null;
    const source = pageParams.get('origen') || hashParams?.get('origen');
    const normalizedSource = source?.trim().toLocaleLowerCase();
    return normalizedSource
        ? normalizedSource.replace(/[^a-z0-9_-]/g, '_').slice(0, 64)
        : null;
}

function isExternalInstallEntry() {
    return Boolean(getExternalInstallOrigin());
}

function trackExternalInstallEvent(action) {
    const origin = getExternalInstallOrigin();
    if (!origin) {
        return;
    }

    // El nombre del evento contiene el identificador de la web de origen,
    // que permite comparar cada campaña en Matomo sin enviar la URL completa.
    _paq.push(['trackEvent', 'external-install', action, origin]);
}

function isStandaloneApp() {
    const displayModes = ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay'];
    const isInstalledDisplayMode = displayModes.some(mode =>
        window.matchMedia(`(display-mode: ${mode})`).matches
    );
    const isAndroidAppContext = document.referrer.startsWith('android-app://');

    return isInstalledDisplayMode
        || window.navigator.standalone === true
        || isAndroidAppContext;
}

function hasExternalInstallBannerBeenHandled() {
    return localStorage.getItem(EXTERNAL_INSTALL_BANNER_DISMISSED_KEY) === 'true'
        || localStorage.getItem(EXTERNAL_INSTALL_BANNER_INSTALLED_KEY) === 'true';
}

function setupExternalInstallBanner() {
    const banner = document.getElementById('external-install-banner');
    const actionButton = document.getElementById('external-install-button');
    const closeButton = document.getElementById('external-install-close');

    if (!banner || !actionButton || !closeButton || !isExternalInstallEntry()
        || isStandaloneApp() || hasExternalInstallBannerBeenHandled()) {
        return;
    }

    banner.hidden = false;

    actionButton.addEventListener('click', () => {
        trackExternalInstallEvent('add_click');

        if (isIOS()) {
            // La instalación en iOS se explica con el flujo que ya usa el botón
            // superior de instalación.
            if (typeof window.showIosInstallInstructions === 'function') {
                window.showIosInstallInstructions();
            }
            return;
        }

        // En Chromium, beforeinstallprompt es el botón de instalación nativo.
        if (deferredPrompt) {
            document.getElementById('installButton')?.click();
        }
    });

    closeButton.addEventListener('click', () => {
        localStorage.setItem(EXTERNAL_INSTALL_BANNER_DISMISSED_KEY, 'true');
        banner.hidden = true;
        trackExternalInstallEvent('dismissed');
    });
}


function showInstallButton() {
    // Muestra el botón de instalación y maneja el evento de clic para mostrar el prompt de instalación.
    // Espera la elección del usuario y registra el resultado.
    const installButton = document.getElementById('installButton');
    installButton.style.display = 'block';

    installButton.addEventListener('click', (e) => {
        // Oculta el botón ya que no se necesita más
        installButton.style.display = 'none';
        displayLoadingSpinner("Iniciando instalación...");

        // Muestra el prompt de instalación
        deferredPrompt.prompt();

        // Espera a que el usuario responda al prompt
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('Usuario aceptó la instalación');
                _paq.push(['trackEvent', 'installbutton', 'click', 'accepted']);

                // Cambiar el mensaje del spinner
                displayLoadingSpinner("Instalando VallaBus...");

                // Mantener el spinner visible por un tiempo más largo
                setTimeout(() => {
                    hideLoadingSpinner();
                    displayLoadingSpinner("¡Instalación completada! Puedes cerrar esta ventana.");

                    // Ocultar el mensaje final después de unos segundos
                    setTimeout(() => {
                        hideLoadingSpinner();
                    }, 3000);
                }, 10000); // Ajusta este tiempo según sea necesario
            } else {
                console.log('Usuario rechazó la instalación');
                _paq.push(['trackEvent', 'installbutton', 'click', 'rejected']);
                // Si el usuario rechaza, volvemos a mostrar el botón
                installButton.style.display = 'block';
                hideLoadingSpinner();
            }
            deferredPrompt = null;
        });
    });
}

// Configurar eventos para el FAB de Guía VallaBus
function guiaFABEvents() {
    const fab = document.getElementById('fab-guia');
    if (!fab) return;

    fab.addEventListener('click', () => {
        _paq.push(['trackEvent', 'guia-voz', 'click', 'fab']);
        window.location.href = 'https://guia.vallabus.com/';
    });
}
