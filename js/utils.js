// Declaración global de intervalId
let intervalId;

// Listado de ids de diálogos de la app
const dialogIds = [
    'horarios-box',
    'lineAlertsDialog',
    'nearestStopsResults',
    'iframe-container',
    'dataDialog',
    'statusDialog'
];

// Generar o recuperar el ID único del cliente
function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        let r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function createButton(className, text, onClick) {
    const button = document.createElement('button');
    button.className = className;
    button.innerHTML = text;
    if (onClick) {
        button.addEventListener('click', onClick);
    }
    return button;
}

function showNotice(lineNumber, message = null) {
    // Crear el elemento de notificación
    const notification = document.createElement('div');
    notification.className = 'notification-popup';
    notification.textContent = `Se notificará cuando queden 3 minutos para que llegue la línea ${lineNumber}, deberá tener la app abierta`;

    // Si le pasamos argumento lo usamos como mensaje
    if (message) {
        notification.textContent = message;
    }

    // Agregar al cuerpo del documento
    document.body.appendChild(notification);

    // Mostrar la notificación
    setTimeout(() => {
        notification.classList.add('show');
    }, 100); // Pequeña demora para la transición

    // Ocultar y eliminar la notificación después de 4 segundos
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 500); // Esperar a que termine la transición de desvanecimiento
    }, 2000);
}

// Creación del panel lateral desplegable con info extra de la línea
async function createInfoPanel(busesProximos, stopNumber, lineNumber) {
    let tripId;
    let infoPanel = document.createElement('div');
    infoPanel.className = 'additional-info-panel';

    // Creamos la flecha de menú
    const arrowButton = document.createElement('button');
    arrowButton.className = 'arrow-button';
    arrowButton.textContent = '⮞';
    infoPanel.appendChild(arrowButton);

    let innerHTML = '<div class="proximos-buses"><ul>';

    // Añadimos cada autobús
    if (busesProximos?.length > 0){
        for (const bus of busesProximos) {
            let horaLlegada;
            let llegadaClass;
            let destino = '';
            let estado;

            if (bus.realTime && bus.realTime.fechaHoraLlegada) {
                horaLlegada = new Date(bus.realTime.fechaHoraLlegada).toLocaleString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
                llegadaClass = 'realtime';
                tripId = bus.realTime.tripId;
                if (bus.realTime.estado) {
                    estado = bus.realTime.estado;
                }
            } else if (bus.scheduled && bus.scheduled.fechaHoraLlegada) {
                horaLlegada = new Date(bus.scheduled.fechaHoraLlegada).toLocaleString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
                llegadaClass = 'programado';
                tripId = bus.scheduled.tripId;
            }

            if (bus.scheduled && bus.scheduled.destino) {
                destino = bus.scheduled.destino;
            }

            // Verificamos que horaLlegada no sea null o vacío
            if (horaLlegada) {
                let contentHTML = `<strong>${horaLlegada}</strong>
                                <div>
                                    <span class="ocupacion" data-trip-id="${tripId}"></span>
                                    ${destino}
                                </div>
                `;

                if (estado && estado == 'SKIPPED') {
                    contentHTML = 'Desviado';
                }

                innerHTML += `
                    <li data-trip-id="${tripId}">
                        <span class="${llegadaClass}">${contentHTML}</span>
                    </li>
                `;
            }
        }
    }

    innerHTML += '</ul></div><div class="actions-buttons"></div>';

    // Añadimos el HTML a infoPanel
    infoPanel.insertAdjacentHTML('beforeend', innerHTML);

    // Añadimos infoPanel al DOM
    document.body.appendChild(infoPanel);
    // Evitamos que se propagen otros click sobre infoPanel
    infoPanel.addEventListener('click', function(event) {
        event.stopPropagation();
    });

    // Añadimos el manejador de eventos a arrowButton
    arrowButton.addEventListener('click', togglePanel);
    arrowButton.addEventListener('touchstart', function(event) {
        event.stopPropagation(); /* Evitamos otros eventos clic */
        event.preventDefault(); // Esto evita el comportamiento predeterminado del navegador, que podría incluir el desplazamiento de la página
        togglePanel.call(this, event); // Usamos call para asegurarnos de que 'this' se refiere al arrowButton dentro de togglePanel
    });

    function togglePanel(event) {
        event.stopPropagation(); /* Evitamos otros eventos clic */
        const panel = this.parentElement;
        let ocupacion;

        // Alternar la visibilidad del panel
        panel.classList.toggle('open');

        // Si el panel se está abriendo, cargamos la ocupación
        if (panel.classList.contains('open')) {
            const busElements = panel.querySelectorAll('.ocupacion');
            busElements.forEach(async (busElement) => {
                const tripId = busElement.getAttribute('data-trip-id');
                let ocupacionClass = null;
                let ocupacionDescription = 'Sin datos de ocupación';
                let busInfo = await fetchBusInfo(tripId);
                if (busInfo) {
                    ocupacion = busInfo.ocupacion ? busInfo.ocupacion : null;
                }
                // Si no es null asignamos la clase
                if (ocupacion) {
                    const occupancyStatusMapping = {
                        'no': 'Sin datos de ocupación',
                        'empty': 'Todos los asientos están libres',
                        'many': 'Hay bastantes asientos libres',
                        'few': 'Hay pocos asientos libres',
                        'standing': 'No hay asientos, solo de pie',
                        'crushed': 'No hay casi hueco libre',
                        'full': 'Bus lleno, no hay sitios',
                        'not': 'Bus lleno, no admite más personas',
                    };
                    ocupacionDescription = occupancyStatusMapping[ocupacion];
                    ocupacionClass = ocupacion;
                    busElement.classList.add(ocupacionClass);
                    busElement.setAttribute('title', ocupacionDescription);
                    busElement.textContent = ocupacionDescription;
                } else {
                    busElement.classList.add('null');
                }
            });
        }

        // Cambia la imagen de fondo del botón
        if (this.style.backgroundImage.endsWith('arrow-left-light.png")')) {
            this.style.backgroundImage = "url('img/arrow-light.png')";
        } else {
            this.style.backgroundImage = "url('img/arrow-left-light.png')";
        }
    }

    // Revisar si ya existe una notificación para esta parada y línea
    let notifications = JSON.parse(localStorage.getItem('busNotifications')) || [];
    let isNotificationSet = notifications.some(n => n.stopNumber === stopNumber && n.lineNumber === lineNumber);

    const bellButton = createButton('bell-button', '&#128276;', function() {
        addLineNotification(this, stopNumber, lineNumber);
    });

    bellButton.style.backgroundImage = isNotificationSet ? "url('img/bell-solid.png')" : "url('img/bell-gray.png')";
    // No añadimos la campana en iOS porque no es compatible con las notificaciones
    const isOS = navigator.userAgent.match(/(iPad|iPhone|iPod)/g)? true : false;

    // FIXME: Desactivamos notificaciones para todos hasta que haya una solución completa que
    // funcione con la app cerrada
    // https://github.com/nukeador/auvasa-tracker/issues/1#issuecomment-1867671323
    if (!isOS) {
        // Descomentar la siguiente línea para activar notificaciones en Android
        // infoPanel.querySelector('.actions-buttons').appendChild(bellButton);
    }

    // Añadimos el botón de eliminar al div de actions-buttons
    const removeButton = createButton('remove-button', '&#128465;', function(event) {
        event.stopPropagation(); /* Evitamos otros eventos clic */
        removeBusLine(stopNumber, lineNumber);
    });
    infoPanel.querySelector('.actions-buttons').appendChild(removeButton);

    return infoPanel;
}

// Muestra dialogo de rutas con ruta al destino desde ubicación del usuario
// Opcionalmente acepta una fecha en formato YYYY-MM-DD y una hora HH:MM
function showRouteToDestination(destName, destY, destX, arriveByDate = null, arriveByHour = null, bike = false) {
    // Abrimos el planeador de rutas
    let plannerURL;
    let arriveBy = 'false';
    let arriveByParams = '';
    let modeButtons = 'transit';
    // Si se definió una hora de llegada
    if (arriveByDate && arriveByHour) {
        arriveBy = 'true'
        arriveByParams = `&date=${arriveByDate}&time=${encodeURIComponent(arriveByHour)}`;
    }

    // Si es ruta en bici
    if (bike) {
        modeButtons = 'transit_bicycle';
    }
    
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(position) {
            displayLoadingSpinner();
            plannerURL = `https://rutas.vallabus.com/#/?ui_activeItinerary=0&&fromPlace=(Ubicación actual)::${position.coords.latitude},${position.coords.longitude}&toPlace=${encodeURIComponent(destName)}::${destY},${destX}${arriveByParams}&arriveBy=${arriveBy}&mode=WALK&showIntermediateStops=true&maxWalkDistance=2000&ignoreRealtimeUpdates=true&numItineraries=3&otherThanPreferredRoutesPenalty=900&modeButtons=${modeButtons}`;
            showIframe(plannerURL);
            // URL para rutas
            const dialogState = {
                dialogType: 'planRoute'
            };
            history.pushState(dialogState, `Planificar ruta`, `#/rutas/destino/${encodeURIComponent(destName)}`);
            trackCurrentUrl();
        }, showError,
            { maximumAge: 6000, timeout: 15000 });
    } else {
       console.log("Geolocalización no soportada por este navegador.");
    }
}

function updateStopName(stopElement, newName, stopGeo) {
    // Actualiza el nombre de la parada en el DOM
    const nameElement = stopElement.querySelector('h2');
    const stopNumber = stopElement.id;

    if (nameElement) {
        nameElement.innerHTML = `${newName}`;

        const stopNameSpan = nameElement.querySelector('.stop-name');
        const stopName = stopNameSpan ? stopNameSpan.textContent : 'Destino';

        // Buscar un mapIcon existente
        let mapIconElement = stopElement.querySelector('.mapIcon');

        // Si no existe, crear uno nuevo
        if (!mapIconElement) {
            mapIconElement = document.createElement('a');
            mapIconElement.className = 'mapIcon';
            mapIconElement.setAttribute('title', 'Cómo llegar');
            mapIconElement.textContent = 'Mapa';

            nameElement.insertAdjacentElement('afterend', mapIconElement);

            mapIconElement.addEventListener('click', function(event) {
                // Prevenir la acción por defecto del enlace
                event.preventDefault();
                showRouteToDestination(stopName, stopGeo.y, stopGeo.x, null, null, true);
            });
        } else {
            // Si ya existe, actualizar solo el evento click
            mapIconElement.onclick = function(event) {
                event.preventDefault();
                showRouteToDestination(stopName, stopGeo.y, stopGeo.x, null, null, true);
            };
        }
    }
}

// Guarda o elimina las paradas fijas y actualiza su posición
async function toggleFixedStop(event) {
    const stopId = event.target.id.split('-')[2]; // Obtiene el stopId del id del icono
    let fixedStops = localStorage.getItem('fixedStops') ? JSON.parse(localStorage.getItem('fixedStops')) : [];

    const busList = document.getElementById("busList");
    const stopElement = document.getElementById(stopId);

    if (fixedStops.includes(stopId)) {
        // Si la parada ya está en fixedStops, la quitamos
        fixedStops = fixedStops.filter(stop => stop !== stopId);
        showSuccessPopUp("Parada desfijada");
        stopElement.parentNode.removeChild(stopElement);

        await updateBusList(true);
        // Delay para que de tiempo a recrear el elemento
        setTimeout(async () => {
            const newStopElement = document.getElementById(`pin-icon-${stopId}`);
            newStopElement.classList.remove('fixed'); // Actualiza el icono
            await updateBusList(false); // Volvemos a actualizar
        }, 2000);
    } else {
        // Si la parada no está en fixedStops, la añadimos
        fixedStops.push(stopId);
        event.target.classList.add('fixed'); // Actualiza el icono
        showSuccessPopUp("Parada fijada en la parte superior");
        // Verifica si el elemento de parada ya está al principio del contenedor de paradas
        const firstChild = busList.firstChild;
        if (firstChild && firstChild.id !== stopId) {
            // Mueve el elemento de parada al principio del contenedor de paradas
            busList.insertBefore(stopElement, busList.firstChild);
        }
        // Actualiza la lista de paradas para reflejar el cambio
        await updateBusList(false);

        // Delay para que de tiempo a mover el elemento
        setTimeout(async () => {
            // Hacemos scroll al elemento
            scrollToElement(stopElement);
            await updateBusList(false); // Volvemos a actualizar
        }, 700);
    }

    // Guarda la nueva lista de paradas fijas en localStorage
    localStorage.setItem('fixedStops', JSON.stringify(fixedStops));
}

function createStopElement(stopId, container, isSkeleton = false) {
    let welcomeBox = document.getElementById('welcome-box');
    if (welcomeBox) {
        welcomeBox.style.display = 'none';
        const formulario = document.querySelector('#formulario form');
        formulario.classList.remove('featured');
    }
    
    let stopElement = document.createElement('div');
    stopElement.id = stopId;
    stopElement.className = 'stop-block' + (isSkeleton ? ' skeleton' : '');

    let headerElement = document.createElement('div');
    headerElement.className = 'stop-header' + (isSkeleton ? ' skeleton-text' : '');

    let nameElement = document.createElement('h2');
    nameElement.textContent = `${stopId}`;

    // Agrega el icono de fijar parada
    let pinIcon = document.createElement('i');
    pinIcon.className = 'pin-icon';
    pinIcon.id = `pin-icon-${stopId}`;
    pinIcon.title = 'Fijar parada';

    // Verifica si la parada está en fixedStops y establece la clase del icono en consecuencia
    let fixedStops = localStorage.getItem('fixedStops') ? JSON.parse(localStorage.getItem('fixedStops')) : [];
    if (fixedStops.includes(stopId)) {
        pinIcon.classList.add('fixed'); // Agrega la clase 'fixed' si la parada está en fixedStops
        pinIcon.title = 'Desfijar parada';
    }

    pinIcon.addEventListener('click', toggleFixedStop);
    
    headerElement.appendChild(pinIcon);
    headerElement.appendChild(nameElement);
    stopElement.appendChild(headerElement);

    // Usar el container que puede ser busList o fragment
    container.appendChild(stopElement);
    return stopElement;
}

function createBusElement(busId, line, index, stopElement, isSkeleton = false) {
    let busElement = document.createElement('div');
    busElement.className = `line-info${isSkeleton ? ' skeleton-text' : ''} linea-${line.lineNumber}`;
    busElement.id = busId;

    if (index % 2 === 0) {
        busElement.classList.add('highlight');
    }

    // Evitamos mostrar undefined mietras carga el DOM
    let lineNumber = "";
    if (line.lineNumber || line.linenumber) {
        lineNumber = line.lineNumber || line.linenumber;
    }

    // Elemento con skeleton loading inicial
    if (isSkeleton) {
        busElement.innerHTML = `
            <div class="linea skeleton-text" data-trip-id="">
                <h3>${lineNumber}</h3>
            </div>
            <div class="ocupacion skeleton"></div>
            <div class="trip-info skeleton"><a class="alert-icon"></a></div>
            <div class="hora-tiempo skeleton"></div>
        `;
    } else {
        // Para elementos existentes, mostrar estado de carga
        busElement.innerHTML = `
            <div class="linea loading-state" data-trip-id="">
                <h3>${lineNumber}</h3>
            </div>
            <div class="ocupacion"></div>
            <div class="trip-info"><a class="alert-icon"></a></div>
            <div class="hora-tiempo">
                <div class="tiempo loading"></div>
                <div class="horaLlegada"></div>
            </div>
        `;
    }

    stopElement.appendChild(busElement);
    return busElement;
}

function createMostrarHorarios(stopId, stopElement, horariosBox) {
    let mostrarHorarios = document.createElement('button');
    mostrarHorarios.classList.add('mostrar-horarios');
    mostrarHorarios.id = `mostrar-horarios-${stopId}`;
    mostrarHorarios.innerHTML = 'Más horarios';
    stopElement.appendChild(mostrarHorarios);
    
    mostrarHorarios.addEventListener('click', async function() {
        displayLoadingSpinner();
        let horariosElement = await displayScheduledBuses(stopId);
        horariosBox.setAttribute('data-stopNumber', stopId);
        horariosBox.innerHTML = horariosElement.innerHTML;
        horariosBox.style.display = 'block';
        horariosBox.scrollTo(0, 0);
        // URL para horarios
        const dialogState = {
            dialogType: 'scheduledTimes',
            stopNumber: stopId
        };
        history.pushState(dialogState, `Horarios para la parada ${dialogState.stopNumber}`, `#/horarios/${dialogState.stopNumber}`);
        trackCurrentUrl();
        hideLoadingSpinner();
        clearInterval(intervalId);
    });
}

function createRemoveStopButton(stopId, stopElement) {
    
    let borrarParada = stopElement.querySelector('.remove-stop');
    
    // Si ya existe el elemento lo borraros y recreamos para que se posicione al final
    if(borrarParada) {
        borrarParada.remove();
    }
        
    let removeStopButton = document.createElement('button');
    removeStopButton.classList.add('remove-stop');
    removeStopButton.id = `remove-stop-${stopId}`;
    removeStopButton.innerHTML = 'Quitar parada';
    stopElement.appendChild(removeStopButton);
    removeStopButton.addEventListener('click', function() {
        removeStop(stopId);
    });
    return removeStopButton;
}

function removeObsoleteElements(stops) {
    // Obtener todos los elementos de parada del DOM
    const allStopElements = document.querySelectorAll('.stop-block');

    allStopElements.forEach(stopElement => {
        const stopId = stopElement.id;

        // Si la parada no existe en los datos actuales, eliminarla del DOM
        if (!stops[stopId]) {
            stopElement.remove();
        } else {
            // Para cada parada existente, verificar las líneas de autobús
            const lineElements = stopElement.querySelectorAll('.line-info');
            lineElements.forEach(lineElement => {
                const lineId = lineElement.id.split('-')[1]; // Obtiene el número de línea del ID

                // Verificar si la línea existe en los datos actuales de la parada
                const lineExists = stops[stopId].some(line => line.lineNumber.toString() === lineId);

                // Si la línea no existe en los datos actuales, eliminarla del DOM
                if (!lineExists) {
                    lineElement.remove();
                }
            });
        }
    });
}

// Las funciones getCachedData y setCacheData han sido reemplazadas por el sistema de caché inteligente
// Ver js/cache.js para el nuevo sistema: window.cacheManager

// Borra las claves obsoletas del caché
function cleanObsoleteCache() {
    // Usar el sistema de caché inteligente
    if (window.cacheManager) {
        return window.cacheManager.clean();
    }
    
    // Si no hay sistema de caché inteligente, no hacer nada
    console.warn('Sistema de caché inteligente no disponible');
    return 0;
}

function updateLastUpdatedTime() {
    const now = new Date();
    const formattedTime = now.toLocaleTimeString(); // Formatea la hora como prefieras
    document.getElementById('last-update').textContent = `Última actualización: ${formattedTime}`;
}

// Función para mostrar el spinner con un mensaje personalizado
function displayLoadingSpinner(message = "") {
    const spinnerOverlay = document.getElementById('spinnerOverlay');
    
    // Eliminar cualquier contenido existente
    spinnerOverlay.innerHTML = '';
    
    // Crear y añadir el spinner
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    spinnerOverlay.appendChild(spinner);
    
    // Crear y añadir el nuevo mensaje
    if (message) {
        const messageElement = document.createElement('p');
        messageElement.textContent = message;
        messageElement.style.color = '#fff';
        messageElement.style.marginTop = '10px';
        messageElement.style.textAlign = 'center';
        spinnerOverlay.appendChild(messageElement);
    }
    
    spinnerOverlay.style.display = 'flex';
    spinnerOverlay.style.flexDirection = 'column';
}

// Función para ocultar el spinner
function hideLoadingSpinner() {
    const spinnerOverlay = document.getElementById('spinnerOverlay');
    spinnerOverlay.style.display = 'none';
    
    // Eliminar el mensaje si existe
    const messageElement = spinnerOverlay.querySelector('p');
    if (messageElement) {
        spinnerOverlay.removeChild(messageElement);
    }
}

// Función para calcular la distancia entre dos puntos
function calculateDistance(loc1, loc2) {
    const rad = function(x) { return x * Math.PI / 180; };
    const R = 6378137; // Radio de la Tierra en metros
    const dLat = rad(loc2.y - loc1.y);
    const dLong = rad(loc2.x - loc1.x);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(rad(loc1.y)) * Math.cos(rad(loc2.y)) *
        Math.sin(dLong / 2) * Math.sin(dLong / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    return distance.toFixed(2); // Devuelve la distancia en metros
}    

function showError(error) {
    let message;
    switch(error.code) {
        case error.PERMISSION_DENIED:
            message = "Debe permitir acceso a la ubicación, verifique los permisos de esta web/app.";
            showErrorPopUp(message);
            break;
        case error.POSITION_UNAVAILABLE:
            message = "Información de ubicación no disponible.";
            showErrorPopUp(message);
            break;
        case error.TIMEOUT:
            message = "El tiempo de espera para obtener la ubicación expiró.";
            showErrorPopUp(message);
            break;
        default:
            message = "Un error desconocido ocurrió al recuperar la ubicación.";
            showErrorPopUp(message);
            break;
    }
    document.getElementById('nearestStopsResults').innerHTML = message;

    hideLoadingSpinner();
}    

function showErrorPopUp(message) {
    // Crear div para el mensaje 
    const errorMessage = document.createElement('div');
    errorMessage.textContent = message;
    errorMessage.classList.add('error');
    document.body.appendChild(errorMessage);

    // Mostrar y ocultar mensaje
    errorMessage.classList.add('show');
    setTimeout(() => {
        errorMessage.classList.remove('show');
        // Borramos del DOM el elemento
        errorMessage.remove();
    }, 2000); // ocultar después de 2 segundos
}

function showSuccessPopUp(message, elementId = null) {
    // Crear div para el mensaje 
    const successMessage = document.createElement('div');
    successMessage.textContent = message;
    successMessage.classList.add('success');

    // Si le hemos pasado un elemento al que enlazar mostramos enlace
    if (elementId) {
        successMessage.innerHTML = `${message} <p><a href="#">Clic para ver</a></p>`;

        successMessage.addEventListener('click', function() {
            event.preventDefault;
            const elementToScroll = document.getElementById(elementId);
            scrollToElement(elementToScroll);
            successMessage.classList.remove('show');
            // Borramos del DOM el elemento
            successMessage.remove();
            // Quitamos posibles diálogos que estén encima
            const horariosBox = document.getElementById("horarios-box");
            horariosBox.style.display = "none";
            const nearestStopsBox = document.getElementById("nearestStopsResults");
            nearestStopsBox.style.display = "none";
        });
    }

    document.body.appendChild(successMessage);
    // Mostrar y ocultar mensaje
    successMessage.classList.add('show');
    setTimeout(() => {
        successMessage.classList.remove('show');
        // Borramos del DOM el elemento
        successMessage.remove();
    }, 2000); // ocultar después de 2 segundos
}

function iniciarIntervalo(updateBusList) {
    // Hacemos coincidir el intervalo con el inicio de cada minuto
    let ahora = new Date();
    // Calcula cuántos segundos han pasado desde el inicio del minuto actual
    let segundos = ahora.getSeconds();
    // Calcula cuánto tiempo queda hasta el próximo intervalo de 30 segundos
    let tiempoHastaProximoIntervalo = segundos < 30 ? 30 - segundos : 60 - segundos;

    // Establece un temporizador para iniciar el intervalo
    setTimeout(function() {
        // Inicia el intervalo
        intervalId = setInterval(updateBusList, 30000);
    }, tiempoHastaProximoIntervalo * 1000);
}

function displayGlobalAlertsBanner(alerts) {
    let alertsBox = document.getElementById('globalAlertsBox');
    if (!alertsBox) {
        alertsBox = document.createElement('div');
        alertsBox.id = 'globalAlertsBox';
        alertsBox.className = 'global-alerts-box';
        alertsBox.innerHTML = '<ul></ul>';
        document.body.insertBefore(alertsBox, document.getElementById('fav-destinations'));
    }

    const alertsList = alertsBox.querySelector('ul');
    alertsList.innerHTML = '';
    let showHeader = false;

    // Si hay varias alertas globales, las ocultamos bajo un header
    if (alerts && alerts.length > 1) {
        showHeader = true;
    }


    if (showHeader) {
        const listItem = document.createElement('li');
        const textContainer = document.createElement('div');
        textContainer.className = 'viewall-header';
        textContainer.innerHTML = `<span class="global-alert-title">Mostrar avisos generales (${alerts.length})</span>`;

        textContainer.addEventListener('click', function() {
            // Verifica si los alerts están expandidos
            const areAlertsExpanded = alertsList.querySelectorAll('.visible').length > 0;
            // Oculta o muestra los alerts según su estado actual
            alertsList.querySelectorAll('div').forEach((alert, index) => {
                if (index > 0) {
                    if (areAlertsExpanded) {
                        // Si los alerts están visibles, los oculta
                        alert.style.maxHeight = 0;
                        alert.style.padding = 0;
                        alert.classList.remove('visible');
                        textContainer.innerHTML = `<span class="global-alert-title">Mostrar avisos generales (${alerts.length})</span>`;
                    } else {
                        // Si los alerts están ocultos, los muestra
                        alert.style.maxHeight = '500px';
                        alert.style.padding = '7px 2px';
                        alert.classList.add('visible');
                        alert.classList.add('expanded');
                        alert.classList.remove('has-more');
                        textContainer.innerHTML = `<span class="global-alert-title">Ocultar avisos generales (${alerts.length})</span>`;
                    }
                }
            });
        });
        listItem.appendChild(textContainer);
        alertsList.appendChild(listItem);
    }

    // If there are global alerts, show them in the alerts list
    if (alerts && alerts.length > 0) {
        alerts.forEach(alert => {
            if (alert.ruta.parada === null && alert.ruta.linea === null) {
                const listItem = document.createElement('li');
                const textContainer = document.createElement('div');
                textContainer.className = 'alert-text-container';
                textContainer.innerHTML = `${alert.descripcion}`;

                const readMoreButton = document.createElement('button');
                readMoreButton.className = 'read-more-button';
                readMoreButton.textContent = '🞃';
                readMoreButton.addEventListener('click', function() {
                    textContainer.classList.add('expanded');
                    textContainer.classList.remove('has-more');
                });

                textContainer.appendChild(readMoreButton);
                listItem.appendChild(textContainer);
                alertsList.appendChild(listItem);

                // Hide the individual alerts when there are multiple global alerts
                if (showHeader) {
                    textContainer.style.maxHeight = 0;
                    textContainer.style.padding = 0;
                }

                // Esperar a que el navegador haya renderizado el contenido
                setTimeout(function() {
                    // Calcular la altura del contenido
                    const contentHeight = textContainer.scrollHeight;

                    // Si el contenido es más alto que el contenedor, mostrar el botón "Leer más"
                    if (contentHeight > 20) {
                        textContainer.classList.add('has-more');
                    }
                }, 50);
            }
        });
        alertsBox.style.display = 'block';
    } else {
        alertsBox.style.display = 'none';
    }
}

// Función para abrir o cerrar el panel lateral
function toogleSidebar(forceClose = false) {
    const sidebar = document.getElementById('sidebar');
    const menuButton = document.getElementById('menuButton');

    if (forceClose || sidebar.classList.contains('sidebar-open')) {
        // Cerrar el sidebar
        sidebar.classList.remove('sidebar-open'); 
        menuButton.classList.remove('menu-button-open');
        menuButton.classList.remove('icon-close');
        menuButton.classList.add('icon-menu');
    } else {
        // Abrir el sidebar
        sidebar.classList.add('sidebar-open');
        menuButton.classList.add('menu-button-open');
        menuButton.classList.remove('icon-menu');
        menuButton.classList.add('icon-close');
    }
}

// Devuelve la posición de un elemento
function getElementPosition(element) {
    let yPosition = 0;
    while (element) {
        yPosition += (element.offsetTop - element.scrollTop + element.clientTop);
        element = element.offsetParent;
    }
    return yPosition;
}

// Scroll de la página para ir a un elemento
function scrollToElement(element) {
    if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const elementPosition = getElementPosition(element);
        setTimeout(function() {
            // Calcular la nueva posición de scroll para evitar el header
            const newScrollPosition = elementPosition - 60;
            // Hacer scroll suave a la nueva posición
            window.scrollTo({ top: newScrollPosition, behavior: 'smooth' });
        }, 100);
    }
}

// Mostramos una URL ocupando toda la pantalla (menos el header) en un iframe
function showIframe (url) {
    const iframeContainer = document.getElementById('iframe-container');
    iframeContainer.innerHTML = ''; 
    // Crear el iframe y agregarlo al contenedor
    const iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.allow = "geolocation";
    iframe.onload = function() {
        // Ocultar el spinner de carga una vez que el iframe haya cargado
        hideLoadingSpinner();
    };
    iframeContainer.appendChild(iframe);
    
    // Mostrar el contenedor
    iframeContainer.style.display = 'block';
    
    // Agregar un botón de cierre
    const closeButton = document.createElement('button');
    closeButton.classList.add('closeRoutesButton');
    closeButton.textContent = 'X';
    closeButton.addEventListener('click', function() {
        // Ocultar el contenedor y eliminar el iframe
        iframeContainer.style.display = 'none';
        iframeContainer.innerHTML = ''; // Limpiar el contenedor
        // Regresamos al home
        const dialogState = {
            dialogType: 'home'
        };
        history.replaceState(dialogState, document.title, '#/');
    });
    iframeContainer.appendChild(closeButton);
}

// Función para cerrar un overlay y guardar la preferencia del usuario
function closeOverlay(overlayId) {
    const overlay = document.getElementById(overlayId);
    if (overlay) {
        overlay.style.display = 'none';
        // Guarda la preferencia en localStorage
        localStorage.setItem(`overlayClosed_${overlayId}`, 'true');
    }
}

// Función para mostrar un overlay si no ha sido cerrado por el usuario y si el usuario tiene paradas y líneas añadidas
function showOverlayIfNotClosed(overlayId) {
    const overlay = document.getElementById(overlayId);
    if (overlay) {
        // Verifica si el overlay ya ha sido cerrado
        const overlayClosed = localStorage.getItem(`overlayClosed_${overlayId}`);
        // Verifica si el usuario no tiene paradas ni líneas añadidas
        const busLines = localStorage.getItem('busLines');
        const hasBusLines = busLines && JSON.parse(busLines).length > 0;

        if (!overlayClosed && hasBusLines) {
            // Si el overlay no ha sido cerrado y el usuario tiene paradas y líneas añadidas, muéstralo
            overlay.style.display = 'block';
        }
    }
}

// Funciones varias para eventos en elementos

// Cambio de theme auto/oscuro/claro
function themeEvents() {
    const themeToggle = document.getElementById('theme-toggle');

    // Función para aplicar el tema
    function applyTheme(theme) {
        const prefersDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
        let isDark;

        if (theme === 'dark') {
            isDark = true;
        } else if (theme === 'light') {
            isDark = false;
        } else {
            // Modo auto: seguir preferencia del sistema
            isDark = prefersDarkMode;
        }

        document.documentElement.classList.toggle('dark-mode', isDark);
        updateThemeToggleIcon(theme);
    }

    // Función para actualizar el icono del toggle
    function updateThemeToggleIcon(theme) {
        if (theme === 'auto') {
            themeToggle.innerHTML = '🌓';
        } else {
            themeToggle.innerHTML = theme === 'dark' ? '🌜' : '🌞';
        }
    }

    // Switch del modo auto/oscuro/claro
    themeToggle.addEventListener('click', () => {
        const currentTheme = localStorage.getItem('theme') || 'auto';
        let newTheme;
        switch(currentTheme) {
            case 'auto':
                newTheme = 'dark';
                break;
            case 'dark':
                newTheme = 'light';
                break;
            default:
                newTheme = 'auto';
        }

        if (newTheme === 'auto') {
            localStorage.removeItem('theme');
        } else {
            localStorage.setItem('theme', newTheme);
        }

        applyTheme(newTheme);
    });

    // Escuchar cambios en la preferencia del sistema
    window.matchMedia('(prefers-color-scheme: dark)').addListener((e) => {
        if (!localStorage.getItem('theme')) {
            applyTheme('auto');
        }
    });
}

// Acciones para botones añadir y quitar
function addRemoveButtonsEvents() {
    const addButton = document.getElementById('addButton');
    const removeAllButton = document.getElementById('removeAllButton');

    if (removeAllButton) {
        removeAllButton.addEventListener('click', removeAllBusLines);
    }

    if (addButton) {
        let isClickAllowed = true; // Variable para controlar si se permite el clic
    
        addButton.addEventListener('click', async function() {
            if (isClickAllowed) { // Verifica si se permite el clic
                isClickAllowed = false; // Deshabilita nuevos clics
    
                const stopNumber = document.getElementById('stopNumber').value;
                const lineNumber = document.getElementById('lineNumber').value;
                await addBusLine(stopNumber, lineNumber);
    
                setTimeout(() => {
                    isClickAllowed = true; // Habilita nuevamente los clics
                }, 1000);
            }
        });
    }
}

// Eventos del sidebar
function sidebarEvents() {

    // Si hacemos click fuera del sidebar, la cerramos
    document.addEventListener('click', function(event) {
        if (sidebar.classList.contains('sidebar-open') && !sidebar.contains(event.target) && event.target !== menuButton) {
            toogleSidebar(true);
        }
    });

    // Evento para abrir el panel lateral al hacer clic en el botón del menú
    document.getElementById('menuButton').addEventListener('click', function() {
        toogleSidebar();
    });

    // Detección de swipe right para cerrar
    let touchStartX = 0;
    let touchEndX = 0;
    let swipeDetected = false;

    // Controlador para el evento touchstart
    document.getElementById('sidebar').addEventListener('touchstart', function(event) {
        touchStartX = event.changedTouches[0].screenX;
        swipeDetected = false; // Reinicia el indicador de deslizamiento
    }, false);

    // Controlador para el evento touchmove
    document.getElementById('sidebar').addEventListener('touchmove', function(event) {
        touchEndX = event.changedTouches[0].screenX;
        // Verifica si el usuario ha deslizado de izquierda a derecha
        if (touchEndX > touchStartX) {
            swipeDetected = true; // Marca que se ha detectado un deslizamiento
        }
    }, false);

    // Controlador para el evento touchend
    document.getElementById('sidebar').addEventListener('touchend', function(event) {
        // Si se detectó un deslizamiento de izquierda a derecha, verifica la distancia
        if (swipeDetected) {
            // Calcula la distancia del deslizamiento
            const swipeDistance = touchEndX - touchStartX;
            // Define un umbral mínimo para considerar el deslizamiento como válido
            const swipeThreshold = 100;

            // Si la distancia del deslizamiento es mayor que el umbral, ejecuta toogleSidebar
            if (swipeDistance > swipeThreshold) {
                toogleSidebar(true);
            }
        }
    }, false);

    // Función para ajustar el margin-top del sidebar basado en la posición de desplazamiento
    function adjustHeaderMargin() {
        //const sidebar = document.getElementById('sidebar');
        const header = document.getElementById('header');
        const title = document.getElementById('title');
        if (window.scrollY === 0) {
            // Si la página está arriba del todo,
            //sidebar.style.marginTop = '50px';
            header.style.height = '60px';
            title.style.margin = '-4px 0 0 0';
            title.style.backgroundPosition = '13px 12px';
        } else {
            // Si la página no está arriba del todo
            //sidebar.style.marginTop = '60px';
            header.style.height = '50px';
            title.style.margin = '0px';
            title.style.backgroundPosition = '13px 8px';
        }
    }

    // Agrega el evento scroll al objeto window para ajustar el tamaño y posición del header
    window.addEventListener('scroll', adjustHeaderMargin);

    // Asegura que el tamaño del header inicial sea correcto cuando la página se carga
    adjustHeaderMargin();
}

// Eventos en el diálogo de mostrar horarios programados
function scheduledBusesEvents() {
    let horariosBox = document.getElementById('horarios-box');
    let closeButtons = horariosBox.querySelectorAll('.horarios-close');
    // Eventos al hacer click en cambiar fecha
    horariosBox.addEventListener('change', async function(event) {
        if (event.target.matches("#stopDateInput")) {
            displayLoadingSpinner();
            const selectedDate = document.getElementById("stopDateInput").value;
            let stopNumber = horariosBox.getAttribute("data-stopnumber");
            horariosBox = document.getElementById('horarios-box');
            let newHorariosElement = await displayScheduledBuses(stopNumber, selectedDate);
            horariosBox.innerHTML = newHorariosElement.innerHTML;
            hideLoadingSpinner();
        }
    });
    // Manejo del botón de cerrar en horarios
    horariosBox.addEventListener('click', async function(event) {
        if (event.target.matches(".horarios-close")) {
            closeButtons = horariosBox.querySelectorAll('.horarios-close');
            closeButtons.forEach(button => {
                button.parentNode.style.display = 'none';
            });
            
            // Regresamos al home
            const dialogState = {
                dialogType: 'home'
            };
            history.replaceState(dialogState, document.title, '#/');
            iniciarIntervalo(() => updateBusList(false));
            updateBusList(false);
        }
    });
}

// Eventos que hacen scroll al arriba de la página
function scrollTopEvents() {
    // Al hacer clic en el header hacemos scroll arriba
    const headerTitle = document.getElementById('title');
    if (headerTitle) {
        headerTitle.addEventListener('click', function() {
            const headerHeight = document.querySelector('header').offsetHeight;
            window.scrollTo({ top: -headerHeight, behavior: 'smooth' });
            // Regresamos al home
            const dialogState = {
                dialogType: 'home'
            };
            history.replaceState(dialogState, document.title, '#/');
            closeAllDialogs(dialogIds);
        });
    }

    // Enlace de volver arriba
    const scrollTopLink = document.getElementById('scrollTop');
    if (scrollTopLink) {
        scrollTopLink.addEventListener('click', function() {
            event.preventDefault();
            const headerHeight = document.querySelector('header').offsetHeight;
            window.scrollTo({ top: -headerHeight, behavior: 'smooth' });
            toogleSidebar(true);
            // Regresamos al home
            const dialogState = {
                dialogType: 'home'
            };
            history.replaceState(dialogState, document.title, '#/');
            closeAllDialogs(dialogIds);
        });
    }
}

// Eventos varios de clic a botones y elementos
function clickEvents() {

    // Banner con tips
    const tipsBanner = document.getElementById('tips-banner');
    if (tipsBanner) {
        // Guardamos cada vez que se hace click en un enlace dentro de un parrafo hijo
        tipsBanner.addEventListener('click', function(e) {
            if (e.target.tagName === 'A') {
                // Mostramos el id del padre del enlace
                console.log(`Click en ${e.target.parentElement.id}`);
                _paq.push(['trackEvent', 'tips-banner', 'click', e.target.parentElement.id]);
            }
        });
    }

    // Elementos compartibles
    document.addEventListener('click', function(event) {
        if (event.target.closest('.share-app')) {
            shareApp(event);
        }
    });

    // Cualquier elemento con clase routeTo enlaza a rutas
    // data-arrive-date y data-arrive-time son opcionales
    // data-bike es opcional y si está, añade el modo bici
    // Ejemplo: <a href="#" class="routeTo" data-dest-name="Estadio José Zorilla" data-dest-y="41.6440028" data-dest-x="-4.7605973" data-arrive-date="2024-05-11" data-arrive-time="18:00" data-bike="true">Planifica tu viaje al Estadio</a>
    document.addEventListener('click', function(event) {
        // Verifica si el evento se originó en un elemento con clase routeTo
        if (event.target.matches('.routeTo')) {
            // Obtiene el evento para evitar la propagación
            event.preventDefault();

            // Extrae los datos del elemento
            const destName = event.target.getAttribute('data-dest-name');
            const destX = event.target.getAttribute('data-dest-x');
            const destY = event.target.getAttribute('data-dest-y');
            // Datos opcionales
            const arriveByDate = event.target.getAttribute('data-arrive-date');
            const arriveByHour = event.target.getAttribute('data-arrive-time');
            
            // Si el enlace tiene el atributo data-bike, añadimos el modo bici
            let bike = false;
            if (event.target.getAttribute('data-bike')) {
                bike = true;
            }

            // Llama a la función showRouteToDestination con los datos extraídos

            // Verifica si los atributos necesarios están definidos
            if (destName && destX && destY && arriveByDate && arriveByHour) {
                showRouteToDestination(destName, destY, destX, arriveByDate, arriveByHour, bike);
            } else if (destName && destX && destY) {
                showRouteToDestination(destName, destY, destX, null, null, bike);
            }
        }
    });
}

// Eventos para el banner de tips
function tipsBannerEvents() {
    // Mostrar solo uno de los tips de forma aleatoria
    const tipsBanner = document.getElementById('tips-banner');
    // Obtener todos los tips hijos
    const children = tipsBanner.children;
    // Flag para controlar si tenemos elementos sticky
    let hasSticky = false;

    // Obtener los tips cerrados del localStorage
    let closedTips = JSON.parse(localStorage.getItem('closedTips')) || [];

    // Verificar si el usuario tiene paradas guardadas
    const busLines = JSON.parse(localStorage.getItem('busLines') || '[]');
    const hasStops = busLines.length > 0;

    // Función para crear y añadir el botón de cierre
    function addCloseButton(tip) {
        const closeButton = document.createElement('button');
        closeButton.innerHTML = '×';
        closeButton.className = 'close-tip';
        tip.appendChild(closeButton);

        closeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            tip.style.display = 'none';
            if (!closedTips.includes(tip.id)) {
                closedTips.push(tip.id);
                localStorage.setItem('closedTips', JSON.stringify(closedTips));
            }
            // Si cerramos un tip no sticky, mostramos otro aleatorio
            if (!tip.classList.contains('sticky')) {
                showRandomTip();
            }
        });
    }

    // Función para mostrar un tip aleatorio
    function showRandomTip() {
        const availableTips = Array.from(children).filter(tip => 
            !tip.classList.contains('sticky') && 
            !closedTips.includes(tip.id)
        );
        if (availableTips.length > 0 && hasStops) {
            const randomIndex = Math.floor(Math.random() * availableTips.length);
            availableTips[randomIndex].style.display = 'block';
        }
    }

    // Procesar cada tip
    for (let i = 0; i < children.length; i++) {
        const tip = children[i];
        
        // Añadir botón de cierre a cada tip
        addCloseButton(tip);

        // Verificar si el tip ha sido cerrado previamente
        if (closedTips.includes(tip.id)) {
            tip.style.display = 'none';
        } else if (tip.classList.contains('sticky')) {
            tip.style.display = 'block';
            hasSticky = true;
        } else if (!hasStops) {
            // Ocultar tips no sticky si el usuario no tiene paradas guardadas
            tip.style.display = 'none';
        }
        // Los no sticky se mantienen con display: none si el usuario tiene paradas
    }

    // Mostrar un tip aleatorio si no hay sticky y el usuario tiene paradas guardadas
    if (!hasSticky && hasStops) {
        showRandomTip();
    }
}

// Mostrar un mensaje de advertencia si el usuario accede desde Instagram o Facebook
function socialBrowserWarning() {
    // Lista de orígenes permitidos
    const allowedOrigins = ['https://www.instagram.com', 'https://m.instagram.com', 'https://www.facebook.com', 'https://m.facebook.com'];

    // Si el referrer está vacío, no hacemos nada
    if (!document.referrer) {
        return;
    }

    try {
        // Crear un objeto URL a partir del referrer
        const referrerUrl = new URL(document.referrer);
        
        // Verificar si el origen del referrer está en la lista de orígenes permitidos
        if (allowedOrigins.includes(referrerUrl.origin)) {
            const tipsBanner = document.getElementById('tips-banner');
            const instagramWarning = document.createElement('div');
            instagramWarning.id = 'instagram-warning';
            instagramWarning.innerHTML = '<p><strong>Si accedes desde Instagram o Facebook</strong><br />- Pulsa en el menú superior derecho con tres puntos<br> - Selecciona "Abrir en Chrome/Navegador externo"<br>- Podrás usar e instalarla correctamente</p>';
            tipsBanner.parentNode.insertBefore(instagramWarning, tipsBanner);
        }
    } catch (error) {
        // Si hay un error al parsear la URL, no hacemos nada
    }
}

// Eventos a controlar en elementos del mapa
function mapEvents() {
    // Agrega el eventListener a cualquier elemento con clase addLineButton
    document.addEventListener('click', async function(event) {
        // Verifica si el evento se originó en un elemento addLineButton y añadimos la línea a la lista
        if (event.target.matches('.addLineButton')) {
            let stopNumber = event.target.getAttribute('data-stop-number');
            let lineNumber = event.target.getAttribute('data-line-number');
            await addBusLine(stopNumber, lineNumber, true);
        }
    });
}

// Obtener el día anterior
function getYesterdayDate() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const year = yesterday.getFullYear();
    const month = String(yesterday.getMonth() + 1).padStart(2, '0');
    const day = String(yesterday.getDate()).padStart(2, '0');
    return `${year}${month}${day}`; // Formato YYYYMMDD
}

// Obtener la fecha de i días en el futuro
function getFutureDate(days) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);
    const year = futureDate.getFullYear();
    const month = String(futureDate.getMonth() + 1).padStart(2, '0');
    const day = String(futureDate.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

// De un objeto fecha completo, devuelve fecha en formato YYYYMMDD
function getFormattedDate(fecha) {
    var año = fecha.getFullYear().toString();
    var mes = (fecha.getMonth() + 1).toString();
    var día = fecha.getDate().toString();

    // Asegurarse de que el mes y el día tengan dos dígitos
    mes = mes.length == 1 ? '0' + mes : mes;
    día = día.length == 1 ? '0' + día : día;

    var fechaFormateada = año + mes + día;
    return fechaFormateada;
}

// Función para ocultar elementos
function closeAllDialogs(ids) {
    ids.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.style.display = 'none';
            if (id === 'lineAlertsDialog') {
                if (typeof hideLineAlertsDialog === 'function') {
                    hideLineAlertsDialog();
                } else {
                    element.setAttribute('aria-hidden', 'true');
                }
            }
        }
    });
    const mapBox = document.getElementById('mapContainer');
    mapBox.classList.remove('show');

    // Cerrar el sidebar
    toogleSidebar(true);

    // Si intervalMap ya está definido, limpiar el intervalo existente
    if (window.globalState.intervalMap) {
        clearInterval(window.globalState.intervalMap);
        window.globalState.intervalMap = null;
    }
}

// Función para eliminar caracteres no alfanuméricos, puntos, guiones y dos puntos de una cadena
function sanitizeString(str) {
    return str.replace(/[^\w.:-]/g, '');
}

// Manejo de estado de URLs y acciones en cada ruta
async function handleRoute() {
    // Si la ruta es un path (no un hash) y no es la raíz, permitimos la navegación normal
    if (window.location.pathname !== '/' && !window.location.hash) {
        return; // No interceptamos la navegación
    }

    // Obtener el hash o pathname según corresponda
    let route = window.location.hash.replace(/\/$/, ''); // Elimina la barra final si existe
    
    // Si no hay hash, usar el pathname
    if (!route && window.location.pathname !== '/') {
        route = '#' + window.location.pathname;
    }

    // No cerramos el sidebar ni los diálogos para los enlaces #linea-X
    if (!route.startsWith('#linea-')) {
        // Cerrar el sidebar antes de procesar la ruta
        toogleSidebar(true);

        // Cerrar todos los diálogos antes de procesar la nueva ruta
        closeAllDialogs(dialogIds);
    }

    switch(route) {
        case '':
        case '#':
        case '#/':
        case '/':
            // No hacemos nada con el historial aquí
            break;
        case '#/lineas':
        case '/lineas':
            displayLoadingSpinner();
            showIframe('https://rutas.vallabus.com/#/route');
            break;
        case '#/rutas':
        case '/rutas':
            displayLoadingSpinner();
            showIframe('https://rutas.vallabus.com');
            break;
        case '#/cercanas':
        case '/cercanas':
            if (navigator.geolocation) {
                displayLoadingSpinner();
                navigator.geolocation.getCurrentPosition(showNearestStops, showError, { maximumAge: 6000, timeout: 15000 });
            } else {
                console.log("Geolocalización no soportada por este navegador.");
            }
            break;
        case '#/datos':
        case '/datos':
            showDataDialog();
            break;
        case '#/estado':
        case '/estado':
            showStatusDialog();
            break;
        default:
            // Manejar rutas con o sin hash
            const pathMatch = route.match(/#?\/horarios\/(.+)/);
            if (pathMatch) {
                const stopNumber = sanitizeString(pathMatch[1]);
                if (stopNumber) {
                    displayLoadingSpinner();
                    const busStops = await loadBusStops();
                    const stopData = busStops.find(stop => stop.parada.numero === stopNumber);

                    if (!stopData) {
                        showErrorPopUp('Error: Parada no encontrada o vacía');
                        history.replaceState({ dialogType: 'home' }, document.title, '#/');
                        hideLoadingSpinner();
                    } else {
                        displayScheduledBuses(stopNumber).then(horariosElement => {
                            const horariosBox = document.getElementById('horarios-box');
                            horariosBox.setAttribute('data-stopNumber', stopNumber);
                            horariosBox.innerHTML = horariosElement.innerHTML;
                            horariosBox.style.display = 'block';
                            horariosBox.scrollTo(0, 0);
                            hideLoadingSpinner();
                            clearInterval(intervalId);
                        });
                    }
                }
            } else if (route.startsWith('#linea-') || route.startsWith('/linea-')) {
                // No hacemos nada especial aquí, permitimos que funcione normalmente
                // Sanitizar el número de línea si es necesario
                const lineNumber = sanitizeString(route.split('-')[1]);
            } else {
                // Si no coincide con ningún deeplink conocido, volver a la página principal
                history.replaceState({ dialogType: 'home' }, document.title, '#/');
            }
            break;
    }

    trackCurrentUrl();
}

async function showStatusDialog() {
    // Crear el diálogo si no existe
    let dialog = document.getElementById('statusDialog');
    if (!dialog) {
        dialog = document.createElement('div');
        dialog.id = 'statusDialog';
        dialog.className = 'dialog-data';
        document.body.appendChild(dialog);
    }

    // Contenido inicial del diálogo
    const dialogContent = `
        <button id="closeStatusDialogBtn" class="closeDialogBtn"></button>
        <h2>Estado del servicio</h2>
        <div id="statusContent"></div>
    `;

    dialog.innerHTML = dialogContent;
    dialog.style.display = 'block';

    displayLoadingSpinner();
    const statusData = await fetchApiStatus();
    if (statusData) {
        const statusContent = document.getElementById('statusContent');
        
        // Verificar si todas las agencias y servicios están activos
        const allAgenciesActive = Object.entries(statusData.gtfs.realtime).every(([agency, services]) => 
            Object.values(services).every(Boolean)
        );
        const allActive = allAgenciesActive && statusData.gtfs.static && statusData.gbfs;
        const allInactive = !allAgenciesActive && !statusData.gtfs.static && !statusData.gbfs;
        
        let agencyStatusHtml = '';
        
        // Generar HTML para cada agencia
        for (const [agency, services] of Object.entries(statusData.gtfs.realtime)) {
            agencyStatusHtml += `
                <h2>${agency}</h2>
                ${Object.entries(services).map(([service, status]) => `
                    <div class="status-item">
                        <span class="status-item-name">${service}</span>
                        <span class="status-item-status ${status ? 'status-active' : 'status-inactive'}">${status ? 'Operativo' : 'Inactivo'}</span>
                    </div>
                `).join('')}
            `;
        }
        
        statusContent.innerHTML = `
            <div class="status-summary ${allActive ? 'all-active' : allInactive ? 'all-inactive' : 'some-inactive'}">
                <div class="status-icon"></div>
                <h2 class="status-message">${allActive ? 'Todos funcionan correctamente' : allInactive ? 'Todos están inactivos' : 'Algunos presentan problemas'}</h2>
                <p class="status-submessage">Si algún servicio externo que usamos no está operativo es posible que no podamos mostrar algunos datos, o no de forma actualizada</p>
            </div>
            <div class="status-grid">
                ${agencyStatusHtml}
                <div class="status-item">
                    <span class="status-item-name">GTFS estático</span>
                    <span class="status-item-status ${statusData.gtfs.static ? 'status-active' : 'status-inactive'}">${statusData.gtfs.static ? 'Operativo' : 'Inactivo'}</span>
                </div>
                <h2>BIKI</h2>
                <div class="status-item">
                    <span class="status-item-name">Datos GBFS</span>
                    <span class="status-item-status ${statusData.gbfs ? 'status-active' : 'status-inactive'}">${statusData.gbfs ? 'Operativo' : 'Inactivo'}</span>
                </div>
            </div>
            <div>
                <p class="status-submessage">Si crees que alguna información presenta algún error, contacta con nosotros en <a href="https://t.me/vallabusapp">Telegram</a>, <a href="https://bsky.app/profile/vallabus.com">BlueSky</a></p>
            </div>
        `;
    } else {
        statusContent.innerHTML = `
            <div class="status-summary all-inactive">
                <div class="status-icon"></div>
                <h2 class="status-message">El API de VallaBus está inactiva</h2>
                <p class="status-submessage">No se puede obtener el estado actual de los servicios</p>
                <p class="status-submessage">Si crees que esto es un error, contacta con nosotros en <a href="https://t.me/vallabusapp">Telegram</a>, <a href="https://bsky.app/profile/vallabus.com">BlueSky</a></p>
            </div>
        `;
    }
    hideLoadingSpinner();

    // Añadir evento al botón de cerrar
    document.getElementById('closeStatusDialogBtn').addEventListener('click', () => {
        dialog.style.display = 'none';
        // Volver a la página principal al cerrar el diálogo
        history.pushState({ dialogType: 'home' }, document.title, '#/');
        trackCurrentUrl();
    });
}

// Contador de fallos consecutivos para el banner de estado
window.globalState = window.globalState || {};
window.globalState.statusCheckFailures = window.globalState.statusCheckFailures || 0;

async function checkAndShowStatusBanner() {
    try {
        const statusData = await fetchApiStatus();
        const tipsBanner = document.getElementById('tips-banner');
        let statusBanner = document.getElementById('status-banner');
        
        // Si la petición tuvo éxito, resetear contador de fallos
        window.globalState.statusCheckFailures = 0;

        if (!statusData) {
            throw new Error('No se pudo obtener el estado de los servicios');
        }

        const allAgenciesActive = Object.entries(statusData.gtfs.realtime).every(([agency, services]) => 
            Object.values(services).every(Boolean)
        );
        const allActive = allAgenciesActive && statusData.gtfs.static && statusData.gbfs;
        const allInactive = !allAgenciesActive && !statusData.gtfs.static && !statusData.gbfs;

        if (!allActive) {
            const iconClass = allInactive ? 'all-inactive' : 'some-inactive';
            const message = allInactive ? 'Todos los servicios están inactivos' : 'Algunos servicios presentan problemas';

            if (!statusBanner) {
                statusBanner = document.createElement('p');
                statusBanner.id = 'status-banner';
                statusBanner.className = 'sticky';
                statusBanner.classList.add(iconClass);
                tipsBanner.insertBefore(statusBanner, tipsBanner.firstChild);
            }
            
            statusBanner.innerHTML = `
                <div class="status-icon ${iconClass}"></div>
                <a href="#/estado">${message}</a>
            `;
            statusBanner.style.display = 'block';
        } else if (statusBanner) {
            // Remover banner si todo está bien
            statusBanner.remove();
        }
    } catch (error) {
        console.error('Error al obtener el estado de los servicios:', error);
        
        // Incrementar contador de fallos
        window.globalState.statusCheckFailures = (window.globalState.statusCheckFailures || 0) + 1;
        
        // Solo mostrar banner después de 3 fallos consecutivos (15 minutos)
        // Esto evita falsos positivos por problemas temporales de conectividad
        if (window.globalState.statusCheckFailures >= 3) {
            const tipsBanner = document.getElementById('tips-banner');
            let statusBanner = document.getElementById('status-banner');
            
            if (!statusBanner) {
                statusBanner = document.createElement('p');
                statusBanner.id = 'status-banner';
                statusBanner.className = 'sticky status-error';
                tipsBanner.insertBefore(statusBanner, tipsBanner.firstChild);
            }

            statusBanner.innerHTML = `
                <div class="status-icon all-inactive"></div>
                <a href="#/estado">Problema de conectividad</a>
            `;
            statusBanner.style.display = 'block';
        } else {
            console.log(`Verificación de estado fallida (${window.globalState.statusCheckFailures}/3), esperando antes de mostrar banner`);
        }
    }
}

function routersEvents() {
    // Manejar la ruta inicial cuando se carga la página
    handleRoute();

    // Manejar cambios en la ruta
    window.addEventListener('popstate', function(event) {
        handleRoute();
    });

    // Manejar clics en enlaces internos
    document.body.addEventListener('click', function(e) {
        // Leaflet cierra sus popups con un enlace interno `#close`. Ese
        // enlace no representa una navegación de VallaBus: si llega al
        // enrutador, se considera una ruta desconocida y closeAllDialogs()
        // termina ocultando el mapa que el usuario sigue consultando.
        if (e.target.closest('#busMap .leaflet-popup-close-button')) {
            return;
        }

        if (e.target.tagName === 'A' && e.target.href.startsWith(window.location.origin)) {
            const url = new URL(e.target.href);
            
            // Si la ruta tiene un path (no es la raíz) y no tiene hash, permitimos la navegación normal
            if (url.pathname !== '/' && !url.hash) {
                return; // Permitir la navegación normal
            }

            // Si es un enlace #linea-X, permitimos el comportamiento normal
            if (url.hash.startsWith('#linea-')) {
                return;
            }
            
            e.preventDefault();
            const newUrl = e.target.href.replace(/\/$/, '');
            if (newUrl !== window.location.href) {
                history.pushState(null, '', newUrl);
                handleRoute();
            }
        }
    });
}

// Función para enviar la URL actual a Matomo
function trackCurrentUrl() {
    // Envía la URL actual a Matomo
    if (typeof _paq !== 'undefined') {
        let currentUrl = window.location.hash;

        if (currentUrl === '#/') {
            currentUrl = '/';
        }

        _paq.push(['setCustomUrl', currentUrl]);
        _paq.push(['setDocumentTitle', document.title]);
        _paq.push(['trackPageView']);
    }
}

// Función para manejar los eventos de seguimiento de manera segura
function trackEvent(category, action, name) {
    if (typeof _paq !== 'undefined') {
        _paq.push(['trackEvent', category, action, name]);
    }
}

// Comprobamos si el usuario no tiene paradas y lo mandamos a exportar de auvasatracker
// Pero solo lo hacemos una vez
function checkStatusForMigration() {
    // Obtiene el valor de 'busLines' del localStorage
    const busLines = localStorage.getItem('busLines');
    // Obtiene el valor de 'migrationStatus' del localStorage
    const migrationStatus = localStorage.getItem('migrationStatus');

    // Comprueba si 'busLines' no existe, es null o una cadena vacía
    // Y también comprueba si 'migrationStatus' no existe, es null o una cadena vacía
    if ((!busLines || busLines === 'null' || busLines === '') && (!migrationStatus || migrationStatus === 'null' || migrationStatus === '')) {
        // Establece 'migrationStatus' a "initiated" en el localStorage
        localStorage.setItem('migrationStatus', 'initiated');
        // Mandamos a exportar a auvasatracker
        window.location.href = 'https://auvasatracker.com/export/';
    // Si venía pendiente de migrar marcamos como completado
    } else if (migrationStatus && migrationStatus === 'initiated') {
        localStorage.setItem('migrationStatus', 'completed');
    }
}

// Añade un espacio entre los carácteres de una matrícula
function cleanMatricula(str) {
    // Slice the string to separate the part before and after the 4th character
    const beforeFourthChar = str.slice(0, 4);
    const afterFourthChar = str.slice(4);
    // Return the concatenated string with a space between the sliced parts
    return beforeFourthChar + ' ' + afterFourthChar;
}

// Si entra desde iOS y no tiene paradas añadidas mostramos botón instalar
function showIosInstallButton() {
    // Obtiene el valor de 'busLines' del localStorage
    const busLines = localStorage.getItem('busLines');
    if (!busLines || busLines === 'null' || busLines === '') {
        // Muestra el botón de instalación y maneja el evento de clic para mostrar el diálogo de instalación.
        const installButton = document.getElementById('installIosButton');
        installButton.style.display = 'block';

        installButton.addEventListener('click', (e) => {

            let overlay = document.createElement("div");
            overlay.id = "overlay-installIos";
            overlay.className = "overlay";
            overlay.innerHTML = `
                <div class="overlay-content">
                    <video id="ios-install-video" poster="/img/ios-install.jpg" controls preload="none" loop>
                        <source src="/img/ios-install.mp4" type="video/mp4">
                    </video>
                    <h2>Añade VallaBus a tu pantalla de inicio</h2>
                    <p>1. Haz clic en el icono Compartir <img src="img/ios-share.svg" alt="Icono compartir en iOS"/> de Safari y "Añadir a la pantalla de inicio"</p>
                    <p>2. Abre la app desde el icono y añade tu primera parada para que se oculte el botón de instalar.</p>
                    <button class="close-overlay">Entendido</button>
                </div>
            `;
            document.body.appendChild(overlay);
            overlay.style.display = 'block';

            const closeButton = overlay.querySelector('.close-overlay');
            if (closeButton) {
                closeButton.addEventListener('click', function(event) {
                    overlay.remove();
                });
            }
            _paq.push(['trackEvent', 'installIosbutton', 'click']);
        });
    }
}

function showDialog(dialogId, content) {
    const dialog = document.getElementById(dialogId);
    if (dialog) {
        dialog.innerHTML = content;
        dialog.style.display = 'block';
    } else {
        console.error(`Elemento con id ${dialogId} no encontrado`);
    }
}

/* Dialogo para exportar e importar datos */
function showDataDialog() {
    // Crear el diálogo si no existe
    let dialog = document.getElementById('dataDialog');
    if (!dialog) {
        dialog = document.createElement('div');
        dialog.id = 'dataDialog';
        dialog.className = 'dialog-data';
        document.body.appendChild(dialog);
    }

    // Obtener los datos de busLines
    const busLines = JSON.parse(localStorage.getItem('busLines') || '[]');

    // Calcular paradas únicas y líneas
    const uniqueStops = new Set(busLines.map(item => item.stopNumber)).size;
    const totalLines = busLines.length;
    
    // Obtener fixedStops del localStorage
    const fixedStops = JSON.parse(localStorage.getItem('fixedStops') || '[]');
    const uniqueFixedStops = fixedStops.length;

    // Obtener destinos rapidos
    const favoriteDestinations = JSON.parse(localStorage.getItem('favoriteDestinations') || '[]');
    const uniqueFavoriteDestinations = favoriteDestinations.length;

    // Contenido del diálogo
    const dialogContent = `
        <button id="closeDataDialogBtn" class="closeDialogBtn"></button>
        <h2>Tus datos</h2>
        <ul>
            <li>Paradas guardadas: ${uniqueStops}</li>
            <li>Líneas guardadas: ${totalLines}</li>
            <li>Paradas fijadas: ${uniqueFixedStops}</li>
            <li>Destinos rápidos: ${uniqueFavoriteDestinations}</li>
        </ul>
        <button id="exportDataBtn" class="primary">Exportar datos</button>
        <button id="importDataBtn" class="secondary">Importar datos</button>
    `;

    dialog.innerHTML = dialogContent;
    dialog.style.display = 'block';

    // Añadir eventos a los botones
    document.getElementById('exportDataBtn').addEventListener('click', exportData);
    document.getElementById('importDataBtn').addEventListener('click', importData);
    document.getElementById('closeDataDialogBtn').addEventListener('click', () => {
        dialog.style.display = 'none';
        // Volver a la página principal al cerrar el diálogo
        history.pushState({ dialogType: 'home' }, document.title, '#/');
        trackCurrentUrl();
    });
}

function exportData() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        // Excluir claves que comienzan con 'busSchedule_' y la clave 'busStops'
        if (!key.startsWith('busSchedule_') && key !== 'busStops') {
            try {
                data[key] = JSON.parse(localStorage.getItem(key));
            } catch (e) {
                // Si no se puede parsear como JSON, guardamos el valor como string
                data[key] = localStorage.getItem(key);
            }
        }
    }

    console.log('Datos completos a exportar:', data);

    const blob = new Blob([JSON.stringify(data)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vallabus_datos.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function importData() {
    if (confirm('ADVERTENCIA: Importar nuevos datos reemplazará todos tus datos, líneas y paradas actuales. ¿Deseas continuar?')) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';
        input.onchange = function(event) {
            const file = event.target.files[0];
            const reader = new FileReader();
            reader.onload = function(e) {
                let backup = null;
                try {
                    const data = JSON.parse(e.target.result);
                    
                    // Validar que data es un objeto
                    if (typeof data !== 'object' || data === null) {
                        throw new Error('El archivo no contiene un objeto JSON válido.');
                    }

                    // Crear backup solo si la validación inicial pasa
                    backup = {};
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        backup[key] = localStorage.getItem(key);
                    }

                    // Limpiar localStorage actual
                    localStorage.clear();
                    // Importar todos los datos
                    for (const [key, value] of Object.entries(data)) {
                        localStorage.setItem(key, JSON.stringify(value));
                    }

                    alert('Datos importados correctamente');
                    updateBusList(true); // Actualizar la lista de paradas y líneas
                    closeAllDialogs(dialogIds); // Cerrar todos los diálogos
                    
                    // Recargar la página en la ruta raíz
                    window.location.href = '/';
                } catch (error) {
                    if (backup) {
                        // Restaurar el backup solo si se creó y hubo un error
                        localStorage.clear();
                        for (const [key, value] of Object.entries(backup)) {
                            localStorage.setItem(key, value);
                        }
                    }
                    alert(`Error al importar los datos: ${error.message}`);
                    console.error('Error al importar datos:', error);
                } finally {
                    // Limpiar la referencia al backup
                    backup = null;
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }
}

function showWelcomeMessage() {
    const welcomeBox = document.getElementById('welcome-box');
    if (welcomeBox) {
        welcomeBox.style.display = 'block';

        // Añadir la clase 'featured' al formulario
        const formulario = document.querySelector('#formulario form');
        formulario.classList.add('featured');

        // Añadir evento para quitar la clase 'featured' al hacer clic en el formulario
        formulario.addEventListener('click', function() {
            this.classList.remove('featured');
        });
    }
}

function showSkeletonLoader() {
    const busList = document.getElementById('busList');
    const initialPlaceholder = document.getElementById('initial-placeholder');
    
    // Ocultar el placeholder inicial si existe
    if (initialPlaceholder) {
        initialPlaceholder.style.display = 'none';
    }
    
    if (busList) {

        // Obtener las paradas guardadas
        const busLines = JSON.parse(localStorage.getItem('busLines') || '[]');
        
        // Obtener las paradas fijadas
        const fixedStops = JSON.parse(localStorage.getItem('fixedStops') || '[]');
        
        // Crear un objeto para agrupar las líneas por parada
        const stopLines = busLines.reduce((acc, {stopNumber, lineNumber}) => {
            if (!acc[stopNumber]) {
                acc[stopNumber] = new Set();
            }
            acc[stopNumber].add(lineNumber);
            return acc;
        }, {});

        // Ordenar las paradas: primero las fijadas (con las más recientes arriba), luego el resto
        const sortedStops = Object.keys(stopLines).sort((a, b) => {
            const aFixed = fixedStops.includes(a);
            const bFixed = fixedStops.includes(b);
            
            if (aFixed && bFixed) {
                // Si ambas están fijadas, ordenar por su índice en fixedStops (orden inverso)
                return fixedStops.indexOf(b) - fixedStops.indexOf(a);
            } else if (aFixed) {
                return -1;
            } else if (bFixed) {
                return 1;
            } else {
                return a.localeCompare(b);
            }
        });

        // Crear elementos para cada parada con clases skeleton
        sortedStops.forEach(stopNumber => {
            const stopElement = createStopElement(stopNumber, busList, true);
            
            // Añadir una línea skeleton por cada línea en esta parada
            const lines = Array.from(stopLines[stopNumber]);
            lines.forEach((lineNumber, index) => {
                createBusElement(`${stopNumber}-${lineNumber}`, {lineNumber}, index, stopElement, true);
            });
        });

        // Eliminar el placeholder inicial después de crear los elementos skeleton si aún existe
        if (initialPlaceholder) {
            initialPlaceholder.remove();
        }
    }
}

function shareApp(event) {
    event.preventDefault();
    const shareData = {
        title: 'VallaBus - La forma más rápida de saber los horarios de tu bus en Valladolid',
        text: '¿Conoces VallaBus? Es la forma más rápida de saber los horarios de tu bus en Valladolid, La Cistérniga, Laguna o Arroyo',
        url: 'https://vallabus.com/?mtm_source=share-banner',
    };

    _paq.push(['trackEvent', 'tips-banner', 'click', 'share-app']);

    if (navigator.share) {
        navigator.share(shareData)
            .catch((error) => console.error('Error al compartir:', error));
    } else {
        // Fallback: copiar al portapapeles y mostrar mensaje
        navigator.clipboard.writeText(`${shareData.text}\n\n${shareData.url}`)
            .then(() => alert('¡Enlace copiado! Pégalo en donde quieras'))
            .catch(() => alert('No se pudo copiar el enlace. Por favor, cópialo manualmente: ' + shareData.url));
    }
}
