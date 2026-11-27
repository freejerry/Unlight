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
PORTS = {port for _, port, _, _ in SERVICES}
FAILED_PORT = 12004
TIMEOUT = 10000


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
    if metadata == dict.fromkeys(ASSETS):
        assert legacy is None, "--legacy-port requires the native server to be configured with --assets"
        expect(page.locator("#asset-checks")).to_have_attribute("data-state", "unconfigured")
        return
    assert metadata == ASSETS, metadata
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


def check_complete(browser, origin, legacy, screenshot):
    page = browser.new_page(viewport={"width": 1240, "height": 960})
    try:
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
        check_native_requests(page, origin, traffic)
        if screenshot:
            if assets["audio"]:
                page.locator("#play-audio").click()
                expect(page.locator("#asset-audio")).to_have_js_property("paused", True)
            screenshot.parent.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=screenshot, full_page=True)
    finally:
        page.close()
    print("All six native service rows matched real binary KeepAlive frames on two runs.")


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
    parser.add_argument("--screenshot", type=Path, help="Save the successful native diagnostics view")
    options = parser.parse_args()
    origin = f"http://127.0.0.1:{options.port}"
    legacy = f"http://127.0.0.1:{options.legacy_port}" if options.legacy_port else None

    with TemporaryDirectory(prefix="unlight-native-chromium-") as profile, sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=options.chromium,
            env=dict(os.environ, XDG_CONFIG_HOME=profile, XDG_CACHE_HOME=profile),
        )
        try:
            check_complete(browser, origin, legacy, options.screenshot)
            check_retry(browser, origin)
        finally:
            browser.close()


if __name__ == "__main__":
    main()
