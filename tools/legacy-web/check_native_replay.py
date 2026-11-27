"""Verify the native Chromium inspector against the archived original Ruby trace."""

import argparse
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import json
from math import ceil
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright

from check_native_browser import TIMEOUT, check_native_requests, observe


ARCHIVE = Path(__file__).resolve().parents[1] / "legacy-server/fixtures/trace-2026.json"
ARCHIVE_SHA256 = "04d860ddb7034170c3e7c666a6992a2dc8234a6e514a1a76343bbd4f99ac23c6"
REPLAY_PATH = "/replay/"
FIXTURE_PATH = "/api/replay-baseline"
PLAYBACK_INTERVAL_MS = 600
PROGRESS_ID = "replay-record-progress"


def original_trace():
    raw = ARCHIVE.read_bytes()
    assert sha256(raw).hexdigest() == ARCHIVE_SHA256, "The original Ruby trace fixture changed"
    fixture = json.loads(raw)
    events = fixture["trace"]
    assert fixture["seed"] == 2026 and len(events) == 68
    assert [event["phase"] for event in events[:4]] == ["start_turn", "draw", "draw_event", "move_input"]
    assert all(event["tick"] == 0 and event["hp"] == [12, 10] for event in events[:4])
    assert events[-1] == {
        "tick": 921, "turn": 4, "phase": "finished", "hp": [5, 0],
        "outcome": ["won", "lost"], "remaining_hp": [[5], [0]],
    }
    assert fixture["outcome"] == events[-1]["outcome"]
    return raw, fixture


def observe_replay(page):
    traffic = observe(page)
    methods = []
    page.on("request", lambda request: methods.append(request.method))
    return traffic, methods


def check_read_only(page, origin, observation, fixture_reads):
    traffic, methods = observation
    requests, sockets, _ = traffic
    check_native_requests(page, origin, traffic)
    assert not sockets, "The replay page opened a live service connection"
    assert methods and all(method == "GET" for method in methods), "The replay page made a non-GET request"
    paths = [urlsplit(url).path for url in requests]
    assert [path for path in paths if path.startswith("/api/")] == [FIXTURE_PATH] * fixture_reads, paths
    assert not any(path.startswith(("/socket/", "/public/")) for path in paths), paths


def check_fixture_response(response, original):
    assert response.ok and response.request.method == "GET", response.status
    assert response.body() == original, "Browser did not receive the exact archived Ruby bytes"


def check_event(page, events, ordinal):
    event = events[ordinal]
    state = page.locator("#replay").evaluate("""(root) => {
        const node = (name) => root.querySelector(`#replay-${name}`);
        const text = (name) => node(name).textContent.trim();
        return {
            slider: Number(node('seek').value),
            index: text('index'),
            tick: text('tick'),
            time: text('time'),
            turn: text('turn'),
            phase: text('phase'),
            hp: [text('player-hp'), text('cpu-hp')],
            outcome: text('result'),
            draw: node('draw').hidden ? null : [text('draw-player'), text('draw-cpu')],
            raw: JSON.parse(text('event-json')),
        };
    }""")
    expected = {
        "slider": ordinal,
        "index": f"{ordinal + 1} / {len(events)}",
        "tick": str(event["tick"]),
        "time": f"{event['tick'] / 10:.1f}",
        "turn": str(event["turn"]),
        "phase": event["phase"],
        "hp": [str(hp) for hp in event["hp"]],
        "outcome": " / ".join(event["outcome"]) if "outcome" in event else "—",
        "draw": [str(len(hand)) for hand in event["cards"]] if "cards" in event else None,
        "raw": event,
    }
    # Canonical JSON comparison distinguishes booleans from numbers in original records.
    assert json.dumps(state, sort_keys=True) == json.dumps(expected, sort_keys=True), (ordinal, state, expected)


def playback_progress(page):
    return page.locator(f"#{PROGRESS_ID}").evaluate("meter => meter.value")


def check_stopped(page, events, ordinal, *, reset=False):
    expect(page.locator("#replay")).to_have_attribute("data-playback", "paused")
    progress = playback_progress(page)
    if reset:
        assert progress == 0, "Selecting a record should reset the meter"
    page.clock.fast_forward(3 * PLAYBACK_INTERVAL_MS)
    check_event(page, events, ordinal)
    assert playback_progress(page) == progress, "The paused meter changed"
    return progress


def set_test_visibility(page, hidden):
    # Headless Chromium keeps both tabs visible when it switches foreground tabs.
    page.evaluate("""hidden => {
        if (hidden) {
            Object.defineProperty(document, 'hidden', { configurable: true, value: true });
            Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
        } else {
            delete document.hidden;
            delete document.visibilityState;
        }
        document.dispatchEvent(new Event('visibilitychange'));
    }""", hidden)


def check_playback(page, events):
    app = page.locator("#replay")
    toggle = page.locator("#replay-toggle")
    seek = page.locator("#replay-seek")
    meter = page.get_by_role("progressbar", name="本筆播放進度")
    expect(meter).to_be_visible()
    expect(meter).to_have_attribute("id", PROGRESS_ID)
    assert meter.evaluate("meter => meter.max") == PLAYBACK_INTERVAL_MS
    expect(app).to_have_attribute("data-playback", "paused")
    expect(page.locator("#replay-prev")).to_be_disabled()

    toggle.click()
    expect(app).to_have_attribute("data-playback", "playing")
    page.clock.run_for(250)
    check_event(page, events, 0)
    animated = playback_progress(page)
    assert 0 < animated <= 250, animated
    toggle.click()
    frozen = check_stopped(page, events, 0)
    assert animated <= frozen < PLAYBACK_INTERVAL_MS, frozen
    toggle.click()
    remaining = ceil(PLAYBACK_INTERVAL_MS - frozen)
    page.clock.run_for(remaining - 5)
    check_event(page, events, 0)
    page.clock.run_for(10)
    check_event(page, events, 1)

    page.clock.run_for(100)
    page.locator("#replay-next").click()
    check_stopped(page, events, 2, reset=True)
    toggle.click()
    page.clock.run_for(100)
    page.locator("#replay-prev").click()
    check_stopped(page, events, 1, reset=True)
    toggle.click()
    seek.press("End")
    check_stopped(page, events, len(events) - 1, reset=True)
    expect(page.locator("#replay-next")).to_be_disabled()

    toggle.click()
    check_event(page, events, 0)
    expect(app).to_have_attribute("data-playback", "playing")
    page.clock.fast_forward(5 * PLAYBACK_INTERVAL_MS)
    check_event(page, events, 1)
    page.clock.run_for(PLAYBACK_INTERVAL_MS - 1)
    check_event(page, events, 1)
    page.clock.run_for(1)
    check_event(page, events, 2)

    page.clock.run_for(150)
    set_test_visibility(page, True)
    frozen = check_stopped(page, events, 2)
    assert 0 < frozen < PLAYBACK_INTERVAL_MS
    set_test_visibility(page, False)
    assert check_stopped(page, events, 2) == frozen
    toggle.click()
    page.clock.run_for(100)
    page.evaluate("window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))")
    frozen = check_stopped(page, events, 2)
    assert 0 < frozen < PLAYBACK_INTERVAL_MS
    page.evaluate("window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))")
    assert check_stopped(page, events, 2) == frozen

    seek.press("Home")
    check_stopped(page, events, 0, reset=True)
    toggle.click()
    # Exercise all records through automatic playback, including four separate tick-0 entries.
    for ordinal in range(1, len(events)):
        page.clock.run_for(PLAYBACK_INTERVAL_MS - 1)
        check_event(page, events, ordinal - 1)
        page.clock.run_for(1)
        check_event(page, events, ordinal)
    check_stopped(page, events, len(events) - 1)


def install_clock(page):
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    page.clock.install(time=start)
    page.clock.pause_at(start + timedelta(seconds=1))


def open_replay(page, origin, original):
    with page.expect_response(origin + FIXTURE_PATH) as response:
        page.goto(origin + REPLAY_PATH)
    check_fixture_response(response.value, original)
    expect(page.locator("#replay")).to_have_attribute("data-state", "ready", timeout=TIMEOUT)


def check_replay(browser, origin, original, fixture, screenshot):
    page = browser.new_page(viewport={"width": 1200, "height": 920})
    try:
        observation = observe_replay(page)
        install_clock(page)
        open_replay(page, origin, original)
        expect(page.locator("#replay-seed")).to_have_text(str(fixture["seed"]))
        expect(page.locator("#replay-phase")).to_be_visible()
        seek = page.get_by_role("slider")
        events = fixture["trace"]
        expect(seek).to_have_attribute("max", str(len(events) - 1))
        check_playback(page, events)

        check_read_only(page, origin, observation, 1)
        if screenshot:
            screenshot.parent.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=screenshot, full_page=True)
    finally:
        page.close()
    print("All 68 original records matched in order, including four separate tick-0 events and final HP 5 / 0 at 92.1 simulated seconds.")
    print("A stalled clock advanced one record. Pause/resume, stepping, seeking, simulated visibility/pagehide, and terminal stop kept record order and meter state.")


def check_reduced_motion(browser, origin, original, events):
    page = browser.new_page(reduced_motion="reduce")
    try:
        observation = observe_replay(page)
        install_clock(page)
        open_replay(page, origin, original)
        assert page.evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches")
        page.locator("#replay-toggle").click()
        for duration, value in ((150, 0), (100, 200), (200, 400)):
            page.clock.run_for(duration)
            check_event(page, events, 0)
            assert playback_progress(page) == value, "Reduced motion should paint only discrete values"
        page.clock.run_for(150)
        check_event(page, events, 1)
        assert playback_progress(page) == 0
        check_read_only(page, origin, observation, 1)
    finally:
        page.close()
    print("Reduced-motion mode painted discrete 200 ms increments while preserving the 600 ms event interval.")


def check_rendered_motion(browser, origin, original, events, directory):
    sample = f"""([lower, upper]) => {{
        const value = document.querySelector('#{PROGRESS_ID}').value;
        return document.querySelector('#replay-seek').valueAsNumber === 1 && value > lower && value < upper
            ? value : false;
    }}"""
    for width, height, label in ((1120, 900, "desktop"), (320, 830, "mobile")):
        page = browser.new_page(viewport={"width": width, "height": height}, reduced_motion="no-preference")
        try:
            observation = observe_replay(page)
            open_replay(page, origin, original)
            page.locator("#replay-next").click()
            check_event(page, events, 1)
            assert page.evaluate("innerWidth === document.documentElement.scrollWidth"), f"Overflow at {width}px"
            for selector in ("#replay-prev", "#replay-toggle", "#replay-next", "#replay-seek", f"#{PROGRESS_ID}"):
                node = page.locator(selector)
                expect(node).to_be_visible()
                assert node.evaluate("""node => {
                    const box = node.getBoundingClientRect();
                    return box.left >= 0 && box.right <= innerWidth + 0.5;
                }"""), f"{selector} is clipped at {width}px"
            page.locator("#replay-toggle").click()
            earlier = page.wait_for_function(sample, arg=[60, 320], timeout=PLAYBACK_INTERVAL_MS * 2).json_value()
            page.wait_for_function(sample, arg=[max(180, earlier + 50), 500], timeout=PLAYBACK_INTERVAL_MS * 2)
            if directory:
                directory.mkdir(parents=True, exist_ok=True)
                filename = f"{'01' if label == 'desktop' else '02'}-{label}-playback.png"
                page.screenshot(path=directory / filename, full_page=True)
            check_read_only(page, origin, observation, 1)
        finally:
            page.close()
    print("Normal-motion Chromium painted a partial meter on the same draw record at 1120px and 320px with no horizontal clipping.")


def check_retry(browser, origin, original, events):
    page = browser.new_page(viewport={"width": 390, "height": 844})
    try:
        observation = observe_replay(page)
        failures = iter((
            {"status": 503, "body": "Fixture temporarily unavailable"},
            {"status": 200, "content_type": "application/json", "body": '{"trace":[null]}'},
        ))

        def fail_twice(route):
            if fault := next(failures, None):
                route.fulfill(**fault)
            else:
                route.continue_()

        endpoint = origin + FIXTURE_PATH
        page.route(endpoint, fail_twice)
        with page.expect_response(endpoint) as response:
            page.goto(origin + REPLAY_PATH)
        assert response.value.status == 503
        retry = page.locator("#replay-retry")
        app = page.locator("#replay")
        expect(app).to_have_attribute("data-state", "failed")
        expect(retry).to_be_visible()
        expect(page.locator("#replay-status")).not_to_be_empty()
        with page.expect_response(endpoint) as response:
            retry.click()
        assert response.value.status == 200
        expect(app).to_have_attribute("data-state", "failed")
        expect(retry).to_be_visible()
        with page.expect_response(endpoint) as response:
            retry.click()
        check_fixture_response(response.value, original)
        expect(app).to_have_attribute("data-state", "ready")
        expect(retry).to_be_hidden()
        check_event(page, events, 0)
        page.get_by_role("slider").press("End")
        check_event(page, events, len(events) - 1)
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "Replay page overflowed at 390 px"
        check_read_only(page, origin, observation, 3)
    finally:
        page.close()
    print("The 390 px replay recovered from HTTP 503 and malformed trace data without live gameplay traffic.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    parser.add_argument("--port", type=int, default=4348, help="Loopback port serving the native replay")
    parser.add_argument("--screenshot", type=Path, help="Save the verified terminal replay view")
    parser.add_argument("--playback-screenshot-dir", type=Path, help="Save desktop and 320px playback screenshots")
    options = parser.parse_args()
    origin = f"http://127.0.0.1:{options.port}"
    original, fixture = original_trace()
    with TemporaryDirectory(prefix="unlight-replay-chromium-") as profile, sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=options.chromium,
            env=dict(os.environ, XDG_CONFIG_HOME=profile, XDG_CACHE_HOME=profile),
        )
        try:
            check_replay(browser, origin, original, fixture, options.screenshot)
            check_retry(browser, origin, original, fixture["trace"])
            check_reduced_motion(browser, origin, original, fixture["trace"])
            check_rendered_motion(browser, origin, original, fixture["trace"], options.playback_screenshot_dir)
        finally:
            browser.close()


if __name__ == "__main__":
    main()
