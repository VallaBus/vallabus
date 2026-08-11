/* Simulador local del seguimiento. Solo se activa con ?rideDemo=1. */
(function () {
    'use strict';

    const params = new URLSearchParams(window.location.search);
    if (params.get('rideDemo') !== '1') return;

    const route = [
        { lat: 41.6317, lon: -4.7432 },
        { lat: 41.6328, lon: -4.7420 },
        { lat: 41.6340, lon: -4.7408 },
        { lat: 41.6357, lon: -4.7390 },
        { lat: 41.6376, lon: -4.7370 },
        { lat: 41.6395, lon: -4.7350 },
        { lat: 41.6415, lon: -4.7329 }
    ];

    const stops = [
        { key: 'BOARD', name: 'Paseo Zorrilla 203 esquina Vinos de Cigales', ...route[2] },
        { key: 'S1', name: 'Paseo Zorrilla 187 esquina Vinos Vega Sicilia', ...route[3] },
        { key: 'S2', name: 'Paseo Zorrilla 153 frente Centro Comercial', ...route[4] },
        { key: 'S3', name: 'Paseo Zorrilla 133 La Rubia', ...route[5] },
        { key: 'DEST', name: 'Paseo Zorrilla 101 LAVA', ...route[6] }
    ];

    const states = [
        {
            label: 'Esperando · llega en 5 min',
            phase: 'waiting', arrivalMinutes: 5, destinationKey: null,
            bus: route[0], user: route[2]
        },
        {
            label: 'Se acerca · llega en 2 min',
            phase: 'waiting', arrivalMinutes: 2, destinationKey: null,
            bus: route[1], user: route[2]
        },
        {
            label: 'El bus está en tu parada',
            phase: 'waiting', arrivalMinutes: 0, destinationKey: null,
            bus: route[2], user: route[2]
        },
        {
            label: 'A bordo · 4 paradas',
            phase: 'onboard', destinationKey: 'DEST',
            bus: { lat: 41.6343, lon: -4.7405 }, user: { lat: 41.6343, lon: -4.7405 }
        },
        {
            label: 'En ruta · 3 paradas',
            phase: 'onboard', destinationKey: 'DEST',
            bus: { lat: 41.6360, lon: -4.7387 }, user: { lat: 41.6360, lon: -4.7387 }
        },
        {
            label: 'Aviso · quedan 2 paradas',
            phase: 'onboard', destinationKey: 'DEST',
            bus: { lat: 41.6379, lon: -4.7367 }, user: { lat: 41.6379, lon: -4.7367 }
        },
        {
            label: 'Bájate en la próxima',
            phase: 'onboard', destinationKey: 'DEST',
            bus: { lat: 41.6398, lon: -4.7347 }, user: { lat: 41.6398, lon: -4.7347 }
        },
        {
            label: 'Sin señal del bus · respaldo GPS',
            phase: 'onboard', destinationKey: 'DEST', bus: null,
            user: { lat: 41.6400, lon: -4.7345 }
        },
        {
            label: 'Has llegado',
            phase: 'onboard', destinationKey: 'DEST',
            bus: route[6], user: route[6]
        }
    ];

    let current = 0;
    let timer = null;
    let demoLayer = null;
    let lastFramedDestinationKey = Symbol('unframed');

    function drawDemoRoute() {
        if (!window.vallabusMap || !window.L) return;
        if (demoLayer) demoLayer.remove();
        demoLayer = window.L.layerGroup().addTo(window.vallabusMap);
        window.L.polyline(route.map(point => [point.lat, point.lon]), {
            color: '#43a650', weight: 6, opacity: 0.92
        }).addTo(demoLayer);
        stops.forEach(stop => {
            window.L.circleMarker([stop.lat, stop.lon], {
                radius: 6, color: '#fff', weight: 2, fillColor: '#43a650', fillOpacity: 1
            }).bindTooltip(stop.name).addTo(demoLayer);
        });
        window.vallabusMap.fitBounds(route.map(point => [point.lat, point.lon]), { padding: [54, 54] });
    }

    function applyState(index) {
        current = (index + states.length) % states.length;
        const item = states[current];
        const arrivalTime = Number.isFinite(item.arrivalMinutes)
            ? new Date(Date.now() + item.arrivalMinutes * 60000).toISOString()
            : undefined;
        window.rideTracking.applyDemoState({
            ...item,
            arrivalTime,
            timestamp: Date.now(),
            lastUpdate: item.bus === null
                ? 'Última ubicación aproximada. Actualizada hace 48s'
                : 'Última ubicación aproximada. Actualizada hace 3s'
        });
        const label = document.getElementById('rideDemoStateLabel');
        if (label) label.textContent = `${current + 1}/${states.length} · ${item.label}`;
        const destinationChanged = item.destinationKey !== lastFramedDestinationKey;
        lastFramedDestinationKey = item.destinationKey;
        if (destinationChanged) {
            setTimeout(() => window.rideTracking.fitMapToJourney?.({ animate: false }), 50);
        }
    }

    async function startDemo() {
        const toolbar = document.getElementById('rideDemoToolbar');
        if (toolbar) toolbar.hidden = false;
        document.getElementById('mapContainer')?.classList.add('show');
        window.vallabusMap?.invalidateSize();
        drawDemoRoute();
        await window.rideTracking.start({
            tripId: 'VALLABUS-DEMO',
            lineNumber: '1',
            stopNumber: 'BOARD',
            stopName: stops[0].name,
            stopLatitud: stops[0].lat,
            stopLongitud: stops[0].lon,
            arrivalTime: new Date(Date.now() + 5 * 60000).toISOString(),
            etaLabel: '5 min',
            arrivalLabel: new Date(Date.now() + 5 * 60000).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
            destination: 'B. España',
            demoData: { route, stops }
        });
        drawDemoRoute();
        applyState(0);
    }

    function togglePlay() {
        const button = document.getElementById('rideDemoPlay');
        if (timer) {
            clearInterval(timer);
            timer = null;
            if (button) button.textContent = 'Reproducir';
            return;
        }
        if (button) button.textContent = 'Pausar';
        timer = setInterval(() => {
            if (current === states.length - 1) {
                togglePlay();
                return;
            }
            applyState(current + 1);
        }, 2600);
    }

    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('rideDemoPrevious')?.addEventListener('click', () => applyState(current - 1));
        document.getElementById('rideDemoNext')?.addEventListener('click', () => applyState(current + 1));
        document.getElementById('rideDemoPlay')?.addEventListener('click', togglePlay);
        setTimeout(startDemo, 120);
    });

    window.rideTrackingDemo = { start: startDemo, setState: applyState, states: states.map(item => item.label) };
})();
