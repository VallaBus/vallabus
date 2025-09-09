/**
 * Sistema de caché inteligente con duraciones variables según el tipo de dato
 * @module cache
 */

// Configuración de duraciones de caché (en milisegundos)
const CACHE_DURATIONS = {
    busStops: 24 * 60 * 60 * 1000,        // 24 horas - Los datos de paradas cambian muy poco
    stopNames: 7 * 24 * 60 * 60 * 1000,   // 7 días - Los nombres de paradas casi nunca cambian
    stopGeo: 7 * 24 * 60 * 60 * 1000,     // 7 días - Las ubicaciones casi nunca cambian
    busSchedule: 60 * 60 * 1000,          // 1 hora - Los horarios programados
    alerts: 5 * 60 * 1000,                // 5 minutos - Las alertas cambian frecuentemente
    suppressedStops: 15 * 60 * 1000,      // 15 minutos - Las paradas suprimidas
    busInfo: 30 * 1000,                   // 30 segundos - Información de ocupación
    busDestinations: 24 * 60 * 60 * 1000, // 24 horas - Los destinos raramente cambian
    bikeStops: 5 * 60 * 1000,             // 5 minutos - Las paradas de bici pueden cambiar
    default: 60 * 60 * 1000               // 1 hora por defecto
};

/**
 * Obtiene datos del caché con duración específica según el tipo
 * @param {string} cacheKey - La clave del caché
 * @param {string} cacheType - El tipo de caché (busStops, alerts, etc.)
 * @returns {any} Los datos del caché o null si no existen o están expirados
 */
function getCachedDataSmart(cacheKey, cacheType = 'default') {
    try {
        const cached = localStorage.getItem(cacheKey);
        if (!cached) {
            return null;
        }

        const { data, timestamp } = JSON.parse(cached);
        const cacheDuration = CACHE_DURATIONS[cacheType] || CACHE_DURATIONS.default;
        const now = Date.now();
        const age = now - new Date(timestamp).getTime();

        // Verificar si los datos están expirados
        if (age < cacheDuration) {
            // console.log(`[Cache HIT] ${cacheKey} (${cacheType}): ${Math.round(age/1000)}s old`);
            return data;
        }

        // Si están expirados, limpiar el caché
        // console.log(`[Cache MISS] ${cacheKey} (${cacheType}): expired (${Math.round(age/1000)}s old)`);
        localStorage.removeItem(cacheKey);
        return null;
    } catch (error) {
        console.error('Error al leer caché:', error);
        return null;
    }
}

/**
 * Guarda datos en el caché con timestamp
 * @param {string} cacheKey - La clave del caché
 * @param {any} data - Los datos a guardar
 * @param {string} cacheType - El tipo de caché para logging
 */
function setCachedDataSmart(cacheKey, data, cacheType = 'default') {
    try {
        const cacheEntry = {
            data: data,
            timestamp: new Date().toISOString(),
            type: cacheType
        };
        localStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
        // console.log(`[Cache SET] ${cacheKey} (${cacheType})`);
    } catch (error) {
        console.error('Error al guardar en caché:', error);
        // Si el localStorage está lleno, intentar limpiar caché viejo
        if (error.name === 'QuotaExceededError') {
            cleanExpiredCache();
            // Intentar de nuevo
            try {
                localStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
            } catch (retryError) {
                console.error('No se pudo guardar en caché después de limpieza:', retryError);
            }
        }
    }
}

/**
 * Limpia todo el caché expirado según sus duraciones específicas
 */
function cleanExpiredCache() {
    let counter = 0;
    const now = Date.now();
    
    // Iterar de forma inversa para evitar problemas al borrar
    for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        
        try {
            const cached = localStorage.getItem(key);
            if (!cached) continue;
            
            // Intentar parsear como caché
            let cacheData;
            try {
                cacheData = JSON.parse(cached);
            } catch {
                // Si no es JSON válido, no es parte de nuestro caché
                continue;
            }
            
            // Verificar si tiene estructura de caché
            if (!cacheData.timestamp) continue;
            
            const cacheType = cacheData.type || 'default';
            const cacheDuration = CACHE_DURATIONS[cacheType] || CACHE_DURATIONS.default;
            const age = now - new Date(cacheData.timestamp).getTime();
            
            if (age > cacheDuration) {
                localStorage.removeItem(key);
                counter++;
                // console.log(`[Cache CLEAN] ${key} (${cacheType}): ${Math.round(age/1000)}s old`);
            }
        } catch (error) {
            // Ignorar errores en elementos individuales
            continue;
        }
    }
    
    if (counter > 0) {
        console.log(`[Cache] Limpiados ${counter} elementos expirados`);
    }
    return counter;
}

/**
 * Obtiene información sobre el uso del caché
 */
function getCacheStats() {
    const stats = {
        totalItems: 0,
        totalSize: 0,
        byType: {},
        expired: 0
    };
    
    const now = Date.now();
    
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const item = localStorage.getItem(key);
        
        try {
            const cacheData = JSON.parse(item);
            if (cacheData.timestamp) {
                stats.totalItems++;
                stats.totalSize += item.length;
                
                const cacheType = cacheData.type || 'unknown';
                if (!stats.byType[cacheType]) {
                    stats.byType[cacheType] = { count: 0, size: 0, expired: 0 };
                }
                
                stats.byType[cacheType].count++;
                stats.byType[cacheType].size += item.length;
                
                const cacheDuration = CACHE_DURATIONS[cacheType] || CACHE_DURATIONS.default;
                const age = now - new Date(cacheData.timestamp).getTime();
                
                if (age > cacheDuration) {
                    stats.expired++;
                    stats.byType[cacheType].expired++;
                }
            }
        } catch {
            // No es parte del caché
        }
    }
    
    // Convertir tamaño a KB
    stats.totalSizeKB = (stats.totalSize / 1024).toFixed(2);
    for (let type in stats.byType) {
        stats.byType[type].sizeKB = (stats.byType[type].size / 1024).toFixed(2);
    }
    
    return stats;
}

// Exportar funciones para uso global
window.cacheManager = {
    get: getCachedDataSmart,
    set: setCachedDataSmart,
    clean: cleanExpiredCache,
    stats: getCacheStats,
    durations: CACHE_DURATIONS
};
