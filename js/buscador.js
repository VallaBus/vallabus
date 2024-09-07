// Definir getUserLocation al principio del archivo
let lastKnownLocation = null;
let lastLocationTime = 0;

function getUserLocation(callback) {
    const now = Date.now();
    if (lastKnownLocation && (now - lastLocationTime < 30000)) {
        callback(lastKnownLocation);
        return;
    }

    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            function(position) {
                lastKnownLocation = {
                    x: position.coords.longitude,
                    y: position.coords.latitude
                };
                lastLocationTime = now;
                callback(lastKnownLocation);
            },
            function(error) {
                console.error("Error obteniendo la ubicación:", error);
                callback(null);
            },
            { maximumAge: 30000, timeout: 15000 }
        );
    } else {
        console.log("Geolocalización no soportada por este navegador.");
        callback(null);
    }
}

// Mostrar sugerencias de paradas al introducir texto
document.getElementById('stopNumber').addEventListener('click', async function() {
    const inputText = this.value;
    const resultsContainer = document.getElementById('autocompleteResults');

    // Solo mostramos sugerencias si no hay texto
    if (inputText.trim() === '') {
        resultsContainer.innerHTML = '';
        resultsContainer.style.display = 'block';

        getUserLocation(function(location) {
            if (location) {
                showTop5NearestStops(resultsContainer);
            } else {
                showNearbyStopsLink(resultsContainer);
            }
        });
    }
});

// Evento de input para el campo de búsqueda de paradas
document.getElementById('stopNumber').addEventListener('input', async function() {
    const inputText = this.value;
    const resultsContainer = document.getElementById('autocompleteResults');

    // Limpia resultados previos
    resultsContainer.innerHTML = '';

    // Si hay texto, mostramos las sugerencias de búsqueda
    if (inputText.trim() !== '') {
        const matchingStops = await searchByStopNumber(inputText);
        displaySearchResults(matchingStops, resultsContainer);
    } else {
        // Si el campo está vacío, volvemos a mostrar las paradas cercanas o el enlace
        getUserLocation(function(location) {
            if (location) {
                showTop5NearestStops(resultsContainer);
            } else {
                showNearbyStopsLink(resultsContainer);
            }
        });
    }

    updateGlowEffects();
});

function showNearbyStopsLink(container) {
    let resultElement = document.createElement('div');
    resultElement.innerHTML = `Ver paradas cercanas`;
    resultElement.classList.add('autocomplete-result', 'nearbyStopsSuggestion');
    resultElement.addEventListener('click', function() {
        container.innerHTML = '';
        getUserLocation(function(location) {
            if (location) {
                displayLoadingSpinner();
                closeAllDialogs(dialogIds);
                showNearestStops({ coords: { latitude: location.y, longitude: location.x } });
                toogleSidebar();
            } else {
                console.log("No se pudo obtener la ubicación.");
            }
        });
    });
    container.appendChild(resultElement);
}

async function showTop5NearestStops(container) {
    getUserLocation(async function(location) {
        if (location) {
            const userLocation = location;
            const busStops = await loadBusStops();
            
            let sortedStops = busStops.map(stop => {
                let distance = calculateDistance(userLocation, stop.ubicacion);
                return { ...stop, distance: distance };
            }).sort((a, b) => a.distance - b.distance);

            let top5Stops = sortedStops.slice(0, 5);

            displayTop5NearestStops(top5Stops, container);
        } else {
            console.log("No se pudo obtener la ubicación.");
        }
    });
}

function displayTop5NearestStops(stops, container) {
    container.innerHTML = '';

    // Añadir cabecera
    let headerElement = document.createElement('div');
    headerElement.textContent = 'Paradas cercanas';
    headerElement.classList.add('autocomplete-header');
    container.appendChild(headerElement);

    // Añadir spinner de carga mientras se detecta la geolocalización
    let searchingElement = document.createElement('div');
    searchingElement.innerHTML = '<div class="spinner"></div>';
    searchingElement.classList.add('searching-message');
    container.appendChild(searchingElement);

    getUserLocation(async function(location) {
        if (location) {
            const userLocation = location;
            const busStops = await loadBusStops();
            
            let sortedStops = busStops.map(stop => {
                let distance = calculateDistance(userLocation, stop.ubicacion);
                return { ...stop, distance: distance };
            }).sort((a, b) => a.distance - b.distance);

            let top5Stops = sortedStops.slice(0, 5);

            // Eliminar el mensaje de "Buscando..."
            container.removeChild(searchingElement);

            // Mostrar las paradas
            displayStops(top5Stops, container);
        } else {
            console.log("No se pudo obtener la ubicación.");
            // Eliminar el mensaje de "Buscando..."
            container.removeChild(searchingElement);
        }
    });
}

function displayStops(stops, container) {
    stops.forEach(stop => {
        let resultElement = document.createElement('div');
        let numParadaSpan = document.createElement('span');
        numParadaSpan.classList.add('numParada');
   
        const match = stop.parada.numero.match(/^([^:]+):/);
        if (match) {
            const className = match[1].toLowerCase();
            numParadaSpan.classList.add(className);
        }
   
        numParadaSpan.textContent = stop.parada.numero;
   
        // Crear un array con todas las líneas
        const allLines = [
            ...(stop.lineas.ordinarias || []),
            ...(stop.lineas.poligonos || []),
            ...(stop.lineas.matinales || []),
            ...(stop.lineas.futbol || []),
            ...(stop.lineas.buho || []),
            ...(stop.lineas.universidad || [])
        ];

        // Ordenar las líneas: primero numéricas, luego alfanuméricas
        const sortedLines = allLines.sort((a, b) => {
            const aIsNumeric = /^\d+$/.test(a);
            const bIsNumeric = /^\d+$/.test(b);
            if (aIsNumeric && bIsNumeric) {
                return parseInt(a) - parseInt(b);
            } else if (aIsNumeric) {
                return -1;
            } else if (bIsNumeric) {
                return 1;
            } else {
                return a.localeCompare(b);
            }
        });

        // Limitar a 5 líneas y añadir "..." si hay más
        const displayedLines = sortedLines.slice(0, 5);
        const lineText = displayedLines.map(line => `<span class="linea linea-${line}">${line}</span>`).join(' ') + (sortedLines.length > 5 ? ' ...' : '');
   
        resultElement.innerHTML = `
            ${numParadaSpan.outerHTML}
            <div class="stop-info">
                <span class="stopName">${stop.parada.nombre}</span>
                <span class="stopLines">${lineText}</span>
            </div>
            <span class="distance">(${Math.round(stop.distance)}m)</span>
        `;
        resultElement.classList.add('autocomplete-result');
        resultElement.addEventListener('click', function() {
            document.getElementById('stopNumber').value = stop.parada.numero;
            container.innerHTML = '';
            updateGlowEffects();
        });
        container.appendChild(resultElement);
    });

    let moreStopsLink = document.createElement('div');
    moreStopsLink.innerHTML = 'Ver más paradas cercanas';
    moreStopsLink.classList.add('autocomplete-result', 'nearbyStopsSuggestion');
    moreStopsLink.addEventListener('click', function() {
        displayLoadingSpinner();
        closeAllDialogs(dialogIds);
        showNearestStops({ coords: { latitude: stops[0].ubicacion.y, longitude: stops[0].ubicacion.x } });
        toogleSidebar();
    });
    container.appendChild(moreStopsLink);
}

function displaySearchResults(stops, container) {
    stops.forEach(function(stop) {
        let resultElement = document.createElement('div');
        let numParadaSpan = document.createElement('span');
        numParadaSpan.classList.add('numParada');
   
        const match = stop.parada.numero.match(/^([^:]+):/);
        if (match) {
            const className = match[1].toLowerCase();
            numParadaSpan.classList.add(className);
        }
   
        numParadaSpan.textContent = stop.parada.numero;
   
        resultElement.innerHTML = `${numParadaSpan.outerHTML} ${stop.parada.nombre}`;
        resultElement.classList.add('autocomplete-result');
        resultElement.addEventListener('click', function() {
            document.getElementById('stopNumber').value = stop.parada.numero;
            container.innerHTML = '';
            updateGlowEffects();
        });
        container.appendChild(resultElement);
    });
}

// Función para buscar paradas por nombre o número
async function searchByStopNumber(name) {
    // Normaliza y elimina los acentos del nombre buscado
    const normalizedSearchName = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const busStops = await loadBusStops();

    // Devuelve todas las paradas que coincidan con el nombre buscado o el número de parada, ignorando acentos
    return busStops.filter(stop => {
        const normalizedStopName = stop.parada.nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const normalizedStopNumber = stop.parada.numero.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        return normalizedStopName.includes(normalizedSearchName) || normalizedStopNumber.includes(normalizedSearchName);
    });
}

// Evento de enfoque para el campo stopNumber
document.getElementById('stopNumber').addEventListener('focus', function() {
    const inputText = this.value;
    const resultsContainer = document.getElementById('autocompleteResults');

    // Solo muestra el cuadro de autocompletado si hay texto en el campo
    if (inputText.trim() !== '') {
        resultsContainer.style.display = 'block';
    }
});

// Cerrar el cuadro de búsqueda si se hace clic fuera de él
window.addEventListener('click', function(event) {
    const searchBox = document.getElementById('autocompleteResults');
    const stopNumberInput = document.getElementById('stopNumber');

    // Ignora los clics que se originen en los elementos
    if (event.target !== searchBox && 
        !searchBox.contains(event.target) &&
        event.target !== stopNumberInput) {
            searchBox.style.display = 'none';
    }
});

let timeoutId;
// Sugerencias de lineas si hemos introducido parada
document.getElementById('lineNumber').addEventListener('focus', async function() {
    // Cancela cualquier timeout previo
    clearTimeout(timeoutId);

    const lineNumber = this.value;
    const stopNumber = document.getElementById('stopNumber').value;

    // Verifica si lineNumber ya está rellenado o si stopNumber no es alfanumérico o contiene dos puntos
    if (!(/^[a-zA-Z0-9:]+$/.test(stopNumber))) {
        return; // No muestra sugerencias si stopNumber no es alfanumérico o contiene dos puntos
    }

    // Encuentra la parada en busStops usando stopNumber
    const busStops = await loadBusStops();
    const stopData = busStops.find(stop => stop.parada.numero === stopNumber);

    if (stopData) {
        const lineSuggestions = [
            ...(stopData.lineas.ordinarias || []), 
            ...(stopData.lineas.poligonos || []), 
            ...(stopData.lineas.matinales || []), 
            ...(stopData.lineas.futbol || []), 
            ...(stopData.lineas.buho || []), 
            ...(stopData.lineas.universidad || [])
        ].map(line => ({ linea: line })); // Convierte cada línea en un objeto

        displayLineSuggestions(lineSuggestions);
    } else {
        console.error('Error: Parada no encontrada en los datos locales');
    }

    updateGlowEffects();
});

// Si el input de línea pierde el foco, borramos las sugerencias
document.getElementById('lineNumber').addEventListener('blur', function() {
    // Establece un timeout para esperar a ver si el usuario hace clic en #lineSuggestions
    timeoutId = setTimeout(() => {
        const lineSuggestions = document.getElementById('lineSuggestions');
        lineSuggestions.innerHTML = ''; // Vacía el contenido de #lineSuggestions
    }, 200);
});

// Cancela el timeout si el usuario hace clic en #lineSuggestions
document.getElementById('lineSuggestions').addEventListener('mousedown', function() {
    clearTimeout(timeoutId);
});

function displayLineSuggestions(buses) {
    let resultsContainer = document.getElementById('lineSuggestions');
    const lineNumber = document.getElementById('lineNumber');

    resultsContainer.innerHTML = '';

    // Ordenar las sugerencias de líneas primero numéricamente y luego alfabéticamente
    buses.sort((a, b) => {
        const aNumber = parseInt(a.linea, 10);
        const bNumber = parseInt(b.linea, 10);
        const aIsNumber = !isNaN(aNumber);
        const bIsNumber = !isNaN(bNumber);

        if (aIsNumber && bIsNumber) {
            // Si ambos son números, compararlos numéricamente
            return aNumber - bNumber;
        } else if (aIsNumber && !bIsNumber) {
            // Si a es un número y b no, a va primero
            return -1;
        } else if (!aIsNumber && bIsNumber) {
            // Si a no es un número y b sí, b va primero
            return 1;
        } else {
            // Si ambos no son números, compararlos alfabéticamente
            return a.linea.localeCompare(b.linea);
        }
    });

    buses.forEach(function(bus) {
        let resultElement = document.createElement('div');

        let lineElement = document.createElement('span');
        lineElement.classList.add('linea', `linea-${ bus.linea}`);
        lineElement.textContent = bus.linea;

        resultElement.classList.add('line-suggestion');
        resultElement.appendChild(lineElement);

        resultElement.addEventListener('click', function() {
            lineNumber.value = bus.linea;
            resultsContainer.innerHTML = ''; // Limpia los resultados después de seleccionar
        });
        resultsContainer.appendChild(resultElement);
    });
}

// Función para actualizar los efectos de glow
function updateGlowEffects() {
    const stopNumber = document.getElementById('stopNumber').value;
    const lineNumber = document.getElementById('lineNumber');
    const addButton = document.getElementById('addButton');

    if (stopNumber.trim() !== '') {
        addButton.classList.add('glow-blue');
        lineNumber.classList.remove('glow-red');
        document.getElementById('stopNumber').classList.remove('glow-red');
    } else {
        addButton.classList.remove('glow-blue');
        if (lineNumber.value.trim() !== '') {
            document.getElementById('stopNumber').classList.add('glow-red');
        } else {
            document.getElementById('stopNumber').classList.remove('glow-red');
        }
    }
}

// Añadir nuevos event listeners
document.getElementById('stopNumber').addEventListener('input', updateGlowEffects);
document.getElementById('lineNumber').addEventListener('input', updateGlowEffects);
document.getElementById('stopNumber').addEventListener('blur', function() {
    setTimeout(updateGlowEffects, 100);
});

// Nuevo event listener para el botón de añadir
document.getElementById('addButton').addEventListener('click', function() {
    this.classList.remove('glow-blue');
});

// Actualizar el glow después de que se complete la acción del botón
document.getElementById('addButton').addEventListener('click', function() {
    setTimeout(updateGlowEffects, 100);
});
