"""Verify live native search deadlines in Chromium against the loopback server."""

import argparse
from pathlib import Path
from urllib.parse import urlsplit
from uuid import UUID

from playwright.sync_api import expect, sync_playwright

from check_native_browser import check_native_requests, observe


API = "/api/searches/"
DURATION_MS = 8000
DAY_MS = 24 * 60 * 60 * 1000
READY_TIMEOUT = 20000
STORAGE_KEY = "unlight.deadline.search-id"
STATUS_TEXT = {
    "idle": "尚未開始",
    "pending": "搜尋中",
    "ready": "搜尋完成",
    "failed": "暫時無法確認",
}


def field(page, name):
    return page.locator(f"#deadline-{name}")


def check_payload(payload, url, origin, *, state=None, previous=None):
    token = payload["id"]
    assert str(UUID(token)) == token and url == origin + API + token, (url, payload)
    status = payload["status"]
    assert status in ("pending", "ready")
    assert state is None or status == state, payload
    assert set(payload) == {"id", "status", "find_at_ms", "server_now_ms"} | (
        {"result"} if status == "ready" else set()
    ), payload
    deadline, now = payload["find_at_ms"], payload["server_now_ms"]
    assert type(deadline) is type(now) is int and now > 0, payload
    if status == "pending":
        assert 0 < deadline - now <= DURATION_MS, payload
    else:
        assert now >= deadline and payload["result"] == {"id": f"result-{token}"}, payload
    if previous:
        assert payload["id"] == previous["id"] and deadline == previous["find_at_ms"], payload
        assert now >= previous["server_now_ms"], payload
    return payload


def check_response(response, origin, method, *, state=None, previous=None):
    assert response.ok and response.request.method == method, (response.url, response.status)
    assert response.headers.get("cache-control") == "no-store", response.headers
    assert response.request.post_data in (None, ""), "Timed search should send an empty request body"
    return check_payload(response.json(), response.url, origin, state=state, previous=previous)


def match_response(origin, method, snapshot=None):
    url = origin + API
    if snapshot:
        url += snapshot["id"]
        return lambda response: response.request.method == method and response.url == url
    return lambda response: response.request.method == method and response.url.startswith(url)


def check_ui(page, state, snapshot=None):
    expect(page.locator("#deadline")).to_have_attribute("data-state", state, timeout=READY_TIMEOUT)
    status = field(page, "status")
    expect(status).to_be_visible()
    expect(status).to_have_text(STATUS_TEXT[state])
    if state == "ready":
        expect(field(page, "result")).to_be_visible()
        expect(field(page, "result-id")).to_have_text(snapshot["result"]["id"])
        expect(field(page, "countdown")).to_have_text("0.0")
        assert field(page, "progress").evaluate("element => element.value === element.max")
        expect(field(page, "start")).to_have_text("開始下一次搜尋")
    else:
        expect(field(page, "result")).to_be_hidden()
    if snapshot:
        assert page.evaluate("key => localStorage.getItem(key)", STORAGE_KEY) == snapshot["id"]
        expect(field(page, "search-id")).to_contain_text(snapshot["id"])
        deadline = field(page, "find-at")
        expect(deadline).to_have_attribute("data-timestamp", str(snapshot["find_at_ms"]))
        iso = page.evaluate("timestamp => new Date(timestamp).toISOString()", snapshot["find_at_ms"])
        expect(deadline).to_have_attribute("datetime", iso)
        formatted = page.evaluate("""timestamp => new Intl.DateTimeFormat('zh-TW', {
            dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Asia/Taipei'
        }).format(timestamp)""", snapshot["find_at_ms"])
        expect(deadline).to_have_text(formatted)


def install_wall_skew(page, milliseconds):
    # Keep the server and the browser's performance.now() and timers on real time.
    page.add_init_script(f"""(() => {{
        const hostTime = Date.now.bind(Date);
        globalThis.deadlineTestWallSkew = {milliseconds};
        Date.now = () => hostTime() + globalThis.deadlineTestWallSkew;
    }})();""")


def check_mobile_fit(page, *, ready=False):
    assert page.evaluate("innerWidth === 320 && document.documentElement.scrollWidth === 320"), (
        "The native page overflows a 320 CSS pixel mobile viewport"
    )
    names = ["status", "countdown", "progress", "search-id", "find-at", "refresh"]
    if ready:
        names.extend(("start", "result-id"))
    else:
        expect(field(page, "start")).to_be_hidden()
    for name in names:
        node = field(page, name)
        expect(node).to_be_visible()
        assert node.evaluate("""element => {
            const text = document.createRange();
            text.selectNodeContents(element);
            return [element.getBoundingClientRect(), ...text.getClientRects()]
                .every(rect => rect.left >= 0 && rect.right <= innerWidth + 0.5);
        }"""), f"Mobile {name} extends outside the viewport"


def save(page, directory, name):
    if directory:
        directory.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=directory / f"{name}.png", full_page=True)


def start_desktop(page, origin, directory):
    check_ui(page, "idle")
    expect(field(page, "countdown")).to_have_text("8.0")
    expect(field(page, "start")).to_have_text("開始搜尋")
    with page.expect_response(match_response(origin, "PUT")) as creation:
        field(page, "start").click()
    first = check_response(creation.value, origin, "PUT", state="pending")
    assert first["find_at_ms"] - first["server_now_ms"] == DURATION_MS
    assert abs(page.evaluate("Date.now()") - DAY_MS - first["server_now_ms"]) < 5000
    check_ui(page, "pending", first)
    save(page, directory, "01-desktop-pending")

    expect(field(page, "refresh")).to_have_text("查詢狀態")
    with page.expect_response(match_response(origin, "GET", first)) as early_check:
        field(page, "refresh").click()
    pending = check_response(early_check.value, origin, "GET", state="pending", previous=first)
    check_ui(page, "pending", pending)
    with page.expect_response(match_response(origin, "GET", first)) as load:
        page.reload(wait_until="domcontentloaded")
    pending = check_response(load.value, origin, "GET", state="pending", previous=pending)
    check_ui(page, "pending", pending)

    countdown = float(field(page, "countdown").inner_text())
    assert 0 < countdown <= DURATION_MS / 1000
    assert field(page, "progress").evaluate("element => element.max === 8000")
    page.evaluate(f"globalThis.deadlineTestWallSkew = {-DAY_MS}")
    page.wait_for_function("""previous => {
        const remaining = Number(document.querySelector('#deadline-countdown').textContent);
        return remaining > 0 && remaining < previous;
    }""", arg=countdown, timeout=2500)
    return first


def start_mobile(page, origin, directory):
    accepted = []

    def drop_creation_reply(route):
        assert route.request.method == "PUT" and route.request.post_data in (None, "")
        upstream = route.fetch(max_redirects=0)
        assert upstream.ok and upstream.headers.get("cache-control") == "no-store"
        accepted.append(check_payload(upstream.json(), route.request.url, origin, state="pending"))
        route.abort("connectionreset")

    check_ui(page, "idle")
    pattern = origin + API + "*"
    page.route(pattern, drop_creation_reply, times=1)
    with page.expect_event("requestfailed", predicate=lambda request: request.url.startswith(origin + API)) as dropped:
        field(page, "start").click()
    assert dropped.value.method == "PUT" and len(accepted) == 1
    first = accepted[0]
    assert first["find_at_ms"] - first["server_now_ms"] == DURATION_MS
    assert abs(page.evaluate("Date.now()") + DAY_MS - first["server_now_ms"]) < 5000
    check_ui(page, "failed")
    assert page.evaluate("key => localStorage.getItem(key)", STORAGE_KEY) == first["id"]
    expect(field(page, "refresh")).to_have_text("重試連線")
    with page.expect_response(match_response(origin, "PUT", first)) as retry:
        field(page, "refresh").click()
    pending = check_response(retry.value, origin, "PUT", state="pending", previous=first)
    check_ui(page, "pending", pending)
    check_mobile_fit(page)
    save(page, directory, "03-mobile-pending")
    return first


def check_automatic_readiness(page, responses, origin, first):
    expect(page.locator("#deadline")).to_have_attribute("data-state", "ready", timeout=READY_TIMEOUT)
    match = match_response(origin, "GET", first)
    for response in reversed(responses):
        if match(response) and response.ok:
            snapshot = check_response(response, origin, "GET", previous=first)
            if snapshot["status"] == "ready":
                check_ui(page, "ready", snapshot)
                return snapshot
    raise AssertionError("The UI marked the search ready with no corresponding real ready GET")


def check_reload_and_recovery(page, origin, terminal):
    url = origin + API + terminal["id"]
    page.route(url, lambda route: route.abort("internetdisconnected"), times=1)
    with page.expect_event("requestfailed", predicate=lambda request: request.url == url) as dropped:
        page.reload(wait_until="domcontentloaded")
    assert dropped.value.method == "GET"
    check_ui(page, "failed")
    assert page.evaluate("key => localStorage.getItem(key)", STORAGE_KEY) == terminal["id"]
    expect(field(page, "refresh")).to_have_text("重試連線")
    with page.expect_response(match_response(origin, "GET", terminal)) as retry:
        field(page, "refresh").click()
    recovered = check_response(retry.value, origin, "GET", state="ready", previous=terminal)
    assert recovered["result"] == terminal["result"]
    check_ui(page, "ready", recovered)
    with page.expect_response(match_response(origin, "GET", terminal)) as reload_result:
        page.reload(wait_until="domcontentloaded")
    hydrated = check_response(reload_result.value, origin, "GET", state="ready", previous=recovered)
    assert hydrated["result"] == terminal["result"]
    check_ui(page, "ready", hydrated)


def check_page_traffic(page, origin, traffic, token):
    check_native_requests(page, origin, traffic)
    requests, sockets, _ = traffic
    assert not sockets and len(page.frames) == 1
    assert not any(urlsplit(url).path.startswith("/socket/") for url in requests)
    assert {url for url in requests if url.startswith(origin + API)} == {origin + API + token}


def check_browser(browser, origin, directory):
    desktop = browser.new_page(viewport={"width": 1120, "height": 860})
    mobile = browser.new_page(viewport={"width": 320, "height": 830}, is_mobile=True, has_touch=True)
    try:
        desktop_traffic, mobile_traffic = observe(desktop), observe(mobile)
        desktop_responses, mobile_responses = [], []
        desktop.on("response", lambda response: desktop_responses.append(response))
        mobile.on("response", lambda response: mobile_responses.append(response))
        install_wall_skew(desktop, DAY_MS)
        install_wall_skew(mobile, -DAY_MS)
        for page in (desktop, mobile):
            page.goto(origin, wait_until="domcontentloaded")
            check_ui(page, "idle")
            assert page.evaluate("document.body.getBoundingClientRect().bottom >= innerHeight"), (
                "The page backdrop ends above the bottom of the viewport"
            )
            assert page.evaluate("key => localStorage.getItem(key)", STORAGE_KEY) is None

        desktop_pending = start_desktop(desktop, origin, directory)
        mobile_pending = start_mobile(mobile, origin, directory)
        assert desktop_pending["id"] != mobile_pending["id"], "Independent contexts shared a search ID"
        desktop_ready = check_automatic_readiness(desktop, desktop_responses, origin, desktop_pending)
        save(desktop, directory, "02-desktop-ready")
        mobile_ready = check_automatic_readiness(mobile, mobile_responses, origin, mobile_pending)
        assert desktop_ready["result"] != mobile_ready["result"]
        check_mobile_fit(mobile, ready=True)
        save(mobile, directory, "04-mobile-ready")
        check_reload_and_recovery(desktop, origin, desktop_ready)
        check_page_traffic(desktop, origin, desktop_traffic, desktop_pending["id"])
        check_page_traffic(mobile, origin, mobile_traffic, mobile_pending["id"])
    finally:
        mobile.close()
        desktop.close()
    print("Real 8-second server deadlines governed ready results with browser wall clocks skewed by ±1 day.")
    print("Pending and ready reloads, a disconnected read, and a lost committed PUT recovered the same ID and deadline.")
    print("Desktop and 320px mobile kept separate searches and rendered their own Traditional Chinese status and result.")
    print("Both flows stayed on the Rust origin with no legacy /socket/, SWF, Ruffle, or iframe traffic.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=4356)
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    parser.add_argument("--screenshot-dir", type=Path)
    args = parser.parse_args()
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=args.chromium)
        try:
            check_browser(browser, f"http://127.0.0.1:{args.port}", args.screenshot_dir)
        finally:
            browser.close()


if __name__ == "__main__":
    main()
