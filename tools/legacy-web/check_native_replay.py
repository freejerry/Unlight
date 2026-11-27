"""Verify the native Chromium inspector against the archived original Ruby trace."""

import argparse
from datetime import datetime, timedelta, timezone
from hashlib import sha256
import json
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


def check_playback(page, events):
    app = page.locator("#replay")
    toggle = page.locator("#replay-toggle")
    seek = page.locator("#replay-seek")
    expect(app).to_have_attribute("data-playback", "paused")
    expect(page.locator("#replay-prev")).to_be_disabled()
    toggle.click()
    expect(app).to_have_attribute("data-playback", "playing")
    page.clock.run_for(PLAYBACK_INTERVAL_MS - 1)
    check_event(page, events, 0)
    page.clock.run_for(1)
    check_event(page, events, 1)
    # Same-tick records advance separately, followed by tick 132 on the same UI cadence.
    for ordinal in (2, 3, 4):
        page.clock.run_for(PLAYBACK_INTERVAL_MS)
        check_event(page, events, ordinal)
    toggle.click()
    expect(app).to_have_attribute("data-playback", "paused")
    page.clock.run_for(2 * PLAYBACK_INTERVAL_MS)
    check_event(page, events, 4)

    page.locator("#replay-prev").click()
    check_event(page, events, 3)
    page.locator("#replay-next").click()
    check_event(page, events, 4)
    seek.press("End")
    check_event(page, events, len(events) - 1)
    expect(page.locator("#replay-next")).to_be_disabled()
    toggle.click()
    check_event(page, events, 0)
    expect(app).to_have_attribute("data-playback", "playing")
    seek.press("End")
    expect(app).to_have_attribute("data-playback", "paused")
    seek.press("ArrowLeft")
    check_event(page, events, len(events) - 2)
    toggle.click()
    page.clock.run_for(PLAYBACK_INTERVAL_MS)
    check_event(page, events, len(events) - 1)
    expect(app).to_have_attribute("data-playback", "paused")
    page.clock.run_for(2 * PLAYBACK_INTERVAL_MS)
    check_event(page, events, len(events) - 1)


def check_replay(browser, origin, original, fixture, screenshot):
    page = browser.new_page(viewport={"width": 1200, "height": 920})
    try:
        observation = observe_replay(page)
        start = datetime(2026, 1, 1, tzinfo=timezone.utc)
        page.clock.install(time=start)
        page.clock.pause_at(start + timedelta(seconds=1))
        with page.expect_response(origin + FIXTURE_PATH) as response:
            page.goto(origin + REPLAY_PATH)
        check_fixture_response(response.value, original)
        expect(page.locator("#replay")).to_have_attribute("data-state", "ready", timeout=TIMEOUT)
        expect(page.locator("#replay-seed")).to_have_text(str(fixture["seed"]))
        expect(page.locator("#replay-phase")).to_be_visible()
        seek = page.get_by_role("slider")
        events = fixture["trace"]
        expect(seek).to_have_attribute("max", str(len(events) - 1))
        check_playback(page, events)

        seek.press("Home")
        for ordinal in range(len(events)):
            check_event(page, events, ordinal)
            if ordinal < len(events) - 1:
                seek.press("ArrowRight")
        check_read_only(page, origin, observation, 1)
        if screenshot:
            screenshot.parent.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=screenshot, full_page=True)
    finally:
        page.close()
    print("All 68 original records matched in order, including four separate tick-0 events and final HP 5 / 0 at 92.1 simulated seconds.")
    print("Playback, pause, seeking, terminal stop, and restart worked at the UI interval, independent of Ruby ticks.")


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
        finally:
            browser.close()


if __name__ == "__main__":
    main()
