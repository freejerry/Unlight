"""Verify the original title in an isolated Playwright Chromium instance."""

import argparse
import os
from pathlib import Path
from tempfile import TemporaryDirectory

from playwright.sync_api import expect, sync_playwright

from check_relay import SERVICES


TITLE_BGM = "/public/sound/bgm/ulbgm01.mp3"

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


def check_title(browser, url, screenshot):
    page = browser.new_page(viewport={"width": 900, "height": 760})
    page.add_init_script(AUDIO_METER)
    renderer_logs = []
    page.on("console", lambda message: renderer_logs.append(message.text)
            if "Used renderer:" in message.text else None)

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
    if screenshot:
        screenshot.parent.mkdir(parents=True, exist_ok=True)
        stage.screenshot(path=screenshot)
    page.close()
    print("Title rendered with wgpu-webgl, animated, and produced a Web Audio signal.")


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


def check_native_relay(browser, url):
    page = browser.new_page()
    page.route("**/ruffle/**", lambda route: route.abort())
    page.goto(url)
    page.evaluate("""async (services) => {
      const { encodeClientFrame, relayURL, ServerFrameDecoder } = await import('/protocol.mjs');
      await Promise.all(services.map(([name, port, ping, pong]) => new Promise((resolve, reject) => {
        const socket = new WebSocket(relayURL(port));
        socket.binaryType = 'arraybuffer';
        const decoder = new ServerFrameDecoder();
        const timer = setTimeout(() => finish(new Error(`${name}: response timed out`)), 5000);

        function finish(error) {
          clearTimeout(timer);
          socket.onclose = null;
          socket.close();
          if (error) reject(error);
          else resolve();
        }

        socket.onopen = () => socket.send(encodeClientFrame(Uint8Array.of(0, ping)));
        socket.onerror = () => finish(new Error(`${name}: WebSocket failed`));
        socket.onclose = () => finish(new Error(`${name}: WebSocket closed early`));
        socket.onmessage = ({ data }) => {
          try {
            const [payload] = decoder.push(new Uint8Array(data));
            if (!payload) return;
            if (payload.length !== 2 || payload[0] !== 0 || payload[1] !== pong) {
              throw new Error(`${name}: incorrect KeepAlive response`);
            }
            finish();
          } catch (error) {
            finish(error);
          }
        };
      })));
    }""", SERVICES)
    page.close()
    print("Native browser WebSockets received all six legacy KeepAlive responses.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    parser.add_argument("--port", type=int, default=4330)
    parser.add_argument("--software", action="store_true", help="Use ANGLE SwiftShader in the test process")
    parser.add_argument("--screenshot", type=Path)
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
            check_native_relay(browser, url)
            check_title(browser, url, options.screenshot)
            check_no_webgl(browser, url)
        finally:
            browser.close()


if __name__ == "__main__":
    main()
