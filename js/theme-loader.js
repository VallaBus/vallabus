// Carga el tema guardado en localStorage o el sistema operativo del usuario
(function() {
    // Obtener el tema guardado en localStorage
    var savedTheme = localStorage.getItem('theme');
    
    // Función para aplicar el tema y actualizar el icono
    function setTheme(theme) {
        let isDark;
        if (theme === 'auto') {
            isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        } else {
            isDark = theme === 'dark';
        }
        document.documentElement.classList.toggle('dark-mode', isDark);
        updateThemeToggleIcon(theme);
    }

    // Función para actualizar el icono de #theme-toggle
    function updateThemeToggleIcon(theme) {
        document.addEventListener('DOMContentLoaded', function() {
            var themeToggle = document.getElementById('theme-toggle');
            if (themeToggle) {
                if (theme === 'auto') {
                    themeToggle.innerHTML = '🌓';
                } else {
                    themeToggle.innerHTML = theme === 'dark' ? '🌜' : '🌞';
                }
            }
        });
    }

    // Aplicar el tema según la preferencia guardada o el tema del sistema
    if (savedTheme === 'dark' || savedTheme === 'light') {
        setTheme(savedTheme);
    } else {
        // Si no hay preferencia guardada, usar el tema del sistema (modo auto)
        setTheme('auto');
        if (window.matchMedia) {
            var darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            // Añadir listener para detectar cambios en el tema del sistema
            darkModeMediaQuery.addListener(() => {
                if (!savedTheme) {
                    setTheme('auto');
                }
            });
        }
    }
})();