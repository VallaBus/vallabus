#!/usr/bin/env python3
"""Real-browser regression checks for VallaBus.

The project intentionally has no npm manifest.  This suite uses the Python
Playwright installation already available in the development environment and
starts a disposable static HTTP server for the app.  The API remains the real
remote API: that is part of the product contract and is deliberately not
mocked here.

Run from the repository root with:

    python3 tests/browser_smoke.py

The stop and line used by the live flow can be changed with
``VALLABUS_TEST_STOP`` and ``VALLABUS_TEST_LINE``.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
import threading
import traceback
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Callable, List, Optional, Tuple

from playwright.sync_api import Browser, Error as PlaywrightError
from playwright.sync_api import Page, Playwright, sync_playwright


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_STOP = os.environ.get("VALLABUS_TEST_STOP", "666")
DEFAULT_LINE = os.environ.get("VALLABUS_TEST_LINE", "2")
CSS_BLOCKS = [
    "01-foundation-shell.css",
    "02-favorites-welcome.css",
    "03-stops-lines.css",
    "04-status-nearby-map.css",
    "05-transit-details.css",
    "06-banners.css",
    "07-footer-feedback.css",
    "08-overlays.css",
    "09-theme-dialogs.css",
    "10-responsive.css",
    "11-line-colors.css",
    "12-guide.css",
]


class QuietRequestHandler(SimpleHTTPRequestHandler):
    """Serve the repository without polluting test output with access logs."""

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002
        return


class AppServer:
    def __init__(self) -> None:
        handler = partial(QuietRequestHandler, directory=str(ROOT))
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    @property
    def base_url(self) -> str:
        return "http://127.0.0.1:%d" % self.server.server_port

    def start(self) -> None:
        self.thread.start()

    def close(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)


class BrowserPage:
    def __init__(self, page: Page, close_context: Callable[[], None]) -> None:
        self.page = page
        self.errors: List[str] = []
        self.console_errors: List[str] = []
        self._close_context = close_context

    def close(self) -> None:
        self._close_context()


def open_app(browser: Browser, base_url: str, timeout_ms: int) -> BrowserPage:
    context = browser.new_context(
        viewport={"width": 390, "height": 844},
        service_workers="allow",
        geolocation={"latitude": 41.652251, "longitude": -4.724532},
        permissions=["geolocation"],
    )
    # Every case starts from a clean app state.  This only affects the
    # disposable test context, never the developer's browser profile.
    context.add_init_script(
        """if (sessionStorage.getItem('__vallabus_test_clean') !== '1') {
            localStorage.clear();
            sessionStorage.setItem('__vallabus_test_clean', '1');
        }
        localStorage.setItem('vallabus.rideTrackingOnboarding.v1', 'seen');"""
    )
    page = context.new_page()
    result = BrowserPage(page, context.close)
    page.set_default_timeout(timeout_ms)
    page.on("pageerror", lambda error: result.errors.append(str(error)))
    page.on(
        "console",
        lambda message: result.console_errors.append(message.text)
        if message.type == "error"
        else None,
    )
    page.goto(base_url + "/", wait_until="domcontentloaded", timeout=timeout_ms)
    page.wait_for_selector("#stopNumber", state="visible", timeout=timeout_ms)
    return result


def select_stop(page: Page, stop_number: str, timeout_ms: int) -> None:
    """Select a stop through the public autocomplete control."""
    page.locator("#stopNumber").fill(stop_number)
    page.wait_for_selector(
        "#autocompleteResults .autocomplete-result", state="visible", timeout=timeout_ms
    )
    first_stop = page.locator("#autocompleteResults .autocomplete-result").first
    assert stop_number in first_stop.inner_text(), "La búsqueda no devuelve la parada solicitada"
    first_stop.click()
    assert page.locator("#stopNumber").input_value() == stop_number


def add_line_to_list(page: Page, stop_number: str, line_number: str, timeout_ms: int):
    """Use the public search form and wait for the fully rendered line card."""
    select_stop(page, stop_number, timeout_ms)

    page.locator("#lineNumber").click()
    page.wait_for_selector("#lineSuggestions .line-suggestion", state="visible", timeout=timeout_ms)
    suggestion = page.locator("#lineSuggestions .line-suggestion").filter(
        has_text=re.compile(r"^\s*" + re.escape(line_number) + r"\s*$")
    )
    assert suggestion.count() > 0, "La parada no ofrece la línea configurada para la prueba"
    suggestion.first.click()
    assert page.locator("#lineNumber").input_value() == line_number

    page.locator("#addButton").click()
    card = page.locator('[id="%s-%s"]' % (stop_number, line_number))
    page.wait_for_selector('[id="%s-%s"] .linea h3' % (stop_number, line_number), timeout=timeout_ms)
    page.wait_for_selector(
        '[id="%s-%s"] .additional-info-panel' % (stop_number, line_number),
        state="attached",
        timeout=timeout_ms,
    )
    assert card.locator(".linea h3").inner_text().strip() == line_number
    return card


def create_favorite_from_map(page: Page, name: str, timeout_ms: int) -> None:
    """Create one quick destination through the visible Leaflet map."""
    page.locator("#addFavoriteButton").click()
    page.wait_for_function("() => document.querySelector('#favoriteDialog').style.display === 'block'")
    page.locator("#favoriteName").fill(name)
    favorite_map = page.locator("#favoriteMapContainer")
    page.wait_for_selector(
        "#favoriteMapContainer.leaflet-container", state="attached", timeout=timeout_ms
    )
    box = favorite_map.bounding_box()
    assert box and box["width"] > 0 and box["height"] > 0, "El mapa de favoritos no tiene tamaño"
    page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    page.wait_for_function(
        """() => Boolean(document.querySelector('#favoriteLat').value &&
                          document.querySelector('#favoriteLon').value)""",
        timeout=timeout_ms,
    )
    page.locator("#favoriteAcceptButton").click()
    page.wait_for_function("() => document.querySelector('#favoriteDialog').style.display !== 'block'")
    assert page.locator("#fav-destinations li").filter(has_text=name).count() == 1


def assert_no_browser_errors(result: BrowserPage) -> None:
    problems = result.errors + ["console.error: " + item for item in result.console_errors]
    if problems:
        raise AssertionError("El navegador registró errores:\n- " + "\n- ".join(problems))


def test_boot_contract(result: BrowserPage, base_url: str, timeout_ms: int) -> None:
    page = result.page
    assert page.title().startswith("VallaBus"), "El título de la aplicación no se cargó"
    assert page.locator("#welcome-box").is_visible(), "No aparece la pantalla inicial"

    scripts = page.locator("script").evaluate_all(
        """elements => elements.map(element => ({
            src: element.getAttribute('src'),
            type: element.getAttribute('type')
        }))"""
    )
    app_scripts = [item for item in scripts if item["src"] and "script.js" in item["src"]]
    assert len(app_scripts) == 1, "Debe existir un único entrypoint script.js"
    assert app_scripts[0]["type"] == "module", "script.js debe cargarse como módulo"
    assert not any(item["src"] and "browser.js" in item["src"] for item in scripts), (
        "browser.js no debe cargarse como script independiente"
    )

    style = page.evaluate(
        "() => fetch('/css/style.css', {cache: 'no-store'}).then(response => response.text())"
    )
    positions = [style.index('"' + block + '"') for block in CSS_BLOCKS]
    assert positions == sorted(positions), "El agregador CSS no conserva el orden funcional"
    assert len(style.splitlines()) < 40, "style.css debe ser solo el agregador de imports"

    # Registration is asynchronous and happens from serviceworker-check.js.
    page.wait_for_function(
        """async () => {
            try {
                const registration = await navigator.serviceWorker.ready;
                return Boolean(registration && registration.active);
            } catch (_) {
                return false;
            }
        }"""
    )
    worker_url = page.evaluate(
        """async () => (await navigator.serviceWorker.ready).active.scriptURL"""
    )
    assert worker_url.endswith("/service-worker.js"), "No se activó el service worker de la app"
    worker_source = page.evaluate(
        "() => fetch('/service-worker.js', {cache: 'no-store'}).then(response => response.text())"
    )
    assert "addEventListener('fetch'" not in worker_source
    assert "respondWith" not in worker_source
    assert "cache.addAll" not in worker_source

    assert_no_browser_errors(result)


def test_menu_and_theme(result: BrowserPage) -> None:
    page = result.page
    page.locator("#menuButton").click()
    assert page.locator("#sidebar.sidebar-open").count() == 1, "El menú lateral no se abre"
    page.locator("#menuButton").click()
    assert page.locator("#sidebar.sidebar-open").count() == 0, "El menú lateral no se cierra"

    page.locator("#theme-toggle").click()
    assert page.evaluate("() => localStorage.getItem('theme')") == "dark"
    assert page.locator("html.dark-mode").count() == 1, "No se aplica el tema oscuro"

    page.locator("#theme-toggle").click()
    assert page.evaluate("() => localStorage.getItem('theme')") == "light"
    assert page.locator("html.dark-mode").count() == 0, "No se puede volver al tema claro"
    assert_no_browser_errors(result)


def test_global_alert_count(result: BrowserPage) -> None:
    page = result.page
    snapshot = page.evaluate(
        """() => {
            const fixture = [
                {ruta: {parada: null, linea: null}, descripcion: 'Global 1'},
                {ruta: {parada: '666', linea: null}, descripcion: 'Solo parada'},
                {ruta: {parada: null, linea: 2}, descripcion: 'Línea 2'},
                {ruta: {parada: null, linea: null}, descripcion: 'Global 2'},
            ];
            const globalAlerts = filterBusAlerts(fixture, null);
            const lineAlerts = filterBusAlerts(fixture, '2');
            displayGlobalAlertsBanner(globalAlerts);
            return {
                filtered: globalAlerts.length,
                lineAlerts: lineAlerts.map(alert => alert.descripcion),
                title: document.querySelector('.global-alert-title')?.textContent || '',
                rendered: Array.from(document.querySelectorAll('#globalAlertsBox .alert-text-container'))
                    .map(element => element.textContent.replace('🞃', '').trim()),
            };
        }"""
    )
    assert snapshot == {
        "filtered": 2,
        "lineAlerts": ["Línea 2"],
        "title": "Mostrar avisos generales (2)",
        "rendered": ["Global 1", "Global 2"],
    }
    assert_no_browser_errors(result)


def test_line_alert_dialog_persists(result: BrowserPage, timeout_ms: int) -> None:
    page = result.page

    live_alert = page.evaluate(
        """async () => {
            const response = await fetch('https://gtfs.vallabus.com/alertas/', {cache: 'no-store'});
            if (!response.ok) {
                throw new Error(`El API de avisos devuelve HTTP ${response.status}`);
            }
            const alerts = await response.json();
            const alert = alerts.find(item => item?.ruta?.linea != null && item?.ruta?.parada != null);
            if (!alert) {
                return null;
            }
            return {
                stop: String(alert.ruta.parada),
                line: String(alert.ruta.linea),
                description: String(alert.descripcion || ''),
            };
        }"""
    )
    assert live_alert, "El API no ofrece un aviso asociado a una línea y parada"
    stop_number = live_alert["stop"]
    line_number = live_alert["line"]
    description = live_alert["description"]

    card = add_line_to_list(page, stop_number, line_number, timeout_ms)
    page.wait_for_function(
        """selector => document.querySelector(selector)?.querySelector('.alert-icon')?.textContent.includes('⚠️')""",
        arg='[id="%s-%s"]' % (stop_number, line_number),
        timeout=timeout_ms,
    )
    alert_icon = card.locator(".alert-icon")
    assert "⚠️" in alert_icon.inner_text(), "La tarjeta no muestra el icono del aviso"

    alert_icon.click()
    page.wait_for_function(
        "() => document.querySelector('#lineAlertsDialog').style.display === 'flex'",
        timeout=timeout_ms,
    )
    dialog = page.locator("#lineAlertsDialog")
    assert dialog.locator("#lineAlertsDialogTitle").inner_text() == (
        "Avisos para la línea " + line_number
    )
    dialog_text = dialog.locator("#lineAlertsDialogList").inner_text()
    description_sections = [
        section.strip()
        for section in re.split(r"\s+-\s+(?=[^:\n]{1,80}:\s*)", description)
        if section.strip()
    ]
    assert all(section in dialog_text for section in description_sections)
    assert dialog.locator(".line-alert-item").count() > 0
    assert dialog.locator(".line-alert-dialog-header").count() == 1
    assert dialog.locator(".line-alert-line").count() == 1
    assert page.locator("#lineAlertsDialog").count() == 1
    assert card.locator(".alert-box").count() == 0, (
        "La tarjeta no debe contener diálogos de avisos dinámicos"
    )

    # Fuerza una actualización real de la línea, con una nueva lectura del
    # endpoint de avisos y del endpoint de tiempos de la aplicación.
    page.evaluate(
        """async ({stop, line}) => {
            const response = await fetch('https://gtfs.vallabus.com/alertas/', {cache: 'no-store'});
            const alerts = await response.json();
            await fetchBusTime(stop, line, document.getElementById(`${stop}-${line}`), alerts);
        }""",
        arg={"stop": stop_number, "line": line_number},
    )
    page.wait_for_function(
        "() => document.querySelector('#lineAlertsDialog').style.display === 'flex'",
        timeout=timeout_ms,
    )
    dialog_text = dialog.locator("#lineAlertsDialogList").inner_text()
    assert all(section in dialog_text for section in description_sections)
    assert dialog.locator("#lineAlertsDialogList li").count() > 0
    assert card.locator(".alert-box").count() == 0

    dialog.locator("#lineAlertsDialogClose").click()
    page.wait_for_function(
        "() => document.querySelector('#lineAlertsDialog').style.display === 'none'",
        timeout=timeout_ms,
    )
    assert_no_browser_errors(result)


def test_live_search_line_and_map(
    result: BrowserPage, stop_number: str, line_number: str, timeout_ms: int
) -> None:
    page = result.page
    card = add_line_to_list(page, stop_number, line_number, timeout_ms)

    # A line card is the data surface the user asked about: it must expose the
    # destination/status panel and open the live-map dialog on click.
    assert card.locator(".trip-info").count() == 1, "La tarjeta de línea no muestra sus datos"
    # The card contains a nested additional-info panel whose click handler
    # intentionally stops propagation.  Clicking its line heading mirrors the
    # user gesture while guaranteeing the line-card map handler receives it.
    card.locator(".linea h3").click()
    page.wait_for_selector("#mapContainer.show", state="visible", timeout=timeout_ms)
    assert "#/mapa/" in page.url, "El clic de la línea no actualiza la ruta del mapa"
    assert page.locator("#busMap").count() == 1, "No se creó el contenedor del mapa"
    assert page.locator("#mapContainer .map-close").is_visible(), "El mapa no ofrece cierre"
    # No basta con que aparezca el panel: updateBusMap debe haber cargado la
    # geometría de la línea y las paradas de ese viaje en Leaflet.
    line_class = "linea-" + line_number
    page.wait_for_function(
        """lineClass => {
            const map = document.querySelector('#busMap');
            const markers = map && map.querySelectorAll('.leaflet-marker-icon').length;
            const route = map && Array.from(map.querySelectorAll('.leaflet-overlay-pane path'))
                .some(path => path.classList.contains(lineClass));
            return markers > 0 && route;
        }""",
        arg=line_class,
        timeout=timeout_ms,
    )
    assert page.locator("#busMap .leaflet-marker-icon").count() > 0, (
        "El mapa no cargó las paradas/marcadores del viaje"
    )
    assert page.locator("#busMap .ride-map-marker--board").count() == 1, (
        "La parada de subida no usa el marcador de usuario/parada"
    )
    assert page.locator("#busMap .leaflet-overlay-pane path.%s" % line_class).count() > 0, (
        "El mapa no cargó la geometría de la ruta"
    )
    assert page.locator("#busMapLastUpdate").inner_text().strip(), (
        "El mapa no muestra el estado de ubicación"
    )

    # Si hay un bus en tiempo real, el popup muestra la matrícula/identificador
    # y su cierre usa internamente el enlace `#close` de Leaflet. Si el API no
    # tiene ningún bus activo en ese instante, se valida explícitamente el
    # estado sin datos y se mantiene el resto de la prueba del mapa.
    bus_markers = page.locator("#busMap .bus-icon")
    if bus_markers.count() > 0:
        bus_markers.first.click()
        page.wait_for_selector("#busMap .leaflet-popup", state="visible", timeout=timeout_ms)
        popup = page.locator("#busMap .leaflet-popup")
        has_vehicle_info = popup.locator(".matricula, .vehicle-id").count() > 0
        assert has_vehicle_info or "Sin info del vehículo" in popup.inner_text(), (
            "El popup del bus no muestra la matrícula ni un estado de vehículo"
        )
        popup.locator(".leaflet-popup-close-button").click()
        page.wait_for_function(
            """() => !document.querySelector('#busMap .leaflet-popup') &&
                      document.querySelector('#mapContainer').classList.contains('show')""",
            timeout=timeout_ms,
        )
        assert "#/mapa/" in page.url, "Cerrar la matrícula no debe abandonar la ruta del mapa"
    else:
        assert "no hay datos" in page.locator("#busMapLastUpdate").inner_text().lower(), (
            "El mapa no indica por qué no hay marcador de bus"
        )

    page.locator("#mapContainer .map-close").click()
    page.wait_for_function("() => !document.querySelector('#mapContainer').classList.contains('show')")
    assert_no_browser_errors(result)


def test_ride_tracking_entry_points(result: BrowserPage) -> None:
    """The compact panel action and the map action share one tracking entry point."""
    page = result.page
    snapshot = page.evaluate(
        """async () => {
            const received = [];
            const originalStart = window.rideTracking.start;
            window.rideTracking.start = context => received.push(context);

            const arrival = new Date(Date.now() + 120000).toISOString();
            const trackingBus = {
                trip_id: 'mvp-trip',
                scheduled: {
                    tripId: 'mvp-trip',
                    fechaHoraLlegada: arrival,
                    destino: 'Destino MVP'
                },
                realTime: {
                    tripId: 'mvp-trip',
                    vehicleId: 'vehicle-mvp',
                    matricula: '1234-ABC',
                    fechaHoraLlegada: arrival
                }
            };

            const panel = await createInfoPanel([], '666', '2', trackingBus);
            const panelButton = panel.querySelector('.ride-follow-button');
            panelButton.click();

            // Renderiza el estado expandido en una tarjeta real para poder
            // revisar visualmente el nuevo primer botón del panel.
            const preview = document.createElement('div');
            preview.id = 'rideTrackingPreview';
            preview.className = 'line-info';
            preview.innerHTML = `
                <div class="linea"><h3>1</h3></div>
                <div class="trip-info"><div class="ocupacion"></div><div class="ruta"><p class="destino">COVARESA</p><span class="diferencia">retraso 2 min</span></div></div>
                <div class="hora-tiempo"><div class="tiempo">2 <p>min</p></div><div class="horaLlegada">19:06</div></div>
            `;
            preview.appendChild(panel);
            document.body.appendChild(preview);
            panel.classList.add('open');
            await new Promise(resolve => requestAnimationFrame(resolve));

            window.rideTracking.setMapContext({
                tripId: 'map-trip',
                lineNumber: '2',
                stopNumber: '666',
                stopName: 'Parada MVP',
                stopLatitud: 41.652,
                stopLongitud: -4.724
            });
            const mapButton = document.querySelector('#mapFollowButton');
            mapButton.click();

            const originalOpenTripMap = window.openTripMap;
            const rowMapContexts = [];
            window.openTripMap = context => rowMapContexts.push(context);
            const rowArrival = '2030-01-01T20:10:00.000Z';
            const row = document.createElement('div');
            row.className = 'line-info';
            row.innerHTML = `
                <div class="linea" data-trip-id="row-trip"><h3>2</h3></div>
                <div class="trip-info"><div class="ocupacion"></div><div class="ruta"><p class="destino">Destino fila</p></div></div>
                <div class="hora-tiempo"><div class="tiempo">3 <p>min</p></div><div class="horaLlegada">20:10</div></div>
            `;
            document.body.appendChild(row);
            addEventListeners(row, {
                parada: [{latitud: 41.652, longitud: -4.724, parada: 'Parada fila'}],
                lineas: [{linea: '2', horarios: [{trip_id: 'row-trip', fechaHoraLlegada: rowArrival, destino: 'Destino fila'}]}]
            }, '2', '666');
            row.dispatchEvent(new MouseEvent('click', {bubbles: true}));
            row.remove();
            window.openTripMap = originalOpenTripMap;

            window.rideTracking.start = originalStart;
            await new Promise(resolve => setTimeout(resolve, 650));
            return {
                panelText: panelButton.textContent.trim(),
                panelLabel: panelButton.getAttribute('aria-label'),
                mapVisible: !mapButton.hidden,
                receivedTrips: received.map(context => context.tripId),
                rowArrivalTime: rowMapContexts[0]?.arrivalTime || ''
            };
        }"""
    )
    page.locator('#rideTrackingPreview').screenshot(path="/tmp/vallabus-ride-panel.png")
    page.locator('#rideTrackingPreview').evaluate("element => element.remove()")
    assert snapshot["panelText"] == "Seguir"
    assert snapshot["panelLabel"].startswith("Seguir bus de las ")
    assert snapshot["panelLabel"].endswith(" hacia Destino MVP")
    assert snapshot["mapVisible"] is True
    assert snapshot["receivedTrips"] == ["mvp-trip", "map-trip"]
    assert snapshot["rowArrivalTime"] == "2030-01-01T20:10:00.000Z"
    assert_no_browser_errors(result)


def test_ride_tracking_onboarding(result: BrowserPage) -> None:
    """The first-time experience teaches the real action once and can start it."""
    page = result.page
    page.set_viewport_size({"width": 430, "height": 897})
    snapshot = page.evaluate(
        """async () => {
            window.rideTrackingOnboarding.reset();
            window.__rideOnboardingReceived = [];
            window.__rideOnboardingOriginalStart = window.rideTracking.start;
            window.rideTracking.start = context => window.__rideOnboardingReceived.push(context);
            const arrival = new Date(Date.now() + 120000).toISOString();
            const panel = await createInfoPanel([], '1043', '1', {
                trip_id: 'onboarding-trip',
                scheduled: {
                    tripId: 'onboarding-trip',
                    fechaHoraLlegada: arrival,
                    destino: 'B. España'
                }
            });
            const preview = document.createElement('div');
            preview.id = 'rideOnboardingPreview';
            preview.className = 'line-info';
            preview.style.cssText = 'position:fixed;left:16px;right:16px;top:160px;z-index:1200;background:#fff;';
            preview.innerHTML = `
                <div class="linea"><h3>1</h3></div>
                <div class="trip-info"><div class="ruta"><p class="destino">B. ESPAÑA</p></div></div>
                <div class="hora-tiempo"><div class="tiempo">2 <p>min</p></div></div>`;
            preview.appendChild(panel);
            document.body.appendChild(preview);
            panel.querySelector('.arrow-button').click();
            await new Promise(resolve => setTimeout(resolve, 620));
            const followRect = panel.querySelector('.ride-follow-button').getBoundingClientRect();
            const spotlightRect = document.querySelector('.ride-onboarding-spotlight').getBoundingClientRect();
            const closeStyles = getComputedStyle(document.querySelector('#rideTrackingClose'));
            const stopStyles = getComputedStyle(document.querySelector('.ride-stop-icon'));
            return {
                title: document.querySelector('#rideOnboardingTitle')?.textContent || '',
                body: document.querySelector('.ride-onboarding > p:not(.ride-onboarding-eyebrow)')?.textContent || '',
                primary: document.querySelector('.ride-onboarding-primary')?.textContent || '',
                secondary: document.querySelector('.ride-onboarding-secondary')?.textContent || '',
                targetAligned: Math.abs((followRect.left - 6) - spotlightRect.left) < 2
                    && Math.abs((followRect.top - 6) - spotlightRect.top) < 2,
                closeSize: [closeStyles.width, closeStyles.height],
                stopSize: [stopStyles.width, stopStyles.height]
            };
        }"""
    )
    page.screenshot(
        path=str(ROOT / "screenshots" / "ride-demo" / "07-onboarding-seguimiento.png"),
        full_page=False,
    )
    page.locator(".ride-onboarding-primary").click()
    after_primary = page.evaluate(
        """() => ({
            seen: localStorage.getItem('vallabus.rideTrackingOnboarding.v1'),
            dialogCount: document.querySelectorAll('.ride-onboarding').length,
            receivedTrip: window.__rideOnboardingReceived?.[0]?.tripId || ''
        })"""
    )
    # The wrapped start recorded the context in the page closure; verify the
    # visible side effects and then exercise the dismissal/no-repeat contract.
    assert snapshot["title"] == "Tu viaje, parada a parada"
    assert snapshot["body"] == "Consulta por dónde va el bus y recibe un aviso antes de llegar a tu destino."
    assert snapshot["primary"] == "Seguir este bus"
    assert snapshot["secondary"] == "Ahora no"
    assert snapshot["targetAligned"] is True
    assert snapshot["closeSize"] == ["44px", "44px"]
    assert snapshot["stopSize"] == ["36px", "36px"]
    assert after_primary["seen"] == "seen"
    assert after_primary["dialogCount"] == 0
    assert after_primary["receivedTrip"] == "onboarding-trip"
    page.evaluate(
        """() => {
            window.rideTrackingOnboarding.reset();
            const button = document.querySelector('#rideOnboardingPreview .ride-follow-button');
            window.rideTrackingOnboarding.consider(button);
        }"""
    )
    page.wait_for_selector(".ride-onboarding", state="visible")
    page.locator(".ride-onboarding-secondary").click()
    page.evaluate(
        """() => window.rideTrackingOnboarding.consider(
            document.querySelector('#rideOnboardingPreview .ride-follow-button')
        )"""
    )
    page.wait_for_timeout(50)
    assert page.locator(".ride-onboarding").count() == 0
    page.evaluate(
        """() => {
            if (window.__rideOnboardingOriginalStart) {
                window.rideTracking.start = window.__rideOnboardingOriginalStart;
            }
            delete window.__rideOnboardingOriginalStart;
            delete window.__rideOnboardingReceived;
            document.querySelector('#rideOnboardingPreview')?.remove();
        }"""
    )
    assert_no_browser_errors(result)


def test_ride_tracking_session(result: BrowserPage, timeout_ms: int) -> None:
    """The foreground MVP can load a route, select a stop and enter onboard state."""
    page = result.page
    page.set_viewport_size({"width": 430, "height": 897})
    route_data = {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": [
                    [-4.7240, 41.6520],
                    [-4.7230, 41.6530],
                    [-4.7220, 41.6540],
                    [-4.7210, 41.6550],
                ],
            },
            "properties": {},
        }],
    }
    stops_data = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [-4.7240, 41.6520]},
                "properties": {"stop_code": "BOARD", "stop_name": "Subida"},
            },
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [-4.7237, 41.6524]},
                "properties": {"stop_code": "NEXT1", "stop_name": "Primera parada"},
            },
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [-4.7234, 41.6527]},
                "properties": {"stop_code": "NEXT2", "stop_name": "Segunda parada"},
            },
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [-4.7220, 41.6540]},
                "properties": {"stop_code": "DEST", "stop_name": "Destino"},
            },
        ],
    }

    page.route(
        "**/v2/geojson/**",
        lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps(stops_data if "/paradas/" in route.request.url else route_data),
        ),
    )

    snapshot = page.evaluate(
        """async () => {
            const originalOpenMap = window.openTripMap;
            const originalLoadBusStops = window.loadBusStops;
            const originalWatchPosition = navigator.geolocation.watchPosition;
            const originalClearWatch = navigator.geolocation.clearWatch;
            let gpsCallback = null;
            let gpsErrorCallback = null;

            window.openTripMap = () => true;
            document.querySelector('#busMapLastUpdate').innerHTML = 'Última ubicación <strong>aproximada</strong>. Actualizada hace 12s';
            window.loadBusStops = async () => [{
                parada: {numero: 'BOARD', nombre: 'Subida'},
                ubicacion: {x: -4.7240, y: 41.6520}
            }];
            navigator.geolocation.watchPosition = (callback, errorCallback) => {
                gpsCallback = callback;
                gpsErrorCallback = errorCallback;
                return 4321;
            };
            navigator.geolocation.clearWatch = () => {};

            try {
                await window.rideTracking.start({
                    tripId: 'mvp-session',
                    lineNumber: '2',
                    stopNumber: 'BOARD',
                    stopName: 'Subida',
                    stopLatitud: 41.6520,
                    stopLongitud: -4.7240,
                    arrivalTime: new Date(Date.now() + 5 * 60000).toISOString()
                });

                await new Promise(resolve => setTimeout(resolve, 150));
                if (gpsErrorCallback) gpsErrorCallback({code: 1});
                const waitingWithGpsError = {
                    status: document.querySelector('#rideTrackingStatus')?.textContent || '',
                    lastUpdate: document.querySelector('#rideTrackingLastUpdate')?.textContent || '',
                    hint: document.querySelector('#rideTrackingLocationHint')?.textContent || '',
                    hintHidden: document.querySelector('#rideTrackingLocationHint')?.hidden
                };
                window.rideTracking.onBusPosition(null, {tripId: 'mvp-session'});
                const waitingWithUnavailableBus = {
                    status: document.querySelector('#rideTrackingStatus')?.textContent || '',
                    hint: document.querySelector('#rideTrackingLocationHint')?.textContent || '',
                    hintHidden: document.querySelector('#rideTrackingLocationHint')?.hidden
                };
                window.rideTracking.onBusPosition({
                    latitud: 41.6520,
                    longitud: -4.7240,
                    timestamp: Date.now()
                }, {tripId: 'mvp-session'});
                const manualWithoutGps = {
                    phase: window.rideTracking.getState().phase,
                    status: document.querySelector('#rideTrackingStatus')?.textContent || '',
                    metric: document.querySelector('#rideTrackingMetricValue')?.textContent || '',
                    button: document.querySelector('#rideBoardButton')?.textContent || '',
                    buttonHidden: document.querySelector('#rideBoardButton')?.hidden
                };
                window.rideTracking.onBusPosition(null, {tripId: 'mvp-session'});
                if (gpsCallback) {
                    gpsCallback({
                        coords: {latitude: 41.6520, longitude: -4.7240, accuracy: 8, speed: 0},
                        timestamp: Date.now()
                    });
                }
                const userMarkerVisible = Boolean(document.querySelector('#busMap .ride-map-marker--user'));

                await new Promise(resolve => setTimeout(resolve, 150));
                const select = document.querySelector('#rideDestinationSelect');
                select.value = 'DEST';
                select.dispatchEvent(new Event('change', {bubbles: true}));
                const destinationMarkerVisible = Boolean(document.querySelector('#busMap .ride-map-marker--destination'));
                window.rideTracking.onBusPosition({
                    latitud: 41.6520,
                    longitud: -4.7240,
                    timestamp: Date.now()
                }, {tripId: 'mvp-session'});
                const beforeBoarding = {
                    phase: window.rideTracking.getState().phase,
                    status: document.querySelector('#rideTrackingStatus')?.textContent || '',
                    button: document.querySelector('#rideBoardButton')?.textContent || '',
                    buttonHidden: document.querySelector('#rideBoardButton')?.hidden
                };
                document.querySelector('#rideBoardButton').click();
                const afterBoarding = {
                    phase: window.rideTracking.getState().phase,
                    status: document.querySelector('#rideTrackingStatus')?.textContent || '',
                    button: document.querySelector('#rideBoardButton')?.textContent || '',
                    buttonHidden: document.querySelector('#rideBoardButton')?.hidden
                };

                window.rideTracking.onBusPosition({
                    latitud: 41.6522,
                    longitud: -4.7238,
                    timestamp: Date.now()
                }, {tripId: 'mvp-session'});

                const onboard = {
                    phase: window.rideTracking.getState().phase,
                    destination: window.rideTracking.getState().destination?.name || '',
                    hasNextStop: Boolean(window.rideTracking.getState().nextStop),
                    panelVisible: !document.querySelector('#rideTrackingPanel').hidden,
                    boardHidden: document.querySelector('#rideBoardButton').hidden,
                    fullMap: document.querySelector('#mapContainer').classList.contains('ride-tracking-active'),
                    userMarkerVisible,
                    destinationMarkerVisible,
                    beforeBoarding,
                    legacyTimelineCount: document.querySelectorAll('.ride-timeline').length,
                    legacyAlertCount: document.querySelectorAll('#rideTrackingDestinationAlert, #rideTrackingAlertDetails').length,
                    status: document.querySelector('#rideTrackingStatus')?.textContent || '',
                    nextStop: document.querySelector('#rideTrackingNextStop')?.textContent || '',
                    remaining: document.querySelector('#rideTrackingRemainingValue')?.textContent || '',
                    metric: document.querySelector('#rideTrackingMetricValue')?.textContent || '',
                    metricLabel: document.querySelector('#rideTrackingMetricLabel')?.textContent || '',
                };

                return {
                    waitingWithGpsError,
                    waitingWithUnavailableBus,
                    manualWithoutGps,
                    onboard,
                    afterBoarding
                };
            } finally {
                window.openTripMap = originalOpenMap;
                window.loadBusStops = originalLoadBusStops;
                navigator.geolocation.watchPosition = originalWatchPosition;
                navigator.geolocation.clearWatch = originalClearWatch;
            }
        }"""
    )
    page.screenshot(
        path=str(ROOT / "screenshots" / "playwright" / "ride-tracking-onboard.png"),
        full_page=False,
    )
    follow_up = page.evaluate(
        """() => {
            window.rideTracking.onBusPosition({
                latitud: 41.6530,
                longitud: -4.7230,
                timestamp: Date.now() + 1000
            }, {tripId: 'mvp-session'});
            const nearDestination = {
                remaining: window.rideTracking.getState().remainingStops,
                status: document.querySelector('#rideTrackingStatus')?.textContent || '',
                nextStop: document.querySelector('#rideTrackingNextStop')?.textContent || '',
                metric: document.querySelector('#rideTrackingMetricValue')?.textContent || '',
                legacyAlertCount: document.querySelectorAll('#rideTrackingDestinationAlert, #rideTrackingAlertDetails').length,
            };
            return nearDestination;
        }"""
    )
    page.screenshot(
        path=str(ROOT / "screenshots" / "playwright" / "ride-tracking-alert.png"),
        full_page=False,
    )
    snapshot.update({"nearDestination": follow_up})
    snapshot.update(page.evaluate(
        """() => {
            window.rideTracking.onBusPosition(null, {tripId: 'mvp-session'});
            const unavailable = {
                status: document.querySelector('#rideTrackingStatus')?.textContent || '',
                summaryHidden: document.querySelector('.ride-tracking-metric')?.hidden
            };
            window.rideTracking.onBusPosition({
                latitud: 41.6540,
                longitud: -4.7220,
                timestamp: Date.now() + 10000
            }, {tripId: 'mvp-session'});
            return {
                unavailable,
                arrived: {
                    phase: window.rideTracking.getState().phase,
                    nextStop: window.rideTracking.getState().nextStop,
                    status: document.querySelector('#rideTrackingStatus')?.textContent || '',
                    destinationStop: document.querySelector('#rideTrackingNextStop')?.textContent || '',
                    panelVisible: !document.querySelector('#rideTrackingPanel').hidden,
                    destinationHidden: document.querySelector('.ride-destination-field')?.hidden
                }
            };
        }"""
    ))
    page.evaluate("() => window.rideTracking.stop('test', {silent: true})")
    assert snapshot["waitingWithGpsError"]["status"] == "Esperando al bus", json.dumps(snapshot["waitingWithGpsError"], ensure_ascii=False)
    assert snapshot["waitingWithGpsError"]["lastUpdate"] == "Actualizada hace 12s"
    assert snapshot["waitingWithGpsError"]["hint"] == "La ubicación ayuda a detectar el trayecto, pero puedes confirmarlo manualmente."
    assert snapshot["waitingWithGpsError"]["hintHidden"] is False
    assert snapshot["waitingWithUnavailableBus"]["status"] == "Esperando al bus", json.dumps(snapshot["waitingWithUnavailableBus"], ensure_ascii=False)
    assert snapshot["waitingWithUnavailableBus"]["hint"] == "La ubicación ayuda a detectar el trayecto, pero puedes confirmarlo manualmente."
    assert snapshot["waitingWithUnavailableBus"]["hintHidden"] is False
    assert snapshot["manualWithoutGps"] == {
        "phase": "waiting",
        "status": "El bus está en tu parada",
        "metric": "Ahora",
        "button": "Ya estoy dentro",
        "buttonHidden": False,
    }
    assert snapshot["afterBoarding"] == {
        "phase": "onboard",
        "status": "Próxima parada",
        "button": "Sí, estoy dentro",
        "buttonHidden": True,
    }
    onboard_snapshot = {
        key: value for key, value in snapshot["onboard"].items()
        if key not in {"metric", "metricLabel"}
    }
    assert onboard_snapshot == {
            "phase": "onboard",
            "destination": "Destino",
            "hasNextStop": True,
            "panelVisible": True,
            "boardHidden": True,
            "fullMap": True,
            "userMarkerVisible": True,
            "destinationMarkerVisible": True,
            "beforeBoarding": {
                "phase": "waiting",
                "status": "El bus está en tu parada",
                "button": "Ya estoy dentro",
                "buttonHidden": False,
            },
            "legacyTimelineCount": 0,
            "legacyAlertCount": 0,
            "status": "Próxima parada",
            "nextStop": "Primera parada",
            "remaining": "3",
        }, json.dumps(snapshot["onboard"], ensure_ascii=False, indent=2)
    assert re.fullmatch(r"~\d+", snapshot["onboard"]["metric"])
    assert snapshot["onboard"]["metricLabel"] == "min"
    assert snapshot["nearDestination"] == {
            "remaining": 1,
            "status": "Bájate en la próxima parada",
            "nextStop": "Destino",
            "metric": "~1",
            "legacyAlertCount": 0,
    }
    assert snapshot["unavailable"] == {
            "status": "Bájate en la próxima parada",
            "summaryHidden": False,
    }, json.dumps(snapshot["unavailable"], ensure_ascii=False)
    assert snapshot["arrived"] == {
            "phase": "arrived",
            "nextStop": None,
            "status": "Esta es tu parada",
            "destinationStop": "Destino",
            "panelVisible": True,
            "destinationHidden": False,
    }
    assert_no_browser_errors(result)


def test_ride_tracking_demo(result: BrowserPage, base_url: str, timeout_ms: int) -> None:
    """The opt-in simulator exercises every critical travel state without live buses."""
    page = result.page
    page.set_viewport_size({"width": 430, "height": 897})
    page.goto(base_url + "/index.html?rideDemo=1", wait_until="domcontentloaded")
    page.wait_for_selector("#rideDemoToolbar:not([hidden])", timeout=timeout_ms)
    page.wait_for_function("() => window.rideTracking?.getState().active === true", timeout=timeout_ms)

    artifact_dir = ROOT / "screenshots" / "ride-demo"
    artifact_dir.mkdir(parents=True, exist_ok=True)

    def capture(index: int, name: str) -> dict:
        page.evaluate("index => window.rideTrackingDemo.setState(index)", index)
        page.wait_for_timeout(120)
        snapshot = page.evaluate(
            """() => ({
                phase: window.rideTracking.getState().phase,
                status: document.querySelector('#rideTrackingStatus')?.textContent || '',
                alert: document.querySelector('#rideTrackingUrgentAlert')?.textContent || '',
                nextStop: document.querySelector('#rideTrackingNextStop')?.textContent || '',
                remaining: document.querySelector('#rideTrackingRemainingValue')?.textContent || '',
                eta: document.querySelector('#rideTrackingMetricValue')?.textContent || '',
                freshness: document.querySelector('#rideTrackingLastUpdate')?.textContent || '',
                boardHidden: document.querySelector('#rideBoardButton')?.hidden,
                boardLabel: document.querySelector('#rideBoardButton')?.textContent || '',
                destination: document.querySelector('#rideDestinationValue')?.textContent || '',
                mapTouchAction: getComputedStyle(document.querySelector('#busMap')).touchAction,
                busGlyph: Boolean(document.querySelector('#busMap .bus-icon-glyph')),
                busGlyphColor: document.querySelector('#busMap .bus-icon-glyph')
                    ? getComputedStyle(document.querySelector('#busMap .bus-icon-glyph')).stroke
                    : '',
                busMarkerWidth: document.querySelector('#busMap .bus-icon')?.getBoundingClientRect().width || 0,
                panelOverflow: document.querySelector('#rideTrackingPanel').scrollWidth > document.querySelector('#rideTrackingPanel').clientWidth
            })"""
        )
        page.screenshot(path=str(artifact_dir / name), full_page=False)
        assert snapshot["panelOverflow"] is False, json.dumps(snapshot, ensure_ascii=False)
        return snapshot

    waiting = capture(0, "01-esperando.png")
    page.locator("#rideDestinationButton").click()
    destination_options = page.locator("#rideDestinationOptions .ride-destination-option")
    assert destination_options.count() == 4
    assert "Paseo Zorrilla 203" not in page.locator("#rideDestinationOptions").inner_text()
    page.screenshot(path=str(artifact_dir / "00-selector-destino.png"), full_page=False)
    page.locator("#rideDestinationDialogClose").click()
    boarding = capture(2, "02-bus-en-parada.png")
    onboard = capture(4, "03-en-ruta.png")
    get_off = capture(6, "04-bajate-proxima.png")
    degraded = capture(7, "05-sin-senal-gps.png")
    arrived = capture(8, "06-destino.png")

    page.evaluate(
        """() => window.rideTracking.applyDemoState({
            phase: 'waiting',
            bus: null,
            destinationKey: null,
            arrivalTime: new Date(Date.now() - 60000).toISOString(),
            lastUpdate: 'Última comprobación hace 2s. No hay datos de ubicación en directo'
        })"""
    )
    scheduled_only = page.evaluate(
        """() => ({
            status: document.querySelector('#rideTrackingStatus')?.textContent || '',
            metricHidden: document.querySelector('.ride-tracking-metric')?.hidden,
            boardHidden: document.querySelector('#rideBoardButton')?.hidden,
            boardLabel: document.querySelector('#rideBoardButton')?.textContent || ''
        })"""
    )

    assert waiting["status"] == "Esperando al bus"
    assert waiting["eta"] == "5"
    assert waiting["mapTouchAction"] == "pan-x pan-y"
    assert waiting["busGlyph"] is True
    assert waiting["busGlyphColor"] == "rgb(255, 255, 255)"
    assert waiting["busMarkerWidth"] == 48
    assert boarding["status"] == "El bus está en tu parada"
    assert boarding["boardHidden"] is False
    assert boarding["boardLabel"] == "Ya estoy dentro"
    assert onboard["phase"] == "onboard"
    assert onboard["nextStop"] == "Paseo Zorrilla 153 frente Centro Comercial"
    assert onboard["remaining"] == "3"
    assert onboard["destination"] == "Paseo Zorrilla 101 LAVA"
    assert get_off["status"] == "Bájate en la próxima parada"
    assert get_off["alert"] == "Bájate en la próxima parada"
    assert get_off["remaining"] == "1"
    assert "Posición del bus no disponible" in degraded["freshness"]
    assert degraded["remaining"] == "1"
    assert arrived["phase"] == "arrived"
    assert arrived["status"] == "Esta es tu parada"
    assert arrived["eta"] == "Baja aquí"
    assert scheduled_only == {
        "status": "El bus ya salió de la parada",
        "metricHidden": True,
        "boardHidden": False,
        "boardLabel": "Sí, estoy dentro",
    }
    assert_no_browser_errors(result)


def test_scheduled_hours(
    result: BrowserPage, stop_number: str, line_number: str, timeout_ms: int
) -> None:
    page = result.page
    add_line_to_list(page, stop_number, line_number, timeout_ms)

    page.locator("#mostrar-horarios-%s" % stop_number).click()
    page.wait_for_function(
        "() => document.querySelector('#horarios-box').style.display === 'block'",
        timeout=timeout_ms,
    )
    page.wait_for_selector("#horarios-box h2", state="visible", timeout=timeout_ms)
    assert "Horarios programados" in page.locator("#horarios-box").inner_text()
    assert page.locator("#stopDateInput").count() == 1, "Falta el selector de fecha de horarios"
    assert page.locator("#horarios-box .indice-linea").count() > 0, (
        "El diálogo de horarios no muestra sus líneas"
    )
    assert page.locator("#horarios-box .hora").count() > 0 or "No hay horarios programados" in page.locator(
        "#horarios-box"
    ).inner_text()

    # Cambiar la fecha ejercita el listener delegado que vuelve a consultar los
    # horarios, sin asumir horas concretas que dependen del día de ejecución.
    tomorrow = (dt.date.today() + dt.timedelta(days=1)).isoformat()
    page.locator("#stopDateInput").fill(tomorrow)
    page.locator("#stopDateInput").dispatch_event("change")
    page.wait_for_selector("#horarios-box h2", state="visible", timeout=timeout_ms)
    assert page.locator("#stopDateInput").input_value() == tomorrow

    page.locator("#horarios-box .horarios-close").click()
    page.wait_for_function("() => document.querySelector('#horarios-box').style.display !== 'block'")
    assert_no_browser_errors(result)


def test_multi_line_selection_duplicate_and_remove_all(
    result: BrowserPage, stop_number: str, line_number: str, timeout_ms: int
) -> None:
    page = result.page
    select_stop(page, stop_number, timeout_ms)

    # Añadir varias líneas desde el diálogo que aparece cuando no se indica
    # una línea concreta.
    page.locator("#addButton").click()
    page.wait_for_selector("#lineSelectionDialog", state="visible", timeout=timeout_ms)
    checkboxes = page.locator('#lineSelectionDialog input[name="line"]')
    assert checkboxes.count() >= 2, "La parada no ofrece selección múltiple de líneas"
    assert page.locator("#addSelectedLines").is_disabled()
    # Las casillas están visualmente ocultas dentro de .line-pill; se activa
    # la misma superficie que pulsaría una persona en móvil.
    line_pills = page.locator("#lineSelectionDialog .line-pill")
    line_pills.nth(0).click()
    line_pills.nth(1).click()
    assert not page.locator("#addSelectedLines").is_disabled()
    selected_values = checkboxes.evaluate_all(
        "elements => elements.filter(element => element.checked).map(element => element.value)"
    )
    page.locator("#addSelectedLines").click()
    page.wait_for_function(
        "() => (JSON.parse(localStorage.getItem('busLines') || '[]')).length === %d"
        % len(selected_values),
        timeout=timeout_ms,
    )
    assert page.locator("#lineSelectionDialog").count() == 0

    # Volver a añadir una combinación existente no debe duplicarla.
    before_duplicate = page.evaluate(
        "() => JSON.parse(localStorage.getItem('busLines') || '[]').length"
    )
    select_stop(page, stop_number, timeout_ms)
    page.locator("#lineNumber").fill(line_number)
    page.locator("#addButton").click()
    page.wait_for_timeout(1000)
    assert page.evaluate(
        "() => JSON.parse(localStorage.getItem('busLines') || '[]').length"
    ) == before_duplicate

    # El borrado global deja de mostrar las tarjetas y recupera el welcome.
    page.once("dialog", lambda dialog: dialog.accept())
    page.locator("#removeAllButton").click()
    page.wait_for_function(
        "() => JSON.parse(localStorage.getItem('busLines') || '[]').length === 0",
        timeout=timeout_ms,
    )
    page.wait_for_function("() => document.querySelector('#welcome-box').style.display !== 'none'")
    assert page.locator(".stop-block").count() == 0
    assert_no_browser_errors(result)


def test_favorite_destinations_and_route(
    result: BrowserPage, timeout_ms: int
) -> None:
    page = result.page

    # La rama Casa debe abrir su diálogo y mostrar validación si no hay
    # ubicación elegida.
    page.locator("#home-destination").click()
    page.wait_for_function("() => document.querySelector('#homeDialog').style.display === 'block'")
    page.locator("#homeAcceptButton").click()
    page.wait_for_function(
        "() => document.querySelector('#homeErrorMessage').style.display === 'block'"
    )
    assert "Debe elegir una ubicación" in page.locator("#homeErrorMessage").inner_text()
    page.locator("#homeCancelButton").click()

    # Crear un destino rápido mediante el mapa real de Leaflet.
    create_favorite_from_map(page, "Prueba Playwright", timeout_ms)
    assert page.evaluate(
        "() => JSON.parse(localStorage.getItem('favoriteDestinations')).some(item => item.name === 'Prueba Playwright')"
    )

    # Configuración, ocultar/mostrar la barra y apertura del planificador desde
    # el favorito.
    page.locator("#configFavoritesButton").click()
    page.wait_for_function(
        "() => document.querySelector('#configFavoritesDialog').style.display === 'block'"
    )
    favorite_item = page.locator('.favorite-item[data-name="Prueba Playwright"]')
    assert favorite_item.count() == 1

    page.locator("#hideFavBar").check()
    page.wait_for_function("() => getComputedStyle(document.querySelector('#fav-destinations')).display === 'none'")
    page.locator("#hideFavBar").uncheck()
    page.wait_for_function("() => getComputedStyle(document.querySelector('#fav-destinations')).display !== 'none'")

    favorite_item.locator(".route-favorite-icon").click()
    page.wait_for_function("() => document.querySelector('#iframe-container').style.display === 'block'")
    assert page.locator("#iframe-container iframe[src^='https://rutas.vallabus.com']").count() == 1
    page.locator("#iframe-container .closeRoutesButton").click()
    page.wait_for_function("() => document.querySelector('#iframe-container').style.display === 'none'")

    favorite_item.locator(".delete-favorite-icon").click()
    page.wait_for_function("() => document.querySelectorAll('.favorite-item[data-name=\"Prueba Playwright\"]').length === 0")
    assert not page.evaluate(
        "() => (JSON.parse(localStorage.getItem('favoriteDestinations')) || []).some(item => item.name === 'Prueba Playwright')"
    )
    page.locator("#closeConfigDialog").click()
    assert_no_browser_errors(result)


def test_save_home_and_reorder_favorites(result: BrowserPage, timeout_ms: int) -> None:
    page = result.page

    # Guardar Casa, no solo validar el formulario vacío.
    page.locator("#home-destination").click()
    page.wait_for_function("() => document.querySelector('#homeDialog').style.display === 'block'")
    home_map = page.locator("#homeMapContainer")
    page.wait_for_selector("#homeMapContainer.leaflet-container", state="attached", timeout=timeout_ms)
    home_box = home_map.bounding_box()
    assert home_box and home_box["width"] > 0 and home_box["height"] > 0
    page.mouse.click(home_box["x"] + home_box["width"] / 2, home_box["y"] + home_box["height"] / 2)
    page.wait_for_function(
        "() => Boolean(document.querySelector('#homeLat').value && document.querySelector('#homeLon').value)",
        timeout=timeout_ms,
    )
    page.locator("#homeAcceptButton").click()
    page.wait_for_function("() => document.querySelector('#homeDialog').style.display !== 'block'")
    assert page.evaluate("() => JSON.parse(localStorage.getItem('homeDestination')).name") == "Casa"

    create_favorite_from_map(page, "Favorito A", timeout_ms)
    create_favorite_from_map(page, "Favorito B", timeout_ms)
    page.locator("#configFavoritesButton").click()
    page.wait_for_function(
        "() => document.querySelector('#configFavoritesDialog').style.display === 'block'"
    )
    favorite_a = page.locator('.favorite-item[data-name="Favorito A"]')
    favorite_b = page.locator('.favorite-item[data-name="Favorito B"]')
    assert favorite_a.count() == 1 and favorite_b.count() == 1

    # El handler de drag/drop debe mantener Casa en primera posición y
    # persistir el nuevo orden de los destinos.
    page.evaluate(
        """() => {
            const source = document.querySelector('.favorite-item[data-name="Favorito B"]');
            const target = document.querySelector('.favorite-item[data-name="Favorito A"]');
            // Chromium protege el payload de un DataTransfer real fuera del
            // ciclo nativo de arrastre. Este objeto reproduce la interfaz que
            // usa la aplicación y permite ejercitar los mismos listeners en
            // una prueba automatizada y determinista.
            const dataTransfer = {
                value: '',
                setData(_type, value) { this.value = value; },
                getData(_type) { return this.value; },
            };
            const dispatch = (element, type) => {
                const event = new Event(type, {bubbles: true, cancelable: true});
                Object.defineProperty(event, 'dataTransfer', {value: dataTransfer});
                element.dispatchEvent(event);
            };
            dispatch(source, 'dragstart');
            dispatch(target, 'dragover');
            dispatch(target, 'drop');
            dispatch(source, 'dragend');
        }"""
    )
    page.wait_for_function(
        """() => {
            const names = (JSON.parse(localStorage.getItem('favoriteDestinations')) || [])
                .map(item => item.name);
            return names[0] === 'Favorito B' && names[1] === 'Favorito A';
        }""",
        timeout=timeout_ms,
    )
    favorite_names = page.evaluate(
        "() => (JSON.parse(localStorage.getItem('favoriteDestinations')) || []).map(item => item.name)"
    )
    assert favorite_names[:2] == ["Favorito B", "Favorito A"]
    page.locator("#closeConfigDialog").click()
    assert_no_browser_errors(result)


def test_nearby_stops(result: BrowserPage, timeout_ms: int) -> None:
    page = result.page
    page.locator("#viewCercanasButton a").click()
    page.wait_for_function(
        "() => document.querySelector('#nearestStopsResults').style.display === 'block'",
        timeout=timeout_ms,
    )
    page.wait_for_selector("#nearestStopsResults h2", state="visible", timeout=timeout_ms)
    assert "Paradas cercanas" in page.locator("#nearestStopsResults").inner_text()
    assert page.locator("#mapaParadasCercanas").count() == 1
    page.wait_for_selector("#nearestStopsResults .stopResult", state="attached", timeout=timeout_ms)
    assert page.locator("#nearestStopsResults .stopResult").count() > 0

    nearby_line = page.locator("#nearestStopsResults .stopResult .addLineButton").first
    nearby_stop = nearby_line.get_attribute("data-stop-number")
    nearby_line_number = nearby_line.get_attribute("data-line-number")
    assert nearby_stop and nearby_line_number
    page.once("dialog", lambda dialog: dialog.accept())
    nearby_line.click()
    page.wait_for_function(
        """(expected) => (JSON.parse(localStorage.getItem('busLines') || '[]'))
            .some(line => line.stopNumber === expected.stop && line.lineNumber === expected.line)""",
        arg={"stop": nearby_stop, "line": nearby_line_number},
        timeout=timeout_ms,
    )
    assert page.evaluate(
        """(expected) => (JSON.parse(localStorage.getItem('busLines') || '[]'))
            .some(line => line.stopNumber === expected.stop && line.lineNumber === expected.line)""",
        arg={"stop": nearby_stop, "line": nearby_line_number},
    )
    page.locator("#close-nearest-stops").click()
    page.wait_for_function("() => document.querySelector('#nearestStopsResults').style.display !== 'block'")
    assert_no_browser_errors(result)


def test_route_planner(result: BrowserPage, timeout_ms: int) -> None:
    page = result.page

    page.locator("#routePlannerButton a").click()
    page.wait_for_function("() => document.querySelector('#iframe-container').style.display === 'block'")
    assert page.locator("#iframe-container iframe[src^='https://rutas.vallabus.com']").count() == 1
    page.locator("#iframe-container .closeRoutesButton").click()
    page.wait_for_function("() => document.querySelector('#iframe-container').style.display === 'none'")
    # The external planner owns its own load lifecycle.  The route flow is
    # isolated from the data/status dialogs so a slow third-party iframe cannot
    # intercept clicks belonging to another regression case.
    assert_no_browser_errors(result)


def test_data_and_status_dialogs(result: BrowserPage, timeout_ms: int) -> None:
    page = result.page

    page.locator("#show-data").click()
    page.wait_for_function("() => document.querySelector('#dataDialog').style.display === 'block'")
    assert "Tus datos" in page.locator("#dataDialog").inner_text()
    with page.expect_download(timeout=timeout_ms) as download_info:
        page.locator("#exportDataBtn").click()
    assert download_info.value.suggested_filename == "vallabus_datos.json"
    page.locator("#closeDataDialogBtn").click()

    page.locator("#show-status").click()
    page.wait_for_function("() => document.querySelector('#statusDialog').style.display === 'block'")
    page.wait_for_selector("#statusContent", state="visible", timeout=timeout_ms)
    assert page.locator("#statusContent").inner_text().strip(), "El diálogo de estado está vacío"
    page.locator("#closeStatusDialogBtn").click()
    assert_no_browser_errors(result)


def test_deep_links(
    result: BrowserPage, base_url: str, stop_number: str, timeout_ms: int
) -> None:
    page = result.page

    # Estas rutas deben funcionar también al abrirlas directamente o tras un
    # refresh, no solo al llegar desde un click en la interfaz.
    page.goto(base_url + "/#/horarios/" + stop_number, wait_until="domcontentloaded", timeout=timeout_ms)
    page.wait_for_function(
        "() => document.querySelector('#horarios-box').style.display === 'block'",
        timeout=timeout_ms,
    )
    page.wait_for_selector("#horarios-box h2", state="visible", timeout=timeout_ms)
    assert "Horarios programados" in page.locator("#horarios-box").inner_text()
    page.locator("#horarios-box .horarios-close").click()

    page.goto(base_url + "/#/datos", wait_until="domcontentloaded", timeout=timeout_ms)
    page.wait_for_function("() => document.querySelector('#dataDialog').style.display === 'block'")
    assert "Tus datos" in page.locator("#dataDialog").inner_text()
    page.locator("#closeDataDialogBtn").click()

    page.goto(base_url + "/#/estado", wait_until="domcontentloaded", timeout=timeout_ms)
    page.wait_for_function("() => document.querySelector('#statusDialog').style.display === 'block'")
    page.wait_for_selector("#statusContent", state="visible", timeout=timeout_ms)
    assert page.locator("#statusContent").inner_text().strip()
    page.locator("#closeStatusDialogBtn").click()
    assert_no_browser_errors(result)


def test_import_data(result: BrowserPage, timeout_ms: int) -> None:
    page = result.page
    page.locator("#show-data").click()
    page.wait_for_function("() => document.querySelector('#dataDialog').style.display === 'block'")

    payload = {
        "favoriteDestinations": [
            {"name": "Importado Playwright", "lat": "41.65", "lon": "-4.72"}
        ],
        "busLines": [],
        "fixedStops": [],
        "theme": "light",
    }
    # importData() asks for confirmation, opens a file chooser and finally
    # navigates back to / after replacing localStorage.  A persistent dialog
    # handler accepts both the confirmation and the success alert.
    page.on("dialog", lambda dialog: dialog.accept())
    with page.expect_file_chooser(timeout=timeout_ms) as chooser_info:
        page.locator("#importDataBtn").click()
    chooser_info.value.set_files(
        {
            "name": "vallabus-import.json",
            "mimeType": "application/json",
            "buffer": json.dumps(payload).encode("utf-8"),
        }
    )
    page.wait_for_url(re.compile(r"/$"), wait_until="domcontentloaded", timeout=timeout_ms)
    page.wait_for_selector("#fav-destinations li", state="visible", timeout=timeout_ms)
    assert page.locator("#fav-destinations li").filter(has_text="Importado Playwright").count() == 1
    assert page.evaluate(
        "() => JSON.parse(localStorage.getItem('favoriteDestinations'))[0].name"
    ) == "Importado Playwright"
    assert_no_browser_errors(result)


def test_pin_and_remove_followed_line(
    result: BrowserPage, stop_number: str, line_number: str, timeout_ms: int
) -> None:
    page = result.page
    card = add_line_to_list(page, stop_number, line_number, timeout_ms)
    pin = page.locator("#pin-icon-%s" % stop_number)
    pin.click()
    page.wait_for_selector(
        "#pin-icon-%s.fixed" % stop_number,
        state="attached",
        timeout=timeout_ms,
    )
    assert page.evaluate(
        "() => JSON.parse(localStorage.getItem('fixedStops')).includes('%s')" % stop_number
    )

    # Desplegar el lateral de la tarjeta: contiene los próximos horarios y la
    # acción de borrar esa línea concreta.
    detail_panel = card.locator(".additional-info-panel")
    detail_panel.locator(".arrow-button").click()
    page.wait_for_selector(
        '[id="%s-%s"] .additional-info-panel.open' % (stop_number, line_number),
        state="attached",
        timeout=timeout_ms,
    )
    assert detail_panel.locator(".proximos-buses").count() == 1
    assert detail_panel.locator(".remove-button").count() == 1, (
        "El lateral no ofrece la acción de borrar"
    )
    upcoming_count = detail_panel.locator(".proximos-buses li").count()
    if upcoming_count:
        assert detail_panel.locator(".proximos-buses li strong").count() > 0, (
            "Los próximos horarios no muestran hora"
        )

    detail_panel.locator(".arrow-button").click()
    page.wait_for_selector(
        '[id="%s-%s"] .additional-info-panel.open' % (stop_number, line_number),
        state="hidden",
        timeout=timeout_ms,
    )
    detail_panel.locator(".arrow-button").click()
    page.wait_for_selector(
        '[id="%s-%s"] .additional-info-panel.open' % (stop_number, line_number),
        state="attached",
        timeout=timeout_ms,
    )

    # Borrado desde el lateral (en lugar del botón de quitar toda la parada).
    page.once("dialog", lambda dialog: dialog.accept())
    detail_panel.locator(".remove-button").click()
    page.wait_for_function(
        "() => JSON.parse(localStorage.getItem('busLines') || '[]').length === 0",
        timeout=timeout_ms,
    )
    page.wait_for_function("() => document.querySelector('#welcome-box').style.display !== 'none'")
    assert page.locator('[id="%s-%s"]' % (stop_number, line_number)).count() == 0
    assert_no_browser_errors(result)


def run_case(
    name: str,
    callback: Callable[[], None],
    result: BrowserPage,
    artifact_dir: Path,
) -> Optional[str]:
    try:
        callback()
        print("PASS  " + name)
        return None
    except Exception as error:  # noqa: BLE001 - report browser artifacts before failing
        traceback.print_exc()
        artifact_dir.mkdir(parents=True, exist_ok=True)
        screenshot_path = artifact_dir / (name.replace(" ", "_") + ".png")
        try:
            result.page.screenshot(path=str(screenshot_path), full_page=True)
        except PlaywrightError:
            pass
        return "%s: %r (captura: %s)" % (name, error, screenshot_path)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stop", default=DEFAULT_STOP, help="Parada para el flujo live (por defecto: 666)")
    parser.add_argument("--line", default=DEFAULT_LINE, help="Línea para el flujo live (por defecto: 2)")
    parser.add_argument(
        "--timeout",
        type=int,
        default=int(os.environ.get("VALLABUS_TEST_TIMEOUT_MS", "60000")),
        help="Timeout Playwright en milisegundos",
    )
    parser.add_argument(
        "--artifacts",
        type=Path,
        default=ROOT / "screenshots" / "playwright",
        help="Directorio para capturas cuando falla una prueba",
    )
    parser.add_argument(
        "--case",
        action="append",
        dest="case_names",
        help="Ejecuta solo el caso indicado (se puede repetir para varios casos)",
    )
    args = parser.parse_args()

    server = AppServer()
    server.start()
    failures: List[str] = []
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            cases: List[Tuple[str, Callable[[BrowserPage], None]]] = [
                (
                    "arranque_y_contratos_de_stack",
                    lambda result: test_boot_contract(result, server.base_url, args.timeout),
                ),
                ("menu_y_tema", test_menu_and_theme),
                ("contador_avisos_generales", test_global_alert_count),
                (
                    "avisos_de_linea_persisten_en_actualizacion",
                    lambda result: test_line_alert_dialog_persists(result, args.timeout),
                ),
                (
                    "flujo_live_parada_linea_mapa",
                    lambda result: test_live_search_line_and_map(
                        result, args.stop, args.line, args.timeout
                    ),
                ),
                ("puntos_de_entrada_del_seguimiento", test_ride_tracking_entry_points),
                ("onboarding_del_seguimiento", test_ride_tracking_onboarding),
                (
                    "sesion_de_seguimiento_en_primer_plano",
                    lambda result: test_ride_tracking_session(result, args.timeout),
                ),
                (
                    "simulador_de_estados_del_viaje",
                    lambda result: test_ride_tracking_demo(result, server.base_url, args.timeout),
                ),
                (
                    "horarios_programados_y_cambio_de_fecha",
                    lambda result: test_scheduled_hours(
                        result, args.stop, args.line, args.timeout
                    ),
                ),
                (
                    "seleccion_multiple_duplicado_y_borrado_total",
                    lambda result: test_multi_line_selection_duplicate_and_remove_all(
                        result, args.stop, args.line, args.timeout
                    ),
                ),
                (
                    "destinos_favoritos_y_planificador",
                    lambda result: test_favorite_destinations_and_route(result, args.timeout),
                ),
                (
                    "guardar_casa_y_reordenar_favoritos",
                    lambda result: test_save_home_and_reorder_favorites(result, args.timeout),
                ),
                (
                    "paradas_cercanas_con_geolocalizacion",
                    lambda result: test_nearby_stops(result, args.timeout),
                ),
                (
                    "planificador_de_rutas",
                    lambda result: test_route_planner(result, args.timeout),
                ),
                (
                    "datos_y_estado",
                    lambda result: test_data_and_status_dialogs(result, args.timeout),
                ),
                (
                    "rutas_deep_link",
                    lambda result: test_deep_links(
                        result, server.base_url, args.stop, args.timeout
                    ),
                ),
                (
                    "importacion_de_datos",
                    lambda result: test_import_data(result, args.timeout),
                ),
                (
                    "fijar_y_eliminar_seguimiento",
                    lambda result: test_pin_and_remove_followed_line(
                        result, args.stop, args.line, args.timeout
                    ),
                ),
            ]
            if args.case_names:
                requested = set(args.case_names)
                available = {name for name, _callback in cases}
                unknown = sorted(requested - available)
                if unknown:
                    parser.error("caso(s) desconocido(s): %s" % ", ".join(unknown))
                cases = [case for case in cases if case[0] in requested]
            for name, callback in cases:
                result = open_app(browser, server.base_url, args.timeout)
                try:
                    failure = run_case(name, lambda: callback(result), result, args.artifacts)
                    if failure:
                        failures.append(failure)
                finally:
                    result.close()
            browser.close()
    except PlaywrightError as error:
        print(
            "ERROR  No se pudo arrancar Chromium de Playwright. "
            "Instala el navegador con `python3 -m playwright install chromium` si falta.\n"
            + str(error),
            file=sys.stderr,
        )
        return 2
    finally:
        server.close()

    if failures:
        print("\nFALLOS:", file=sys.stderr)
        for failure in failures:
            print("- " + failure, file=sys.stderr)
        return 1
    print("\n%d pruebas Playwright superadas en Chromium real." % len(cases))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
