document.addEventListener('DOMContentLoaded', function() {
    const elements = [
        'fav-destinations',
        'home-destination',
        'addFavoriteButton',
        'configFavoritesButton',
        'homeDialog',
        'favoriteDialog',
        'configFavoritesDialog',
        'closeConfigDialog',
        'addNewFavoriteButton'
    ];

    const foundElements = {};

    elements.forEach(id => {
        const element = document.getElementById(id);
        foundElements[id] = element;
    });

    if (Object.values(foundElements).some(el => el === null)) {
        console.error('Algunos elementos necesarios no están presentes en el DOM. Abortando la inicialización.');
        return;
    }

    let currentMap = null;

    // Cargar destinos favoritos del localStorage
    loadFavoriteDestinations();

    // Usar delegación de eventos para manejar clics en destinos favoritos
    foundElements['fav-destinations'].addEventListener('click', function(event) {
        const target = event.target;
        if (target.tagName === 'LI') {
            if (target.id === 'home-destination') {
                const home = JSON.parse(localStorage.getItem('homeDestination'));
                if (home) {
                    showRouteToDestination(home.name, home.lat, home.lon);
                } else {
                    showHomeDialog();
                }
            } else {
                showRouteToDestination(target.dataset.name, target.dataset.lat, target.dataset.lon);
            }
        }
    });

    // Evento para añadir nuevo destino favorito
    foundElements['addFavoriteButton'].addEventListener('click', showAddFavoriteDialog);

    // Evento para configurar favoritos
    foundElements['configFavoritesButton'].addEventListener('click', showConfigFavoritesDialog);

    // Eventos para los diálogos
    foundElements['closeConfigDialog'].addEventListener('click', () => closeDialog(foundElements['configFavoritesDialog']));
    foundElements['addNewFavoriteButton'].addEventListener('click', () => {
        closeDialog(foundElements['configFavoritesDialog']);
        showAddFavoriteDialog();
    });

    function showConfigFavoritesDialog() {
        const favoritesList = document.getElementById('favoritesList');
        if (!favoritesList) {
            console.error('La lista de favoritos no se encontró en el DOM');
            return;
        }
        favoritesList.innerHTML = ''; // Limpiar la lista

        const home = JSON.parse(localStorage.getItem('homeDestination'));
        if (home) {
            addFavoriteToConfigList(favoritesList, 'Casa', home);
        }

        const favorites = JSON.parse(localStorage.getItem('favoriteDestinations')) || [];
        favorites.forEach(fav => addFavoriteToConfigList(favoritesList, fav.name, fav));

        // Configurar el estado del checkbox
        const hideFavBar = document.getElementById('hideFavBar');
        if (hideFavBar) {
            hideFavBar.checked = localStorage.getItem('hideFavBar') === 'true';
        } else {
            console.error('El checkbox hideFavBar no se encontró en el DOM');
        }

        foundElements['configFavoritesDialog'].style.display = 'block';
    }

    function closeDialog(dialog) {
        if (dialog) {
            dialog.style.display = 'none';
            if (currentMap) {
                currentMap.remove();
                currentMap = null;
            }
        }
    }

    // Evento para gestionar destinos rápidos en el sidebar
    const quickDestinationsButton = document.getElementById('quickDestinationsButton');

    quickDestinationsButton.addEventListener('click', function(event) {
        event.preventDefault();
        showConfigFavoritesDialog();
        toogleSidebar(true); // Cerramos el sidebar
    });

    // Eventos para los diálogos
    document.getElementById('cancelHomeDialog').addEventListener('click', () => closeDialog(foundElements['homeDialog']));
    document.getElementById('saveHomeDialog').addEventListener('click', saveHomeDestination);
    document.getElementById('cancelFavoriteDialog').addEventListener('click', () => closeDialog(foundElements['favoriteDialog']));
    document.getElementById('saveFavoriteDialog').addEventListener('click', saveFavoriteDestination);

    function loadFavoriteDestinations() {
        const favorites = JSON.parse(localStorage.getItem('favoriteDestinations')) || [];
        const favList = foundElements['fav-destinations'].querySelector('ul');
        
        // Limpiar la lista antes de cargar
        favList.innerHTML = '<li id="home-destination">Casa</li>';
        
        favorites.forEach(fav => {
            const li = document.createElement('li');
            li.textContent = fav.name;
            li.dataset.name = fav.name;
            li.dataset.lat = fav.lat;
            li.dataset.lon = fav.lon;
            favList.appendChild(li);
        });

        updateFavBarVisibility();
    }

    function showLocationDialog(isHome) {
        const dialog = isHome ? foundElements['homeDialog'] : foundElements['favoriteDialog'];
        const dialogId = isHome ? 'home' : 'favorite';
        const latInputId = `${dialogId}Lat`;
        const lonInputId = `${dialogId}Lon`;

        // Limpiar el contenido existente
        const dialogContent = dialog.querySelector('.dialog-content');
        dialogContent.innerHTML = `
            <h2>${isHome ? 'Definir Casa' : 'Añadir destino rápido'}</h2>
            <p class="dialog-subtitle">Te permitirá acceder a la ruta más rápida</p>
            ${!isHome ? `<input type="text" id="${dialogId}Name" placeholder="Nombre del destino" maxlength="25">` : ''}
            <div class="search-container">
                <input type="text" id="${dialogId}SearchInput" class="search-input" placeholder="Buscar dirección">
                <button id="${dialogId}SearchButton" class="search-button">
                    <span class="search-icon"></span>
                </button>
            </div>
            <div id="${dialogId}MapContainer" class="map-container"></div>
            <button id="${dialogId}CurrentLocationButton" class="current-location-button">
                <span class="location-icon"></span>
                Usar tu ubicación
            </button>
            <div id="${dialogId}ErrorMessage" class="error-message"></div>
            <div class="dialog-buttons">
                <button id="${dialogId}CancelButton" class="dialog-button">Cancelar</button>
                <button id="${dialogId}AcceptButton" class="dialog-button">Aceptar</button>
            </div>
            <input type="hidden" id="${latInputId}">
            <input type="hidden" id="${lonInputId}">
        `;

        // Configurar eventos
        document.getElementById(`${dialogId}CancelButton`).onclick = () => closeDialog(dialog);
        document.getElementById(`${dialogId}AcceptButton`).onclick = () => {
            const lat = document.getElementById(latInputId).value;
            const lon = document.getElementById(lonInputId).value;
            const errorMessage = document.getElementById(`${dialogId}ErrorMessage`);
            let hasError = false;

            if (!lat || !lon) {
                errorMessage.textContent = 'Debe elegir una ubicación';
                hasError = true;
            }

            if (!isHome) {
                const name = document.getElementById(`${dialogId}Name`).value.trim();
                if (!name) {
                    errorMessage.textContent = errorMessage.textContent ? 
                        'Debes elegir una ubicación y proporcionar un nombre' : 
                        'Debes proporcionar un nombre';
                    hasError = true;
                }
            }

            if (hasError) {
                errorMessage.style.display = 'block';
                return;
            }

            errorMessage.style.display = 'none';
            if (isHome) {
                saveHomeDestination();
            } else {
                saveFavoriteDestination();
            }
            closeDialog(dialog);
        };

        dialog.style.display = 'block';

        // Asegurarse de que el mapa anterior se elimine si existe
        if (currentMap) {
            currentMap.remove();
            currentMap = null;
        }

        // Inicializar el mapa inmediatamente
        initializeMap(dialogId, latInputId, lonInputId);

        // Añadir este nuevo evento después de configurar los otros eventos
        if (!isHome) {
            const nameInput = document.getElementById(`${dialogId}Name`);
            nameInput.addEventListener('input', function() {
                if (this.value.length > 25) {
                    this.value = this.value.slice(0, 25);
                }
            });
        }
    }

    function initializeMap(dialogId, latInputId, lonInputId) {
        // Coordenadas del centro del área
        const areaCenter = [41.652251, -4.724532];
        const initialZoom = 13;
        
        currentMap = L.map(`${dialogId}MapContainer`).setView(areaCenter, initialZoom);
        
        // Usar las capas de mapa de mapa.js
        if (document.documentElement.classList.contains('dark-mode')) {
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}' + (L.Browser.retina ? '@2x.png' : '.png'), {
                attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
                subdomains: 'abcd',
                maxZoom: 20,
                minZoom: 0
            }).addTo(currentMap);
        } else {
            L.tileLayer('https://{s}.tile.thunderforest.com/atlas/{z}/{x}/{y}.png?apikey=a1eb584c78ab43ddafe0831ad04566ae', {
                maxZoom: 19,
                attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="http://thunderforest.com/">Thunderforest</a>',
                subdomains: 'abc'
            }).addTo(currentMap);
        }
        
        // Modificar la funcionalidad de búsqueda
        const geocoder = L.Control.Geocoder.nominatim({
            geocodingQueryParams: {
                countrycodes: 'es',
                viewbox: '-4.8835282,41.7195078,-4.6481,41.5410',  // Formato correcto: left,top,right,bottom
                bounded: 1
            }
        });
        
        let marker = null; // Inicializamos el marcador como null
        
        // Añadir evento de clic al mapa
        currentMap.on('click', function(e) {
            const lat = e.latlng.lat;
            const lng = e.latlng.lng;
            
            if (marker) {
                currentMap.removeLayer(marker); // Eliminar el marcador existente si lo hay
            }
            marker = L.marker([lat, lng]).addTo(currentMap); // Crear nuevo marcador
            
            document.getElementById(latInputId).value = lat;
            document.getElementById(lonInputId).value = lng;
            
            // Opcional: Realizar una búsqueda inversa para obtener el nombre de la ubicación
            geocoder.reverse(e.latlng, currentMap.options.crs.scale(currentMap.getZoom()), function(results) {
                if (results.length > 0) {
                    document.getElementById(`${dialogId}SearchInput`).value = results[0].name;
                }
            });
        });
        
        const searchInput = document.getElementById(`${dialogId}SearchInput`);
        const searchButton = document.getElementById(`${dialogId}SearchButton`);
        const searchResults = document.createElement('ul');
        searchResults.id = `${dialogId}SearchResults`;
        searchResults.className = 'search-results';
        searchInput.parentNode.insertBefore(searchResults, searchInput.nextSibling);

        function performSearch() {
            if (searchInput.value.length > 2) {
                geocoder.geocode(searchInput.value, function(results) {
                    searchResults.innerHTML = '';
                    searchResults.style.display = results.length > 0 ? 'block' : 'none';
                    results.forEach(function(r) {
                        const li = document.createElement('li');
                        li.textContent = r.name;
                        li.className = 'search-result-item';
                        li.addEventListener('click', function() {
                            if (marker) {
                                currentMap.removeLayer(marker); // Eliminar el marcador existente si lo hay
                            }
                            marker = L.marker(r.center).addTo(currentMap); // Crear nuevo marcador
                            currentMap.setView(r.center, 15);
                            document.getElementById(latInputId).value = r.center.lat;
                            document.getElementById(lonInputId).value = r.center.lng;
                            searchInput.value = r.name;
                            searchResults.style.display = 'none';
                        });
                        searchResults.appendChild(li);
                    });
                });
            }
        }

        searchInput.addEventListener('keydown', function(event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                performSearch();
            }
        });

        searchButton.addEventListener('click', performSearch);

        // Cerrar la lista de resultados si se hace clic fuera de ella
        document.addEventListener('click', function(event) {
            if (!searchResults.contains(event.target) && event.target !== searchInput) {
                searchResults.style.display = 'none';
            }
        });
        
        // Modificar la funcionalidad del botón "Mi ubicación actual"
        document.getElementById(`${dialogId}CurrentLocationButton`).addEventListener('click', function() {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(function(position) {
                    const lat = position.coords.latitude;
                    const lon = position.coords.longitude;
                    if (marker) {
                        currentMap.removeLayer(marker); // Eliminar el marcador existente si lo hay
                    }
                    marker = L.marker([lat, lon]).addTo(currentMap); // Crear nuevo marcador
                    currentMap.setView([lat, lon], 15);
                    document.getElementById(latInputId).value = lat;
                    document.getElementById(lonInputId).value = lon;

                    // Realizar búsqueda inversa para obtener el nombre de la ubicación
                    geocoder.reverse({lat: lat, lng: lon}, currentMap.options.crs.scale(currentMap.getZoom()), function(results) {
                        if (results.length > 0) {
                            document.getElementById(`${dialogId}SearchInput`).value = results[0].name;
                        }
                    });
                }, function() {
                    alert('No se pudo obtener tu ubicación actual.');
                });
            } else {
                alert('Tu navegador no soporta geolocalización.');
            }
        });
        
        currentMap.invalidateSize();
    }

    function showHomeDialog() {
        showLocationDialog(true);
    }

    function showAddFavoriteDialog() {
        showLocationDialog(false);
    }

    function addFavoriteToConfigList(list, name, data) {
        const li = document.createElement('li');
        li.textContent = name;
        
        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-favorite-icon';
        deleteButton.setAttribute('aria-label', 'Borrar favorito');
        deleteButton.addEventListener('click', () => deleteFavorite(name, data));
        
        li.appendChild(deleteButton);
        list.appendChild(li);
    }

    function deleteFavorite(name, data) {
        if (name === 'Casa') {
            localStorage.removeItem('homeDestination');
        } else {
            let favorites = JSON.parse(localStorage.getItem('favoriteDestinations')) || [];
            favorites = favorites.filter(fav => fav.name !== name);
            localStorage.setItem('favoriteDestinations', JSON.stringify(favorites));
        }
        loadFavoriteDestinations(); // Actualizar la lista de favoritos y la visibilidad del botón
        showConfigFavoritesDialog(); // Actualizar la lista en el diálogo
    }

    function saveHomeDestination() {
        const lat = document.getElementById('homeLat').value;
        const lon = document.getElementById('homeLon').value;
        
        if (lat && lon) {
            localStorage.setItem('homeDestination', JSON.stringify({name: 'Casa', lat, lon}));
            loadFavoriteDestinations(); // Actualizar la lista de favoritos y la visibilidad del botón
        }
    }

    function saveFavoriteDestination() {
        const nameInput = document.getElementById('favoriteName');
        const name = nameInput.value.trim().slice(0, 25);
        const lat = document.getElementById('favoriteLat').value;
        const lon = document.getElementById('favoriteLon').value;
        
        if (name && lat && lon) {
            const favorites = JSON.parse(localStorage.getItem('favoriteDestinations')) || [];
            favorites.push({name, lat, lon});
            localStorage.setItem('favoriteDestinations', JSON.stringify(favorites));
            loadFavoriteDestinations(); // Actualizar la lista de favoritos y la visibilidad del botón
        }
    }

    function hasSavedLocations() {
        const homeDestination = localStorage.getItem('homeDestination');
        const favoriteDestinations = localStorage.getItem('favoriteDestinations');
        return homeDestination || (favoriteDestinations && JSON.parse(favoriteDestinations).length > 0);
    }

    // Evento para ocultar/mostrar la barra de destinos
    document.getElementById('hideFavBar').addEventListener('change', function() {
        localStorage.setItem('hideFavBar', this.checked);
        updateFavBarVisibility();
    });

    function updateFavBarVisibility() {
        const favDestinations = document.getElementById('fav-destinations');
        const isHidden = localStorage.getItem('hideFavBar') === 'true';
        favDestinations.style.display = isHidden ? 'none' : 'flex';
    }

    // Asegúrate de llamar a updateFavBarVisibility() al cargar la página
    updateFavBarVisibility();

    // Evento para añadir un nuevo destino rápido
    document.getElementById('addNewFavoriteButton').addEventListener('click', function() {
        closeDialog(foundElements['configFavoritesDialog']);
        showAddFavoriteDialog();
    });
});

console.log('Script favDestinations.js cargado');