# VallaBus — Architecture Decisions (ADR ligero)

Este documento recoge decisiones técnicas estables para que futuros cambios (humanos o LLM) mantengan coherencia.

## ADR-001 — Arquitectura estática vanilla JS
- Estado: Aceptada
- Contexto: Proyecto web/PWA con foco en bajo coste operativo y despliegue simple.
- Decisión: Mantener HTML/CSS/JS vanilla sin pipeline de build obligatorio y migrar gradualmente a ES Modules nativos.
- Consecuencia: Alta simplicidad de hosting; el entry point modular mejora los límites de código, pero los scripts clásicos siguen requiriendo disciplina de orden hasta completar la migración.

## ADR-002 — API con fallback obligatorio
- Estado: Aceptada
- Contexto: Dependencia crítica de datos en tiempo real.
- Decisión: Toda llamada de dominio de transporte debe pasar por `fetchApi()` con fallback principal→secundario.
- Consecuencia: Mayor resiliencia ante caída parcial; aumenta necesidad de pruebas de degradación.

## ADR-003 — Estado cliente en localStorage
- Estado: Aceptada
- Contexto: Necesidad de persistencia sin backend de usuario/autenticación.
- Decisión: Guardar preferencias y seguimiento en `localStorage`.
- Consecuencia: UX persistente y simple; se requiere compatibilidad hacia atrás de claves y migraciones al renombrar.

## ADR-004 — Caché inteligente por tipo de dato
- Estado: Aceptada
- Contexto: Equilibrar rendimiento, consumo de red y frescura de datos.
- Decisión: `window.cacheManager` con TTL por categoría (`busStops`, `alerts`, `busInfo`, etc.).
- Consecuencia: Menos latencia y coste de red; exige revisar TTL si cambian frecuencias de actualización.

## ADR-005 — PWA con Service Worker de notificaciones
- Estado: Aceptada
- Contexto: Uso móvil intensivo, instalación PWA y notificaciones push; los horarios dependen siempre de APIs remotas.
- Decisión: Mantener `manifest.json` + `service-worker.js` para ciclo de vida y Push, sin interceptar `fetch` ni precachear la aplicación.
- Consecuencia: La app no promete funcionamiento offline y evita servir datos/assets obsoletos; los cambios de comportamiento del worker activan una nueva versión del propio script.

## ADR-011 — CSS funcional con agregador ordenado
- Estado: Aceptada
- Contexto: `css/style.css` había crecido hasta mezclar shell, mapa, diálogos, banners y colores de líneas.
- Decisión: Mantener `css/style.css` como agregador `@import` de doce bloques funcionales contiguos, conservando su orden original de cascada.
- Consecuencia: Los estilos se pueden mantener por dominio sin introducir un preprocesador; cualquier reordenación requiere regresión visual en navegador.

## ADR-012 — Regresión de navegador con Playwright sin npm
- Estado: Aceptada
- Contexto: Los cambios de Service Worker, CSS y módulos afectan a interacción y carga real; los tests unitarios no cubren el contrato visual ni el flujo de datos remoto.
- Decisión: Mantener una suite Playwright en `tests/browser_smoke.py`, ejecutable con Python y sin introducir `package.json`, que arranca un servidor local temporal y consulta la API remota real.
- Consecuencia: Cada fase puede validarse en Chromium con un comando reproducible; el flujo live depende de que la API pública y la combinación de parada/línea configurada estén disponibles.

## ADR-006 — Mapa Leaflet como estándar
- Estado: Aceptada
- Contexto: Necesidad de visualizar posiciones/rutas y geocodificación.
- Decisión: Leaflet + Control.Geocoder como base de cartografía.
- Consecuencia: Dependencia de proveedores de teselas/geocoding permitidos por CSP.

## ADR-007 — Micrositios desacoplados por carpeta
- Estado: Aceptada
- Contexto: Casos de uso diferentes (informes, reclamaciones, campañas, migración) con ciclos propios.
- Decisión: Mantener cada micrositio en carpeta dedicada con assets y scripts propios.
- Consecuencia: Menos interferencia entre dominios funcionales; a cambio, posible duplicidad de estilos/scripts.

## ADR-008 — Instrumentación Matomo transversal
- Estado: Aceptada
- Contexto: Medir uso y campañas sin dependencia de terceros comerciales.
- Decisión: Matomo en app principal y micrositios clave.
- Consecuencia: Trazabilidad de uso; cualquier rediseño debe preservar eventos relevantes.

## ADR-009 — Seguridad por CSP estricta + orígenes explícitos
- Estado: Aceptada
- Contexto: Reducir superficie de ataque en app estática con múltiples integraciones externas.
- Decisión: Restringir `script-src`, `connect-src`, `frame-src`, etc. en `index.html`.
- Consecuencia: Mayor seguridad; cualquier nueva integración requiere actualización explícita de CSP.

## ADR-010 — Runbook LLM como parte del código
- Estado: Aceptada
- Contexto: Iteraciones frecuentes con agentes IA.
- Decisión: Mantener documentación operativa en `docs/PROJECT_HANDBOOK.md` + este ADR.
- Consecuencia: Menor coste de onboarding para IA/humanos; se vuelve obligatorio mantener docs al cambiar arquitectura.

## Regla de actualización de ADR
Actualizar este archivo cuando cambie alguna decisión base de:
- Arquitectura global de frontend.
- Estrategia de datos/API/fallback.
- Persistencia y contratos de estado.
- PWA/SW/caché.
- Seguridad/CSP.
- Organización de micrositios.
