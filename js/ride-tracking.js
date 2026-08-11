/*
 * MVP de seguimiento de viaje.
 *
 * El autobús es la fuente principal del avance por la ruta. El GPS del
 * usuario se utiliza en primer plano para dibujar su posición y aportar una
 * señal adicional de que ambos se están moviendo juntos. No se envían las
 * coordenadas del usuario a ningún servidor en este MVP.
 */
(function () {
    'use strict';

    const BOARD_STOP_RADIUS = 90;
    const BUS_STOP_RADIUS = 95;
    const BUS_USER_RADIUS = 180;
    const ONBOARD_MARKER_MERGE_RADIUS = 75;
    const DESTINATION_TOLERANCE = 25;
    const POSITION_MAX_AGE = 5000;
    const GPS_TIMEOUT = 12000;
    const LIVE_POSITION_MAX_AGE = 90 * 1000;

    const state = {
        active: false,
        phase: 'idle',
        tripId: null,
        lineNumber: null,
        vehicleId: null,
        matricula: null,
        stopNumber: null,
        stopName: '',
        arrivalTime: null,
        etaLabel: '',
        arrivalLabel: '',
        destinationHint: '',
        mapContext: null,
        boardStop: null,
        destination: null,
        stops: [],
        route: null,
        userPosition: null,
        userProjection: null,
        busPosition: null,
        busProjection: null,
        busPositionUnavailable: false,
        busAtBoardStop: false,
        userWasAtBoardStop: false,
        boardingEvidence: 0,
        busSpeedMps: null,
        previousBusProjection: null,
        previousBusTimestamp: null,
        lastBusUpdateAt: null,
        lastUpdateHtml: '',
        nextStop: null,
        remainingStops: null,
        destinationEtaMinutes: null,
        progressSource: null,
        demoData: null,
        notified: new Set(),
        gpsWatchId: null,
        gpsErrorMessage: '',
        loadToken: 0
    };

    let userMarker = null;
    let destinationMarker = null;
    let uiBound = false;

    function refreshTrackingMap({ refit = false } = {}) {
        const map = window.vallabusMap;
        if (!map) return;
        map.invalidateSize?.({ pan: false });
        map.dragging?.enable?.();
        map.touchZoom?.enable?.();
        map.scrollWheelZoom?.enable?.();
        map.doubleClickZoom?.enable?.();
        if (refit) requestAnimationFrame(() => fitMapToJourney({ animate: true }));
    }

    function setPanelCollapsed(collapsed) {
        const ui = getUi();
        if (!ui.panel || !ui.sheetToggle) return;
        ui.panel.classList.toggle('is-collapsed', collapsed);
        ui.sheetToggle.setAttribute('aria-expanded', String(!collapsed));
        ui.sheetToggle.setAttribute('aria-label', collapsed ? 'Expandir panel' : 'Contraer panel');
        refreshTrackingMap();
    }

    function bindSheetGesture(ui) {
        const handle = ui.sheetToggle;
        if (!handle) return;

        let gesture = null;
        let suppressPointerClick = false;

        // Con puntero la hoja cambia mediante un gesto vertical. El click
        // queda reservado para teclado y lectores de pantalla.
        handle.addEventListener('click', event => {
            if (suppressPointerClick) {
                suppressPointerClick = false;
                event.preventDefault();
                return;
            }
            setPanelCollapsed(!ui.panel.classList.contains('is-collapsed'));
        });

        handle.addEventListener('pointerdown', event => {
            if (event.pointerType === 'mouse' && event.button !== 0) return;
            gesture = { startY: event.clientY, pointerId: event.pointerId };
            suppressPointerClick = true;
            handle.classList.add('is-dragging');
            handle.setPointerCapture?.(event.pointerId);
            event.preventDefault();
        }, { passive: false });

        handle.addEventListener('pointermove', event => {
            if (!gesture || event.pointerId !== gesture.pointerId) return;
            event.preventDefault();
        }, { passive: false });

        const finishGesture = event => {
            if (!gesture || (event.pointerId !== undefined && event.pointerId !== gesture.pointerId)) return;
            const deltaY = event.clientY - gesture.startY;
            const dragged = Math.abs(deltaY) >= 28;
            gesture = null;
            handle.classList.remove('is-dragging');
            handle.releasePointerCapture?.(event.pointerId);
            if (dragged) setPanelCollapsed(deltaY > 0);
        };

        handle.addEventListener('pointerup', finishGesture);
        handle.addEventListener('pointercancel', finishGesture);
    }

    function ensureGlobalState() {
        window.globalState = window.globalState || {};
        return window.globalState;
    }

    function getUi() {
        return {
            mapFollowButton: document.getElementById('mapFollowButton'),
            mapFollowTitle: document.getElementById('mapFollowTitle'),
            mapFollowMeta: document.getElementById('mapFollowMeta'),
            mapFollowFreshness: document.getElementById('mapFollowFreshness'),
            mapFollowAction: document.querySelector('#mapFollowButton .map-follow-action'),
            panel: document.getElementById('rideTrackingPanel'),
            sheetToggle: document.getElementById('rideSheetToggle'),
            title: document.getElementById('rideTrackingTitle'),
            lineLabel: document.getElementById('rideTrackingLineLabel'),
            phaseLabel: document.getElementById('rideTrackingPhaseLabel'),
            status: document.getElementById('rideTrackingStatus'),
            urgentAlert: document.getElementById('rideTrackingUrgentAlert'),
            metric: document.querySelector('.ride-tracking-metric'),
            remainingMetric: document.getElementById('rideTrackingRemainingMetric'),
            remainingValue: document.getElementById('rideTrackingRemainingValue'),
            remainingLabel: document.getElementById('rideTrackingRemainingLabel'),
            summaryDivider: document.getElementById('rideTrackingSummaryDivider'),
            etaMetric: document.getElementById('rideTrackingEtaMetric'),
            metricValue: document.getElementById('rideTrackingMetricValue'),
            metricLabel: document.getElementById('rideTrackingMetricLabel'),
            nextStop: document.getElementById('rideTrackingNextStop'),
            arrivalTime: document.getElementById('rideTrackingArrivalTime'),
            lastUpdate: document.getElementById('rideTrackingLastUpdate'),
            locationHint: document.getElementById('rideTrackingLocationHint'),
            destination: document.getElementById('rideDestinationSelect'),
            destinationField: document.querySelector('.ride-destination-field'),
            destinationValue: document.getElementById('rideDestinationValue'),
            destinationDialog: document.getElementById('rideDestinationDialog'),
            destinationDialogClose: document.getElementById('rideDestinationDialogClose'),
            destinationSearch: document.getElementById('rideDestinationSearch'),
            destinationOptions: document.getElementById('rideDestinationOptions'),
            boardButton: document.getElementById('rideBoardButton'),
            stopButton: document.getElementById('rideStopButton'),
            stopLabel: document.querySelector('#rideStopButton > span:last-child'),
            closeButton: document.getElementById('rideTrackingClose')
        };
    }

    function bindUi() {
        if (uiBound) return;
        const ui = getUi();
        if (!ui.mapFollowButton || !ui.panel) return;

        ui.mapFollowButton.addEventListener('click', event => {
            event.stopPropagation();
            window.rideTrackingOnboarding?.complete?.();
            if (state.active) {
                ui.panel.hidden = false;
                render();
                return;
            }
            if (state.mapContext) {
                window.rideTracking.start(state.mapContext);
            }
        });

        ui.destination.addEventListener('change', event => {
            const selectedKey = event.target.value;
            state.destination = state.stops.find(stop => stop.key === selectedKey) || null;
            if (state.phase === 'onboard') updateTripProgress();
            render();
            fitMapToJourney({ animate: true });
        });

        ui.destinationField?.addEventListener('click', event => {
            event.stopPropagation();
            openDestinationDialog();
        });

        ui.destinationDialogClose?.addEventListener('click', closeDestinationDialog);
        ui.destinationDialog?.addEventListener('click', event => {
            if (event.target === ui.destinationDialog) closeDestinationDialog();
        });
        ui.destinationSearch?.addEventListener('input', renderDestinationOptions);

        bindSheetGesture(ui);

        ui.boardButton.addEventListener('click', event => {
            event.stopPropagation();
            confirmBoarding();
        });

        ui.stopButton.addEventListener('click', event => {
            event.stopPropagation();
            stop('manual');
        });

        ui.closeButton.addEventListener('click', event => {
            event.stopPropagation();
            stop('manual');
        });

        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && ui.destinationDialog && !ui.destinationDialog.hidden) {
                closeDestinationDialog();
            }
        });

        uiBound = true;
    }

    function toNumber(value) {
        const number = Number.parseFloat(value);
        return Number.isFinite(number) ? number : null;
    }

    function normalizeContext(input) {
        const context = input || {};
        return {
            tripId: context.tripId != null ? String(context.tripId) : null,
            lineNumber: context.lineNumber != null ? String(context.lineNumber) : '',
            vehicleId: context.vehicleId || null,
            matricula: context.matricula || null,
            stopNumber: context.stopNumber != null ? String(context.stopNumber) : '',
            stopName: context.stopName || '',
            stopLatitud: toNumber(context.stopLatitud ?? context.latitud),
            stopLongitud: toNumber(context.stopLongitud ?? context.longitud),
            arrivalTime: context.arrivalTime || null,
            etaLabel: context.etaLabel || '',
            arrivalLabel: context.arrivalLabel || '',
            destination: context.destination || '',
            demoData: context.demoData || null
        };
    }

    function positionFromRaw(raw) {
        if (!raw) return null;
        const lat = toNumber(raw.latitud ?? raw.latitude ?? raw.lat);
        const lon = toNumber(raw.longitud ?? raw.longitude ?? raw.lon ?? raw.lng);
        if (lat === null || lon === null) return null;
        const numericTimestamp = toNumber(raw.timestamp);
        const parsedTimestamp = numericTimestamp === null && raw.timestamp
            ? Date.parse(String(raw.timestamp))
            : null;
        const timestampValue = numericTimestamp ?? (Number.isFinite(parsedTimestamp) ? parsedTimestamp : null);
        const timestamp = timestampValue !== null && timestampValue < 100000000000
            ? timestampValue * 1000
            : timestampValue;
        return {
            lat,
            lon,
            accuracy: toNumber(raw.accuracy) || null,
            timestamp: timestamp || Date.now(),
            speed: toNumber(raw.velocidad ?? raw.speed)
        };
    }

    function haversine(a, b) {
        if (!a || !b) return Infinity;
        const radius = 6371000;
        const lat1 = a.lat * Math.PI / 180;
        const lat2 = b.lat * Math.PI / 180;
        const dLat = (b.lat - a.lat) * Math.PI / 180;
        const dLon = (b.lon - a.lon) * Math.PI / 180;
        const sinLat = Math.sin(dLat / 2);
        const sinLon = Math.sin(dLon / 2);
        const value = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
        return 2 * radius * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
    }

    function coordinateFromGeometry(feature) {
        const coordinates = feature?.geometry?.coordinates || feature?.coordinates;
        if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
        return {
            lat: toNumber(coordinates[1]),
            lon: toNumber(coordinates[0])
        };
    }

    function extractRouteCoordinates(data) {
        const features = Array.isArray(data?.features)
            ? data.features
            : data?.type === 'Feature'
                ? [data]
                : Array.isArray(data)
                    ? data
                    : [];
        const feature = features.find(item => {
            const type = item?.geometry?.type;
            return type === 'LineString' || type === 'MultiLineString';
        });
        if (!feature) return [];

        const type = feature.geometry.type;
        const coordinates = type === 'MultiLineString'
            ? feature.geometry.coordinates.flat()
            : feature.geometry.coordinates;

        return coordinates
            .map(pair => ({ lat: toNumber(pair?.[1]), lon: toNumber(pair?.[0]) }))
            .filter(point => point.lat !== null && point.lon !== null);
    }

    function buildRouteModel(coordinates) {
        if (!coordinates || coordinates.length < 2) return null;
        const cumulative = [0];
        for (let index = 1; index < coordinates.length; index += 1) {
            cumulative.push(cumulative[index - 1] + haversine(coordinates[index - 1], coordinates[index]));
        }
        return {
            coordinates,
            cumulative,
            length: cumulative[cumulative.length - 1]
        };
    }

    function projectToRoute(point) {
        if (!point || !state.route) return null;

        const route = state.route;
        const referenceLat = point.lat * Math.PI / 180;
        let best = null;

        for (let index = 1; index < route.coordinates.length; index += 1) {
            const start = route.coordinates[index - 1];
            const end = route.coordinates[index];
            const scaleX = 111320 * Math.cos(referenceLat);
            const scaleY = 110540;
            const dx = (end.lon - start.lon) * scaleX;
            const dy = (end.lat - start.lat) * scaleY;
            const px = (point.lon - start.lon) * scaleX;
            const py = (point.lat - start.lat) * scaleY;
            const denominator = dx * dx + dy * dy;
            const ratio = denominator === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / denominator));
            const projected = {
                lat: start.lat + (end.lat - start.lat) * ratio,
                lon: start.lon + (end.lon - start.lon) * ratio
            };
            const distance = haversine(point, projected);
            if (!best || distance < best.distance) {
                best = {
                    distance,
                    progress: route.cumulative[index - 1] + haversine(start, projected),
                    point: projected,
                    segment: index
                };
            }
        }
        return best;
    }

    function extractStops(data) {
        const features = Array.isArray(data?.features)
            ? data.features
            : data?.type === 'Feature'
                ? [data]
                : Array.isArray(data)
                    ? data
                    : [];
        return features.map((feature, index) => {
            const coordinates = coordinateFromGeometry(feature);
            const properties = feature?.properties || feature || {};
            if (!coordinates || coordinates.lat === null || coordinates.lon === null) return null;

            const id = properties.stop_code ?? properties.stop_id ?? properties.code ?? index;
            const sequence = toNumber(
                properties.stop_sequence ?? properties.stop_seq ?? properties.sequence ?? properties.order
            );
            const name = properties.stop_name || properties.name || properties.parada || `Parada ${id}`;
            return {
                key: String(id),
                id: String(id),
                name: String(name),
                lat: coordinates.lat,
                lon: coordinates.lon,
                sequence: sequence === null ? index : sequence,
                progress: null
            };
        }).filter(Boolean);
    }

    async function requestJson(path) {
        const response = typeof window.fetchApi === 'function'
            ? await window.fetchApi(path)
            : await fetch(path);
        if (!response.ok) throw new Error(`No se pudo cargar ${path}`);
        return response.json();
    }

    async function resolveBoardStop() {
        if (!state.stopNumber || (state.boardStop?.lat !== undefined && state.boardStop?.lon !== undefined)) {
            return;
        }

        if (typeof window.loadBusStops !== 'function') return;
        try {
            const stops = await window.loadBusStops();
            const stop = stops.find(item => String(item?.parada?.numero) === String(state.stopNumber));
            if (stop?.ubicacion) {
                state.boardStop = {
                    id: String(state.stopNumber),
                    name: state.stopName || stop.parada.nombre,
                    lat: toNumber(stop.ubicacion.y),
                    lon: toNumber(stop.ubicacion.x),
                    progress: null
                };
                state.stopName = state.boardStop.name;
            }
        } catch (error) {
            console.warn('No se pudo resolver la parada de subida:', error);
        }
    }

    async function loadTripData() {
        if (!state.tripId) return;
        const token = ++state.loadToken;
        try {
            const [shapeData, stopsData] = await Promise.all([
                requestJson(`/v2/geojson/${encodeURIComponent(state.tripId)}`),
                requestJson(`/v2/geojson/paradas/${encodeURIComponent(state.tripId)}`)
            ]);
            if (!state.active || token !== state.loadToken) return;

            state.route = buildRouteModel(extractRouteCoordinates(shapeData));
            const loadedStops = extractStops(stopsData);
            if (state.route) {
                loadedStops.forEach(stop => {
                    const projection = projectToRoute(stop);
                    stop.progress = projection ? projection.progress : null;
                });
            }

            if (!state.boardStop?.lat && state.stopNumber) {
                const fromRoute = loadedStops.find(stop => String(stop.id) === String(state.stopNumber));
                if (fromRoute) {
                    state.boardStop = { ...fromRoute };
                    state.stopName = fromRoute.name;
                }
            }

            if (state.boardStop && state.route && state.boardStop.progress === null) {
                const boardProjection = projectToRoute(state.boardStop);
                state.boardStop.progress = boardProjection?.progress ?? null;
            }

            state.stops = loadedStops
                .filter(stop => stop.progress !== null)
                .sort((first, second) => first.progress - second.progress);

            // El primer position update puede llegar antes que la geometría.
            // Reproyectamos las posiciones ya recibidas para no perder el
            // avance ni la detección de subida durante esa carrera de carga.
            if (state.route && state.busPosition) {
                state.busProjection = projectToRoute(state.busPosition);
            }
            if (state.route && state.userPosition) {
                state.userProjection = projectToRoute(state.userPosition);
            }
            evaluateBoarding();
            if (state.phase === 'onboard' || state.phase === 'arrived') {
                updateTripProgress();
            }

            populateDestinationSelect();
            render();
            fitMapToJourney({ animate: false });
        } catch (error) {
            console.error('Error cargando el recorrido para el seguimiento:', error);
            setStatus('No puedo cargar las paradas de esta línea ahora.', 'warning');
        }
    }

    function loadDemoData(demoData) {
        if (!demoData) return;
        state.route = buildRouteModel((demoData.route || []).map(point => ({
            lat: toNumber(point.lat ?? point[1]),
            lon: toNumber(point.lon ?? point.lng ?? point[0])
        })).filter(point => point.lat !== null && point.lon !== null));
        state.stops = (demoData.stops || []).map((stop, index) => ({
            key: String(stop.key ?? stop.id ?? index),
            id: String(stop.id ?? stop.key ?? index),
            name: String(stop.name || `Parada ${index + 1}`),
            lat: toNumber(stop.lat),
            lon: toNumber(stop.lon ?? stop.lng),
            sequence: index,
            progress: null
        }));
        if (state.route) {
            state.stops.forEach(stop => {
                stop.progress = projectToRoute(stop)?.progress ?? null;
            });
            state.stops = state.stops.filter(stop => stop.progress !== null).sort((a, b) => a.progress - b.progress);
            if (state.boardStop) state.boardStop.progress = projectToRoute(state.boardStop)?.progress ?? null;
        }
        populateDestinationSelect();
    }

    function populateDestinationSelect() {
        const select = getUi().destination;
        if (!select) return;
        const currentValue = state.destination?.key || '';
        select.replaceChildren();

        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Elige una parada (opcional)';
        select.appendChild(placeholder);

        const boardProgress = state.boardStop?.progress ?? -Infinity;
        state.stops
            .filter(stop => stop.progress > boardProgress + 10)
            .forEach(stop => {
                const option = document.createElement('option');
                option.value = stop.key;
                option.textContent = stop.name;
                select.appendChild(option);
            });

        if (currentValue && state.stops.some(stop => stop.key === currentValue)) {
            select.value = currentValue;
        }
        renderDestinationOptions();
    }

    function getUpcomingStops() {
        const liveProgress = state.busProjection?.progress
            ?? state.userProjection?.progress
            ?? state.boardStop?.progress
            ?? -Infinity;
        const currentProgress = Math.max(liveProgress, state.boardStop?.progress ?? -Infinity);
        return state.stops.filter(stop => stop.progress > currentProgress + 10);
    }

    function estimateStopMeta(stop) {
        const currentProgress = state.busProjection?.progress
            ?? state.userProjection?.progress
            ?? state.boardStop?.progress
            ?? -Infinity;
        const remaining = state.stops.filter(candidate =>
            candidate.progress > currentProgress + 10 && candidate.progress <= stop.progress + 5
        ).length;
        return `${remaining} ${remaining === 1 ? 'parada' : 'paradas'} · ~${Math.max(1, remaining * 2)} min`;
    }

    function renderDestinationOptions() {
        const ui = getUi();
        if (!ui.destinationOptions) return;
        const query = String(ui.destinationSearch?.value || '').trim().toLocaleLowerCase('es');
        const stops = getUpcomingStops().filter(stop => stop.name.toLocaleLowerCase('es').includes(query));
        ui.destinationOptions.replaceChildren();

        stops.forEach(stop => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'ride-destination-option';
            button.classList.toggle('is-selected', state.destination?.key === stop.key);
            button.innerHTML = `<span><strong></strong><small></small></span><span aria-hidden="true">›</span>`;
            button.querySelector('strong').textContent = stop.name;
            button.querySelector('small').textContent = estimateStopMeta(stop);
            button.addEventListener('click', () => {
                state.destination = stop;
                if (ui.destination) {
                    ui.destination.value = stop.key;
                    ui.destination.dispatchEvent(new Event('change', { bubbles: true }));
                }
                closeDestinationDialog();
            });
            ui.destinationOptions.appendChild(button);
        });

        if (!stops.length) {
            const empty = document.createElement('p');
            empty.className = 'ride-destination-empty';
            empty.textContent = 'No hay próximas paradas que coincidan.';
            ui.destinationOptions.appendChild(empty);
        }
    }

    function openDestinationDialog() {
        const ui = getUi();
        if (!ui.destinationDialog) return;
        ui.destinationDialog.hidden = false;
        if (ui.destinationSearch) ui.destinationSearch.value = '';
        renderDestinationOptions();
        // El selector se abre para poder recorrer la lista; enfocar el campo
        // aquí dispara el teclado virtual antes de que el usuario decida
        // buscar. Dejamos el foco en cerrar, que es accesible y no abre el
        // teclado en móvil.
        requestAnimationFrame(() => ui.destinationDialogClose?.focus({ preventScroll: true }));
    }

    function closeDestinationDialog() {
        const ui = getUi();
        if (!ui.destinationDialog) return;
        ui.destinationDialog.hidden = true;
        ui.destinationField?.focus();
    }

    function startUserTracking() {
        if (!navigator.geolocation) {
            state.gpsErrorMessage = 'Este dispositivo no permite usar la ubicación.';
            render();
            return;
        }

        if (state.gpsWatchId !== null) {
            navigator.geolocation.clearWatch(state.gpsWatchId);
        }

        try {
            state.gpsWatchId = navigator.geolocation.watchPosition(
                handleUserPosition,
                handleGpsError,
                {
                    enableHighAccuracy: true,
                    maximumAge: POSITION_MAX_AGE,
                    timeout: GPS_TIMEOUT
                }
            );
        } catch (error) {
            handleGpsError(error);
        }
    }

    function stopUserTracking() {
        if (state.gpsWatchId !== null && navigator.geolocation) {
            navigator.geolocation.clearWatch(state.gpsWatchId);
        }
        state.gpsWatchId = null;
        removeUserMarker();
    }

    function handleUserPosition(position) {
        if (!state.active) return;
        if (!position?.coords) return;
        state.gpsErrorMessage = '';
        state.userPosition = positionFromRaw({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            speed: position.coords.speed,
            timestamp: position.timestamp
        });
        state.userProjection = projectToRoute(state.userPosition);
        updateUserMarker();

        if (state.userProjection && state.boardStop) {
            const distanceToBoard = haversine(state.userPosition, state.boardStop);
            state.userWasAtBoardStop = state.userWasAtBoardStop
                || distanceToBoard <= Math.max(BOARD_STOP_RADIUS, state.userPosition.accuracy || 0);
        }
        evaluateBoarding();
        if (state.phase === 'onboard' && state.busPositionUnavailable) {
            updateTripProgress();
        }
        render();
    }

    function handleGpsError(error) {
        if (!state.active) return;
        if (error?.code === 1) {
            state.gpsErrorMessage = 'Necesito permiso de ubicación para seguir tu viaje.';
        } else {
            state.gpsErrorMessage = 'No recibo una posición precisa del móvil. El seguimiento del bus continúa.';
        }
        render();
    }

    function createRideMarkerIcon(kind) {
        const markerContent = kind === 'destination'
            ? `
                <span class="ride-map-marker ride-map-marker--destination" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false">
                        <path d="M5 21V4"></path>
                        <path d="M6 4h11l-2.2 3L17 10H6z"></path>
                    </svg>
                </span>`
            : `
                <span class="ride-map-marker ride-map-marker--user" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false">
                        <circle cx="12" cy="7" r="3.1"></circle>
                        <path d="M5.8 20c.4-4.1 2.4-6.2 6.2-6.2s5.8 2.1 6.2 6.2"></path>
                    </svg>
                </span>`;
        return window.L.divIcon({
            className: 'ride-map-marker-icon',
            html: markerContent,
            iconSize: [40, 46],
            iconAnchor: [20, 42],
            popupAnchor: [0, -38]
        });
    }

    function updateUserMarker() {
        const map = window.vallabusMap;
        if (!map || !state.userPosition || typeof window.L === 'undefined') return;
        if ((state.phase === 'onboard' || state.phase === 'arrived')
            && state.busPosition
            && haversine(state.userPosition, state.busPosition)
                <= Math.max(ONBOARD_MARKER_MERGE_RADIUS, state.userPosition.accuracy || 0)) {
            removeUserMarker();
            return;
        }
        const latLng = [state.userPosition.lat, state.userPosition.lon];
        if (!userMarker) {
            userMarker = window.L.marker(latLng, {
                icon: createRideMarkerIcon('user'),
                title: 'Tu ubicación'
            }).addTo(map);
            userMarker.bindTooltip('Tu ubicación');
        } else {
            userMarker.setLatLng(latLng);
        }
    }

    function removeUserMarker() {
        if (userMarker && typeof userMarker.remove === 'function') {
            userMarker.remove();
        }
        userMarker = null;
    }

    function removeDestinationMarker() {
        if (destinationMarker && typeof destinationMarker.remove === 'function') {
            destinationMarker.remove();
        }
        destinationMarker = null;
    }

    function updateDestinationMarker() {
        const map = window.vallabusMap;
        if (!map || typeof window.L === 'undefined') return;
        if (!state.destination || state.destination.lat === null || state.destination.lon === null) {
            removeDestinationMarker();
            return;
        }

        const latLng = [state.destination.lat, state.destination.lon];
        if (!destinationMarker) {
            destinationMarker = window.L.marker(latLng, {
                icon: createRideMarkerIcon('destination'),
                title: `Destino: ${state.destination.name}`
            }).addTo(map);
            destinationMarker.bindTooltip(`Destino: ${state.destination.name}`);
        } else {
            destinationMarker.setLatLng(latLng);
            destinationMarker.setTooltipContent(`Destino: ${state.destination.name}`);
        }
    }

    function fitMapToJourney(options = {}) {
        const map = window.vallabusMap;
        if (!map || typeof window.L === 'undefined' || !state.active) return;

        const destinationProgress = state.destination?.progress ?? null;
        const points = [];
        const addPoint = point => {
            if (point && Number.isFinite(point.lat) && Number.isFinite(point.lon)) {
                points.push([point.lat, point.lon]);
            }
        };

        const progressCandidates = [
            state.busProjection?.progress,
            state.userProjection?.progress,
            state.boardStop?.progress
        ].filter(Number.isFinite);
        const currentProgress = progressCandidates.length ? Math.max(...progressCandidates) : null;
        const boardProgress = Number.isFinite(state.boardStop?.progress) ? state.boardStop.progress : null;
        const startProgress = Math.max(
            0,
            (state.phase === 'waiting' && boardProgress !== null
                ? Math.min(currentProgress ?? boardProgress, boardProgress)
                : currentProgress ?? boardProgress ?? 0) - 120
        );

        let endProgress = destinationProgress;
        if (endProgress === null && currentProgress !== null) {
            const upcomingStops = state.stops
                .filter(stop => Number.isFinite(stop.progress) && stop.progress >= currentProgress - 20)
                .sort((first, second) => first.progress - second.progress);
            const lastVisibleStop = upcomingStops[Math.min(5, Math.max(0, upcomingStops.length - 1))];
            endProgress = lastVisibleStop?.progress
                ?? Math.min(state.route?.length ?? currentProgress + 2600, currentProgress + 2600);
        }
        if (endProgress === null && state.route?.length) endProgress = state.route.length;
        if (endProgress !== null && endProgress < startProgress + 120) {
            endProgress = startProgress + 120;
        }

        // Encuadramos el tramo relevante, no toda la línea: así la secuencia
        // de próximas paradas se entiende incluso en una pantalla pequeña.
        if (state.route?.coordinates?.length) {
            state.route.coordinates.forEach((point, index) => {
                const progress = state.route.cumulative[index];
                if (progress >= startProgress && progress <= (endProgress ?? progress) + 45) {
                    addPoint(point);
                }
            });
        }

        state.stops
            .filter(stop => Number.isFinite(stop.progress)
                && stop.progress >= startProgress
                && stop.progress <= (endProgress ?? stop.progress) + 45)
            .forEach(addPoint);
        addPoint(state.boardStop);
        addPoint(state.busPosition);
        addPoint(state.userPosition);
        addPoint(state.destination);

        if (points.length < 2) return;

        const panel = document.getElementById('rideTrackingPanel');
        const mapHeight = map.getSize?.().y || document.getElementById('busMap')?.clientHeight || window.innerHeight;
        const panelHeight = panel && !panel.hidden && !panel.classList.contains('is-collapsed')
            ? panel.getBoundingClientRect().height
            : 0;
        const bottomPadding = Math.min(
            Math.max(96, Math.round(panelHeight + 30)),
            Math.max(96, Math.round(mapHeight - 96))
        );

        refreshTrackingMap();
        map.fitBounds(points, {
            animate: options.animate !== false,
            duration: 0.45,
            paddingTopLeft: [32, 52],
            paddingBottomRight: [32, bottomPadding],
            maxZoom: 16.5
        });
    }

    function handleBusPosition(raw, busData) {
        if (!state.active) return;
        const incomingTripId = busData?.tripId != null ? String(busData.tripId) : null;
        if (incomingTripId && incomingTripId !== state.tripId) return;

        const position = positionFromRaw(raw);
        if (!position) {
            state.busPositionUnavailable = true;
            state.busAtBoardStop = false;
            if (state.phase === 'onboard') updateTripProgress();
            render();
            return;
        }

        state.busPosition = position;
        state.busPositionUnavailable = false;
        state.lastBusUpdateAt = Date.now();
        state.busProjection = projectToRoute(position);

        if (state.previousBusProjection && state.previousBusTimestamp) {
            const elapsed = (position.timestamp - state.previousBusTimestamp) / 1000;
            const progressDelta = state.busProjection && state.previousBusProjection
                ? state.busProjection.progress - state.previousBusProjection.progress
                : 0;
            if (elapsed > 0 && elapsed < 90 && progressDelta >= 0 && progressDelta < 2500) {
                const speed = progressDelta / elapsed;
                state.busSpeedMps = state.busSpeedMps === null
                    ? speed
                    : state.busSpeedMps * 0.7 + speed * 0.3;
            }
        }
        state.previousBusProjection = state.busProjection;
        state.previousBusTimestamp = position.timestamp;

        evaluateBoarding();
        if (state.phase === 'onboard') updateTripProgress();
        render();
    }

    function evaluateBoarding() {
        if (!state.active || !state.boardStop || !state.busProjection) return;
        const boardProjection = state.boardStop.progress === null
            ? projectToRoute(state.boardStop)
            : { progress: state.boardStop.progress };
        if (!boardProjection) return;

        const busToBoardProgress = Math.abs(state.busProjection.progress - boardProjection.progress);
        state.busAtBoardStop = busToBoardProgress <= BUS_STOP_RADIUS;

        // El GPS del usuario mejora la detección automática, pero no debe
        // impedir la confirmación manual cuando el bus ya está en la parada.
        if (!state.userPosition) return;

        const userToBoard = haversine(state.userPosition, state.boardStop);
        state.userWasAtBoardStop = state.userWasAtBoardStop
            || userToBoard <= Math.max(BOARD_STOP_RADIUS, state.userPosition.accuracy || 0);

        if (state.phase === 'waiting' && state.userWasAtBoardStop) {
            const busToUser = haversine(state.busPosition, state.userPosition);
            const sameRouteProgress = state.userProjection
                && Math.abs(state.busProjection.progress - state.userProjection.progress) <= BUS_USER_RADIUS;
            const busHasLeftStop = state.busProjection.progress > boardProjection.progress + 100;

            if (busHasLeftStop && busToUser <= Math.max(BUS_USER_RADIUS, (state.userPosition.accuracy || 0) + 30) && sameRouteProgress) {
                state.boardingEvidence += 1;
            } else {
                state.boardingEvidence = Math.max(0, state.boardingEvidence - 1);
            }

            if (state.boardingEvidence >= 2) {
                state.phase = 'boarding-candidate';
            }
        }
    }

    function isBoardingPromptAvailable() {
        if (state.phase !== 'waiting') return false;
        return state.busAtBoardStop && hasFreshBusPosition();
    }

    function hasBusLeftBoardStop() {
        if (!hasFreshBusPosition() || !state.busProjection) return false;
        const boardProgress = Number.isFinite(state.boardStop?.progress)
            ? state.boardStop.progress
            : projectToRoute(state.boardStop)?.progress;
        return Number.isFinite(boardProgress)
            && state.busProjection.progress > boardProgress + 100;
    }

    function isArrivalWindow() {
        const reportedEta = getReportedEtaMinutes();
        if (reportedEta !== null) return reportedEta <= 1;

        if (state.arrivalTime) {
            const arrival = new Date(state.arrivalTime);
            if (!Number.isNaN(arrival.getTime())) {
                const delta = arrival.getTime() - Date.now();
                return delta <= 90 * 1000 && delta > -15 * 60 * 1000;
            }
        }

        return false;
    }

    function getReportedEtaMinutes() {
        const eta = String(state.etaLabel || '').match(/\d+/);
        if (eta) return Math.max(0, Number(eta[0]));

        if (state.arrivalTime) {
            const arrival = new Date(state.arrivalTime);
            if (!Number.isNaN(arrival.getTime())) {
                return Math.max(0, Math.ceil((arrival.getTime() - Date.now()) / 60000));
            }
        }

        return null;
    }

    function isScheduledBoardingWindow() {
        if (state.phase !== 'waiting') return false;
        // La hora prevista habilita la confirmación manual aunque la posición
        // viva todavía no haya llegado exactamente al radio de la parada.
        // Solo la descartamos si el bus ha rebasado claramente la parada, para
        // no mostrar "Estoy dentro" cuando ya sabemos que se fue.
        if (hasBusLeftBoardStop()) return false;
        return isArrivalWindow();
    }

    function hasFreshBusPosition() {
        if (state.busPositionUnavailable || !state.busPosition || !state.lastBusUpdateAt) return false;
        return Date.now() - state.lastBusUpdateAt <= LIVE_POSITION_MAX_AGE;
    }

    function confirmBoarding() {
        if (!state.active) return;

        if (state.phase === 'waiting') {
            if (!isBoardingPromptAvailable() && !isScheduledBoardingWindow()) return;
            state.phase = 'onboard';
            state.boardingEvidence = 0;
            updateTripProgress();
            notifyOnce('boarded', 'Seguimiento iniciado. Te avisaré al acercarte a tu destino.');
            render();
            return;
        }

        if (state.phase !== 'preparing' && state.phase !== 'boarding-candidate') return;
        state.phase = 'onboard';
        state.boardingEvidence = 0;
        updateTripProgress();
        notifyOnce('boarded', 'Seguimiento iniciado. Te avisaré al acercarte a tu destino.');
        render();
    }

    function updateTripProgress() {
        const fallbackProjection = state.userProjection && state.busProjection
            ? (state.userProjection.progress >= state.busProjection.progress - 20 ? state.userProjection : state.busProjection)
            : state.userProjection || state.busProjection;
        const projection = !state.busPositionUnavailable && state.busProjection
            ? state.busProjection
            : fallbackProjection;
        if (!projection || !state.stops.length) return;
        const progress = projection.progress;
        state.progressSource = projection === state.userProjection ? 'gps' : 'bus';
        state.nextStop = state.stops.find(stop => stop.progress > progress + 20) || null;

        if (state.destination && state.destination.progress <= progress + DESTINATION_TOLERANCE) {
            state.nextStop = null;
            state.remainingStops = 0;
            state.destinationEtaMinutes = 0;
            if (state.phase !== 'arrived') {
                state.phase = 'arrived';
                notifyOnce('arrived', `Has llegado a ${state.destination.name}.`);
            }
            return;
        }

        if (state.destination) {
            state.remainingStops = state.stops.filter(stop =>
                stop.progress > progress + 20 && stop.progress <= state.destination.progress + 5
            ).length;
            const distance = Math.max(0, state.destination.progress - progress);
            if (state.busSpeedMps && state.busSpeedMps > 1) {
                const movingMinutes = distance / state.busSpeedMps / 60;
                state.destinationEtaMinutes = Math.max(1, Math.ceil(movingMinutes + state.remainingStops * 0.25));
            } else {
                // La ruta sigue siendo útil aunque la velocidad aún no esté
                // calculada: damos una estimación prudente de dos minutos
                // por parada hasta recibir otra posición del bus.
                state.destinationEtaMinutes = Math.max(1, state.remainingStops * 2);
            }

            if (state.remainingStops <= 3) {
                notifyOnce('three-stops', `Te quedan ${state.remainingStops} paradas para ${state.destination.name}.`);
            }
            if (state.remainingStops <= 1) {
                notifyOnce('one-stop', `Prepárate: bájate en la próxima parada, ${state.destination.name}.`);
            }
        } else {
            state.remainingStops = null;
            state.destinationEtaMinutes = null;
        }
    }

    function notifyOnce(key, message) {
        if (state.notified.has(key)) return;
        state.notified.add(key);
        if (document.visibilityState !== 'visible' && typeof window.showNotice === 'function') {
            window.showNotice('', message);
        }
        if (typeof navigator.vibrate === 'function') {
            navigator.vibrate(120);
        }
    }

    function formatArrivalStatus() {
        const minutes = getReportedEtaMinutes();
        if (minutes === null) return 'Esperando al bus.';
        const arrival = state.arrivalTime ? new Date(state.arrivalTime) : null;
        const time = arrival && !Number.isNaN(arrival.getTime())
            ? arrival.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false })
            : String(state.arrivalLabel || '').trim();
        const timeSuffix = time ? ` · ${time}` : '';
        return minutes <= 1
            ? `El bus está llegando${timeSuffix}`
            : `Esperando al bus · ${minutes} min${timeSuffix}`;
    }

    function getDestinationArrivalLabel() {
        if (state.phase !== 'onboard'
            || !state.destination
            || !Number.isFinite(state.destinationEtaMinutes)) return '';
        const estimatedArrival = new Date(Date.now() + Math.max(0, state.destinationEtaMinutes) * 60000);
        const time = estimatedArrival.toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
        return `Hora de llegada: ${time}`;
    }

    function formatWaitingStatus() {
        if (state.busAtBoardStop) return 'El bus está en la parada. Prepárate para subir.';
        if (state.arrivalTime) {
            const status = formatArrivalStatus();
            if (status !== 'Esperando al bus.') return status;
        }
        const eta = String(state.etaLabel || '').trim();
        const arrival = String(state.arrivalLabel || '').trim();
        if (eta && arrival) return `Esperando al bus · ${eta} · ${arrival}`;
        if (eta) return `Esperando al bus · ${eta}`;
        if (arrival) return `Esperando al bus · ${arrival}`;
        return 'Esperando al bus.';
    }

    function getWaitingMetric() {
        if (isBoardingPromptAvailable()) return { value: 'Ahora', label: '' };
        if (isScheduledBoardingWindow()) return { value: '', label: '' };

        const eta = getReportedEtaMinutes();
        return eta === null ? { value: '', label: '' } : { value: String(eta), label: 'min' };
    }

    function compactFreshnessHtml(message) {
        const raw = String(message || '');
        const normalized = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const updated = normalized.match(/Actualizada hace\s+(.+)$/i);
        if (updated) return `Actualizada hace <strong>${updated[1]}</strong>`;
        if (normalized.includes('No hay datos de ubicación')) return 'Posición en directo no disponible';
        if (normalized.includes('Última comprobación')) return 'Comprobación reciente';
        return normalized;
    }

    function mapFollowFreshnessHtml(message) {
        const normalized = String(message || '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const updated = normalized.match(/Actualizada hace\s+(.+)$/i);
        if (updated) return `Actualizada hace <strong>${updated[1]}</strong>`;
        const checked = normalized.match(/Última comprobación\s+(.+?)(?:\.|$)/i);
        if (checked) return `Comprobada <strong>${checked[1]}</strong>`;
        if (normalized.includes('No hay datos de ubicación')) return 'Sin posición en directo';
        return compactFreshnessHtml(message);
    }

    function renderMapFollowFreshness(ui) {
        if (!ui.mapFollowFreshness) return;
        const freshness = mapFollowFreshnessHtml(state.lastUpdateHtml);
        const visible = !state.active && !ui.mapFollowButton?.hidden && Boolean(freshness);
        ui.mapFollowFreshness.hidden = !visible;
        ui.mapFollowFreshness.innerHTML = visible ? freshness : '';
    }

    function renderSummary(ui, remaining, eta) {
        const hasRemaining = Number.isFinite(remaining);
        const hasEta = Boolean(eta?.value);

        if (ui.remainingMetric) ui.remainingMetric.hidden = !hasRemaining;
        if (ui.remainingValue) ui.remainingValue.textContent = hasRemaining ? String(remaining) : '';
        if (ui.remainingLabel) {
            ui.remainingLabel.textContent = remaining === 1 ? 'parada' : 'paradas';
        }
        if (ui.etaMetric) ui.etaMetric.hidden = !hasEta;
        if (ui.metricValue) ui.metricValue.textContent = eta?.value || '';
        if (ui.metricLabel) ui.metricLabel.textContent = eta?.label || '';
        if (ui.summaryDivider) ui.summaryDivider.hidden = !hasRemaining || !hasEta;
        if (ui.metric) ui.metric.hidden = !hasRemaining && !hasEta;
    }

    function setStatus(message, tone = '') {
        const status = getUi().status;
        if (!status) return;
        status.textContent = typeof message === 'string' ? message : String(message?.primary || '');
        status.classList.toggle('is-success', tone === 'success');
        status.classList.toggle('is-warning', tone === 'warning');
        status.classList.toggle('is-preparing', tone === 'preparing');
    }

    function render() {
        bindUi();
        const ui = getUi();
        if (!ui.panel) return;

        if (!state.active) {
            ui.panel.hidden = true;
        }

        const mapBox = document.getElementById('mapContainer');
        if (mapBox) mapBox.classList.toggle('ride-tracking-active', state.active);

        const boardingPromptAvailable = isBoardingPromptAvailable();
        const scheduledBoardingWindow = isScheduledBoardingWindow();
        const arrivalWindow = isArrivalWindow();
        const busHasLeftBoardStop = hasBusLeftBoardStop();
        const phaseLabel = state.phase === 'onboard'
            ? 'en ruta'
            : state.phase === 'arrived'
                ? 'destino alcanzado'
                : boardingPromptAvailable || scheduledBoardingWindow || state.phase === 'preparing' || state.phase === 'boarding-candidate'
                    ? 'prepárate para subir'
                    : 'esperando';
        if (ui.lineLabel && ui.phaseLabel) {
            ui.lineLabel.textContent = state.lineNumber ? `Línea ${state.lineNumber}` : 'Seguimiento';
            ui.phaseLabel.textContent = state.lineNumber ? phaseLabel : 'del bus';
        } else if (ui.title) {
            ui.title.textContent = state.lineNumber
                ? `Línea ${state.lineNumber} · ${phaseLabel}`
                : 'Seguimiento del bus';
        }

        let statusMessage = 'Esperando al bus';
        let statusTone = '';
        let nextStopName = '';
        let remaining = null;
        let eta = { value: '', label: '' };
        const shouldWarnToGetOff = state.phase === 'onboard'
            && Boolean(state.destination)
            && state.remainingStops !== null
            && state.remainingStops <= 1;

        if (state.phase === 'waiting') {
            statusMessage = boardingPromptAvailable
                ? 'El bus está en tu parada'
                : busHasLeftBoardStop
                    ? 'El bus ya salió de la parada'
                    : arrivalWindow
                        ? 'El bus está llegando'
                    : 'Esperando al bus';
            eta = getWaitingMetric();
            statusTone = boardingPromptAvailable || scheduledBoardingWindow || (arrivalWindow && !hasFreshBusPosition())
                ? 'preparing'
                : '';
            nextStopName = state.stopName || '';
        } else if (state.phase === 'preparing' || state.phase === 'boarding-candidate') {
            statusMessage = 'Prepárate para subir';
            eta = { value: 'Ahora', label: '' };
            statusTone = 'preparing';
        } else if (state.phase === 'onboard') {
            statusMessage = shouldWarnToGetOff ? 'Bájate en la próxima parada' : 'Próxima parada';
            statusTone = shouldWarnToGetOff ? 'warning' : 'success';
            nextStopName = state.nextStop?.name || '';
            if (state.destination && state.remainingStops !== null) {
                remaining = state.remainingStops;
                eta = state.destinationEtaMinutes
                    ? { value: `~${state.destinationEtaMinutes}`, label: 'min' }
                    : { value: '', label: '' };
            }
        } else if (state.phase === 'arrived') {
            statusMessage = 'Esta es tu parada';
            statusTone = 'success';
            nextStopName = state.destination?.name || '';
            eta = { value: 'Baja aquí', label: '' };
        }

        setStatus(statusMessage, statusTone);
        if (ui.nextStop) {
            ui.nextStop.hidden = !nextStopName;
            ui.nextStop.textContent = nextStopName;
        }
        renderSummary(ui, remaining, eta);
        if (ui.destinationValue) {
            ui.destinationValue.textContent = state.destination?.name || 'Elige una parada (opcional)';
        }

        const showGpsHint = state.active && state.phase === 'waiting' && Boolean(state.gpsErrorMessage);
        if (ui.locationHint) {
            ui.locationHint.hidden = !showGpsHint;
            ui.locationHint.textContent = showGpsHint
                ? 'La ubicación ayuda a detectar el trayecto, pero puedes confirmarlo manualmente.'
                : '';
        }
        const destinationArrivalLabel = getDestinationArrivalLabel();
        if (ui.arrivalTime) {
            ui.arrivalTime.hidden = !destinationArrivalLabel;
            ui.arrivalTime.textContent = destinationArrivalLabel;
        }
        if (ui.lastUpdate) {
            const degraded = state.phase === 'onboard' && state.busPositionUnavailable;
            const fallback = state.progressSource === 'gps' ? 'siguiendo tu ubicación' : 'manteniendo la última estimación';
            const freshness = compactFreshnessHtml(state.lastUpdateHtml);
            ui.lastUpdate.hidden = !degraded && !freshness;
            ui.lastUpdate.innerHTML = degraded
                ? `Posición del bus no disponible · ${fallback}${freshness ? ` · ${freshness.toLocaleLowerCase('es')}` : ''}`
                : freshness;
        }
        updateDestinationMarker();
        updateUserMarker();

        ui.panel.classList.toggle('is-arrived', state.phase === 'arrived');
        ui.panel.classList.toggle('is-onboard', state.phase === 'onboard');
        ui.panel.classList.toggle('is-waiting', state.phase === 'waiting');
        ui.panel.classList.toggle('is-preparing', state.phase === 'preparing' || state.phase === 'boarding-candidate' || boardingPromptAvailable || scheduledBoardingWindow);
        ui.panel.classList.toggle('is-near-destination', shouldWarnToGetOff);

        if (ui.urgentAlert) {
            ui.urgentAlert.hidden = !shouldWarnToGetOff;
            ui.urgentAlert.textContent = shouldWarnToGetOff ? 'Bájate en la próxima parada' : '';
        }

        // El destino sigue visible para poder cambiarlo durante el viaje.
        if (ui.destinationField) ui.destinationField.hidden = false;

        const canStartBoarding = state.phase === 'waiting' && (boardingPromptAvailable || scheduledBoardingWindow);
        const canConfirmBoarding = state.phase === 'preparing' || state.phase === 'boarding-candidate';
        if (ui.boardButton) {
            ui.boardButton.hidden = !canStartBoarding && !canConfirmBoarding;
            ui.boardButton.textContent = boardingPromptAvailable ? 'Ya estoy dentro' : 'Sí, estoy dentro';
        }
        if (ui.stopLabel) {
            ui.stopLabel.textContent = state.phase === 'arrived' ? 'Cerrar' : 'Parar seguimiento';
        } else if (ui.stopButton) {
            ui.stopButton.textContent = state.phase === 'arrived' ? 'Cerrar' : 'Parar seguimiento';
        }
        if (ui.closeButton) {
            const closeLabel = state.phase === 'arrived' ? 'Cerrar' : 'Parar seguimiento';
            ui.closeButton.textContent = closeLabel;
            ui.closeButton.setAttribute('aria-label', closeLabel);
        }

        if (ui.mapFollowButton) {
            ui.mapFollowButton.hidden = !state.mapContext || (state.active && !ui.panel.hidden);
            ui.mapFollowButton.classList.toggle('is-active', state.active);
            if (ui.mapFollowTitle) ui.mapFollowTitle.textContent = state.mapContext?.lineNumber ? `Línea ${state.mapContext.lineNumber}` : 'Este bus';
            if (ui.mapFollowMeta) {
                const direction = state.mapContext?.destination ? ` · hacia ${state.mapContext.destination}` : '';
                const etaLabel = state.mapContext?.etaLabel || state.mapContext?.arrivalLabel || 'Ver recorrido';
                ui.mapFollowMeta.textContent = `${etaLabel}${direction}`;
            }
            if (ui.mapFollowAction) ui.mapFollowAction.textContent = state.active ? 'Abrir' : 'Seguir';
            ui.mapFollowButton.setAttribute('aria-label', state.active
                ? 'Abrir seguimiento activo'
                : `Seguir bus${state.mapContext?.arrivalLabel ? ` de las ${state.mapContext.arrivalLabel}` : ''}${state.mapContext?.destination ? ` hacia ${state.mapContext.destination}` : ''}`);
        }
        renderMapFollowFreshness(ui);
    }

    async function start(input) {
        bindUi();
        const context = normalizeContext(input);
        if (!context.tripId) {
            setStatus('Este bus todavía no tiene un viaje identificable.', 'warning');
            return;
        }

        if (state.active && state.tripId === context.tripId) {
            const ui = getUi();
            ui.panel.hidden = false;
            render();
            return;
        }

        if (state.active) stop('new-trip', { silent: true });

        state.active = true;
        state.phase = 'waiting';
        state.tripId = context.tripId;
        state.lineNumber = context.lineNumber;
        state.vehicleId = context.vehicleId;
        state.matricula = context.matricula;
        state.stopNumber = context.stopNumber;
        state.stopName = context.stopName;
        state.arrivalTime = context.arrivalTime;
        state.etaLabel = context.etaLabel;
        state.arrivalLabel = context.arrivalLabel;
        state.destinationHint = context.destination;
        state.mapContext = context;
        state.demoData = context.demoData;
        state.boardStop = context.stopLatitud !== null && context.stopLongitud !== null
            ? { id: context.stopNumber, name: context.stopName, lat: context.stopLatitud, lon: context.stopLongitud, progress: null }
            : null;
        state.destination = null;
        state.stops = [];
        state.route = null;
        state.userPosition = null;
        state.userProjection = null;
        state.busPosition = null;
        state.busProjection = null;
        state.busPositionUnavailable = false;
        state.busAtBoardStop = false;
        state.userWasAtBoardStop = false;
        state.boardingEvidence = 0;
        state.busSpeedMps = null;
        state.previousBusProjection = null;
        state.previousBusTimestamp = null;
        state.lastUpdateHtml = document.getElementById('busMapLastUpdate')?.innerHTML || '';
        state.nextStop = null;
        state.remainingStops = null;
        state.destinationEtaMinutes = null;
        state.progressSource = null;
        state.gpsErrorMessage = '';
        state.notified = new Set();

        const ui = getUi();
        ui.panel.hidden = false;
        render();

        await resolveBoardStop();
        if (state.demoData) loadDemoData(state.demoData);
        const mapBox = document.getElementById('mapContainer');
        if (!mapBox?.classList.contains('show') && typeof window.openTripMap === 'function') {
            window.openTripMap({
                tripId: context.tripId,
                lineNumber: context.lineNumber,
                vehicleId: context.vehicleId,
                matricula: context.matricula,
                stopNumber: context.stopNumber,
                stopName: state.stopName,
                arrivalTime: context.arrivalTime,
                arrivalLabel: context.arrivalLabel,
                etaLabel: context.etaLabel,
                destination: context.destination
            }, {
                latitud: state.boardStop?.lat,
                longitud: state.boardStop?.lon,
                nombre: state.stopName,
                numero: state.stopNumber
            });
        }

        if (!state.demoData) startUserTracking();
        if (!state.demoData) loadTripData();
        render();
    }

    function stop(reason = 'manual', options = {}) {
        if (!state.active && reason !== 'map-closed') return;
        stopUserTracking();
        state.active = false;
        state.phase = 'idle';
        state.loadToken += 1;
        state.userPosition = null;
        state.userProjection = null;
        state.busPosition = null;
        state.busProjection = null;
        state.busPositionUnavailable = false;
        state.gpsErrorMessage = '';
        state.lastUpdateHtml = '';
        state.etaLabel = '';
        state.arrivalLabel = '';
        state.destination = null;
        state.nextStop = null;
        state.remainingStops = null;
        state.destinationEtaMinutes = null;
        state.progressSource = null;
        state.demoData = null;
        const ui = getUi();
        if (ui.panel) ui.panel.hidden = true;
        removeDestinationMarker();
        const mapBox = document.getElementById('mapContainer');
        if (mapBox) mapBox.classList.remove('ride-tracking-active');
        if (ui.mapFollowButton) {
            ui.mapFollowButton.hidden = !state.mapContext;
            ui.mapFollowButton.classList.remove('is-active');
            if (ui.mapFollowAction) ui.mapFollowAction.textContent = 'Seguir';
            ui.mapFollowButton.setAttribute('aria-label', 'Seguir este bus');
            renderMapFollowFreshness(ui);
        }
        if (!options.silent && reason === 'manual' && typeof window.showNotice === 'function') {
            window.showNotice('', 'Seguimiento detenido.');
        }
    }

    function setMapContext(context) {
        state.mapContext = normalizeContext(context);
        bindUi();
        render();
        requestAnimationFrame(() => {
            const button = getUi().mapFollowButton;
            if (button && !button.hidden) window.rideTrackingOnboarding?.consider?.(button);
        });
    }

    function setLastUpdate(message) {
        state.lastUpdateHtml = message || '';
        const ui = getUi();
        if (ui.lastUpdate) {
            ui.lastUpdate.hidden = !state.lastUpdateHtml;
            ui.lastUpdate.innerHTML = compactFreshnessHtml(state.lastUpdateHtml);
        }
        renderMapFollowFreshness(ui);
    }

    function applyDemoState(input = {}) {
        if (!state.active || !state.demoData) return;
        if (input.destinationKey !== undefined) {
            state.destination = state.stops.find(stop => stop.key === String(input.destinationKey)) || null;
            const select = getUi().destination;
            if (select) select.value = state.destination?.key || '';
        }
        if (input.user) {
            handleUserPosition({
                coords: {
                    latitude: input.user.lat,
                    longitude: input.user.lon,
                    accuracy: input.user.accuracy || 8,
                    speed: input.user.speed || 0
                },
                timestamp: input.timestamp || Date.now()
            });
        }
        if (input.bus === null) {
            handleBusPosition(null, { tripId: state.tripId });
        } else if (input.bus) {
            handleBusPosition({
                latitud: input.bus.lat,
                longitud: input.bus.lon,
                velocidad: input.bus.speed,
                timestamp: input.timestamp || Date.now()
            }, { tripId: state.tripId });
            if (typeof window.actualizarBus === 'function') {
                window.actualizarBus(input.bus.lat, input.bus.lon, {
                    lineNumber: state.lineNumber,
                    vehicleId: 'DEMO',
                    matricula: 'SIMULADO'
                });
            }
        }
        if (input.phase) state.phase = input.phase;
        if (input.arrivalTime !== undefined) state.arrivalTime = input.arrivalTime;
        if (input.etaLabel !== undefined) state.etaLabel = input.etaLabel;
        else if (input.arrivalMinutes !== undefined) state.etaLabel = `${input.arrivalMinutes} min`;
        if (input.lastUpdate) state.lastUpdateHtml = input.lastUpdate;
        if (state.phase === 'onboard' || state.phase === 'arrived') updateTripProgress();
        render();
    }

    window.rideTracking = {
        start,
        stop,
        setMapContext,
        setLastUpdate,
        onBusPosition: handleBusPosition,
        applyDemoState,
        fitMapToJourney,
        getState: () => ({
            active: state.active,
            phase: state.phase,
            tripId: state.tripId,
            lineNumber: state.lineNumber,
            nextStop: state.nextStop,
            remainingStops: state.remainingStops,
            destination: state.destination,
            destinationEtaMinutes: state.destinationEtaMinutes,
            busPositionUnavailable: state.busPositionUnavailable,
            progressSource: state.progressSource
        })
    };

    document.addEventListener('DOMContentLoaded', () => {
        bindUi();
        render();
    });
})();
