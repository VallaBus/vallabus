// Inicializar los iconos de Lucide
lucide.createIcons();

// Configuración de colores
const COLORS = {
    primary: 'hsl(238, 84%, 67%)',    // Indigo más suave
    secondary: 'hsl(270, 76%, 65%)',   // Púrpura más suave
    warning: 'hsl(38, 92%, 60%)',      // Naranja más suave
    error: 'hsl(0, 90%, 65%)',         // Rojo más suave
    redLight: 'hsl(0, 60%, 75%)',     // Rojo más suave
    success: 'hsl(160, 64%, 55%)',     // Verde más suave
    successLight: 'hsl(160, 20%, 85%)', // Verde más suave
    neutral: 'hsl(214, 20%, 65%)'      // Gris más suave
};

// Actualizar datos de las tarjetas de estadísticas
const statsCards = [
    {
        icon: 'calendar',
        title: "Periodo",
        value: "31 días",
        subtitle: "1 al 31 de enero 2025"
    },
    {
        icon: 'file-bar-chart',
        title: "Registros",
        value: "1,2 millones",
        subtitle: "de llegadas"
    },
    {
        icon: 'map-pin',
        title: "Ubicaciones",
        value: "571",
        subtitle: "paradas"
    }
];

// Generar tarjetas de estadísticas
const statsCardsContainer = document.getElementById('statsCards');
statsCards.forEach(stat => {
    const card = document.createElement('div');
    card.className = 'bg-white p-6 rounded-lg shadow-sm border border-gray-100';
    card.innerHTML = `
        <div class="flex items-center gap-4">
            <div class="p-3 rounded-lg">
                <i data-lucide="${stat.icon}" class="h-8 w-8 card-icon"></i>
            </div>
            <div>
                <p class="text-sm font-medium text-primary">${stat.title}</p>
                <h3 class="text-2xl font-semibold text-primary mt-1">${stat.value}</h3>
                <p class="text-sm text-primary mt-1">${stat.subtitle}</p>
            </div>
        </div>
    `;
    statsCardsContainer.appendChild(card);
});
lucide.createIcons();

// Gráfica de Puntualidad (Horizontal Bar Chart)
const punctualityCtx = document.getElementById('punctualityChart').getContext('2d');
let punctualityChart;
let lineData = null;

const punctualityData = {
    labels: ['Retrasados', 'Puntuales', 'Adelantados'],
    datasets: [{
        data: [48, 33, 19],
        backgroundColor: [COLORS.error, COLORS.successLight, COLORS.redLight],
        borderColor: 'white',
        borderWidth: 1
    }]
};

// Variables globales para los totales (añadir al inicio del archivo)
let totalLineData = {
    porcentajes: [0, 0, 0],
    incumplimiento: 0
};

let totalNeighborhoodData = {
    porcentajes: [0, 0, 0],
    incumplimiento: 0
};

// Variable global para los datos de evolución
let delayEvolutionData = [];
let currentChart = 0;
let charts = [];

function createDelayEvolutionChart(container, data, index) {
    const chartWrapper = document.createElement('div');
    chartWrapper.className = `chart-wrapper ${index === 0 ? '' : 'hidden'}`;
    chartWrapper.innerHTML = `
        <div class="chart-container">
            <canvas id="delayEvolutionChart${index}"></canvas>
        </div>
        <div class="flex items-center gap-2 mb-1 mt-5">
            <i data-lucide="route" class="h-5 w-5 text-gray-400"></i>
            <h3 class="text-xs text-gray-500"><strong class="linea linea-${data.line} mr-1">${data.line}</strong> ${data.title}</h3>
        </div>
        <div class="flex items-center gap-2 mb-1 mt-5">
            <i data-lucide="calendar-days" class="h-5 w-5 text-gray-400"></i>
            <h3 class="text-xs text-gray-500">${data.date}</h3>
        </div>
        <div class="flex items-center gap-2 mb-1 mt-5">
            <i data-lucide="map-pin" class="h-5 w-5 text-gray-400"></i>
            <h3 class="text-xs text-gray-500">${data.stops}</h3>
        </div>
    `;
    container.appendChild(chartWrapper);

    const ctx = document.getElementById(`delayEvolutionChart${index}`).getContext('2d');

    // Encontrar los valores mínimo y máximo para esta gráfica
    const values = data.data.datasets[0].data;
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const padding = 2; // Padding para que los valores no toquen los bordes

    const chart = new Chart(ctx, {
        type: 'line',
        data: data.data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Desfase: ${context.raw} minutos`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    grid: {
                        color: (context) => context.tick.value === 0 ? '#666' : '#ddd',
                        lineWidth: (context) => context.tick.value === 0 ? 1 : 1,
                        borderDash: (context) => context.tick.value === 0 ? [5, 5] : [],
                    },
                    title: {
                        display: true,
                        text: 'Minutos de desfase'
                    },
                    min: Math.min(Math.floor(minValue) - padding, 0),
                    max: Math.max(Math.ceil(maxValue) + padding, 0),
                    ticks: {
                        maxTicksLimit: 5
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Parada'
                    },
                    ticks: {
                        maxRotation: 45,
                        minRotation: 45
                    }
                }
            }
        }
    });
    charts.push(chart);
    return chartWrapper;
}

function updateChartVisibility() {
    document.querySelectorAll('.chart-wrapper').forEach((wrapper, index) => {
        wrapper.className = `chart-wrapper ${index === currentChart ? '' : 'hidden'}`;
    });
    
    // Actualizar el indicador de página
    const indicator = document.querySelector('.chart-indicator');
    if (indicator) {
        indicator.textContent = `${currentChart + 1}/${delayEvolutionData.length}`;
    }
}

// Función para cargar y procesar datos de los archivos JSON
async function loadDelayData() {
    try {
        const [line1Data, line2Data, lineC2Data] = await Promise.all([
            fetch('data/puntualidad-1-ejemplo.json').then(response => response.json()),
            fetch('data/puntualidad-2-ejemplo.json').then(response => response.json()),
            fetch('data/puntualidad-c2-ejemplo.json').then(response => response.json())
        ]);

        // Función auxiliar para procesar los datos de cada línea
        function processLineData(jsonData, title, line, lineColor) {
            // Ordenar por Stop Sequence
            const sortedData = jsonData.sort((a, b) => parseInt(a['Stop Sequence']) - parseInt(b['Stop Sequence']));
            
            // Extraer la fecha de la primera parada
            const firstStop = sortedData[0];
            const date = firstStop['Fechahorallegada Programada'];
            
            // Paradas fijas para cada línea
            let stops;
            switch (line) {
                case "1":
                    stops = "957 - Cardenal Torquemada frente 16<br />813 - Plaza España Bola del Mundo";
                    break;
                case "2":
                    stops = "876 - Avenida Santander Poblado Endasa<br />813 - Plaza España Bola del Mundo";
                    break;
                case "C2":
                    stops = "1390 - Calle Enseñanza Centro Educación Especial<br />625 - Paseo del Cauce frente Centro Salud Pilarica<br />995 - Paseo Zorrilla 101 LAVA";
                    break;
                default:
                    // Si por alguna razón no tenemos paradas fijas definidas, usar las dinámicas
                    const firstStopName = firstStop['Paradas 2025 - Numero Parada → Nombre Parada'];
                    const lastStopName = sortedData[sortedData.length - 1]['Paradas 2025 - Numero Parada → Nombre Parada'];
                    stops = `${firstStopName}<br />${lastStopName}`;
            }
            
            // Extraer labels y datos de desfase
            const labels = sortedData.map(stop => stop['Paradas 2025 - Numero Parada → Numero Parada']);
            const desfases = sortedData.map(stop => parseInt(stop['Desfase']));

            return {
                title,
                date,
                stops,
                line,
                lineColor,
                data: {
                    labels,
                    datasets: [{
                        label: 'Minutos de desfase',
                        data: desfases,
                        borderColor: COLORS.error,
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        tension: 0.3,
                        fill: true
                    }]
                }
            };
        }

        // Procesar datos para cada línea
        delayEvolutionData = [
            processLineData(line1Data, "Barrio España → Covaresa", "1", "hsl(117.6, 42.9%, 54.7%)"),
            processLineData(line2Data, "San Pedro Regalado → Covaresa", "2", "hsl(47.6, 82.9%, 54.7%)"),
            processLineData(lineC2Data, "Circular", "C2", "hsl(207.6, 42.9%, 54.7%)")
        ];

        // Crear el carrusel de gráficas
        const delayEvolutionChart = document.querySelector('#delay-evolution-chart');
        if (!delayEvolutionChart) {
            console.error('No se encontró el elemento #delay-evolution-chart');
            return;
        }

        // Limpiar el contenedor antes de agregar nuevos elementos
        delayEvolutionChart.innerHTML = '';
        
        // Agregar controles de navegación
        const navigationControls = document.createElement('div');
        navigationControls.className = 'flex justify-center items-center gap-4 mt-4';
        navigationControls.innerHTML = `
            <button type="button" class="prev-chart p-2 rounded-full hover:bg-gray-100" aria-label="Anterior">
                <i data-lucide="chevron-left" class="h-6 w-6 text-gray-600"></i>
            </button>
            <div class="chart-indicator text-sm font-medium text-gray-600">
                1/${delayEvolutionData.length}
            </div>
            <button type="button" class="next-chart p-2 rounded-full hover:bg-gray-100" aria-label="Siguiente">
                <i data-lucide="chevron-right" class="h-6 w-6 text-gray-600"></i>
            </button>
        `;

        // Crear los gráficos y agregar navegación
        const chartsContainer = document.createElement('div');
        chartsContainer.className = 'charts-container';
        delayEvolutionChart.appendChild(chartsContainer);

        // Crear los gráficos
        delayEvolutionData.forEach((data, index) => {
            createDelayEvolutionChart(chartsContainer, data, index);
        });

        delayEvolutionChart.appendChild(navigationControls);
        
        // Actualizar iconos
        lucide.createIcons();

        // Configurar navegación
        document.querySelector('.prev-chart').addEventListener('click', (e) => {
            e.preventDefault();
            currentChart = (currentChart - 1 + delayEvolutionData.length) % delayEvolutionData.length;
            updateChartVisibility();
        });

        document.querySelector('.next-chart').addEventListener('click', (e) => {
            e.preventDefault();
            currentChart = (currentChart + 1) % delayEvolutionData.length;
            updateChartVisibility();
        });

        // Mostrar el primer gráfico
        currentChart = 0;
        updateChartVisibility();

    } catch (error) {
        console.error('Error al cargar los datos:', error);
    }
}

// Llamar a la función al cargar la página
loadDelayData();

// Modificar la función loadLineData
async function loadLineData() {
    try {
        const response = await fetch('./data/puntualidad-lineas.json');
        if (!response.ok) {
            throw new Error('Error al cargar los datos');
        }
        lineData = await response.json();
        
        // Calcular totales
        let totalRetrasos = 0;
        let totalPuntuales = 0;
        let totalAdelantos = 0;
        let granTotal = 0;
        
        lineData.forEach(line => {
            totalRetrasos += parseInt(line['Retrasos']);
            totalPuntuales += parseInt(line['Puntual']);
            totalAdelantos += parseInt(line['Adelantos']);
            granTotal += parseInt(line['Total']);
        });
        
        // Guardar porcentajes totales
        totalLineData.porcentajes = [
            Math.round((totalRetrasos / granTotal) * 100),
            Math.round((totalPuntuales / granTotal) * 100),
            Math.round((totalAdelantos / granTotal) * 100)
        ];
        totalLineData.incumplimiento = Math.round(((totalRetrasos + totalAdelantos) / granTotal) * 10);

        // Actualizar datos iniciales
        punctualityChart.data.datasets[0].data = totalLineData.porcentajes;
        punctualityChart.update();
        updateDescriptionText(totalLineData.incumplimiento, "no cumplen su horario programado");
        updateBusIcons(totalLineData.porcentajes);

        // Ordenar las líneas: primero numéricas y luego alfanuméricas
        const sortedLines = [...lineData].sort((a, b) => {
            const numA = parseInt(a['Numero Linea']);
            const numB = parseInt(b['Numero Linea']);
            
            // Si ambos son números, ordenar numéricamente
            if (!isNaN(numA) && !isNaN(numB)) {
                return numA - numB;
            }
            // Si solo uno es número, los números van primero
            if (!isNaN(numA)) return -1;
            if (!isNaN(numB)) return 1;
            // Si ambos son alfanuméricos, ordenar alfabéticamente
            return a['Numero Linea'].localeCompare(b['Numero Linea']);
        });

        // Crear selector de líneas con el nuevo orden
        const lineSelector = document.createElement('div');
        lineSelector.className = 'mt-6 border-t border-gray-100 pt-4';
        lineSelector.innerHTML = `
            <div class="flex items-center gap-2">
                <i data-lucide="filter" class="h-5 w-5 text-gray-400"></i>
                <select id="lineFilter" class="w-full p-2 border border-gray-200 rounded-lg text-sm">
                    <option value="total">Todas las líneas</option>
                    ${sortedLines.map(line => `
                        <option value="${line['Numero Linea']}">Línea ${line['Numero Linea']}</option>
                    `).join('')}
                </select>
            </div>
        `;
        
        // Añadir el selector al final de la card
        const punctualityCard = document.getElementById('punctuality-chart');
        punctualityCard.appendChild(lineSelector);
        
        // Evento para cambio de línea
        document.getElementById('lineFilter').addEventListener('change', updatePunctualityData);
        
        // Inicializar los iconos del filtro
        lucide.createIcons();
    } catch (error) {
        console.error('Error cargando datos:', error);
        // Opcional: Mostrar mensaje de error al usuario
        alert('Error al cargar los datos de puntualidad. Por favor, intente más tarde.');
    }
}

function updatePunctualityData(event) {
    const selectedLine = event.target.value;
    let newData;
    
    if (selectedLine === 'total') {
        newData = totalLineData.porcentajes;
        updateDescriptionText(totalLineData.incumplimiento, "no cumplen su horario programado");
    } else {
        const lineInfo = lineData.find(l => l['Numero Linea'] === selectedLine);
        const total = parseInt(lineInfo['Total']);
        newData = [
            Math.round((parseInt(lineInfo['Retrasos']) / total) * 100),
            Math.round((parseInt(lineInfo['Puntual']) / total) * 100),
            Math.round((parseInt(lineInfo['Adelantos']) / total) * 100)
        ];
        const retrasados = Math.round(newData[0] / 10);
        const adelantados = Math.round(newData[2] / 10);
        const incumplimiento = retrasados + adelantados;
        
        updateDescriptionText(incumplimiento, `no cumplen su horario programado`);
    }
    
    // Actualizar datos del gráfico
    punctualityChart.data.datasets[0].data = newData;
    punctualityChart.update();
    
    // Actualizar iconos de bus
    updateBusIcons(newData);
}

function updateDescriptionText(number, text) {
    const descriptionElement = document.getElementById('punctuality-chart-description');
    descriptionElement.textContent = `${number} de cada 10`;
    descriptionElement.nextElementSibling.textContent = text;
}

function updateBusIcons(data) {
    const totalBuses = 10;
    const retrasados = Math.round(data[0] / 10);
    const adelantados = Math.round(data[2] / 10);
    const puntuales = totalBuses - retrasados - adelantados;
    
    busIconsContainer.innerHTML = `
        <div class="w-full flex justify-center gap-1 mb-1">
            ${Array(5).fill().map((_, i) => {
                if (i < retrasados) {
                    return `<i data-lucide="bus" class="h-8 w-8" style="color: ${COLORS.error}"></i>`;
                } else if (i < retrasados + adelantados) {
                    return `<i data-lucide="bus" class="h-8 w-8" style="color: ${COLORS.redLight}"></i>`;
                } else {
                    return `<i data-lucide="bus" class="h-8 w-8" style="color: ${COLORS.successLight}"></i>`;
                }
            }).join('')}
        </div>
        <div class="w-full flex justify-center gap-1">
            ${Array(5).fill().map((_, i) => {
                const pos = i + 5;
                if (pos < retrasados) {
                    return `<i data-lucide="bus" class="h-8 w-8" style="color: ${COLORS.error}"></i>`;
                } else if (pos < retrasados + adelantados) {
                    return `<i data-lucide="bus" class="h-8 w-8" style="color: ${COLORS.redLight}"></i>`;
                } else {
                    return `<i data-lucide="bus" class="h-8 w-8" style="color: ${COLORS.successLight}"></i>`;
                }
            }).join('')}
        </div>
    `;
    lucide.createIcons();
}
// Modificar la creación del gráfico original
punctualityChart = new Chart(punctualityCtx, {
    type: 'bar',
    data: punctualityData,
    options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false
            },
            tooltip: {
                callbacks: {
                    label: function(context) {
                        return context.raw + '%';
                    }
                }
            }
        },
        scales: {
            x: {
                beginAtZero: true,
                max: 100,
                ticks: {
                    callback: function(value) {
                        return value + '%';
                    }
                },
                padding: {
                    right: 10
                }
            },
            y: {
                ticks: {
                    padding: 5
                }
            }
        },
        layout: {
            padding: {
                right: 20,
                left: 10
            }
        }
    }
});

// Crear el contenedor para los iconos de bus
const busIconsContainer = document.createElement('div');
busIconsContainer.className = 'flex flex-wrap justify-center gap-1 mb-4 pl-1 pr-1';
busIconsContainer.innerHTML = `
    <div class="w-full flex justify-center gap-1 mb-1">
        ${Array(5).fill(`<i data-lucide="bus" class="h-8 w-8" style="color: ${COLORS.error}"></i>`).join('')}
    </div>
    <div class="w-full flex justify-center gap-1">
        ${Array(2).fill(`<i data-lucide="bus" class="h-8 w-8" style="color: ${COLORS.redLight}"></i>`).join('')}
        ${Array(3).fill(`<i data-lucide="bus" class="h-8 w-8" style="color: ${COLORS.successLight}"></i>`).join('')}
    </div>
`;

// Insertar los iconos antes del contenedor del gráfico
const chartContainer = document.querySelector('#punctuality-chart-description');
chartContainer.parentNode.insertBefore(busIconsContainer, chartContainer);

// Inicializar los nuevos iconos
lucide.createIcons();

// Cargar datos de líneas al iniciar
loadLineData();

// Gráfica de Frecuencias (Stacked Bar Chart)
const frequencyCtx = document.getElementById('frequencyChart').getContext('2d');

// Crear el contenedor para los iconos de bus de frecuencias
const frequencyBusIconsContainer = document.createElement('div');
frequencyBusIconsContainer.className = 'flex flex-wrap justify-center gap-1 mb-4';
frequencyBusIconsContainer.innerHTML = `
    <div class="w-full flex flex-wrap justify-center gap-1">
        ${Array(3).fill(`<i data-lucide="bus" class="h-8 w-8" style="color: ${COLORS.error}"></i>`).join('')}
        ${Array(2).fill(`<i data-lucide="bus" class="h-8 w-8" style="color: ${COLORS.successLight}"></i>`).join('')}
    </div>
    <div class="w-full flex flex-wrap justify-center gap-1">
        ${Array(5).fill(`<i data-lucide="bus" class="h-8 w-8" style="color: ${COLORS.successLight}"></i>`).join('')}
    </div>
`;

// Insertar los iconos antes del contenedor del gráfico
const frequencyChartContainer = document.querySelector('#frequency-chart-description');
frequencyChartContainer.parentNode.insertBefore(frequencyBusIconsContainer, frequencyChartContainer);

new Chart(frequencyCtx, {
    type: 'bar',
    data: {
        labels: ['Línea 1', 'Línea 2', 'Línea C2'],
        datasets: [
            {
                label: 'Mayor de 12-13 min',
                data: [28, 36, 29],
                backgroundColor: COLORS.error,
                borderColor: 'white',
                borderWidth: 1
            },
            {
                label: 'Menor de 12-13 min',
                data: [72, 64, 71],
                backgroundColor: COLORS.successLight,
                borderColor: 'white',
                borderWidth: 1
            }
        ]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: {
                stacked: true,
                grid: {
                    display: false
                }
            },
            y: {
                stacked: true,
                beginAtZero: true,
                max: 100,
                ticks: {
                    callback: function(value) {
                        return value + '%';
                    }
                }
            }
        },
        plugins: {
            legend: {
                position: 'bottom'
            },
            tooltip: {
                callbacks: {
                    label: function(context) {
                        return context.dataset.label + ': ' + context.raw + '%';
                    }
                }
            }
        }
    }
});

// Inicializar los nuevos iconos
lucide.createIcons();

// Gráfico de tendencia mensual
fetch('data/puntualidad-evolucion.json')
    .then(response => response.json())
    .then(data => {
        const monthlyTrendCtx = document.getElementById('monthlyTrendChart').getContext('2d');
        new Chart(monthlyTrendCtx, {
            type: 'line',
            data: {
                labels: data.map(item => item.Fecha.replace('., 2025', '')),
                datasets: [{
                    label: 'Llegadas puntuales (%)',
                    data: data.map(item => parseInt(item['Puntuales (%)'])),
                    borderColor: COLORS.error,
                    tension: 0.3,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: false,
                        text: 'Llegadas puntuales (%)'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            callback: function(value) {
                                return value + '%';
                            }
                        }
                    }
                }
            }
        });
    })
    .catch(error => console.error('Error loading monthly trend data:', error));

function shareReport() {
    const text = 'El análisis de @VallaBusApp revela que el 65% de los buses de AUVASA no cumplen con su horario programado\n\n';
    
    // Crear un objeto URL y modificarlo
    const url = new URL(window.location.href);
    url.hash = ''; // Eliminar anchor
    url.search = '?mtm_campaign=informeshare'; // Reemplazar todos los parámetros
    
    // Registrar el evento en Matomo
    if (typeof _paq !== 'undefined') {
        _paq.push(['trackEvent', 'Compartir', 'Informe', 'AUVASA enero 2025']);
    }

    if (navigator.share) {
        navigator.share({
            title: 'Informe sobre calidad del servicio de AUVASA - enero 2025',
            text: text,
            url: url.toString()
        })
        .catch((error) => console.log('Error compartiendo:', error));
    } else {
        // Fallback para navegadores que no soportan Web Share API
        const dummy = document.createElement('textarea');
        document.body.appendChild(dummy);
        dummy.value = text + url.toString();
        dummy.select();
        document.execCommand('copy');
        document.body.removeChild(dummy);
        alert('Texto y URL copiados al portapapeles');
    }
}

// Variables para el gráfico de barrios
let neighborhoodData = null;
const punctualityNeighborhoodsCtx = document.getElementById('punctualityNeighborhoodsChart').getContext('2d');
const punctualityNeighborhoodsChart = new Chart(punctualityNeighborhoodsCtx, {
    type: 'bar',
    data: {
        labels: ['Retrasados', 'Puntuales', 'Adelantados'],
        datasets: [{
            data: [51, 31, 18],
            backgroundColor: [COLORS.error, COLORS.successLight, COLORS.redLight],
            borderColor: 'white',
            borderWidth: 1
        }]
    },
    options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false
            },
            tooltip: {
                callbacks: {
                    label: function(context) {
                        return context.raw + '%';
                    }
                }
            }
        },
        scales: {
            x: {
                beginAtZero: true,
                max: 100,
                ticks: {
                    callback: function(value) {
                        return value + '%';
                    }
                },
                padding: {
                    right: 10
                }
            },
            y: {
                ticks: {
                    padding: 5
                }
            }
        },
        layout: {
            padding: {
                right: 20,
                left: 10
            }
        }
    }
});

// Función para cargar datos de barrios
async function loadNeighborhoodData() {
    try {
        const response = await fetch('./data/puntualidad-barrios.json');
        if (!response.ok) {
            throw new Error('Error al cargar los datos');
        }
        neighborhoodData = await response.json();
        
        // Calcular totales
        let totalRetrasos = 0;
        let totalPuntuales = 0;
        let totalAdelantos = 0;
        let granTotal = 0;
        
        neighborhoodData.forEach(neighborhood => {
            totalRetrasos += parseInt(neighborhood['Retrasado'].replace(/,/g, ''));
            totalPuntuales += parseInt(neighborhood['Puntual'].replace(/,/g, ''));
            totalAdelantos += parseInt(neighborhood['Adelantado'].replace(/,/g, ''));
            granTotal += parseInt(neighborhood['Total'].replace(/,/g, ''));
        });
        
        // Guardar porcentajes totales
        totalNeighborhoodData.porcentajes = [
            Math.round((totalRetrasos / granTotal) * 100),
            Math.round((totalPuntuales / granTotal) * 100),
            Math.round((totalAdelantos / granTotal) * 100)
        ];
        totalNeighborhoodData.incumplimiento = Math.round(((totalRetrasos + totalAdelantos) / granTotal) * 10);

        // Actualizar datos iniciales
        punctualityNeighborhoodsChart.data.datasets[0].data = totalNeighborhoodData.porcentajes;
        punctualityNeighborhoodsChart.update();
        updateNeighborhoodDescriptionText(totalNeighborhoodData.incumplimiento, "no cumplen su horario programado");
        updateNeighborhoodBusIcons(totalNeighborhoodData.porcentajes);

        // Ordenar barrios alfabéticamente
        const sortedNeighborhoods = [...neighborhoodData]
            .filter(n => n.Barrio !== "") // Excluir barrios sin nombre
            .sort((a, b) => a.Barrio.localeCompare(b.Barrio));

        // Crear selector de barrios
        const neighborhoodSelector = document.createElement('div');
        neighborhoodSelector.className = 'mt-6 border-t border-gray-100 pt-4';
        neighborhoodSelector.innerHTML = `
            <div class="flex items-center gap-2">
                <i data-lucide="filter" class="h-5 w-5 text-gray-400"></i>
                <select id="neighborhoodFilter" class="w-full p-2 border border-gray-200 rounded-lg text-sm">
                    <option value="total">Todos los barrios</option>
                    ${sortedNeighborhoods.map(neighborhood => `
                        <option value="${neighborhood.Barrio}">${neighborhood.Barrio}</option>
                    `).join('')}
                </select>
            </div>
        `;
        
        // Añadir el selector al final de la card
        const punctualityNeighborhoodsCard = document.getElementById('punctuality-neighborhoods-chart');
        punctualityNeighborhoodsCard.appendChild(neighborhoodSelector);
        
        // Crear el contenedor para los iconos de bus
        const busNeighborhoodIconsContainer = document.createElement('div');
        busNeighborhoodIconsContainer.className = 'flex flex-wrap justify-center gap-1 mb-4 pl-1 pr-1';
        
        // Insertar los iconos antes del contenedor del gráfico
        const chartDescription = document.querySelector('#punctuality-neighborhoods-description');
        chartDescription.parentNode.insertBefore(busNeighborhoodIconsContainer, chartDescription);
        
        // Inicializar con los datos totales
        updateNeighborhoodBusIcons([48, 33, 19]);
        
        // Evento para cambio de barrio
        document.getElementById('neighborhoodFilter').addEventListener('change', updateNeighborhoodData);
        
        // Inicializar los iconos del filtro
        lucide.createIcons();

    } catch (error) {
        console.error('Error cargando datos:', error);
        alert('Error al cargar los datos de puntualidad por barrios. Por favor, intente más tarde.');
    }
}

function updateNeighborhoodData(event) {
    const selectedNeighborhood = event.target.value;
    let newData;
    
    if (selectedNeighborhood === 'total') {
        newData = totalNeighborhoodData.porcentajes;
        updateNeighborhoodDescriptionText(totalNeighborhoodData.incumplimiento, "no cumplen su horario programado");
    } else {
        const neighborhoodInfo = neighborhoodData.find(n => n.Barrio === selectedNeighborhood);
        // Corregir el parsing de números eliminando las comas y convirtiendo a enteros
        const total = parseInt(neighborhoodInfo['Total'].replace(/,/g, ''));
        const puntuales = parseInt(neighborhoodInfo['Puntual'].replace(/,/g, ''));
        const adelantados = parseInt(neighborhoodInfo['Adelantado'].replace(/,/g, ''));
        const retrasados = parseInt(neighborhoodInfo['Retrasado'].replace(/,/g, ''));
        
        newData = [
            Math.round((retrasados / total) * 100),
            Math.round((puntuales / total) * 100),
            Math.round((adelantados / total) * 100)
        ];
        
        const incumplimiento = Math.round(((retrasados + adelantados) / total) * 10);
        updateNeighborhoodDescriptionText(incumplimiento, `no cumplen su horario programado`);
    }
    
    // Actualizar datos del gráfico
    punctualityNeighborhoodsChart.data.datasets[0].data = newData;
    punctualityNeighborhoodsChart.update();
    
    // Actualizar iconos de bus
    updateNeighborhoodBusIcons(newData);
}

function updateNeighborhoodDescriptionText(number, text) {
    const descriptionElement = document.getElementById('punctuality-neighborhoods-description');
    descriptionElement.textContent = `${number} de cada 10`;
    descriptionElement.nextElementSibling.textContent = text;
}

function updateNeighborhoodBusIcons(data) {
    const container = document.querySelector('#punctuality-neighborhoods-chart .flex.flex-wrap.justify-center');
    if (!container) return; // Añadir verificación
    
    const totalBuses = 10;
    const retrasados = Math.round(data[0] / 10);
    const adelantados = Math.round(data[2] / 10);
    const puntuales = totalBuses - retrasados - adelantados;
    
    container.innerHTML = `
        <div class="w-full flex justify-center gap-1 mb-1">
            ${Array(5).fill().map((_, i) => {
                if (i < retrasados) {
                    return `<i data-lucide="bus" class="h-8 w-8" style="color: ${COLORS.error}"></i>`;
                } else if (i < retrasados + adelantados) {
                    return `<i data-lucide="bus" class="h-8 w-8" style="color: ${COLORS.redLight}"></i>`;
                } else {
                    return `<i data-lucide="bus" class="h-8 w-8" style="color: ${COLORS.successLight}"></i>`;
                }
            }).join('')}
        </div>
        <div class="w-full flex justify-center gap-1">
            ${Array(5).fill().map((_, i) => {
                const pos = i + 5;
                if (pos < retrasados) {
                    return `<i data-lucide="bus" class="h-8 w-8" style="color: ${COLORS.error}"></i>`;
                } else if (pos < retrasados + adelantados) {
                    return `<i data-lucide="bus" class="h-8 w-8" style="color: ${COLORS.redLight}"></i>`;
                } else {
                    return `<i data-lucide="bus" class="h-8 w-8" style="color: ${COLORS.successLight}"></i>`;
                }
            }).join('')}
        </div>
    `;
    lucide.createIcons();
}

// Llamar a la función al cargar la página
loadNeighborhoodData();

// Control de los botones flotantes
const floatingButtons = document.getElementById('floating-buttons');
let lastScrollPosition = 0;
const scrollThreshold = 1100; // Píxeles de scroll necesarios para mostrar los botones

window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset || document.documentElement.scrollTop;
    
    // Mostrar/ocultar basado en la posición del scroll
    if (currentScroll > scrollThreshold) {
        floatingButtons.style.transform = 'translateY(0)';
    } else {
        floatingButtons.style.transform = 'translateY(200%)';
    }
    
    lastScrollPosition = currentScroll;
});

// Función para volver arriba suavemente
function scrollToTop() {
    document.getElementById('index').scrollIntoView({
        behavior: 'smooth'
    });
}
