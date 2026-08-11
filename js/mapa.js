let myMap = L.map('busMap').setView([41.64817, -4.72974], 15);
// Exponemos la instancia para que el seguimiento de viaje pueda dibujar la
// posición del usuario sobre el mismo mapa sin crear una segunda instancia.
window.vallabusMap = myMap;
let currentTileLayer;
let centerControl;
let paradaMarker;
let marcadorAutobus;

// Eventos al mapa - se ejecutarán cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mapEvents);
} else {
    mapEvents();
}

function crearClaseLinea(lineNumber) {
    const normalized = String(lineNumber ?? '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
    return normalized ? ` linea-${normalized}` : '';
}

function crearIconoBus(numeroBus) {
    const label = String(numeroBus ?? '');
    const labelClass = label.length >= 5
        ? ' bus-icon-long-label'
        : label.length >= 4
            ? ' bus-icon-text-label'
            : '';

    return L.divIcon({
        className: 'bus-icon' + crearClaseLinea(numeroBus) + labelClass,
        html: `
            <div>${label}</div>
            <svg class="bus-icon-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path fill-rule="evenodd" d="M8 3.5h8A2.5 2.5 0 0 1 18.5 6v13h-2v1.5h-2V19h-5v1.5h-2V19h-2V6A2.5 2.5 0 0 1 8 3.5zm0 3v4h8v-4H8z"></path>
            </svg>`,
        iconSize: [30, 30]
    });
}

function crearIconoParadaSeguimiento(lineNumber) {
    return L.divIcon({
        className: 'ride-map-marker-icon',
        html: `
            <span class="ride-map-marker ride-map-marker--board${crearClaseLinea(lineNumber)}" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                    <path fill-rule="evenodd" d="M12 21s-6-4.8-6-10a6 6 0 1 1 12 0c0 5.2-6 10-6 10zm0-7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"></path>
                </svg>
            </span>`,
        iconSize: [40, 46],
        iconAnchor: [20, 42],
        popupAnchor: [0, -38]
    });
}

let lat = null;
let lon = null;

let updateMapPromise = Promise.resolve();
let latestUpdateId = 0;

async function updateBusMap(busData, paradaData, centerMap) {
    const currentUpdateId = ++latestUpdateId;

    // Cancel any previous update
    updateMapPromise = updateMapPromise.then(() => { }, () => { });

    updateMapPromise = updateMapPromise.then(async () => {
        // Check if this is still the latest update
        if (currentUpdateId !== latestUpdateId) {
            //console.log('Skipping outdated update');
            return;
        }

        try {
            // Si el html es dark-mode, usamos la capa de mapa oscura
            let savedTheme;
            if (document.documentElement.classList.contains('dark-mode')) {
                savedTheme = 'dark';
            }

            // Añadimos la nueva capa de mapa basada en el tema si no existe o ha cambiado
            if (savedTheme === "dark") {
                if (!currentTileLayer || currentTileLayer._url.indexOf('thunderforest') !== -1) {
                    if (currentTileLayer) myMap.removeLayer(currentTileLayer);
                    currentTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}' + (L.Browser.retina ? '@2x.png' : '.png'), {
                        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
                        subdomains: 'abcd',
                        maxZoom: 20,
                        minZoom: 0
                    }).addTo(myMap);
                }
            } else {
                if (!currentTileLayer || currentTileLayer._url.indexOf('cartocdn') !== -1) {
                    if (currentTileLayer) myMap.removeLayer(currentTileLayer);
                    currentTileLayer = L.tileLayer('https://{s}.tile.thunderforest.com/atlas/{z}/{x}/{y}.png?apikey=a1eb584c78ab43ddafe0831ad04566ae', {
                        maxZoom: 19,
                        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="http://thunderforest.com/">Thunderforest</a>',
                        subdomains: 'abc'
                    }).addTo(myMap);
                }
            }

            if (!paradaData || !paradaData.latitud || !paradaData.longitud) {
                console.error('Datos de la parada no disponibles o inválidos');
                return;
            }

            if (!busData || !busData.tripId || !busData.lineNumber) {
                console.error('Datos del bus no disponibles o inválidos');
                return;
            }

            try {
                const response = await fetchApi(`/v2/busPosition/${busData.tripId}`);
                // Si no hay datos de ubicación, los dejamos como null
                if (!response.ok) {
                    console.log('Error al consultar el API de ubicación');
                    actualizarSinPosicion();
                    if (typeof window.rideTracking?.onBusPosition === 'function') {
                        window.rideTracking.onBusPosition(null, busData);
                    }
                }
                else {
                    const data = await response.json();

                    if (!data || !data.length || !data[0].latitud || !data[0].longitud) {
                        // Si no hay datos simplemente centramos el mapa en la parada
                        if (centerMap && !document.getElementById('mapContainer')?.classList.contains('ride-tracking-active')) {
                            myMap.panTo([paradaData.latitud, paradaData.longitud]);
                        }
                        actualizarSinPosicion();
                        if (marcadorAutobus) {
                            marcadorAutobus.remove();
                            marcadorAutobus = null;
                        }
                        if (typeof window.rideTracking?.onBusPosition === 'function') {
                            window.rideTracking.onBusPosition(null, busData);
                        }
                    }
                    else {
                        // Si tenemos datos de ubicación los guardamos y mostramos
                        lat = parseFloat(data[0].latitud);
                        lon = parseFloat(data[0].longitud);
                        actualizarBus(lat, lon, busData);
                        if (typeof window.rideTracking?.onBusPosition === 'function') {
                            window.rideTracking.onBusPosition(data[0], busData);
                        }
                        actualizarControlCentro(myMap, lat, lon);
                        actualizarUltimaActualizacion(data[0].timestamp);
                        if (centerMap && !document.getElementById('mapContainer')?.classList.contains('ride-tracking-active')) {
                            myMap.panTo([lat, lon], { animate: true, duration: 1 });
                        }
                    }

                }
                // La posición puede no estar disponible todavía, pero la
                // geometría y las paradas del viaje sí deben mostrarse.
                actualizarParada(paradaData, busData.lineNumber);
                addRouteShapesToMap(busData.tripId, busData.lineNumber);
                addStopsToMap(busData.tripId, busData.lineNumber);
            } catch (error) {
                console.error('Error al actualizar el mapa de buses:', error.message);
                actualizarSinPosicion();
                if (typeof window.rideTracking?.onBusPosition === 'function') {
                    window.rideTracking.onBusPosition(null, busData);
                }
            }
        } catch (error) {
            console.error('Error al actualizar el mapa de buses:', error.message);
            actualizarSinPosicion();
            if (typeof window.rideTracking?.onBusPosition === 'function') {
                window.rideTracking.onBusPosition(null, busData);
            }
        }
    });

    // Wait for the update to complete
    await updateMapPromise;
}

function actualizarControlCentro(map, lat, lon) {
    if (!centerControl) {
        let CenterControl = L.Control.extend({
            options: {
                position: 'topleft' // Posición del control en el mapa
            },
            onAdd: function () {
                let container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
                container.style.backgroundColor = 'white';
                container.style.backgroundImage = "url('img/bus-location-center.png')";
                container.style.backgroundSize = "30px 30px";
                container.style.width = '30px';
                container.style.height = '30px';
                container.style.cursor = 'pointer';
                container.title = "Centrar mapa en el bus";
                return container;
            }
        });

        centerControl = new CenterControl();
        map.addControl(centerControl);
    }

    centerControl.getContainer().onclick = function () {
        map.panTo([lat, lon], { animate: true, duration: 1 });
    };
}

let UbicacionUsuarioControl = L.Control.extend({
    options: {
        position: 'topleft' // Posición del control en el mapa
    },

    onAdd: function (map) {
        let container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');

        container.style.backgroundColor = 'white';
        container.style.backgroundImage = "url('img/location.svg')";
        container.style.backgroundSize = "20px 20px";
        container.style.backgroundRepeat = "no-repeat";
        container.style.backgroundPosition = "center";
        container.style.width = '30px';
        container.style.height = '30px';
        container.style.cursor = 'pointer';
        container.title = "Mostrar mi ubicación";

        container.onclick = function () {
            actualizarUbicacionUsuario(true);
        }

        return container;
    }
});

myMap.addControl(new UbicacionUsuarioControl());

function actualizarParada(paradaData, lineNumber) {
    // La parada de subida se mantiene visible también durante el seguimiento:
    // es la referencia espacial del viaje y usa un pin distinto del bus y de
    // la persona. Así sigue siendo útil aunque el GPS no esté disponible.
    if (paradaMarker) {
        // Si ya existe, actualizamos su posición y su popup
        paradaMarker.setLatLng([paradaData.latitud, paradaData.longitud]);
        paradaMarker.setIcon(crearIconoParadaSeguimiento(lineNumber));
        paradaMarker.getPopup().setContent(paradaData.nombre);
    } else {
        // Si no existe, creamos uno nuevo
        paradaMarker = L.marker([paradaData.latitud, paradaData.longitud], {
            title: `Tu parada: ${paradaData.nombre}`,
            icon: crearIconoParadaSeguimiento(lineNumber)
        }).addTo(myMap).bindPopup(paradaData.nombre);
    }
}

function actualizarBus(lat, lon, busData) {
    // Actualizar o crear el marcador del autobús
    const nuevoIconoBus = crearIconoBus(busData.lineNumber);
    const trackingActive = document.getElementById('mapContainer')?.classList.contains('ride-tracking-active');

    // Mostramos solo los datos que realmente publica el API. LaRegional
    // puede enviar el número interno del vehículo sin matrícula.
    const hasVehicleValue = (value) => {
        if (value === null || value === undefined) return false;
        const normalizedValue = String(value).trim().toLowerCase();
        return normalizedValue !== ''
            && normalizedValue !== 'undefined'
            && normalizedValue !== 'null';
    };
    const hasVehicleId = hasVehicleValue(busData?.vehicleId);
    const hasMatricula = hasVehicleValue(busData?.matricula);

    const vehicleInfoRows = [];
    if (hasVehicleId) {
        vehicleInfoRows.push(`<li class="vehicle-id"><strong>${busData.vehicleId}</strong></li>`);
    }
    if (hasMatricula) {
        vehicleInfoRows.push(`<li class="matricula"><strong>${busData.matricula}</strong></li>`);
    }

    const busInfo = vehicleInfoRows.length > 0
        ? `<ul class="busInfo">${vehicleInfoRows.join('')}</ul>`
        : 'Sin info del vehículo aún';

    if (marcadorAutobus) {
        // Si ya existe, actualizamos su posición y su icono
        // Pero solo si lat y lon ha cambiado
        if (marcadorAutobus.getLatLng().lat !== lat || marcadorAutobus.getLatLng().lng !== lon) {
            marcadorAutobus.setLatLng([lat, lon]).setIcon(nuevoIconoBus);
            // Popup con info del bus
            marcadorAutobus.bindPopup(`${busInfo}`);
            // En seguimiento el usuario puede haber desplazado el mapa; no
            // devolvemos la vista al bus en cada refresco del API.
            if (!trackingActive) {
                myMap.panTo([lat, lon], { animate: true, duration: 1 });
            }
        }
    } else {
        // Si no existe, creamos uno nuevo
        marcadorAutobus = L.marker([lat, lon], { icon: nuevoIconoBus }).addTo(myMap).bindPopup(`${busInfo}`);
    }
}

function actualizarUltimaActualizacion(timestamp) {
    // Convertimos el Unix timestamp a ms
    let timestampDate = new Date(timestamp * 1000);
    let currentDate = new Date();
    let diff = currentDate - timestampDate;
    let minutes = Math.floor(diff / 60000);
    let seconds = ((diff % 60000) / 1000).toFixed(0);
    let lastUpdate = minutes < 1 ? `${seconds}s` : `${minutes} min ${seconds}s`;
    let updateHTML = `Última ubicación <strong>aproximada</strong>. Actualizada hace ${lastUpdate}`;
    document.getElementById('busMapLastUpdate').innerHTML = updateHTML;
    window.rideTracking?.setLastUpdate?.(updateHTML);
}

function actualizarSinPosicion() {
    const updateHTML = 'Última comprobación <strong>hace 0s</strong>. No hay datos de ubicación en directo';
    document.getElementById('busMapLastUpdate').innerHTML = updateHTML;
    window.rideTracking?.setLastUpdate?.(updateHTML);
}

// Función para calcular el ángulo entre dos puntos
function calculateBearing(lat1, lon1, lat2, lon2) {
    var dLon = (lon2 - lon1);
    var y = Math.sin(dLon) * Math.cos(lat2);
    var x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    var brng = Math.atan2(y, x);
    brng = (brng * (180 / Math.PI));
    brng = (brng + 360) % 360;
    brng = 360 - brng; // count degrees counter-clockwise

    // Ajusta el ángulo para que 0 grados apunte hacia arriba en el mapa
    brng = (brng + 90) % 360;

    // Invierte la dirección de la flecha
    brng = (brng + 180) % 360;

    return brng;
}

let directionIcons = [];
// Función para dibujar indicadores de dirección para cada segmento de línea en la ruta
function drawDirectionIndicators(mapName, routeCoordinates, className) {
    if (routeCoordinates.length < 2) {
        console.log('No hay suficientes coordenadas para dibujar indicadores');
        return;
    }

    // Elimina los iconos de dirección existentes
    directionIcons.forEach(icon => {
        mapName.removeLayer(icon);
    });
    // Limpia el array de iconos de dirección
    directionIcons = [];

    // Itera sobre cada segmento de línea en la ruta, excluyendo el primer y el último
    for (let i = 1; i < routeCoordinates.length - 2; i++) {
        // Solo procesa cada 60 segmentos
        if (i % 60 !== 0) continue;

        // Extrae las coordenadas de inicio y fin del segmento de línea actual
        const startCoord = [routeCoordinates[i][1], routeCoordinates[i][0]];
        const endCoord = [routeCoordinates[i + 1][1], routeCoordinates[i + 1][0]];

        // Calcula el punto medio del segmento
        const midLat = (startCoord[0] + endCoord[0]) / 2;
        const midLon = (startCoord[1] + endCoord[1]) / 2;
        const midCoord = [midLat, midLon];

        // Calcula el ángulo para el segmento de línea actual
        const bearing = calculateBearing(startCoord[0], startCoord[1], endCoord[0], endCoord[1]);

        // Crea un marcador en el punto medio del segmento de línea actual, apuntando en la dirección del ángulo calculado
        const directionIcon = L.divIcon({
            className: `direction-icon ${className}`,
            html: `<div style="transform: rotate(${bearing}deg);">></div>`, // Usa mayor que (>) como icono
            iconSize: [10, 10]
        });

        // Añade el marcador al mapa en la posición del punto medio del segmento de línea actual
        const marker = L.marker(midCoord, { icon: directionIcon }).addTo(mapName);
        // Añade el marcador al array de iconos de dirección
        directionIcons.push(marker);
    }
}

let currentShapesLayer = null;
let currentShapesTripId = null;
// Route shapes de un trip_id al mapa
async function addRouteShapesToMap(tripId, lineNumber) {
    try {
        // Si el tripId no ha cambiado, no hacemos nada
        if (tripId === currentShapesTripId) {
            return;
        }

        const shapesResponse = await fetchApi(`/v2/geojson/${tripId}`);
        if (!shapesResponse.ok) {
            throw new Error('Failed to fetch route shapes');
        }
        const shapesData = await shapesResponse.json();

        // Remove the existing shapes layer if it exists
        if (currentShapesLayer) {
            myMap.removeLayer(currentShapesLayer);
        }

        // Actualizar el tripId actual para las shapes
        currentShapesTripId = tripId;

        // Add the new GeoJSON to the map with a custom class
        currentShapesLayer = L.geoJSON(shapesData, {
            onEachFeature: (feature, layer) => {
                if (layer.setStyle) {
                    // Set the class name based on the line number
                    const className = `linea-${lineNumber}`;
                    layer.setStyle({
                        className: className
                    });
                }
            }
        }).addTo(myMap);

        // Extraer coordenadas de shapesData GeoJSON
        let routeCoordinates = [];
        if (shapesData.features && shapesData.features.length > 0 && shapesData.features[0].geometry) {
            if (shapesData.features[0].geometry.type === "LineString") {
                routeCoordinates = shapesData.features[0].geometry.coordinates;
            } else if (shapesData.features[0].geometry.type === "MultiLineString") {
                routeCoordinates = shapesData.features[0].geometry.coordinates.flat();
            }
        }

        const className = `linea-${lineNumber}`;
        // Pintamos los indicadores de dirección
        drawDirectionIndicators(myMap, routeCoordinates, className);
    } catch (error) {
        console.error('Error adding route shapes to the map:', error.message);
    }
}

// Preparar los datos asíncronos antes de agregar las capas al mapa
async function prepareBusLines(stopsData) {
    let busLinesPromises = stopsData.features.map(async (stop) => {
        // El GeoJSON antiguo usaba stop_code; el GTFS nuevo publica stop_id.
        let stopCode = stop.properties.stop_code || stop.properties.stop_id;
        let lines = await getStopLines(stopCode);
        return { stopCode, lines };
    });

    let busLinesArray = await Promise.all(busLinesPromises);

    let busLines = {};
    busLinesArray.forEach(({ stopCode, lines }) => {
        busLines[stopCode] = lines;
    });

    return busLines;
}

let currentStopsLayer = null;
let currentTripId = null;

// Función para añadir paradas de un trip_id al mapa
async function addStopsToMap(tripId, lineNumber) {
    try {
        // Only update stops if the tripId has changed
        if (tripId !== currentTripId) {
            const stopsResponse = await fetchApi(`/v2/geojson/paradas/${tripId}`);
            if (!stopsResponse.ok) {
                throw new Error('Failed to fetch stops');
            }
            const stopsData = await stopsResponse.json();

            // Obtain the list of suppressed stops
            const suppressedStops = await fetchSuppressedStops();

            // Update the current tripId
            currentTripId = tripId;

            // Obtain active lines for each stop
            let busLines = await prepareBusLines(stopsData);

            // Remove the existing stops layer if it exists
            if (currentStopsLayer) {
                myMap.removeLayer(currentStopsLayer);
                //console.log('Limpiando paradas anteriores');
                currentStopsLayer = null;
            }

            // Add the new stops to the map
            currentStopsLayer = L.geoJSON(stopsData, {
                pointToLayer: (feature, latlng) => {
                    const stopCode = feature.properties.stop_code || feature.properties.stop_id;
                    const stopName = feature.properties.stop_name || feature.properties.name || 'Parada';
                    // HTML para el listado de líneas
                    let lineasHTML = '<div id="lineas-correspondencia">';
                    // Iteramos por las líneas de la parada y las añadimos
                    if (busLines[stopCode]) {
                        busLines[stopCode].forEach(lineNumber => {
                            lineasHTML += `<span class="addLineButton linea linea-${lineNumber}" data-stop-number="${stopCode}" data-line-number="${lineNumber}">${lineNumber}</span>`;
                        });
                    }
                    lineasHTML += '</div>';

                    let iconUrl = 'img/bus-stop.png';
                    // Si el html es dark-mode, usamos la capa de mapa oscura
                    let savedTheme;
                    if (document.documentElement.classList.contains('dark-mode')) {
                        savedTheme = 'dark';
                    }

                    if (savedTheme === "dark") {
                        iconUrl = 'img/bus-stop-dark.png';
                    }

                    let popupContent = `<strong>${stopName}</strong> (${stopCode}) ${lineasHTML}`;

                    // Verify if the stop is suppressed
                    let stopSuppressed = suppressedStops.some(stop => stop.numero === stopCode);
                    if (stopSuppressed) {
                        iconUrl = 'img/circle-exclamation.png';
                        popupContent += '<br>🚫 Aviso: Parada actualmente suprimida';
                    }

                    const busStopIcon = L.icon({
                        iconUrl: iconUrl,
                        iconSize: [12, 12],
                        iconAnchor: [0, 0],
                        popupAnchor: [0, -12]
                    });
                    return L.marker(latlng, { icon: busStopIcon }).bindPopup(popupContent);
                }
            }).addTo(myMap);
            //console.log('Nuevas paradas añadidas al mapa');
        } else {
            //console.log('No se actualizan las paradas, mismo tripId');
        }
    } catch (error) {
        console.error('Error adding stops to the map:', error.message);
    }
}

let userLocationCircle;

function actualizarUbicacionUsuario(mapCenter) {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            position => mostrarUbicacionUsuario(position, mapCenter), mostrarErrorUbicacion, {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
        });
    } else {
        console.error('Geolocalización no soportada por este navegador.');
    }
}

function mostrarUbicacionUsuario(position, mapCenter) {
    const lat = position.coords.latitude;
    const lon = position.coords.longitude;

    // Si ya existe un círculo de ubicación del usuario, elimínalo
    if (userLocationCircle) {
        myMap.removeLayer(userLocationCircle);
    }

    // Dibuja un círculo alrededor de la ubicación del usuario
    userLocationCircle = L.circle([lat, lon], {
        color: '#FFF',
        fillColor: '#1da1f2',
        fillOpacity: 0.7,
        radius: 30
    }).addTo(myMap);

    if (mapCenter) {
        // Centramos el mapa en la ubicación
        myMap.panTo([lat, lon], { animate: true, duration: 1 });
    }
}

function mostrarErrorUbicacion(error) {
    switch (error.code) {
        case error.PERMISSION_DENIED:
            console.error("Usuario negó la solicitud de geolocalización.");
            break;
        case error.POSITION_UNAVAILABLE:
            console.error("Información de ubicación no disponible.");
            break;
        case error.TIMEOUT:
            console.error("La solicitud para obtener la ubicación del usuario expiró.");
            break;
        case error.UNKNOWN_ERROR:
            console.error("Un error desconocido ocurrió.");
            break;
    }
}

// Función auxiliar para preparar datos de paradas a GeoJSON
function prepararDatosParadas(paradas) {

    return {
        type: "FeatureCollection",
        features: paradas.map(parada => {
            // Generar el HTML para el listado de líneas
            let lineasHTML = '<div id="lineas-correspondencia">';
            parada.lineas.ordinarias.sort((a, b) => {
                // Comprueba si 'a' y 'b' contienen una letra
                const aHasLetter = /[a-zA-Z]/.test(a);
                const bHasLetter = /[a-zA-Z]/.test(b);

                // Si ambos contienen una letra, los ordena alfabéticamente
                if (aHasLetter && bHasLetter) {
                    return a.localeCompare(b);
                }
                // Si solo 'a' contiene una letra, lo coloca después
                if (aHasLetter) {
                    return 1;
                }
                // Si solo 'b' contiene una letra, lo coloca después
                if (bHasLetter) {
                    return -1;
                }
                // Si ninguno contiene una letra, los ordena numéricamente
                return parseInt(a, 10) - parseInt(b, 10);
            }).forEach(linea => {
                lineasHTML += `<span class="addLineButton linea linea-${linea}" data-stop-number="${parada.parada.numero}" data-line-number="${linea}">${linea}</span>`;
            });
            lineasHTML += '<p>Haga clic en una línea para añadirla a su lista</p></div>';

            return {
                type: "Feature",
                properties: {
                    nombre: parada.parada.nombre,
                    numero: parada.parada.numero,
                    lineasHTML: lineasHTML,
                    lineas: parada.lineas.ordinarias,
                },
                geometry: {
                    type: "Point",
                    coordinates: [parada.ubicacion.x, parada.ubicacion.y]
                }
            };
        })
    };
}

// Variable para almacenar la capa de GeoJSON de bicicletas
let biciGeoJSONLayer = null;

// Mapa para paradas cercanas
async function mapaParadasCercanas(paradas, ubicacionUsuarioX, ubicacionUsuarioY) {

    // Check if the map container already has a map instance
    if (window.myMapParadasCercanas) {
        // Remove the existing map instance
        window.myMapParadasCercanas.remove();
        if (biciGeoJSONLayer) {
            window.myMapParadasCercanas.removeLayer(biciGeoJSONLayer);
            biciGeoJSONLayer = null;
        }
    }

    // Create a new map instance
    window.myMapParadasCercanas = L.map('mapaParadasCercanas').setView([ubicacionUsuarioY, ubicacionUsuarioX], 15);

    let iconUrl = 'img/bus-stop.png';
    const suppressedStops = await fetchSuppressedStops();

    // Si el html es dark-mode, usamos la capa de mapa oscura
    let savedTheme;
    if (document.documentElement.classList.contains('dark-mode')) {
        savedTheme = 'dark';
    }
    if (savedTheme === "dark") {
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}' + (L.Browser.retina ? '@2x.png' : '.png'), {
            attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 20,
            minZoom: 0
        }).addTo(window.myMapParadasCercanas);
        iconUrl = 'img/bus-stop-dark.png';
    } else {
        L.tileLayer('https://{s}.tile.thunderforest.com/atlas/{z}/{x}/{y}.png?apikey=a1eb584c78ab43ddafe0831ad04566ae', {
            maxZoom: 19,
            attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="http://thunderforest.com/">Thunderforest</a>',
            subdomains: 'abc'
        }).addTo(window.myMapParadasCercanas);
    }

    const geoJSONData = prepararDatosParadas(paradas);

    L.geoJSON(geoJSONData, {
        pointToLayer: function (feature, latlng) {
            // Crear el icono para la parada
            const iconoParada = L.icon({
                iconUrl: iconUrl,
                iconSize: [12, 12],
                iconAnchor: [0, 0],
                popupAnchor: [0, -12]
            });

            // Crear el marcador con el icono y el popup personalizado
            const marker = L.marker(latlng, { icon: iconoParada })
                .bindPopup(`<strong>${feature.properties.nombre}</strong> (${feature.properties.numero}) ${feature.properties.lineasHTML}`);

            // Agregar un evento de clic al marcador
            marker.on('click', async function (e) {
                // Obtener destino para todas las líneas de la parada
                let lineasDestinos = await getBusDestinationsForStop(feature.properties.numero);

                // Generar el HTML para el listado de líneas
                let lineasHTML = '<div id="lineas-correspondencia">';
                feature.properties.lineas.forEach(linea => {
                    let destino = lineasDestinos[linea] || '';
                    lineasHTML += `
                        <div>
                            <span class="addLineButton linea linea-${linea}" data-stop-number="${feature.properties.numero}" data-line-number="${linea}">${linea}</span><span class="addLineButton destino linea-${linea}" data-stop-number="${feature.properties.numero}" data-line-number="${linea}">${destino}</span>
                            <a href="#" class="mapIcon routeTo" data-dest-name="${feature.properties.nombre}" data-dest-y="${feature.geometry.coordinates[1]}" data-dest-x="${feature.geometry.coordinates[0]}">Cómo llegar a la parada</a>
                        </div>
                    `;
                });
                lineasHTML += '<p>Haga clic en una línea para añadirla a su lista</p></div>';

                // Verificar si la parada está suprimida
                const stopSuppressed = suppressedStops.some(stop => stop.numero === feature.properties.numero);

                // Si la parada está suprimida, añadir texto adicional al popup
                if (stopSuppressed) {
                    marker.setPopupContent(`<strong>${feature.properties.nombre}</strong> (${feature.properties.numero}) ${lineasHTML}<p>🚫 Aviso: Parada actualmente suprimida</p>`);
                } else {
                    marker.setPopupContent(`<strong>${feature.properties.nombre}</strong> (${feature.properties.numero}) ${lineasHTML}`);
                }

                // Mostrar el popup
                marker.openPopup();
            });

            return marker;
        }
    }).addTo(window.myMapParadasCercanas);

    const lat = ubicacionUsuarioY;
    const lon = ubicacionUsuarioX;

    // Si ya existe un círculo de ubicación del usuario, elimínalo
    if (userLocationCircle) {
        window.myMapParadasCercanas.removeLayer(userLocationCircle);
    }

    // Dibuja un círculo alrededor de la ubicación del usuario
    userLocationCircle = L.circle([lat, lon], {
        color: '#FFF',
        fillColor: '#1da1f2',
        fillOpacity: 0.7,
        radius: 30
    }).addTo(window.myMapParadasCercanas);

    // Toogle de bicis
    // Definición del control personalizado
    var ShowBikesControl = L.Control.extend({
        options: {
            position: 'bottomleft'
        },

        onAdd: function (map) {
            var container = L.DomUtil.create('div', 'leaflet-control leaflet-control-custom bike-control');
            container.style.width = 'auto';
            container.style.height = 'auto';
            container.innerHTML = '<p id="show-bikes">BIKI</p>';
            return container;
        }
    });

    // Añadir el control al mapa
    window.myMapParadasCercanas.addControl(new ShowBikesControl());

}

// Función auxiliar para preparar datos de paradas a GeoJSON
function prepararDatosBiciParadas(paradas) {

    return {
        type: "FeatureCollection",
        features: paradas.map(parada => {
            // Generar el HTML
            let stopHTML = `<div class="bikestop-info">
                                <div class="bikes-available">
                                    <p class="e-bikes"><span class="count">${parada.vehicle_types_available[1].count}</span> eléctricas</p>
                                    <p class="m-bikes"><span class="count">${parada.vehicle_types_available[0].count}</span> mecánicas</p>
                                </div>
                                <p class="slots-bikes"><span class="count">${parada.num_docks_available}</span> huecos de ${parada.capacity}</p>
                                <a href="#" class="mapIcon routeTo" data-dest-name="${parada.name}" data-dest-y="${parada.lat}" data-dest-x="${parada.lon}">Cómo llegar a la parada</a>
                            </div>`;

            return {
                type: "Feature",
                properties: {
                    nombre: parada.name,
                    numero: parada.station_id,
                    huecos: parada.num_docks_available,
                    disponibles: parada.vehicle_types_available,
                    estado: parada.status,
                    capacidad: parada.capacity,
                    stopHTML: stopHTML,
                },
                geometry: {
                    type: "Point",
                    coordinates: [parada.lon, parada.lat]
                }
            };
        })
    };
}
// Mapa para paradas cercanas BIKI
async function mapaParadasBiciCercanas(paradas) {

    let iconUrl = 'img/bike-stop.png';

    // Si el html es dark-mode, usamos la capa de mapa oscura
    let savedTheme;
    if (document.documentElement.classList.contains('dark-mode')) {
        savedTheme = 'dark';
    }
    if (savedTheme === "dark") {
        iconUrl = 'img/bike-stop-dark.png';
    }

    const geoJSONData = prepararDatosBiciParadas(paradas);

    // Limpiar la capa de GeoJSON existente si hay una
    if (biciGeoJSONLayer) {
        window.myMapParadasCercanas.removeLayer(biciGeoJSONLayer);
        biciGeoJSONLayer = null; // Asegurarse de que la capa sea nula
    }

    // Crear una nueva capa de GeoJSON
    biciGeoJSONLayer = L.geoJSON(geoJSONData, {
        pointToLayer: function (feature, latlng) {
            const iconoParada = L.icon({
                iconUrl: iconUrl,
                iconSize: [12, 12],
                iconAnchor: [0, 0],
                popupAnchor: [0, -12]
            });

            return L.marker(latlng, { icon: iconoParada })
                .bindPopup(`<span class="bike-agency">BIKI</span> <strong class="bikestop-name">${feature.properties.nombre}</strong> ${feature.properties.stopHTML}`);
        }
    }).addTo(window.myMapParadasCercanas);
}

async function limpiarMapaParadasBiciCercanas() {
    if (window.myMapParadasCercanas && biciGeoJSONLayer) {
        window.myMapParadasCercanas.removeLayer(biciGeoJSONLayer);
        biciGeoJSONLayer = null;
    }
}
