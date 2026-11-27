"""Verify the native browser diagnostics against the original Ruby services."""

import argparse
import hashlib
import os
import struct
from pathlib import Path, PurePosixPath
from tempfile import TemporaryDirectory
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright

from check_relay import SERVICES


ASSETS = {
    "image": "/public/image/rm_shop/item_id020.png",
    "audio": "/public/sound/bgm/ulbgm01.mp3",
}
PANEL_PATH = "/public/panel_gene.png"
PANEL_SHA256 = "81038be00fa27a1143ac651a789d0a665d51a7be326f322685c7f6cddb85ee3b"
PANEL_HEIGHTS = (96, 215, 300)
PORTS = {port for _, port, _, _ in SERVICES}
FAILED_PORT = 12004
TIMEOUT = 10000
PANEL_CONTEXT_MONITOR = """
(forceUnavailable) => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    const monitor = window.panelContextMonitor = {attempts: 0, contexts: new Set()};
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
        if (kind !== 'webgl2') return getContext.call(this, kind, ...args);
        monitor.attempts++;
        if (forceUnavailable) return null;
        const context = getContext.call(this, kind, ...args);
        if (context) monitor.contexts.add(context);
        return context;
    };
}
"""


def observe(page):
    requests = []
    sockets = []
    errors = []

    def observe_socket(socket):
        sent = []
        received = []
        sockets.append((socket.url, sent, received))
        socket.on("framesent", lambda payload: sent.append(payload))
        socket.on("framereceived", lambda payload: received.append(payload))

    page.on("request", lambda request: requests.append(request.url))
    page.on("websocket", observe_socket)
    page.on("pageerror", lambda error: errors.append(error))
    return requests, sockets, errors


def check_native_requests(page, origin, traffic):
    requests, sockets, errors = traffic
    assert not errors, errors
    expected_host = urlsplit(origin).netloc
    for url in [*requests, *(socket[0] for socket in sockets)]:
        parsed = urlsplit(url)
        assert parsed.netloc == expected_host and parsed.scheme in ("http", "ws"), url
        assert not any(part.lower().startswith("ruffle") for part in PurePosixPath(parsed.path).parts), url
        assert PurePosixPath(parsed.path).suffix.lower() not in {".swf", ".wasm"}, url
    expect(page.locator("ruffle-player, object, embed")).to_have_count(0)


def load_diagnostics(page, origin):
    with page.expect_response(origin + "/api/assets") as assets_response:
        page.goto(origin, wait_until="domcontentloaded")
    assert assets_response.value.ok, assets_response.value.status
    expect(page.locator("#service-list article[data-port]")).to_have_count(len(SERVICES))
    expect(page.locator("#diagnostics")).to_have_attribute("data-state", "idle")
    return assets_response.value.json()


def run_diagnostics(page, origin, button):
    with page.expect_response(origin + "/api/services") as services_response:
        page.locator(button).click()
    assert services_response.value.ok, services_response.value.status
    assert services_response.value.json() == {
        "services": [
            {"name": name, "port": port, "ping": ping, "pong": pong}
            for name, port, ping, pong in SERVICES
        ],
    }


def expect_results(page, failed_port=None):
    state = "failed" if failed_port else "success"
    expect(page.locator("#diagnostics")).to_have_attribute("data-state", state, timeout=TIMEOUT)
    expect(page.locator("#progress")).to_have_js_property("max", len(SERVICES))
    expect(page.locator("#progress")).to_have_js_property("value", len(SERVICES))
    expect(page.locator("#overall-status")).not_to_be_empty()
    for _, port, _, pong in SERVICES:
        row = page.locator(f'#service-list article[data-port="{port}"]')
        if port == failed_port:
            expect(row).to_have_attribute("data-state", "failed")
        else:
            expect(row).to_have_attribute("data-state", "success")
            expect(row.locator(".response-hex")).to_have_text((struct.pack("!IH", 2, pong) + b"\n").hex(" "))


def check_keepalive_frames(sockets):
    assert len(sockets) == len(SERVICES), [socket[0] for socket in sockets]
    exchanges = {urlsplit(url).path: (sent, received) for url, sent, received in sockets}
    assert set(exchanges) == {f"/socket/{port}" for port in PORTS}, exchanges.keys()
    for name, port, ping, pong in SERVICES:
        sent, received = exchanges[f"/socket/{port}"]
        assert sent == [struct.pack("!HH", 2, ping) + b"\n"], (name, sent)
        assert received and all(isinstance(part, bytes) for part in received), (name, received)
        assert b"".join(received) == struct.pack("!IH", 2, pong) + b"\n", (name, received)


def verify_asset_bytes(request, native, legacy):
    for key, path in ASSETS.items():
        actual = request.get(native + path)
        original = request.get(legacy + path)
        assert actual.ok and original.ok, (key, actual.status, original.status)
        actual_digest = hashlib.sha256(actual.body()).hexdigest()
        expected_digest = hashlib.sha256(original.body()).hexdigest()
        assert actual_digest == expected_digest, (key, actual_digest, expected_digest)
        print(f"{key} original SHA-256 matched: {actual_digest}")


def check_assets(page, origin, metadata, requests, legacy):
    assert set(metadata) == {*ASSETS, "panel"}, metadata
    media = {name: metadata[name] for name in ASSETS}
    if media == dict.fromkeys(ASSETS):
        assert legacy is None, "--legacy-port requires the native server to be configured with --assets"
        expect(page.locator("#asset-checks")).to_have_attribute("data-state", "unconfigured")
        expect(page.locator("#play-audio")).to_be_hidden()
        assert all(origin + path not in requests for path in ASSETS.values())
        return
    assert media == ASSETS, media
    expect(page.locator("#image-status")).to_have_attribute("data-state", "success", timeout=TIMEOUT)
    image = page.locator("#asset-image")
    assert image.evaluate("(image) => image.complete && image.naturalWidth > 0"), "The original PNG did not decode"
    assert image.evaluate("(image) => image.currentSrc") == origin + ASSETS["image"]

    audio = page.locator("#asset-audio")
    assert audio.evaluate("(audio) => audio.paused && audio.currentTime === 0"), "Audio autoplayed"
    page.locator("#play-audio").click()
    page.wait_for_function("""() => {
        const audio = document.querySelector("#asset-audio");
        return audio && !audio.paused && audio.readyState >= audio.HAVE_CURRENT_DATA
            && Number.isFinite(audio.duration) && audio.duration > 0 && audio.currentTime > 0.25;
    }""", timeout=TIMEOUT)
    assert audio.evaluate("(audio) => audio.currentSrc") == origin + ASSETS["audio"]
    assert all(origin + path in requests for path in ASSETS.values())
    if legacy:
        verify_asset_bytes(page.request, origin, legacy)
    print("Native browser decoded the original image and played the original MP3 after a click.")


def observe_panel_contexts(page, *, force_unavailable=False):
    page.add_init_script(f"({PANEL_CONTEXT_MONITOR})({str(force_unavailable).lower()})")


def check_panel(page, origin, path, requests, dpr, *, renderer=None, css_width=220):
    status = page.locator("#panel-status")
    grid = page.locator("#panel-previews")
    canvases = grid.locator("canvas[data-panel-height][data-panel-width]")
    if path is None:
        assert renderer is None, "The requested renderer needs the archived panel PNG"
        expect(status).to_have_attribute("data-state", "unconfigured")
        expect(grid).to_be_hidden()
        expect(grid.locator("canvas[data-rendered='true']")).to_have_count(0)
        assert grid.get_attribute("data-renderer") is None
        assert page.evaluate("panelContextMonitor.attempts") == 0
        assert origin + PANEL_PATH not in requests, "Unconfigured client tried to load the panel image"
        return

    assert path == PANEL_PATH, path
    expect(status).to_have_attribute("data-state", "success", timeout=TIMEOUT)
    if renderer:
        expect(grid).to_have_attribute("data-renderer", renderer)
    renderer = grid.get_attribute("data-renderer")
    assert renderer in ("webgl2", "canvas2d"), renderer
    expect(canvases).to_have_count(len(PANEL_HEIGHTS))
    assert origin + PANEL_PATH in requests, "The canvas did not request the original panel image"
    response = page.request.get(origin + PANEL_PATH)
    assert response.ok and hashlib.sha256(response.body()).hexdigest() == PANEL_SHA256
    for height in PANEL_HEIGHTS:
        canvas = page.locator(f'#panel-previews canvas[data-panel-height="{height}"]')
        expect(canvas).to_have_attribute("data-panel-width", "220")
        expect(canvas).to_have_attribute("data-rendered", "true")
        expect(canvas).to_be_visible()

    # Map pixel centers into the archived texture. At an exact nearest-neighbor tie,
    # either adjacent source texel is valid.
    results = canvases.evaluate_all("""async (canvases, {path, dpr, renderer, cssWidth, heights}) => {
        const image = new Image();
        image.src = path;
        await image.decode();
        const original = document.createElement('canvas');
        original.width = image.naturalWidth;
        original.height = image.naturalHeight;
        const source = original.getContext('2d');
        source.drawImage(image, 0, 0);
        const originalPixels = source.getImageData(0, 0, original.width, original.height).data;

        function axisCandidates(size, logical, sourceStops) {
            const leading = sourceStops[1];
            const trailing = sourceStops[3] - sourceStops[2];
            const narrow = logical < leading + trailing;
            const firstCut = Math.round(size * leading / (narrow ? leading + trailing : logical));
            const lastCut = narrow ? firstCut : Math.round(size * (logical - trailing) / logical);
            const stops = [0, firstCut, lastCut, size];
            const candidates = new Array(size);
            for (let slice = 0; slice < 3; slice++) {
                const start = stops[slice];
                const end = stops[slice + 1];
                const sourceStart = sourceStops[slice];
                const sourceSize = sourceStops[slice + 1] - sourceStart;
                for (let pixel = start; pixel < end; pixel++) {
                    const numerator = (2 * (pixel - start) + 1) * sourceSize;
                    const denominator = 2 * (end - start);
                    const nearest = sourceStart + Math.floor(numerator / denominator);
                    candidates[pixel] = numerator % denominator ? [nearest] : [nearest - 1, nearest];
                }
            }
            return candidates;
        }

        function comparePixels(width, height, pixels, cssHeight, flipped = false, premultiplied = false) {
            const sourceXs = axisCandidates(width, cssWidth, [0, 42, 78, 120]);
            const sourceYs = axisCandidates(height, cssHeight, [0, 60, 64, 96]);
            let mismatch = null;
            for (let y = 0; y < height; y++) {
                const actualY = flipped ? height - 1 - y : y;
                for (let x = 0; x < width; x++) {
                    const actualOffset = 4 * (actualY * width + x);
                    const allowed = sourceYs[y].some(sourceY => sourceXs[x].some(sourceX => {
                        const offset = 4 * (sourceY * original.width + sourceX);
                        const alpha = originalPixels[offset + 3];
                        return [0, 1, 2, 3].every(channel => {
                            const original = originalPixels[offset + channel];
                            const expected = premultiplied && channel < 3 ? Math.round(original * alpha / 255) : original;
                            return pixels[actualOffset + channel] === expected;
                        });
                    }));
                    if (!allowed) {
                        mismatch = {x, y, sourceXs: sourceXs[x], sourceYs: sourceYs[y],
                            actual: [...pixels.slice(actualOffset, actualOffset + 4)]};
                        return {width, height, mismatch};
                    }
                }
            }
            return {width, height, mismatch};
        }

        let webgl = null;
        if (renderer === 'webgl2') {
            // The renderer paints to one detached WebGL2 buffer before copying to the gallery.
            const contexts = [...panelContextMonitor.contexts];
            const gl = contexts.find(context => !context.isContextLost());
            if (!(gl instanceof WebGL2RenderingContext)) throw new Error('No live WebGL2 context observed');
            const {drawingBufferWidth: width, drawingBufferHeight: height} = gl;
            const pixels = new Uint8Array(width * height * 4);
            gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            const rendererInfo = gl.getExtension('WEBGL_debug_renderer_info');
            webgl = {
                ...comparePixels(width, height, pixels, heights.at(-1), true, gl.getContextAttributes().premultipliedAlpha),
                renderer: gl.getParameter(rendererInfo?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER),
            };
        }

        return {
            dpr: window.devicePixelRatio,
            source: [original.width, original.height],
            canvases: canvases.map((canvas, index) => {
                const {width, height} = canvas;
                const bounds = canvas.getBoundingClientRect();
                const pixels = canvas.getContext('2d').getImageData(0, 0, width, height).data;
                return {...comparePixels(width, height, pixels, heights[index]), cssSize: [bounds.width, bounds.height]};
            }),
            webgl,
        };
    }""", {"path": path, "dpr": dpr, "renderer": renderer, "cssWidth": css_width, "heights": PANEL_HEIGHTS})
    assert results["source"] == [120, 96] and results["dpr"] == dpr, results
    for height, result in zip(PANEL_HEIGHTS, results["canvases"], strict=True):
        assert (result["width"], result["height"]) == (int(css_width * dpr + .5), int(height * dpr + .5)), result
        assert result["cssSize"] == [css_width, height], result
        assert result["mismatch"] is None, (height, dpr, result["mismatch"])
    if webgl := results["webgl"]:
        assert (webgl["width"], webgl["height"]) == (int(css_width * dpr + .5), int(PANEL_HEIGHTS[-1] * dpr + .5)), webgl
        assert webgl["mismatch"] is None, (dpr, webgl["mismatch"])
    print(f"Original panel pixels match the {css_width}×96/215/300 previews at DPR {dpr} using {renderer}.")
    return results["webgl"]


def check_complete(browser, origin, legacy, screenshot, panel_screenshot=None, *, software_webgl=False):
    page = browser.new_page(viewport={"width": 1240, "height": 960}, device_scale_factor=1)
    try:
        observe_panel_contexts(page)
        traffic = observe(page)
        requests, sockets, _ = traffic
        assets = load_diagnostics(page, origin)
        assert not sockets, "Socket probes ran before the user requested them"
        for _ in range(2):
            previous = len(sockets)
            run_diagnostics(page, origin, "#run-checks")
            expect_results(page)
            check_keepalive_frames(sockets[previous:])
        check_assets(page, origin, assets, requests, legacy)
        webgl = check_panel(page, origin, assets["panel"], requests, 1,
                            renderer="webgl2" if software_webgl else None)
        if software_webgl:
            assert "swiftshader" in webgl["renderer"].lower(), webgl["renderer"]
            print(f"Read actual WebGL2 framebuffer pixels from {webgl['renderer']}.")
        check_native_requests(page, origin, traffic)
        if screenshot:
            if assets["audio"]:
                page.locator("#play-audio").click()
                expect(page.locator("#asset-audio")).to_have_js_property("paused", True)
            screenshot.parent.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=screenshot, full_page=True)
        if panel_screenshot:
            assert assets["panel"] is not None, "--panel-screenshot requires the archived panel asset"
            panel_screenshot.parent.mkdir(parents=True, exist_ok=True)
            page.locator("#panel-check").screenshot(path=panel_screenshot)
    finally:
        page.close()
    print("All six native service rows matched real binary KeepAlive frames on two runs.")
    return assets


def resize_panel_grid(page, width):
    # Constrain this grid independently of the rest of the page.
    style = "" if width == 220 else f"{width}px"
    page.locator("#panel-previews").evaluate("(grid, width) => { grid.style.maxWidth = width; }", style)
    page.wait_for_function("""(expectedWidth) => {
        const canvases = document.querySelectorAll('#panel-previews canvas');
        return canvases.length === 3 && Array.from(canvases).every(canvas => {
            const width = canvas.getBoundingClientRect().width;
            return canvas.dataset.rendered === 'true' && canvas.width === Math.round(width * devicePixelRatio)
                && width === expectedWidth;
        });
    }""", arg=width, timeout=TIMEOUT)


def check_high_density(browser, origin, *, software_webgl=False):
    page = browser.new_page(viewport={"width": 390, "height": 960}, device_scale_factor=2)
    try:
        observe_panel_contexts(page)
        page.add_init_script("""(() => {
            const match = window.matchMedia.bind(window);
            window.matchMedia = query => {
                const result = match(query);
                if (query.startsWith('(resolution:')) window.panelResolutionQuery = result;
                return result;
            };
        })();""")
        traffic = observe(page)
        assets = load_diagnostics(page, origin)
        assert assets["panel"] == PANEL_PATH
        renderer = "webgl2" if software_webgl else None
        check_panel(page, origin, assets["panel"], traffic[0], 2, renderer=renderer)
        assert page.evaluate("document.documentElement.scrollWidth === innerWidth"), "Compact layout overflowed"
        for width in (78, 220):
            resize_panel_grid(page, width)
            check_panel(page, origin, assets["panel"], traffic[0], 2, renderer=renderer, css_width=width)
        device = page.context.new_cdp_session(page)
        try:
            for dpr in (1, 1.25, 2):
                device.send("Emulation.setDeviceMetricsOverride", {
                    "width": 390, "height": 960, "deviceScaleFactor": dpr, "mobile": False,
                })
                # Chromium's DPR emulation changes the media match without reliably emitting its event.
                page.evaluate("""() => {
                    const query = window.panelResolutionQuery;
                    if (!query.matches) query.dispatchEvent(new Event('change'));
                }""")
                resize_panel_grid(page, 220)
                check_panel(page, origin, assets["panel"], traffic[0], dpr, renderer=renderer)
            print("Resolution-change notifications resize panel backing pixels at the same CSS viewport.")
            if software_webgl:
                assert page.evaluate("""() => {
                    const gl = [...panelContextMonitor.contexts].find(context => !context.isContextLost());
                    const loss = gl?.getExtension('WEBGL_lose_context');
                    if (!loss) return false;
                    loss.loseContext();
                    return true;
                }"""), "SwiftShader did not expose WEBGL_lose_context"
                check_panel(page, origin, assets["panel"], traffic[0], 2, renderer="canvas2d")
                resize_panel_grid(page, 78)
                check_panel(page, origin, assets["panel"], traffic[0], 2, renderer="canvas2d", css_width=78)
                print("Losing the real WebGL2 context recovered to Canvas2D and redrew after resizing.")
        finally:
            device.detach()
        check_native_requests(page, origin, traffic)
    finally:
        page.close()
    print("Panel backing sizes tracked a narrow grid column and recovered when widened.")


def check_canvas_fallback(browser, origin):
    page = browser.new_page(viewport={"width": 1240, "height": 960})
    try:
        observe_panel_contexts(page, force_unavailable=True)
        traffic = observe(page)
        assets = load_diagnostics(page, origin)
        check_panel(page, origin, assets["panel"], traffic[0], 1, renderer="canvas2d")
        assert page.evaluate("panelContextMonitor.attempts > 0 && panelContextMonitor.contexts.size === 0")
        check_native_requests(page, origin, traffic)
    finally:
        page.close()
    print("Without WebGL2, the original panel samples render in Canvas2D.")


def check_retry(browser, origin):
    page = browser.new_page()
    try:
        traffic = observe(page)
        # Redirect one probe to a missing same-origin route to trigger real connection failures.
        page.add_init_script(f"""(() => {{
            const OriginalWebSocket = window.WebSocket;
            const probe = window.unavailableProbe = {{ blocked: true, attempts: 0 }};
            window.WebSocket = class extends OriginalWebSocket {{
                constructor(url, protocols) {{
                    const address = new URL(url, location.href);
                    if (address.pathname === '/socket/{FAILED_PORT}') {{
                        probe.attempts += 1;
                        if (probe.blocked) address.pathname = '/socket/unavailable';
                    }}
                    super(address, protocols);
                }}
            }};
        }})();""")
        load_diagnostics(page, origin)
        run_diagnostics(page, origin, "#run-checks")
        expect_results(page, failed_port=FAILED_PORT)
        failed_row = page.locator(f'#service-list article[data-port="{FAILED_PORT}"]')
        expect(failed_row).to_have_attribute("data-error-kind", "network")
        assert page.evaluate("window.unavailableProbe.attempts") == 2
        page.evaluate("window.unavailableProbe.blocked = false")
        run_diagnostics(page, origin, "#retry-failed")
        expect_results(page)
        assert page.evaluate("window.unavailableProbe.attempts") == 3
        check_native_requests(page, origin, traffic)
    finally:
        page.close()
    print(f"An unavailable {FAILED_PORT} relay reports one failure after two attempts. Retry recovers it.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    parser.add_argument("--port", type=int, default=4342, help="Loopback port serving the native client")
    parser.add_argument("--legacy-port", type=int, help="Compare original asset bytes on this loopback port")
    parser.add_argument("--no-assets-port", type=int, help="Also check a native server running without --assets")
    parser.add_argument("--screenshot", type=Path, help="Save the successful native diagnostics view")
    parser.add_argument("--panel-screenshot", type=Path, help="Save the verified original panel samples")
    parser.add_argument("--software-webgl", action="store_true", help="Require WebGL2 via ANGLE SwiftShader and exercise context loss")
    options = parser.parse_args()
    origin = f"http://127.0.0.1:{options.port}"
    legacy = f"http://127.0.0.1:{options.legacy_port}" if options.legacy_port else None

    with TemporaryDirectory(prefix="unlight-native-chromium-") as profile, sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=options.chromium,
            args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] if options.software_webgl else [],
            env=dict(os.environ, XDG_CONFIG_HOME=profile, XDG_CACHE_HOME=profile),
        )
        try:
            assets = check_complete(browser, origin, legacy, options.screenshot, options.panel_screenshot,
                                    software_webgl=options.software_webgl)
            if assets["panel"]:
                check_high_density(browser, origin, software_webgl=options.software_webgl)
                check_canvas_fallback(browser, origin)
            check_retry(browser, origin)
            if options.no_assets_port:
                no_assets_origin = f"http://127.0.0.1:{options.no_assets_port}"
                unconfigured = check_complete(browser, no_assets_origin, None, None)
                assert unconfigured == dict.fromkeys((*ASSETS, "panel")), unconfigured
        finally:
            browser.close()


if __name__ == "__main__":
    main()
