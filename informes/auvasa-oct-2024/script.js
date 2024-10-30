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
        value: "5 meses",
        subtitle: "junio a octubre 2024"
    },
    {
        icon: 'file-bar-chart',
        title: "Registros",
        value: "+6 millones",
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
const punctualityData = {
    labels: ['Retrasados', 'Puntuales', 'Adelantados'],
    datasets: [{
        data: [48, 33, 19],
        backgroundColor: [COLORS.error, COLORS.successLight, COLORS.redLight],
        borderColor: 'white',
        borderWidth: 1
    }]
};

new Chart(punctualityCtx, {
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

// Gráfica de Frecuencias (Stacked Bar Chart)
const frequencyCtx = document.getElementById('frequencyChart').getContext('2d');

// Crear el contenedor para los iconos de bus de frecuencias
const frequencyBusIconsContainer = document.createElement('div');
frequencyBusIconsContainer.className = 'flex flex-wrap justify-center gap-1 mb-4';
frequencyBusIconsContainer.innerHTML = `
    <div class="flex flex-wrap justify-center gap-1">
        ${Array(1).fill(`<i data-lucide="bus" class="h-8 w-8" style="color: ${COLORS.error}"></i>`).join('')}
        ${Array(2).fill(`<i data-lucide="bus" class="h-8 w-8" style="color: ${COLORS.successLight}"></i>`).join('')}
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
                data: [29, 33, 35],
                backgroundColor: COLORS.error,
                borderColor: 'white',
                borderWidth: 1
            },
            {
                label: 'Menor de 12-13 min',
                data: [71, 67, 65],
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
const monthlyTrendCtx = document.getElementById('monthlyTrendChart').getContext('2d');
new Chart(monthlyTrendCtx, {
    type: 'line',
    data: {
        labels: ['Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre'],
        datasets: [{
            label: 'Llegadas puntuales (%)',
            data: [33, 35, 37, 33, 32],
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

function shareReport() {
    const text = 'El análisis de @VallaBusApp revela que el 70% de los buses de AUVASA no cumplen con su horario programado\n\n';
    
    // Registrar el evento en Matomo
    if (typeof _paq !== 'undefined') {
        _paq.push(['trackEvent', 'Compartir', 'Informe', 'AUVASA Octubre 2024']);
    }

    if (navigator.share) {
        navigator.share({
            title: 'Informe sobre calidad del servicio de AUVASA - Octubre 2024',
            text: text,
            url: window.location.href + '?mtm_campaign=informeshare'
        })
        .catch((error) => console.log('Error compartiendo:', error));
    } else {
        // Fallback para navegadores que no soportan Web Share API
        const dummy = document.createElement('textarea');
        document.body.appendChild(dummy);
        dummy.value = text + window.location.href + '?mtm_campaign=informeshare';
        dummy.select();
        document.execCommand('copy');
        document.body.removeChild(dummy);
        alert('Texto y URL copiados al portapapeles');
    }
}

// Datos para múltiples gráficas
const delayEvolutionData = [
    {
        title: "Barrio España → Covaresa",
        date: "24 octubre 2024 - 08:17",
        stops: "957 - Cardenal Torquemada frente 16<br />813 - Plaza España Bola del Mundo",
        line: "1",
        lineColor: "hsl(117.6, 42.9%, 54.7%)",
        data: {
            labels: ['1204', '1205', '1206', '1073', '752', '751', '957', '1371', '558', '828', '813', '832', 
                     '1003', '991', '998', '990', '1000', '1001', '1039', '1044', '1389', '1370', '858'],
            datasets: [{
                label: 'Minutos de desfase',
                data: [-4, -4, -4, -4, -5, -7, -7, -9, -10, -11, -12, -13, -13, -13, -14, -14, -12, -13, -14, -15, -14, -13, -15],
                borderColor: COLORS.error,
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                tension: 0.3,
                fill: true
            }]
        }
    },
    {
        title: "San Pedro Regalado → Covaresa",
        date: "24 octubre 2024 - 08:25",
        stops: "876 - Avenida Santander Poblado Endasa<br />813 - Plaza España Bola del Mundo",
        line: "2",
        lineColor: "hsl(47.6, 82.9%, 54.7%)",
        data: {
            labels: ['816', '878', '879', '876', '779', '1155', '1158', '558', '828', '813', 
                    '1156', '844', '651', '653', '991', '998', '990', '865', '854', '1150', 
                    '868', '861', '1082', '1087', '1055', '663', '607'],
            datasets: [{
                label: 'Minutos de desfase',
                data: [6, 0, -2, 0, -2, -4, -3, -4, -5, -6, -8, -8, -8, -8, -9, -8, -8, 
                      -6, -7, -3, -7, -7, -7, -7, -5, -4, -4],
                borderColor: COLORS.error,
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                tension: 0.3,
                fill: true
            }]
        }
    },
    {
        title: "Circular",
        date: "24 octubre 2024 - 07:32",
        stops: "1390 - Calle Enseñanza Centro Educación Especial<br />625 - Paseo del Cauce frente Centro Salud Pilarica<br />995 - Paseo Zorrilla 101 LAVA",
        line: "C2",
        lineColor: "hsl(207.6, 42.9%, 54.7%)",
        data: {
            labels: ['742', '1239', '1237', '1249', '1247', '744', '633', '657', '1390', '696', 
                    '694', '805', '973', '1141', '960', '642', '629', '840', '799', '624', 
                    '625', '869', '640', '634', '636', '671', '885', '883', '668', '673', 
                    '882', '560', '12227', '12228', '993', '999', '995', '992', '803', '985', 
                    '553', '552', '700', '950'],
            datasets: [{
                label: 'Minutos de desfase',
                data: [1, 0, 1, 3, 3, 3, 3, 2, 0, -2, 0, -4, -5, -7, -6, -6, -7, -7, -6, -6, 
                       -6, -7, -5, -7, -6, -6, -6, -6, -7, -7, -6, -6, -6, -4, -4, 0, 0, 0, 
                       0, 0, 0, 0, 5, 0],
                borderColor: COLORS.error,
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                tension: 0.3,
                fill: true
            }]
        }
    }
];

// Crear el carrusel de gráficas
const delayEvolutionChart = document.querySelector('#delay-evolution-chart');
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

    console.log(`Gráfica ${data.line}:`);
    console.log('Valores:', values);
    console.log('Mínimo:', minValue);
    console.log('Máximo:', maxValue);
    console.log('Escala sugerida:', Math.floor(minValue) - padding, 'a', Math.ceil(maxValue) + padding);

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
                        borderDash: (context) => context.tick.value === 0 ? [5, 5] : [], // patrón punteado
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

delayEvolutionData.forEach((data, index) => {
    createDelayEvolutionChart(chartsContainer, data, index);
});

delayEvolutionChart.appendChild(navigationControls);
lucide.createIcons();

// Funciones de navegación
function updateChartVisibility() {
    document.querySelectorAll('.chart-wrapper').forEach((wrapper, index) => {
        wrapper.className = `chart-wrapper ${index === currentChart ? '' : 'hidden'}`;
    });
    
    // Actualizar el indicador de página
    const indicator = document.querySelector('.chart-indicator');
    indicator.textContent = `${currentChart + 1}/${delayEvolutionData.length}`;
}

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

// Soporte para gestos táctiles
let touchStartX = 0;
let touchEndX = 0;

chartsContainer.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
});

chartsContainer.addEventListener('touchend', e => {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
});

function handleSwipe() {
    const swipeThreshold = 50;
    const diff = touchStartX - touchEndX;
    
    if (Math.abs(diff) > swipeThreshold) {
        if (diff > 0) {
            // Swipe izquierda
            currentChart = (currentChart + 1) % delayEvolutionData.length;
        } else {
            // Swipe derecha
            currentChart = (currentChart - 1 + delayEvolutionData.length) % delayEvolutionData.length;
        }
        updateChartVisibility();
    }
}

