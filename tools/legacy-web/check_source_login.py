"""Check the fixed title, original audio and a rejected login on an isolated server."""

import argparse
from base64 import b64encode
from hashlib import sha256
from secrets import token_hex
from time import monotonic

from playwright.sync_api import expect, sync_playwright

BGM = "/public/sound/bgm/ulbgm01.mp3"
BGM_SHA256 = "82924cf090817ea98e5c6b524f46a90e6dbe3cb79ee6413ab1010aebcd085f89"
CLICK = "/public/sound/se/ulse01.mp3"
ALERT = "/public/sound/se/ulse02.mp3"
SOUND_SHA256 = {
    BGM: BGM_SHA256,
    CLICK: "2f67cac2f64df9a516984f9d2d579b2e3da26e58ae8545001ce0a34bdcfa6b51",
    ALERT: "a18e72cdaab4ba75d76dedbbe32ff08e460a45b5a28120da63e977c7dc5fe195",
}
ENTRY = "/source-login/"
CHROMIUM_GRAPHICS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
STRICT_AUTOPLAY = [
    "--autoplay-policy=document-user-activation-required",
    "--disable-features=PreloadMediaEngagementData,MediaEngagementBypassAutoplayPolicies",
]
PANEL_ART = "/source-login/assets/panel_gene.png"
PANEL_SHA256 = "81038be00fa27a1143ac651a789d0a665d51a7be326f322685c7f6cddb85ee3b"
OBSERVE_MUSIC = """(() => {
  window.musicAttempts = [];
  window.musicSeeks = [];
  window.soundEffects = 0;
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...args) {
    window.soundEffects++;
    return start.apply(this, args);
  };
  const gains = new WeakMap();
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (destination, ...args) {
    const result = connect.call(this, destination, ...args);
    if (this instanceof MediaElementAudioSourceNode && destination instanceof GainNode) {
      gains.set(this.mediaElement, destination);
    }
    return result;
  };
  window.musicGain = audio => gains.get(audio)?.gain.value ?? null;
  window.musicVolume = audio => {
    const output = gains.get(audio);
    return audio?.muted || (output && output.context.state !== 'running')
      ? 0 : (audio?.volume ?? 0) * (output?.gain.value ?? 1);
  };
  const currentTime = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
  Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
    ...currentTime,
    set(value) {
      const result = currentTime.set.call(this, value);
      window.musicSeeks.push({
        value,
        entry: document.querySelector('#stage')?.dataset.entry,
        path: new URL(this.currentSrc || this.src).pathname,
      });
      return result;
    },
  });
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) {
    const attempt = {
      path: new URL(this.currentSrc || this.src).pathname,
      entry: document.querySelector('#stage')?.dataset.entry,
      activated: navigator.userActivation.hasBeenActive,
      volume: this.volume,
      gain: window.musicGain(this),
    };
    window.musicAttempts.push(attempt);
    const result = play.apply(this, args);
    void result.then(() => { attempt.result = 'playing'; }, error => { attempt.result = error.name; });
    return result;
  };
})()"""
READ_MUSIC = """(() => {
  const stage = document.querySelector('#stage');
  const button = document.querySelector('#title-music-start');
  const audio = stage?.querySelector('audio');
  return {
    entry: stage?.dataset.entry ?? null,
    loadingFrame: stage?.querySelector('canvas')?.hasAttribute('data-loading-frame') ?? false,
    state: stage?.dataset.musicState ?? null,
    activated: navigator.userActivation.hasBeenActive,
    buttonVisible: Boolean(button?.getClientRects().length),
    time: audio?.currentTime ?? 0,
    gain: window.musicGain(audio),
    volume: window.musicVolume(audio),
    audible: Boolean(audio && !audio.paused && window.musicVolume(audio) > 0),
    attempts: window.musicAttempts,
    seeks: window.musicSeeks,
    soundEffects: window.soundEffects,
  };
})()"""


def music_state(cdp):
    # Playwright's usual Chromium evaluate marks scripts as user gestures. Observe
    # without one so the browser's autoplay decision comes from real input only.
    return cdp.send("Runtime.evaluate", {
        "expression": READ_MUSIC, "returnByValue": True, "userGesture": False,
    })["result"]["value"]


def wait_music(page, cdp, condition):
    deadline = monotonic() + 14
    while True:
        state = music_state(cdp)
        if condition(state):
            return state
        assert monotonic() < deadline, state
        page.wait_for_timeout(50)


def check_music_activation(browser, origin, gesture):
    page = browser.new_page(viewport={"width": 780, "height": 680}, device_scale_factor=1,
                            has_touch=gesture in ("touch", "loading touch"),
                            reduced_motion="no-preference" if gesture == "loading touch" else "reduce")
    sockets, errors, delayed = [], [], []
    page.on("websocket", lambda socket: sockets.append(socket.url))
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.add_init_script(OBSERVE_MUSIC)
    cdp = page.context.new_cdp_session(page)
    if gesture == "loading touch":
        page.route(origin + "/source-login/assets/event_title.swf", lambda route: delayed.append(route))
    try:
        assert page.goto(origin + ENTRY, wait_until="domcontentloaded").ok
        if gesture == "loading touch":
            wait_music(page, cdp, lambda state: state["entry"] == "loading" and state["loadingFrame"] and delayed)
            assert not music_state(cdp)["activated"]
            cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": 410, "y": 140}]})
            assert not music_state(cdp)["activated"], "Touch start must not unlock autoplay in Chromium"
            cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
            during_load = wait_music(page, cdp, lambda state: state["activated"] and state["gain"] == 0)
            assert during_load["entry"] == "loading" and not during_load["audible"] and during_load["volume"] == 0
            assert not during_load["buttonVisible"]
            assert any(attempt["entry"] == "loading" and attempt["gain"] == 0 for attempt in during_load["attempts"])
            delayed[0].continue_()
        elif gesture != "autoplay":
            blocked = wait_music(page, cdp, lambda state: state["entry"] == "ready" and state["state"] == "blocked")
            assert blocked["buttonVisible"]
            assert not blocked["activated"] and not blocked["audible"] and blocked["time"] == 0
            assert any(attempt.get("result") == "NotAllowedError" and not attempt["activated"]
                       for attempt in blocked["attempts"])
            if gesture == "blank stage":
                page.mouse.click(410, 140)
            elif gesture == "field":
                page.locator("#username").click()
            elif gesture == "keyboard":
                cdp.send("Runtime.evaluate", {"expression": "document.querySelector('#username').focus()",
                                              "userGesture": False})
                page.keyboard.press("a")
            elif gesture == "touch":
                page.touchscreen.tap(410, 140)
            else:
                page.locator("#title-music-start").click()

        playing = wait_music(page, cdp, lambda state: (
            state["entry"] == "ready" and state["state"] == "playing" and state["audible"] and state["time"] > 0.2
        ))
        assert not playing["buttonVisible"]
        assert playing["volume"] == 0.5
        assert playing["soundEffects"] == 0
        assert playing["activated"] == (gesture != "autoplay")
        assert playing["attempts"] and all(attempt["path"] == BGM for attempt in playing["attempts"])
        assert any(attempt.get("result") == "playing" and attempt["entry"] in ("entering", "ready")
                   and attempt["volume"] > 0 for attempt in playing["attempts"])
        if gesture == "loading touch":
            assert playing["gain"] == 0.5
            assert {"value": 0, "entry": "entering", "path": BGM} in playing["seeks"]
        assert not sockets and not errors, (sockets, errors)
    finally:
        page.close()


def check_panel_alpha(page, panel):
    box = panel.bounding_box()
    bottom = int(box["height"])
    # The authored 42px sides and 60px/32px cap and foot stay fixed as the body grows.
    samples = [(0, 0, (255, 255, 255, 0)), (1, 1, (0, 0, 0, 195)), (3, 3, (230, 230, 230, 255)),
               (4, 31, (107, 124, 152, 255)), (1, bottom - 1, (0, 0, 0, 44)),
               (3, bottom - 4, (243, 243, 243, 255))]
    front = page.screenshot(clip=box, scale="css")
    previous = panel.evaluate("node => { const value = node.style.visibility; node.style.visibility = 'hidden'; return value; }")
    try:
        behind = page.screenshot(clip=box, scale="css")
    finally:
        panel.evaluate("(node, value) => { node.style.visibility = value; }", previous)
    front_pixels, behind_pixels = page.evaluate("""async ({shots, points}) => Promise.all(shots.map(async encoded => {
      const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
      const image = await createImageBitmap(new Blob([bytes], {type: 'image/png'}));
      const pixels = new OffscreenCanvas(image.width, image.height).getContext('2d');
      pixels.drawImage(image, 0, 0);
      image.close();
      return points.map(([x, y]) => Array.from(pixels.getImageData(x, y, 1, 1).data).slice(0, 3));
    }))""", {"shots": [b64encode(image).decode("ascii") for image in (front, behind)],
               "points": [(x, y) for x, y, _ in samples]})
    for (x, y, rgba), actual, base in zip(samples, front_pixels, behind_pixels):
        expected = [round((source * rgba[3] + background * (255 - rgba[3])) / 255)
                    for source, background in zip(rgba[:3], base)]
        assert all(abs(value - reference) <= 1 for value, reference in zip(actual, expected)), (x, y, actual, expected)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=4389)
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    parser.add_argument("--screenshot", help="Save the 780×680 login view")
    parser.add_argument("--alert-screenshot", help="Save the centered stage and error dialog at 1040×900")
    args = parser.parse_args()
    origin = f"http://127.0.0.1:{args.port}"

    with sync_playwright() as tool:
        browser = tool.chromium.launch(executable_path=args.chromium, args=[
            *CHROMIUM_GRAPHICS, *STRICT_AUTOPLAY,
        ])
        for gesture in ("blank stage", "field", "keyboard", "touch", "button", "loading touch"):
            check_music_activation(browser, origin, gesture)
        page = browser.new_page(viewport={"width": 780, "height": 680}, device_scale_factor=1)
        page.emulate_media(reduced_motion="reduce")
        page.add_init_script("""(() => {
          window.titleAudio = [];
          window.titleEffects = [];
          window.nativeValidationEvents = 0;
          addEventListener("invalid", () => { window.nativeValidationEvents += 1; }, true);
          const play = HTMLMediaElement.prototype.play;
          HTMLMediaElement.prototype.play = function (...args) {
            window.titleAudio.push(this);
            return play.apply(this, args);
          };
          const start = AudioBufferSourceNode.prototype.start;
          AudioBufferSourceNode.prototype.start = function (...args) {
            window.titleEffects.push({ source: this, time: this.context.currentTime });
            return start.apply(this, args);
          };
        })()""")
        sockets, errors = [], []
        page.on("websocket", lambda socket: sockets.append(socket.url))
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(origin + "/source-login/", wait_until="domcontentloaded")
        stage = page.locator("#stage")
        expect(stage).to_have_attribute("data-entry", "ready")
        assert stage.evaluate("node => [node.offsetWidth, node.offsetHeight]") == [780, 680]
        assert page.evaluate("getComputedStyle(document.documentElement).backgroundColor") == "rgb(8, 8, 8)"
        expect(page.locator("#stage-background")).to_have_attribute("data-title-state", "ready")
        skin = page.request.get(origin + PANEL_ART)
        assert skin.ok and sha256(skin.body()).hexdigest() == PANEL_SHA256
        check_panel_alpha(page, page.locator("#login"))

        news = page.locator("#news")
        expect(news).to_have_attribute("data-state", "ready")
        assert news.evaluate("""node => [node.offsetLeft, node.offsetTop, node.offsetWidth, node.offsetHeight]""") == [
            15, 480, 220, 200,
        ], "News differs from the original ActionScript panel geometry"
        expect(news.locator("li")).to_have_count(3)
        for selector, text in [("#login-title", "Login"), ("#news-title", "News")]:
            header = page.locator(selector)
            expect(header).to_have_text(text)
            assert "Bradley" not in header.evaluate("node => getComputedStyle(node).fontFamily"), (
                "Flex renders the panel caption as separate device text"
            )

        toggle = page.get_by_role("button", name="Create New Account", exact=True)
        expect(toggle).to_be_visible()
        submit = page.get_by_role("button", name="Login", exact=True)
        submit_box = submit.bounding_box()
        login_box = page.locator("#login").bounding_box()
        assert submit_box["x"] + submit_box["width"] / 2 == login_box["x"] + login_box["width"] / 2
        button_skin = submit.evaluate("node => getComputedStyle(node).backgroundImage")
        assert button_skin.startswith("linear-gradient(")
        assert toggle.bounding_box()["y"] >= submit_box["y"] + submit_box["height"]
        toggle.click()
        expect(page.locator("#login-title")).to_have_text("Register")
        check_panel_alpha(page, page.locator("#login"))
        expect(page.locator("#confirm-password")).to_be_visible()
        expect(page.locator("#email")).to_be_visible()
        page.get_by_role("button", name="Login Form", exact=True).click()
        expect(page.locator("#login-title")).to_have_text("Login")
        expect(page.locator("#confirm-password")).to_be_hidden()
        expect(page.locator("#email")).to_be_hidden()

        for path, expected_sha in SOUND_SHA256.items():
            response = page.request.get(origin + path)
            assert response.ok and sha256(response.body()).hexdigest() == expected_sha
        page.wait_for_function(
            """path => window.titleAudio.some(audio => audio.src.endsWith(path)
               && audio.loop && !audio.paused && audio.currentTime > 0.2)""",
            arg=BGM,
        )
        assert not sockets and not errors, (sockets, errors)
        if args.screenshot:
            stage.screenshot(path=args.screenshot, scale="css")

        page.set_viewport_size({"width": 1040, "height": 900})
        bounds = stage.bounding_box()
        assert [bounds[key] for key in ("x", "y", "width", "height")] == [130, 110, 780, 680]
        dialog = page.get_by_role("alertdialog", name="Error", exact=True)
        message = dialog.locator("#login-alert-message")
        ok = dialog.get_by_role("button", name="OK", exact=True)
        username = page.locator("#username")
        password = page.locator("#password")

        submit.click()
        expect(message).to_have_text("請輸入名字。")
        expect(ok).to_be_focused()
        ok.click()
        expect(dialog).to_be_hidden()
        expect(username).to_be_focused()

        username.fill("smoke" + token_hex(5))
        password.press("Enter")
        expect(message).to_have_text("認證失敗")
        expect(ok).to_be_focused()
        page.mouse.move(4, 4)
        assert ok.evaluate("node => getComputedStyle(node).backgroundImage") == button_skin
        ok.press("Escape")
        expect(dialog).to_be_hidden()
        expect(password).to_be_focused()
        assert not sockets and page.evaluate("window.nativeValidationEvents") == 0

        title_time = page.locator("#stage > audio[data-bgm-scene='title']").evaluate("""audio => {
          window.rejectedLoginTitle = audio;
          return audio.currentTime;
        }""")
        password.fill("testonly")
        submit.click()
        expect(dialog).to_be_visible()
        expect(message).to_have_text("認證失敗")
        expect(ok).to_be_focused()
        box = dialog.bounding_box()
        assert [box["x"] + box["width"] / 2, box["y"] + box["height"] / 2] == [520, 450]
        assert stage.evaluate("""node => {
          const scrim = getComputedStyle(node, '::after');
          return scrim.backgroundColor === 'rgba(221, 221, 221, 0.5)'
            && scrim.backdropFilter === 'blur(3px)';
        }""")
        assert page.locator("#username").evaluate("input => { input.focus(); return document.activeElement !== input; }")
        page.wait_for_function("""time => {
          const title = window.rejectedLoginTitle;
          return title === document.querySelector("#stage > audio[data-bgm-scene='title']") && !title.paused
            && title.currentTime > time && title.volume === 0.5;
        }""", arg=title_time)
        check_panel_alpha(page, page.locator("#login-alert"))
        page.wait_for_function(
            """path => window.titleAudio.some(audio => audio.src.endsWith(path) && audio.currentTime > 0)
              && window.titleEffects.some(({ source, time }) =>
                source.buffer && source.buffer.duration > 1.25 && source.buffer.duration < 1.4
                && source.buffer.getChannelData(0).some(sample => sample !== 0)
                && source.context.state === 'running' && source.context.currentTime > time)""",
            arg=CLICK,
        )
        if args.alert_screenshot:
            page.screenshot(path=args.alert_screenshot, scale="css")
        ok.click()
        expect(dialog).to_be_hidden()
        expect(page.locator("#password")).to_be_focused()
        expect(page.locator("#password")).to_have_value("")
        assert len(sockets) == 1 and not errors, (sockets, errors)
        assert page.url == origin + "/source-login/"
        browser.close()
        browser = tool.chromium.launch(executable_path=args.chromium, args=[
            *CHROMIUM_GRAPHICS, "--autoplay-policy=no-user-gesture-required",
        ])
        try:
            check_music_activation(browser, origin, "autoplay")
        finally:
            browser.close()
    print("Original title audio autoplay, activation fallbacks, fixed stage, three News items and modal rejection passed.")


if __name__ == "__main__":
    main()
