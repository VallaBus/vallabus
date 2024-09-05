// Mostrar sugerencias de paradas al introducir texto
document.getElementById('stopNumber').addEventListener('click', async function() {
    const inputText = this.value;
    const resultsContainer = document.getElementById('autocompleteResults');

    // Solo mostramos sugerencias si no hay texto
    if (inputText.trim() === '') {
        resultsContainer.innerHTML = '';
        resultsContainer.style.display = 'block';

        if ("geolocation" in navigator) {
            // Intentamos obtener la ubicación directamente
            navigator.geolocation.getCurrentPosition(
                function(position) {
                    // Éxito: mostramos las 5 paradas más cercanas
                    showTop5NearestStops(resultsContainer);
                },
                function(error) {
                    // Error o permiso denegado: mostramos solo el enlace
                    showNearbyStopsLink(resultsContainer);
                },
                { timeout: 5000 }
            );
        } else {
            console.log("Geolocalización no soportada por este navegador.");
        }
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
        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(
                function(position) {
                    showTop5NearestStops(resultsContainer);
                },
                function(error) {
                    showNearbyStopsLink(resultsContainer);
                },
                { timeout: 5000 }
            );
        }
    }
});

function showNearbyStopsLink(container) {
    let resultElement = document.createElement('div');
    resultElement.innerHTML = `Ver paradas cercanas`;
    resultElement.classList.add('autocomplete-result', 'nearbyStopsSuggestion');
    resultElement.addEventListener('click', function() {
        container.innerHTML = '';
        if (navigator.geolocation) {
            displayLoadingSpinner();
            closeAllDialogs(dialogIds);
            navigator.geolocation.getCurrentPosition(showNearestStops, showError, { maximumAge: 6000, timeout: 15000 });
            toogleSidebar();
        } else {
            console.log("Geolocalización no soportada por este navegador.");
        }
    });
    container.appendChild(resultElement);
}

async function showTop5NearestStops(container) {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async function(position) {
            const userLocation = { x: position.coords.longitude, y: position.coords.latitude };
            const busStops = await loadBusStops();
            
            let sortedStops = busStops.map(stop => {
                let distance = calculateDistance(userLocation, stop.ubicacion);
                return { ...stop, distance: distance };
            }).sort((a, b) => a.distance - b.distance);

            let top5Stops = sortedStops.slice(0, 5);

            displayTop5NearestStops(top5Stops, container);
        }, showError, { maximumAge: 6000, timeout: 15000 });
    } else {
        console.log("Geolocalización no soportada por este navegador.");
    }
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

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async function(position) {
            const userLocation = { x: position.coords.longitude, y: position.coords.latitude };
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
        }, showError, { maximumAge: 6000, timeout: 15000 });
    } else {
        console.log("Geolocalización no soportada por este navegador.");
        // Eliminar el mensaje de "Buscando..."
        container.removeChild(searchingElement);
    }
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
   
        resultElement.innerHTML = `${numParadaSpan.outerHTML} <span class="stopName">${stop.parada.nombre}</span> <span class="distance">(${Math.round(stop.distance)}m)</span>`;
        resultElement.classList.add('autocomplete-result');
        resultElement.addEventListener('click', function() {
            document.getElementById('stopNumber').value = stop.parada.numero;
            container.innerHTML = '';
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
