// Declaración global de intervalId
let intervalId;

// Listado de ids de diálogos de la app
const dialogIds = [
    'horarios-box',
    'nearestStopsResults',
    'iframe-container'
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
function showRouteToDestination(destName, destY, destX, arriveByDate = null, arriveByHour = null) {
    // Abrimos el planeador de rutas
    let plannerURL;
    let arriveBy = 'false';
    let arriveByParams = '';

    // Si se definió una hora de llegada
    if (arriveByDate && arriveByHour) {
        arriveBy = 'true'
        arriveByParams = `&date=${arriveByDate}&time=${encodeURIComponent(arriveByHour)}`;
    }
    

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(position) {
            displayLoadingSpinner();
            plannerURL = `https://rutas.vallabus.com/#/?ui_activeItinerary=0&&fromPlace=(Ubicación actual)::${position.coords.latitude},${position.coords.longitude}&toPlace=${encodeURIComponent(destName)}::${destY},${destX}${arriveByParams}&arriveBy=${arriveBy}&mode=WALK&showIntermediateStops=true&maxWalkDistance=2000&ignoreRealtimeUpdates=true&numItineraries=3&otherThanPreferredRoutesPenalty=900&modeButtons=transit_bicycle`
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

        // Icono de mapa
        const mapIconElement = document.createElement('a');
        mapIconElement.className = 'mapIcon';
        mapIconElement.setAttribute('title', 'Cómo llegar');
        mapIconElement.textContent = 'Mapa';

        nameElement.insertAdjacentElement('afterend', mapIconElement);

        mapIconElement.addEventListener('click', function(event) {
            // Prevenir la acción por defecto del enlace
            event.preventDefault();

            showRouteToDestination(stopName, stopGeo.y, stopGeo.x);
        });
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

        await updateBusList();
        // Delay para que de tiempo a recrear el elemento
        setTimeout(async () => {
            const newStopElement = document.getElementById(`pin-icon-${stopId}`);
            newStopElement.classList.remove('fixed'); // Actualiza el icono
            await updateBusList(); // Volvemos a actualizar
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
        await updateBusList();

        // Delay para que de tiempo a mover el elemento
        setTimeout(async () => {
            // Hacemos scroll al elemento
            scrollToElement(stopElement);
            await updateBusList(); // Volvemos a actualizar
        }, 700);
    }

    // Guarda la nueva lista de paradas fijas en localStorage
    localStorage.setItem('fixedStops', JSON.stringify(fixedStops));
}

function createStopElement(stopId, busList) {
    let welcomeBox = document.getElementById('welcome-box');
    welcomeBox.style.display = 'none';
    
    let stopElement = document.createElement('div');
    stopElement.id = stopId;
    stopElement.className = 'stop-block';

    let headerElement = document.createElement('div');
    headerElement.className = 'stop-header';

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

    busList.appendChild(stopElement);
    return stopElement;
}

function createBusElement(busId, line, index, stopElement) {
    let busElement = document.createElement('div');
    busElement.className = `line-info linea-${line.lineNumber}`;
    busElement.id = busId;

    if (index % 2 === 0) {
        busElement.classList.add('highlight');
    }

    // Evitamos mostrar undefined mietras carga el DOM
    let lineNumber = "";
    if (line.linenumber) {
        lineNumber = line.linenumber;
    }

    // Elemento con placeholders HTML
    busElement.innerHTML = `
        <div class="linea" data-trip-id="">
            <h3>${lineNumber}</h3>
        </div>
        <div class="ocupacion"></div>
        <div class="trip-info"><a class="alert-icon"></div>
        <div class="hora-tiempo"></div>
    `;

    stopElement.appendChild(busElement);
    return busElement;
}

function createMostrarHorarios(stopId, stopElement, horariosBox) {
    let mostrarHorarios = document.createElement('button');
    mostrarHorarios.classList.add('mostrar-horarios');
    mostrarHorarios.id = `mostrar-horarios-${stopId}`;
    mostrarHorarios.innerHTML = 'Mostrar todos los horarios';
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

function getCachedData(cacheKey) {
    const cached = localStorage.getItem(cacheKey);
    if (!cached) {
        return null;
    }

    const { data, timestamp } = JSON.parse(cached);
    // Tiempo de expiración en milisegundos
    const expTime = 1 * 60 * 60 * 1000; // 1 hora
    const timestampExp = new Date() - new Date(timestamp);

    // Verifica si los datos del caché tienen menos del tiempo de expiración
    if ( timestampExp < expTime) {
        return data;
    }

    // Si los datos del caché son antiguos, limpia el caché
    localStorage.removeItem(cacheKey);
    return null;
}

function setCacheData(cacheKey, data) {
    const cacheEntry = JSON.stringify({
        data: data,
        timestamp: new Date().toISOString()
    });
    localStorage.setItem(cacheKey, cacheEntry);
}

// Borra las claves obsoletas del caché
function cleanObsoleteCache() {
    let counter = 0;
    // Iteramos de forma inversa porque al borrar un elemento el índice cambia
    for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key.startsWith('busSchedule') || key.startsWith('busStops')) {
            const cached = localStorage.getItem(key);
            if (!cached) {
                continue;
            }

            const { data, timestamp } = JSON.parse(cached);
            // Tiempo de expiración en milisegundos
            const expTime = 3600000; // 1 hora
            const timestampExp = new Date().getTime() - new Date(timestamp).getTime();

            // Verifica si los datos del caché tienen menos del tiempo de expiración
            if (timestampExp > expTime) {
                // Si los datos del caché son antiguos, limpia el caché
                localStorage.removeItem(key);
                //console.log(`Limpiando el caché obsoleto de ${key}`);
                counter += 1;
            }
        }
    }
    //console.log(`${counter} elementos obsoletos del caché borrados`);
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
        document.body.insertBefore(alertsBox, document.getElementById('busList'));
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

// Función para abrir el panel lateral
function toogleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const menuButton = document.getElementById('menuButton');

    // Alterna la clase para abrir o cerrar el sidebar
    sidebar.classList.toggle('sidebar-open'); 
    menuButton.classList.toggle('menu-button-open');

    // Cambia el icono según el estado del sidebar
    menuButton.innerHTML = sidebar.classList.contains('sidebar-open') ? '✖' : '☰';
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
            // Si el overlay no ha sido cerrado y el usuario no tiene paradas ni líneas añadidas, muéstralo
            overlay.style.display = 'block';
        }
    }
}

// Funciones varias para eventos en elementos

// Detección y cambio de de theme claro/oscuro
function themeEvents() {
    // Determina el tema del usuario basándose en la preferencia guardada en localStorage
    // o en la preferencia del sistema operativo.
    const themeToggle = document.getElementById('theme-toggle');
    const themeToggleIcon = document.getElementById('theme-toggle-icon');
    let savedTheme = localStorage.getItem('theme');

    if (!savedTheme) {
        // Si no hay un tema guardado en localStorage, establece el tema basado en la preferencia del sistema operativo.
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            savedTheme = 'dark';
        } else {
            savedTheme = 'light';
        }
        // Guarda la preferencia del sistema operativo en localStorage.
        localStorage.setItem('theme', savedTheme);
    }

    document.body.classList.toggle('dark-mode', savedTheme === 'dark');
    themeToggleIcon.textContent = savedTheme === 'dark' ? '🌜' : '🌞';

    // Switch del modo claro/oscuro
    themeToggle.addEventListener('click', () => {
        const isDarkMode = document.body.classList.toggle('dark-mode');
        themeToggleIcon.textContent = isDarkMode ? '🌜' : '🌞';
        // Guardar la preferencia del usuario
        localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
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
            toogleSidebar();
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
                toogleSidebar();
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
            iniciarIntervalo(updateBusList);
            updateBusList();
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
            toogleSidebar();
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

    // Solicita la geolocalización del usuario para encontrar las paradas más cercanas.
    // Muestra un spinner de carga mientras se obtiene la posición.
    const nearestStopsButton = document.querySelector('#nearestStops button');
    nearestStopsButton.addEventListener('click', function() {
        if (navigator.geolocation) {
            displayLoadingSpinner();
            closeAllDialogs(dialogIds);
            navigator.geolocation.getCurrentPosition(showNearestStops, showError, { maximumAge: 6000, timeout: 15000 });
            toogleSidebar();
        } else {
           console.log("Geolocalización no soportada por este navegador.");
        }
    });

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

    // Iframes de rutas y paradas
    const routesButton = document.getElementById('routesButton');
    routesButton.addEventListener('click', function() {
        displayLoadingSpinner();
        closeAllDialogs(dialogIds);
        showIframe('https://rutas.vallabus.com');
        // URL para rutas
        const dialogState = {
            dialogType: 'planRoute'
        };
        history.pushState(dialogState, `Planificar ruta`, `#/rutas/`);
        trackCurrentUrl();
        toogleSidebar();
    });
    
    const viewLinesButton = document.getElementById('viewLinesButton');
    viewLinesButton.addEventListener('click', function() {
        displayLoadingSpinner();
        closeAllDialogs(dialogIds);
        showIframe('https://rutas.vallabus.com/#/route');
        // URL para visor de líneas
        const dialogState = {
            dialogType: 'showLines'
        };
        history.pushState(dialogState, `Planificar ruta`, `#/lineas/`);
        trackCurrentUrl();
        toogleSidebar();
    });

    // Cualquier elemento con clase routeTo enlaza a rutas
    // data-arrive-date y data-arrive-time son opcionales
    // Ejemplo: <a href="#" class="routeTo" data-dest-name="Estadio José Zorilla" data-dest-y="41.6440028" data-dest-x="-4.7605973" data-arrive-date="2024-05-11" data-arrive-time="18:00">Planifica tu viaje al Estadio</a>
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

            // Llama a la función showRouteToDestination con los datos extraídos

            // Verifica si los atributos necesarios están definidos
            if (destName && destX && destY && arriveByDate && arriveByHour) {
                showRouteToDestination(destName, destY, destX, arriveByDate, arriveByHour);
            } else if (destName && destX && destY) {
                showRouteToDestination(destName, destY, destX);
            }
        }
    });

    // Añadir el evento al enlace "Tus datos"
    document.getElementById('show-data').addEventListener('click', showDataDialog);
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
        if (availableTips.length > 0) {
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
        }
        // Los no sticky se mantienen con display: none
    }

    // Mostrar un tip aleatorio si no hay sticky
    if (!hasSticky) {
        showRandomTip();
    }
}

function socialBrowserWarning() {
    // Aviso si se accede desde el navegador de instagram
    // Check if the referrer is from Instagram
    if (document.referrer.includes('instagram.com') || document.referrer.includes('facebook.com')) {
        const tipsBannerElement = document.getElementById('tips-banner');
        const instagramWarning = document.createElement('p');
        instagramWarning.id = 'instagram-warning';
        instagramWarning.innerHTML = '<strong>Si accedes desde Instagram o Facebook</strong><br />- Pulsa en el menú superior derecho con tres puntos<br> - Selecciona "Abrir en Chrome/Navegador externo"<br>- Podrás usar e instalarla correctamente';
        tipsBannerElement.parentNode.insertBefore(instagramWarning, tipsBannerElement);
    }
}

// Eventos a controlar en elementos del mapa
function mapEvents() {

    // Mediante delegación de eventos controlamos clics
    document.addEventListener('DOMContentLoaded', function() {
        // Agrega el eventListener a cualquier elemento con clase addLineButton
        document.addEventListener('click', async function(event) {
            // Verifica si el evento se originó en un elemento addLineButton y añadimos la línea a la lista
            if (event.target.matches('.addLineButton')) {
                let stopNumber = event.target.getAttribute('data-stop-number');
                let lineNumber = event.target.getAttribute('data-line-number');
                await addBusLine(stopNumber, lineNumber, true);
            }
        });
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
        }
    });
    const mapBox = document.getElementById('mapContainer');
    mapBox.classList.remove('show');
    // Si intervalMap ya está definido, limpiar el intervalo existente
    if (window.globalState.intervalMap) {
        clearInterval(window.globalState.intervalMap);
        window.globalState.intervalMap = null;
    }
}

// Manejo de estado de URLs y acciones en cada ruta
function handleRoute() {
    const hash = window.location.hash;

    if (hash === '' || hash === '#/' || hash === '#') {
        closeAllDialogs(dialogIds);
    } else if (hash.startsWith('#/lineas') || hash.startsWith('#/lineas/')) {
        displayLoadingSpinner();
        closeAllDialogs(dialogIds);
        showIframe('https://rutas.vallabus.com/#/route');
        history.replaceState(null, null, '#/lineas/');
    } else if (hash.startsWith('#/rutas') || hash.startsWith('#/rutas/')) {
        displayLoadingSpinner();
        closeAllDialogs(dialogIds);
        showIframe('https://rutas.vallabus.com');
        history.replaceState(null, null, '#/rutas/');
    } else if (hash === '#/cercanas' || hash === '#/cercanas/') {
        if (navigator.geolocation) {
            displayLoadingSpinner();
            navigator.geolocation.getCurrentPosition(showNearestStops, showError, { maximumAge: 6000, timeout: 15000 });
        } else {
            console.log("Geolocalización no soportada por este navegador.");
        }
        history.replaceState(null, null, '#/cercanas/');
    } else if (hash.startsWith('#linea-')) {
        // No hacemos nada con enlaces a líneas específicas, ya que tenemos anchors en los horarios programados que queremos que funcionen
    } else {
        // Si no coincide con ningún deeplink conocido, volver a la página principal
        history.replaceState({ dialogType: 'home' }, document.title, '#/');
        closeAllDialogs(dialogIds);
    }

    trackCurrentUrl();
}

function routersEvents() {
    // Manejar la ruta inicial cuando se carga la página
    handleRoute();

    // Manejar cambios en la ruta
    window.addEventListener('popstate', function(event) {
        handleRoute();
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
        dialog.className = 'dialog';
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

    // Contenido del diálogo
    const dialogContent = `
        <button id="closeDataDialogBtn"></button>
        <h2>Tus datos</h2>
        <ul>
            <li>Paradas guardadas: ${uniqueStops}</li>
            <li>Líneas guardadas: ${totalLines}</li>
            <li>Paradas fijadas: ${uniqueFixedStops}</li>
        </ul>
        <button id="exportDataBtn">Exportar datos</button>
        <button id="importDataBtn">Importar datos</button>
    `;

    dialog.innerHTML = dialogContent;
    dialog.style.display = 'block';

    // Añadir eventos a los botones
    document.getElementById('exportDataBtn').addEventListener('click', exportData);
    document.getElementById('importDataBtn').addEventListener('click', importData);
    document.getElementById('closeDataDialogBtn').addEventListener('click', () => {
        dialog.style.display = 'none';
    });
}

function exportData() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        try {
            data[key] = JSON.parse(localStorage.getItem(key));
        } catch (e) {
            // Si no se puede parsear como JSON, guardamos el valor como string
            data[key] = localStorage.getItem(key);
        }
    }

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
                    updateBusList(); // Actualizar la lista de paradas y líneas
                    document.getElementById('dataDialog').style.display = 'none'; // Cerrar el diálogo
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