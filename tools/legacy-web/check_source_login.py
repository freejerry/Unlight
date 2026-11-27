"""Check the fixed title, original audio and a rejected login on an isolated server."""

import argparse
from hashlib import sha256
from secrets import token_hex

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
            "--autoplay-policy=user-gesture-required",
            "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
        ])
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
    print("Fixed title, centered stage, account form, three News items, original audio and modal rejection passed.")


if __name__ == "__main__":
    main()
