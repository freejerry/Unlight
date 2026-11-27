"""Verify Chromium login and logout against a disposable original Ruby account."""

import argparse
import getpass
import json
import os
import re
import secrets
import struct
import sys
from contextlib import ExitStack
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import quote, quote_plus, urlsplit

from playwright.sync_api import expect, sync_playwright

from check_native_browser import TIMEOUT, check_native_requests, load_diagnostics, observe


FIELD_PATTERN = r"[A-Za-z0-9_.\-]{1,16}"
SESSION_SERVICES = {"lobby": 12002, "data": 12003, "chat": 12020}


def read_password(options):
    if options.password_file:
        return options.password_file.read_text(encoding="utf-8").rstrip("\r\n")
    if options.password_stdin:
        return sys.stdin.readline().rstrip("\r\n")
    return getpass.getpass("Disposable test account password: ")


def submit(page, username, password, state):
    form = page.locator("#session-form")
    form.locator("#session-username").fill(username)
    form.locator("#session-password").fill(password)
    form.locator('button[type="submit"]').click()
    status = page.locator("#session-status")
    expect(status).to_have_attribute("data-state", state, timeout=TIMEOUT)
    if state == "failed":
        expect(status).to_have_attribute("data-error-kind", "credentials")
    expect(form.locator("#session-password")).to_have_value("")


def frames_for(chunks, size_width, count):
    assert chunks and all(isinstance(chunk, bytes) for chunk in chunks), "Expected binary WebSocket payloads"
    data = b"".join(chunks)
    packets = []
    cursor = 0
    for _ in range(count):
        length = int.from_bytes(data[cursor : cursor + size_width], "big")
        start = cursor + size_width
        end = start + length
        assert length >= 2 and data[end : end + 1] == b"\n", "Original frame boundaries did not match"
        packets.append(data[start:end])
        cursor = end + 1
    return packets


def command_ids(packets):
    return [int.from_bytes(packet[:2], "big") for packet in packets]


def verify_exchange(sockets, challenge, result, player_id=None):
    expected_paths = {"/socket/12001"}
    if player_id is not None:
        expected_paths.update(f"/socket/{port}" for port in SESSION_SERVICES.values())
    paths = [urlsplit(socket[0]).path for socket in sockets]
    assert paths[:1] == ["/socket/12001"] and len(paths) == len(expected_paths) and set(paths) == expected_paths, "Unexpected session sockets"
    _, sent, received = sockets[0]
    expected_sent = [1, 2] if challenge else [1]
    expected_received = [1, result] if challenge else [result]
    outgoing = frames_for(sent, 2, len(expected_sent))
    incoming = frames_for(received, 4, len(expected_received))
    assert command_ids(outgoing) == expected_sent, "Auth commands did not match the original"
    assert command_ids(incoming) == expected_received, "Auth result did not match the original"
    if challenge:
        proof = outgoing[1][2:]
        assert proof[:2] == b"\x00\x28" and re.fullmatch(b"[a-f0-9]{40}", proof[2:]), "Expected a canonical SRP proof"
    for _, sent, received in sockets[1:]:
        outgoing = frames_for(sent, 2, 2)
        frames_for(received, 4, 2)
        assert outgoing[0] == struct.pack("!HI", 0, player_id), "Service negotiation used a different player ID"


def signed_in_player(page):
    for service in SESSION_SERVICES:
        expect(page.locator(f"#session-{service}")).to_have_attribute("data-verified", "true")
    player = page.locator("#session-player-id")
    expect(player).to_have_text(re.compile("^[1-9][0-9]*$"))
    return int(player.inner_text())


def sign_out(page, live_sockets):
    expect(page.locator("#session-signout")).to_be_enabled()
    assert len(live_sockets) == len(SESSION_SERVICES) + 1, "Unexpected active socket count"
    assert not any(socket.is_closed() for socket in live_sockets), "Expected all session sockets to remain active"
    with ExitStack() as events:
        for socket in live_sockets:
            events.enter_context(socket.expect_event("close", timeout=TIMEOUT))
        page.locator("#session-signout").click()
    expect(page.locator("#session-status")).to_have_attribute("data-state", "idle")
    expect(page.locator("#session-password")).to_have_value("")
    for service in SESSION_SERVICES:
        expect(page.locator(f"#session-{service}")).not_to_have_attribute("data-verified", "true")


def secret_forms(value):
    return {value, quote(value, safe=""), quote_plus(value, safe=""), json.dumps(value)[1:-1]}


def ensure_no_password(requests, sockets, passwords):
    for request in requests:
        assert request.method == "GET" and not request.post_data_buffer, "Login sent an HTTP payload"
        metadata = [request.url, *request.all_headers().values()]
        for password in passwords:
            if len(password.encode()) >= 8:
                assert not any(secret in field for secret in secret_forms(password) for field in metadata), "Password leaked in HTTP metadata"
    for _, sent, received in sockets:
        for chunks in (sent, received):
            data = b"".join(chunk.encode() if isinstance(chunk, str) else chunk for chunk in chunks)
            for password in passwords:
                if len(password.encode()) >= 8:
                    assert password.encode() not in data, "Plaintext password leaked over WebSocket"


def check_session(browser, origin, username, wrong_username, password, wrong_password, screenshot):
    page = browser.new_page(viewport={"width": 1360, "height": 1100})
    try:
        traffic = observe(page)
        _, sockets, _ = traffic
        requests = []
        live_sockets = []
        page.on("request", lambda request: requests.append(request))
        page.on("websocket", lambda socket: live_sockets.append(socket))
        load_diagnostics(page, origin)
        assert not sockets, "Login opened a socket before submission"
        expect(page.locator("#session-status")).to_have_attribute("data-state", "idle")
        for selector in ("#session-username", "#session-password"):
            field = page.locator(selector)
            expect(field).to_have_attribute("maxlength", "16")
            expect(field).to_have_attribute("pattern", FIELD_PATTERN)

        missing_name = "qa" + secrets.token_hex(6)
        submit(page, missing_name, wrong_password, "failed")
        verify_exchange(sockets, challenge=False, result=3)

        offset = len(sockets)
        submit(page, wrong_username, wrong_password, "failed")
        verify_exchange(sockets[offset:], challenge=True, result=9)

        offset = len(sockets)
        submit(page, username, password, "signed-in")
        player_id = signed_in_player(page)
        verify_exchange(sockets[offset:], challenge=True, result=2, player_id=player_id)
        sign_out(page, live_sockets[offset:])

        offset = len(sockets)
        submit(page, username, password, "signed-in")
        assert signed_in_player(page) == player_id, "Re-login returned a different player"
        verify_exchange(sockets[offset:], challenge=True, result=2, player_id=player_id)
        check_native_requests(page, origin, traffic)
        ensure_no_password(requests, sockets, [password, wrong_password])
        if screenshot:
            screenshot.parent.mkdir(parents=True, exist_ok=True)
            page.get_by_role("region", name="本機登入驗證").screenshot(
                path=screenshot,
                mask=[page.locator("#session-username"), page.locator("#session-password")],
            )
        sign_out(page, live_sockets[offset:])
    finally:
        page.close()
    print("Chromium matched the original unknown-user and wrong-password responses.")
    print("Original Ruby SRP and Lobby, Data, and GlobalChat passed on login and re-login; all four sockets closed on sign-out.")
    print("The password field cleared, and inspected traffic stayed on the native origin.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    parser.add_argument("--port", type=int, default=4342, help="Loopback port serving native diagnostics")
    parser.add_argument("--username", required=True, help="Disposable seeded account for valid login")
    parser.add_argument("--wrong-username", help="Optional separate disposable account for the rejection test")
    input_mode = parser.add_mutually_exclusive_group()
    input_mode.add_argument("--password-file", type=Path, help="Read the password from a private text file")
    input_mode.add_argument("--password-stdin", action="store_true", help="Read one password line from stdin")
    parser.add_argument("--screenshot", type=Path, help="Save the verified signed-in view with form fields masked")
    options = parser.parse_args()
    if not (options.password_file or options.password_stdin or sys.stdin.isatty()):
        parser.error("use --password-file or --password-stdin without an interactive terminal")

    wrong_username = options.wrong_username or options.username
    wrong_password = secrets.token_hex(7)
    password = read_password(options)
    if any(not re.fullmatch(FIELD_PATTERN, value) for value in (options.username, wrong_username, password)):
        parser.error("test account inputs must match the original 1–16 character field format")
    while password == wrong_password:
        wrong_password = secrets.token_hex(7)

    # Playwright debug and tracing output must never record passwords passed to fill().
    for setting in ("DEBUG", "PWDEBUG"):
        os.environ.pop(setting, None)
    origin = f"http://127.0.0.1:{options.port}"
    try:
        with TemporaryDirectory(prefix="unlight-session-chromium-") as profile, sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                executable_path=options.chromium,
                env=dict(os.environ, XDG_CONFIG_HOME=profile, XDG_CACHE_HOME=profile),
            )
            try:
                check_session(browser, origin, options.username, wrong_username, password, wrong_password, options.screenshot)
            finally:
                browser.close()
    except Exception as error:
        message = str(error).split("\n\nCall log:", 1)[0]
        redactions = set().union(*(secret_forms(value) for value in (options.username, wrong_username, password, wrong_password)))
        for value in sorted(redactions, key=len, reverse=True):
            message = message.replace(value, "[redacted]")
        sys.exit(f"Native session acceptance failed ({type(error).__name__}): {message}")


if __name__ == "__main__":
    main()
