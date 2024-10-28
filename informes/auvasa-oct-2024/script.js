// Inicializar los iconos de Lucide
lucide.createIcons();

// Configuración de colores
const COLORS = {
    primary: 'hsl(238, 84%, 67%)',    // Indigo más suave
    secondary: 'hsl(270, 76%, 65%)',   // Púrpura más suave
    warning: 'hsl(38, 92%, 60%)',      // Naranja más suave
    error: 'hsl(0, 84%, 65%)',         // Rojo más suave
    redLight: 'hsl(0, 74%, 75%)',     // Rojo más suave
    success: 'hsl(160, 64%, 55%)',     // Verde más suave
    neutral: 'hsl(214, 20%, 65%)'      // Gris más suave
};

// Actualizar datos de las tarjetas de estadísticas
const statsCards = [
    {
        icon: 'calendar',
        title: "Periodo analizado",
        value: "5 meses",
        subtitle: "junio a octubre 2024"
    },
    {
        icon: 'file-bar-chart',
        title: "Registros analizados",
        value: "+6 millones",
        subtitle: "de llegadas"
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

// Gráfica de Puntualidad (Pie Chart)
const punctualityCtx = document.getElementById('punctualityChart').getContext('2d');
const punctualityData = {
    labels: ['Retrasados', 'Puntuales', 'Adelantados'],
    datasets: [{
        data: [48, 33, 19],
        backgroundColor: [COLORS.error, COLORS.success, COLORS.redLight],
        borderColor: 'white',
        borderWidth: 2
    }]
};

new Chart(punctualityCtx, {
    type: 'doughnut',
    data: punctualityData,
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'bottom'
            }
        }
    }
});

// Gráfica de Frecuencias (Stacked Bar Chart)
const frequencyCtx = document.getElementById('frequencyChart').getContext('2d');
new Chart(frequencyCtx, {
    type: 'bar',
    data: {
        labels: ['Línea 1', 'Línea 2', 'Línea C2'],
        datasets: [
            {
                label: 'En frecuencia',
                data: [71, 67, 65],
                backgroundColor: COLORS.success,
                borderColor: 'white',
                borderWidth: 1
            },
            {
                label: 'Exceden frecuencia',
                data: [29, 33, 35],
                backgroundColor: COLORS.error,
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
            fill: false
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
    const text = 'El análisis de VallaBus revela que el 70% de los buses de AUVASA no cumplen con su horario programado\n\n Más detalles:\n\n';
    
    // Registrar el evento en Matomo
    if (typeof _paq !== 'undefined') {
        _paq.push(['trackEvent', 'Compartir', 'Informe', 'AUVASA Octubre 2024']);
    }

    if (navigator.share) {
        navigator.share({
            title: 'Informe sobre calidad del servicio de AUVASA - Octubre 2024',
            text: text,
            url: window.location.href
        })
        .catch((error) => console.log('Error compartiendo:', error));
    } else {
        // Fallback para navegadores que no soportan Web Share API
        const dummy = document.createElement('textarea');
        document.body.appendChild(dummy);
        dummy.value = text + ' ' + window.location.href;
        dummy.select();
        document.execCommand('copy');
        document.body.removeChild(dummy);
        alert('Texto y URL copiados al portapapeles');
    }
}