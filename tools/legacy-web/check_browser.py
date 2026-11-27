"""Verify the original title in an isolated Playwright Chromium instance."""

import argparse
import json
import os
from hashlib import sha256
from math import ceil
from pathlib import Path
from statistics import median
from tempfile import TemporaryDirectory

from playwright.sync_api import expect, sync_playwright

from frame_observation import measure_rendered_cadence


TITLE_BGM = "/public/sound/bgm/ulbgm01.mp3"
TITLE_SWF = "/Unlight.swf"
RENDERED_SAMPLE_MS = 4000

# Observe the sample buffers reaching Web Audio without changing the game or its mix.
AUDIO_METER = """
(() => {
  const connect = AudioNode.prototype.connect;
  const attached = new WeakSet();
  window.audioMeters = [];
  AudioNode.prototype.connect = function (destination, ...args) {
    const result = connect.call(this, destination, ...args);
    if (destination instanceof AudioDestinationNode && !attached.has(this)) {
      attached.add(this);
      const meter = this.context.createAnalyser();
      connect.call(this, meter);
      window.audioMeters.push(meter);
    }
    return result;
  };
})();
"""
HAS_SIGNAL = """
() => window.audioMeters.some(meter => {
  const samples = new Float32Array(meter.fftSize);
  meter.getFloatTimeDomainData(samples);
  return meter.context.state === "running" &&
    samples.some(sample => Math.abs(sample) > 0.0001);
})
"""


def measure_browser_cadence(page, duration_ms=1000):
    observation = page.evaluate("""
      duration => new Promise(resolve => {
        const timestamps = [];
        let frame;
        const deadline = setTimeout(() => finish(true), duration + 3000);

        function finish(timedOut) {
          clearTimeout(deadline);
          cancelAnimationFrame(frame);
          resolve({timestamps, timedOut});
        }

        function sample(timestamp) {
          timestamps.push(timestamp);
          if (timestamp - timestamps[0] >= duration) finish(false);
          else frame = requestAnimationFrame(sample);
        }

        frame = requestAnimationFrame(sample);
      })
    """, duration_ms)
    times = observation["timestamps"]
    intervals = sorted(after - before for before, after in zip(times, times[1:]))
    return {
        "callbacks": len(times),
        "window_ms": times[-1] - times[0] if times else 0,
        "p50_ms": median(intervals) if intervals else None,
        "p95_ms": intervals[ceil(0.95 * len(intervals)) - 1] if intervals else None,
        "max_ms": intervals[-1] if intervals else None,
        "timed_out": observation["timedOut"],
    }


def check_responsive_shell(page):
    desktop = page.viewport_size or page.evaluate("() => ({width: innerWidth, height: innerHeight})")
    sizes = []
    try:
        for viewport in (desktop, {"width": 390, "height": 844}):
            page.set_viewport_size(viewport)
            bounds = page.locator("#stage").evaluate("""
              stage => ({
                viewportWidth: innerWidth,
                viewportHeight: innerHeight,
                pageWidth: document.documentElement.scrollWidth,
                pageHeight: document.documentElement.scrollHeight,
                stage: stage.getBoundingClientRect().toJSON(),
                player: stage.querySelector('ruffle-player')?.getBoundingClientRect().toJSON()
              })
            """)
            width, height = viewport["width"], viewport["height"]
            assert (bounds["viewportWidth"], bounds["viewportHeight"]) == (width, height), bounds
            assert bounds["pageWidth"] <= width and bounds["pageHeight"] <= height, bounds
            for box in (bounds["stage"], bounds.get("player")):
                assert box and box["width"] > 0 and box["height"] > 0, bounds
                assert box["left"] >= -1 and box["top"] >= -1, bounds
                assert box["right"] <= width + 1 and box["bottom"] <= height + 1, bounds
                assert abs(box["height"] - box["width"] * 680 / 780) <= 1, bounds
            stage = bounds["stage"]
            sizes.append(f"{width}×{height} viewport, {stage['width']:.0f}×{stage['height']:.0f} stage")
    finally:
        page.set_viewport_size(desktop)
    print("Original stage shell fits both viewports. " + " | ".join(sizes), flush=True)


def write_title_frame_report(page, path, swf_response, callback_cadence, original_swf):
    player = page.locator("ruffle-player")
    movie = player.evaluate("player => player.ruffle().metadata")
    assert movie and movie["frameRate"] > 0, "Ruffle did not report an authored SWF frame rate"
    stage = player.bounding_box()
    browser = page.context.browser
    session = browser.new_browser_cdp_session()
    try:
        gpu = session.send("SystemInfo.getInfo")["gpu"].get("auxAttributes", {})
    finally:
        session.detach()

    content = measure_rendered_cadence(
        page, duration_ms=RENDERED_SAMPLE_MS, max_width=320, max_height=280,
    )
    # The inspector can evict large bodies. Match the same HTTP file version through the API client.
    tag = swf_response.headers.get("etag")
    assert tag, "The active SWF response did not have a file version tag"
    original = page.request.get(swf_response.url, headers={"If-Match": tag})
    try:
        assert original.status == 200 and original.headers.get("etag") == tag, "The served SWF changed during the observation"
        digest = sha256(original.body()).hexdigest()
    finally:
        original.dispose()
    report = {
        "chromium": browser.version,
        "ruffle": page.evaluate("String(window.RufflePlayer.newest().version)"),
        "ruffle_renderer": "wgpu-webgl",
        "gl_renderer": gpu.get("glRenderer"),
        "original_debug_bridge": original_swf,
        "swf": {"sha256": digest, **movie},
        "viewport_css": page.viewport_size,
        "stage_css": {"width": stage["width"], "height": stage["height"]},
        "device_pixel_ratio": page.evaluate("devicePixelRatio"),
        "browser_callbacks": callback_cadence,
        "rendered_content": content,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(
        f"Compositor delivered {content['samples']} samples with {content['changes']} visible changes "
        f"during {content['window_ms']:.1f} ms of observation. The SWF declares {movie['frameRate']} FPS.",
        flush=True,
    )
    assert content["ack_failures"] == 0, "Chromium failed to acknowledge compositor samples"
    assert content["changes"] > 0, "No visible title changes in the compositor samples"


def route_original_debug_bridge(page, origin):
    def intercept(route):
        url = route.request.url
        if not url.startswith(origin + "/"):
            route.abort()
        elif url == origin + "/player.js":
            response = route.fetch(max_redirects=0)
            launcher = response.text()
            option = "allowScriptAccess: false,"
            assert launcher.count(option) == 1, "Could not locate the original client's bridge option"
            route.fulfill(response=response, body=launcher.replace(option, "allowScriptAccess: true,", 1))
        else:
            route.continue_()

    page.route("**/*", intercept)


def check_title(browser, url, screenshot, frame_report=None, *, original_swf=False):
    page = browser.new_page(
        viewport={"width": 900, "height": 760}, device_scale_factor=1,
        service_workers="block" if original_swf else "allow",
    )
    if original_swf:
        route_original_debug_bridge(page, url)
    page.add_init_script(AUDIO_METER)
    renderer_logs = []
    page.on("console", lambda message: renderer_logs.append(message.text)
            if "Used renderer:" in message.text else None)
    swf_responses = []
    if frame_report:
        page.on("response", lambda response: swf_responses.append(response)
                if response.url == url + TITLE_SWF and response.status == 200 else None)

    page.goto(url)
    with page.expect_response(
        lambda response: response.url == url + TITLE_BGM and response.ok, timeout=45000
    ):
        page.get_by_role("button", name="開始遊戲").click()
    expect(page.locator("#launch")).to_be_hidden(timeout=45000)
    assert any("Used renderer: wgpu-webgl" in line for line in renderer_logs), renderer_logs
    page.wait_for_function(HAS_SIGNAL, timeout=30000)

    acceleration_dialog = page.locator("ruffle-player #hardware-acceleration-modal:not(.hidden)")
    if acceleration_dialog.is_visible():
        acceleration_dialog.locator(".close-modal").click()
    stage = page.locator("#stage")
    frames = {stage.screenshot() for _ in range(3)}
    assert len(frames) > 1, "The title stage did not animate between samples"
    print("Title rendered with wgpu-webgl, animated, and produced a Web Audio signal.", flush=True)
    cadence = measure_browser_cadence(page)
    print(
        f"During the title, browser requestAnimationFrame recorded {cadence['callbacks']} callbacks "
        f"over {cadence['window_ms']:.1f} ms. The SWF timeline has its own authored frame rate.",
        flush=True,
    )
    if cadence["p50_ms"] is not None:
        print(
            f"Browser callback intervals had a p50 of {cadence['p50_ms']:.1f} ms, "
            f"p95 of {cadence['p95_ms']:.1f} ms, and maximum of {cadence['max_ms']:.1f} ms.",
            flush=True,
        )
    if cadence["timed_out"]:
        print("Browser callback sampling reached the observation deadline.", flush=True)
    if frame_report:
        assert len(swf_responses) == 1, "Expected a complete browser response for the active title SWF"
        write_title_frame_report(page, frame_report, swf_responses[0], cadence, original_swf)
    if screenshot:
        screenshot.parent.mkdir(parents=True, exist_ok=True)
        stage.screenshot(path=screenshot)
    check_responsive_shell(page)
    page.close()


def check_no_webgl(browser, url):
    page = browser.new_page()
    page.add_init_script("""
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
        return kind === "webgl2" ? null : getContext.call(this, kind, ...args);
      };
    """)
    page.goto(url)
    start = page.get_by_role("button", name="開始遊戲")
    start.click()
    expect(page.get_by_role("status")).to_contain_text("無法使用 WebGL 2")
    expect(start).to_be_enabled()
    expect(page.locator("ruffle-player")).to_have_count(0)
    page.close()
    print("The launcher reports missing WebGL 2 and supports retry.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    parser.add_argument("--port", type=int, default=4330)
    parser.add_argument("--software", action="store_true", help="Use ANGLE SwiftShader in the test process")
    parser.add_argument("--screenshot", type=Path)
    parser.add_argument("--frame-report", type=Path, help="Save SWF metadata, callback timing and visible title changes as JSON")
    parser.add_argument("--original-swf", action="store_true", help="Enable the source-built original SWF's logging bridge in the isolated test page")
    options = parser.parse_args()
    url = f"http://127.0.0.1:{options.port}"
    chromium_args = ["--use-gl=angle", "--use-angle=swiftshader"] if options.software else []

    with TemporaryDirectory(prefix="unlight-chromium-") as profile, sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=options.chromium,
            args=chromium_args,
            ignore_default_args=["--enable-unsafe-swiftshader", "--mute-audio"],
            env=dict(os.environ, XDG_CONFIG_HOME=profile, XDG_CACHE_HOME=profile),
        )
        try:
            check_title(browser, url, options.screenshot, options.frame_report, original_swf=options.original_swf)
            check_no_webgl(browser, url)
        finally:
            browser.close()


if __name__ == "__main__":
    main()
