# VallaBus — Project Handbook (Source of Truth para IA y humanos)

## 1) Resumen rápido
VallaBus es una PWA web estática (HTML/CSS/JS vanilla) para consultar tiempos de llegada de autobuses en Valladolid y alrededores, con funcionalidades de seguimiento por parada/línea, mapa en tiempo real, alertas/notificaciones y utilidades comunitarias.

Este documento está optimizado para que agentes LLM puedan:
- Entender el producto y su arquitectura sin releer todo el repositorio.
- Identificar rápido dónde tocar según el tipo de cambio.
- Reducir regresiones en flujos críticos (API, render, estado local, PWA, notificaciones).

## 2) Alcance funcional del repositorio

### 2.1 App principal
- Ruta: `/` (archivo [index.html](./index.html)).
- Función: seguimiento de líneas/paradas, tiempos programados/estimados, mapa, avisos, favoritos, tema, instalación PWA.

### 2.2 Micrositios incluidos
- `informes/`: informes mensuales de calidad (puntualidad/frecuencias) con Chart.js y Tailwind CDN.
- `reclama/`: asistente de reclamaciones a AUVASA + visualización de estadísticas.
- `ruedas-biki/`: landing de documentación/reporte ciudadano sobre ruedas defectuosas (iframes externos).
- `import/` y `export/`: migración de datos entre dominios (localStorage serializado en URL base64).
- `buspucela/`: importación de favoritos desde archivo TXT de BusPucela.
- `android/`: redirección a Play Store en Android.
- `privacidad/`: política de privacidad.

## 3) Arquitectura técnica real

### 3.1 Stack
- Frontend: HTML + CSS + JavaScript vanilla (sin framework ni pipeline de build obligatorio).
- Módulos: `js/script.js` es el primer entry point ES Module; el resto de la app mantiene scripts clásicos mientras avanza la migración.
- Mapa: Leaflet + Control.Geocoder.
- Métricas: Matomo (`stats.vallabus.com`).
- PWA: `manifest.json` + `service-worker.js` solo para Push; la aplicación no ofrece modo offline porque depende de APIs remotas.
- Persistencia cliente: `localStorage`.
- CSS principal: `css/style.css` actúa como agregador ordenado de bloques funcionales `css/01-*.css` … `css/12-*.css`.
- Visualización en micrositios: Tailwind CDN, Lucide CDN, Chart.js CDN.

### 3.2 Orden de carga de scripts (app principal)
En [index.html](./index.html):
1. `js/theme-loader.js`
2. `js/matomo.js`
3. `js/cache.js`
4. (al final del body) `js/leaflet/leaflet.js`
5. `js/leaflet/Control.Geocoder.js`
6. `js/utils.js`
7. `js/notifications.js`
8. `js/mapa.js`
9. `js/api.js`
10. `js/buscador.js`
11. `js/favDestinations.js`
12. `js/script.js?v=20260809` (módulo; importa `js/browser.js?v=20260809`)
13. `js/serviceworker-check.js`

Importante: todavía existe acoplamiento por orden global en los scripts clásicos. El entry point modular solo debe ampliarse mediante imports explícitos y cada paso debe probarse en navegador.

### 3.3 Seguridad y políticas
- CSP declarada en `<meta http-equiv="Content-Security-Policy">` de [index.html](./index.html).
- `connect-src` permite APIs de VallaBus, push, stats y Nominatim.
- `frame-src` restringido a dominios permitidos (rutas/guía).

## 4) Flujo principal end-to-end
1. Usuario introduce parada/línea o usa buscador/autocompletado.
2. Validación de existencia con `stopAndLineExist()` en [js/api.js](./js/api.js).
3. Fetch de datos con `fetchApi()` (endpoint principal + fallback automático).
4. Render de lista por parada/línea y estado de tiempos (programado/estimado/actualizado).
5. Render opcional en mapa (vehículos/ruta/paradas) desde módulo de mapa.
6. Refresco automático recurrente de datos (30s) y refresco adicional al recuperar foco/visibilidad.
7. Persistencia de preferencias/seguimiento en `localStorage`.

## 5) APIs y contratos observables

### 5.1 Endpoints base usados
- Principal: `https://gtfs.vallabus.com`
- Fallback: `https://api.vallabus.com`
- Push: `https://push.vallabus.com`
- Stats reclamaciones: `https://datos.vallabus.com/reclamaciones/stats_reclamaciones.json`
- Geocoding: `https://nominatim.openstreetmap.org`

### 5.2 Patrón de fallback
`fetchApi(url)` intenta principal y, ante `!ok` o excepción de red, reintenta sobre fallback.

### 5.3 Estructura esperada de paradas/líneas (consumo)
Forma observada en código:
```json
{
  "parada": { "numero": "string", "nombre": "string" },
  "lineas": {
    "ordinarias": ["string"],
    "poligonos": ["string"],
    "matinales": ["string"],
    "futbol": ["string"],
    "buho": ["string"],
    "universidad": ["string"]
  },
  "ubicacion": { "x": -4.7, "y": 41.6 }
}
```

### 5.4 Side effects relevantes
- Polling periódico de tiempos.
- Suscripción/verificación de push vía Service Worker y backend push.
- Eventos de analytics Matomo en interacciones clave.

## 6) Estado y persistencia (`localStorage`)

### 6.1 Claves funcionales principales
- `busLines`: seguimiento de parada/línea del usuario.
- `fixedStops`: usado en flujo de import/export histórico.
- `theme`: `light|dark` (o auto por ausencia).
- `busNotifications`: líneas/paradas con aviso activo.
- `clientId`: identificador de cliente para push.
- `homeDestination`: destino rápido “Casa”.
- `favoriteDestinations`: destinos rápidos adicionales.
- `hideFavBar`: preferencia UI para ocultar barra de favoritos.
- `ultimaReclamacionFecha`: control de evento diario en `reclama`.

### 6.2 Caché inteligente
Módulo: [js/cache.js](./js/cache.js) vía `window.cacheManager`.
Duraciones definidas por tipo (ejemplos):
- `busStops`: 24h
- `stopNames` / `stopGeo`: 7 días
- `alerts`: 5 min
- `busInfo`: 30s
- `bikeStops`: 5 min
- `default`: 1h

## 7) Mapa de módulos (app principal)
- [js/script.js](./js/script.js): bootstrap principal, eventos globales, intervalos, UI principal, overlays, routing hooks.
- [js/api.js](./js/api.js): acceso a API, fallback, validaciones parada/línea, carga de datos de paradas/alertas/vehículos.
- [js/buscador.js](./js/buscador.js): autocompletado, cercanas por geolocalización, sugerencias de línea.
- [js/mapa.js](./js/mapa.js): rendering Leaflet, capas, marcadores, rutas y visualización de vehículos.
- [js/notifications.js](./js/notifications.js): permisos, suscripción push, registro de notificaciones de llegada.
- [js/favDestinations.js](./js/favDestinations.js): CRUD destinos rápidos, diálogo con mapa, reorder drag/touch.
- [js/utils.js](./js/utils.js): utilidades compartidas de UI/datos (módulo transversal).
- [js/browser.js](./js/browser.js): módulo de detección iOS y clase de compatibilidad.
- [js/theme-loader.js](./js/theme-loader.js): carga temprana de tema y sincronía con sistema.
- [js/cache.js](./js/cache.js): gestor de caché en localStorage.
- [service-worker.js](./service-worker.js): activación/limpieza de workers antiguos y recepción de push; no intercepta `fetch` ni cachea assets.

## 8) Routing UX, overlays y PWA
- Routing principal de UX por hash (`#/cercanas`, `#/rutas`, etc.) desde handlers de app.
- Overlays con estado de cierre persistido en localStorage.
- PWA:
  - Manifest: [manifest.json](./manifest.json)
  - SW registro: [js/serviceworker-check.js](./js/serviceworker-check.js)
  - SW lógica: [service-worker.js](./service-worker.js)
  - Estrategia: worker de notificaciones sin caché de aplicación; si no hay red, las consultas remotas no están disponibles.
- Instalación:
  - Prompt estándar (`beforeinstallprompt`) en web.
  - Botón/flujo iOS específico en UI.
  - Redirección Android Play Store en `android/`.

## 9) Seguridad, privacidad y confianza de datos
- CSP restringe orígenes de script/connect/frame.
- El flujo `import/` depende de `document.referrer === 'https://auvasatracker.com/'` para aceptar importación automática.
- Datos de geolocalización se usan para funcionalidad local (cercanas/mapa); revisar siempre permisos UX y fallback sin ubicación.

## 10) Guía de contribución para agentes (dónde tocar)

### 10.1 Si cambias API o payload
- Tocar: `js/api.js` (+ consumidores en `js/script.js`, `js/mapa.js`, `js/buscador.js`).
- Verificar: fallback activo, parseo robusto, estados vacíos, UI de error.

### 10.2 Si cambias mapa
- Tocar: `js/mapa.js` (+ bloque funcional correspondiente en `css/04-status-nearby-map.css` o `css/05-transit-details.css` si aplica).
- Verificar: tema claro/oscuro, rendimiento en móvil, cierre correcto de mapa.

### 10.3 Si cambias notificaciones
- Tocar: `js/notifications.js`, `service-worker.js`.
- Verificar: permisos denegados, re-suscripción, limpieza de notificaciones locales.

### 10.4 Si cambias onboarding/inputs
- Tocar: `index.html`, `js/buscador.js`, `js/script.js`.
- Verificar: teclado móvil, accesibilidad táctil, autocompletado, validaciones.

### 10.5 Si cambias micrositios
- `informes/*`: `index.html` + `script.js` + `data/*.json` por mes.
- `reclama/index.html`: formulario y lógica inline JS.
- `ruedas-biki/*`: iframes, CTAs y tracking.
- `import/export`: compatibilidad de migración de datos y referrer.

## 11) Riesgos frecuentes
- Romper el orden de scripts globales en `index.html`.
- Cambiar nombres/estructura de claves `localStorage` sin migración.
- Introducir llamadas API sin pasar por fallback.
- Degradar UX móvil (targets pequeños, scroll bloqueado, overlays invasivos).
- Cambiar el entry point modular sin actualizar su query de versión (`?v=YYYYMMDD`) en despliegues estáticos.
- Reordenar los imports CSS o convertir un bloque en módulo sin repetir la matriz de pruebas de navegador.

## 12) Checklist antes de PR
- [ ] Flujo añadir parada/línea sigue operativo.
- [ ] Refresco automático y refresco al volver a foco/visibilidad siguen activos.
- [ ] Fallback API comprobado o no afectado.
- [ ] Mapa funciona en claro/oscuro y en móvil.
- [ ] El Service Worker se registra para Push y no intercepta las peticiones API.
- [ ] No se rompió PWA/manifest.
- [ ] Claves de localStorage documentadas si hubo cambios.
- [ ] Si tocaste micrositios, se revisaron sus enlaces y recursos externos.
- [ ] `python3 tests/browser_smoke.py` pasa en Chromium real.

### 12.1) Pruebas reales de navegador (Playwright)

La regresión funcional de la app principal vive en [tests/browser_smoke.py](../tests/browser_smoke.py). No requiere `package.json`, npm ni ESLint: usa la instalación de Python Playwright disponible en el entorno y arranca un servidor HTTP temporal para servir el repositorio.

Ejecutar desde la raíz:

```bash
python3 tests/browser_smoke.py
```

La suite consulta la API remota real y comprueba en Chromium 14 flujos:

1. Arranque sin errores de runtime, entrypoint ES Module, agregador CSS y registro del Service Worker sin `fetch`/`respondWith`.
2. Apertura/cierre del menú y cambio de temas.
3. Flujo end-to-end de parada → sugerencia de línea → tarjeta con datos → mapa, geometría de ruta, paradas Leaflet, estado de ubicación y cierre.
4. Horarios programados, selector de fecha y cierre del diálogo.
5. Contador de avisos generales: solo cuenta avisos sin parada ni línea y coincide con los avisos renderizados.
6. Selección múltiple de líneas, rechazo de duplicados y borrado de todas las líneas.
7. Destinos rápidos: validación de Casa, alta desde mapa, persistencia, ocultar/mostrar barra, planificador y borrado.
8. Guardar Casa y reordenar favoritos con drag & drop, manteniendo Casa en primera posición.
9. Paradas cercanas con permiso de geolocalización, mapa, añadir una línea y cierre.
10. Planificador de rutas desde la pantalla inicial.
11. Diálogos de datos/estado y descarga de exportación JSON.
12. Rutas hash directas para horarios, datos y estado.
13. Importación JSON mediante `file chooser`, confirmación, persistencia y navegación de vuelta.
14. Fijar una parada, desplegar el lateral de una línea, consultar próximos horarios y borrar la línea desde ese lateral.

El flujo live usa por defecto parada `666` y línea `2`. Se puede seleccionar otra combinación estable para el entorno con `--stop`/`--line` o las variables `VALLABUS_TEST_STOP`/`VALLABUS_TEST_LINE`. Para iterar sobre un flujo concreto, añadir `--case <nombre>` (se puede repetir). Si falla una prueba se guarda una captura en `screenshots/playwright/`.

Si Chromium aún no está instalado para Playwright, hacerlo una vez (fuera del repositorio):

```bash
python3 -m playwright install chromium
```

## 13) Runbook de iteración LLM

### 13.1 Prompt mínimo recomendado para nuevas iteraciones
Usar este contexto base:
```text
Proyecto: VallaBus (PWA estática vanilla JS).
Lee docs/PROJECT_HANDBOOK.md y docs/ARCHITECTURE_DECISIONS.md antes de proponer cambios.
Mantén fallback API, claves localStorage y orden de scripts globales.
Prioriza UX móvil, accesibilidad táctil y no romper micrositios.
```

### 13.2 Secuencia mínima de lectura (3-5 archivos)
Para tareas comunes:
1. [docs/PROJECT_HANDBOOK.md](./docs/PROJECT_HANDBOOK.md)
2. [index.html](./index.html)
3. [js/script.js](./js/script.js)
4. [js/api.js](./js/api.js)
5. Archivo del subsistema objetivo (`js/mapa.js`, `js/notifications.js`, `reclama/index.html`, etc.)

### 13.3 Playbooks rápidos
- Añadir feature UI principal:
  - Ajustar HTML en `index.html`.
  - Registrar eventos en `js/script.js`/`js/buscador.js`.
  - Persistir en localStorage solo si aporta valor real.
- Tocar API:
  - Centralizar llamada en `js/api.js`.
  - Mantener fallback y manejo de `!ok`.
  - Propagar cambios al render.
- Tocar mapa:
  - Modificar `js/mapa.js`.
  - Revisar capas por tema y rendimiento móvil.
- Tocar notificaciones:
  - Ajustar `js/notifications.js` + `service-worker.js`.
  - Verificar permisos y suscripción existente.
- Tocar micrositios:
  - Cambiar solo carpeta específica.
  - Validar tracking y enlaces de retorno a `/?mtm_campaign=...`.

## 14) Glosario de dominio
- Parada: identificador numérico de punto de subida.
- Línea: servicio de bus asociado a una parada.
- Programado: hora teórica planificada del paso.
- Estimado: hora calculada en tiempo real.
- Actualizado: dato reciente confirmado del feed.
- Incidencia/alerta: aviso de servicio para líneas/paradas.
- Destinos rápidos: ubicaciones guardadas por usuario para rutas frecuentes.
- Cercanas: paradas próximas por geolocalización.

## 15) Mantenimiento de esta documentación
Actualizar este handbook cuando cambie cualquiera de estos subsistemas:
- Arquitectura de scripts/carga global.
- Frontera de módulos ES y versionado de entry points.
- Orden y ownership de los bloques CSS funcionales.
- Endpoints base o contratos de datos.
- Claves `localStorage` y políticas de caché.
- Flujos de mapa, notificaciones o PWA.
- Estructura funcional de micrositios.
