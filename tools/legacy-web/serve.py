"""Serve the original Unlight client or native diagnostics with a loopback relay."""

import argparse
import asyncio
from contextlib import suppress
from hashlib import sha256
from pathlib import Path
from xml.etree import ElementTree

from aiohttp import WSMsgType, web
from yarl import URL


HOST = "127.0.0.1"
SERVICES = (
    ("Auth", 12001, 6, 7),
    ("Lobby", 12002, 3, 35),
    ("Data", 12003, 3, 3),
    ("Game", 12004, 3, 3),
    ("Quest", 12005, 3, 3),
    ("GlobalChat", 12020, 3, 3),
)
PORTS = tuple(port for _, port, _, _ in SERVICES)
ROOT = Path(__file__).resolve().parent
PUBLIC_CONFIG = ROOT.parents[1] / "app/client/public"
NATIVE_ROOT = ROOT.parents[1] / "web-client"
NATIVE_ASSETS = {
    "image": "image/rm_shop/item_id020.png",
    "audio": "sound/bgm/ulbgm01.mp3",
}
# Historical cwming.ttf pin from tools/legacy-build/build.sh.
TCN_FONT_SHA256 = "094a5c7340f181059baf2c574da05f558a3dfe6b12d6323349354c64c0ecbb5e"
TCN_FONT_URL = "/tcn-device-font.ttf"


def native_asset_files(assets):
    if assets is None:
        return {}

    assets = assets.resolve()
    files = {}
    for kind, filename in NATIVE_ASSETS.items():
        path = (assets / filename).resolve()
        if not path.is_relative_to(assets) or not path.is_file():
            raise ValueError(f"--assets must contain a regular file at {filename}")
        files[kind] = path
    return files


def client_config(server_offset, direct_sockets):
    root = ElementTree.parse(PUBLIC_CONFIG / "config.xml.orig").getroot()
    for node in root.findall(".//host/*/*/name"):
        node.text = HOST
    for node in root.findall(".//host/data_servers/*/port"):
        node.text = "12003"
    if direct_sockets:
        for node in root.findall(".//host/*/*/port"):
            port = int(node.text)
            if port in PORTS:
                node.text = str(port + server_offset)
    return ElementTree.tostring(root, encoding="utf-8", xml_declaration=True)


def https_origin(value):
    try:
        url = URL(value)
        if url.scheme == "https" and url.host and url.user is None:
            return str(url.origin())
    except ValueError:
        pass
    raise argparse.ArgumentTypeError("use the HTTPS URL from the authenticated preview")


def create_app(
    client, assets, ruffle, listen_port, server_offset,
    preview_origin=None, direct_sockets=False, *, native=False, news=None,
    tcn_device_font=None,
):
    if native and (preview_origin or direct_sockets):
        raise ValueError("native mode uses loopback WebSocket clients")
    if native and tcn_device_font is not None:
        raise ValueError("--tcn-device-font is only available in Ruffle mode")
    origins = {f"http://{HOST}:{listen_port}"}
    socket_sources = [f"ws://{HOST}:{listen_port}"]
    if preview_origin:
        origins.add(preview_origin)
        socket_sources.append("wss://" + URL(preview_origin).host_port_subcomponent)
    csp = "; ".join((
        "default-src 'self'",
        "script-src 'self'" if native else "script-src 'self' 'wasm-unsafe-eval'",
        "style-src 'self'" if native else "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "media-src 'self' blob:",
        "worker-src 'self' blob:",
        "connect-src 'self' " + " ".join(socket_sources),
        "object-src 'none'",
        "base-uri 'none'",
        "frame-ancestors 'none'",
    ))

    async def add_headers(_request, response):
        response.headers["Content-Security-Policy"] = csp
        response.headers["X-Content-Type-Options"] = "nosniff"

    async def static_asset(request):
        filename = (assets / request.match_info["filename"]).resolve()
        if not filename.is_relative_to(assets):
            raise web.HTTPNotFound()
        if filename.suffix.lower() == ".swf" and not filename.stem.endswith("_ch"):
            chinese = filename.with_stem(f"{filename.stem}_ch").resolve()
            if chinese.is_relative_to(assets) and chinese.is_file():
                filename = chinese
        if not filename.is_file():
            raise web.HTTPNotFound()
        return web.FileResponse(filename)

    async def relay(request):
        port = int(request.match_info["port"])
        if port not in PORTS:
            raise web.HTTPNotFound()
        if request.headers.get("Origin") not in origins:
            raise web.HTTPForbidden()

        socket = web.WebSocketResponse(max_msg_size=1024 * 1024)
        if not socket.can_prepare(request).ok:
            raise web.HTTPBadRequest()
        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(HOST, port + server_offset), timeout=3
            )
        except (OSError, TimeoutError) as error:
            raise web.HTTPServiceUnavailable() from error

        async def forward():
            try:
                while data := await reader.read(65536):
                    await socket.send_bytes(data)
            finally:
                await socket.close()

        receiver = None
        try:
            await socket.prepare(request)
            receiver = asyncio.create_task(forward())
            async for message in socket:
                if message.type != WSMsgType.BINARY:
                    break
                writer.write(message.data)
                await writer.drain()
        finally:
            if receiver is not None:
                receiver.cancel()
                with suppress(asyncio.CancelledError, OSError):
                    await receiver
            writer.close()
            with suppress(OSError):
                await writer.wait_closed()
        return socket

    def serve_file(path, headers=None):
        async def handle_file(_request):
            return web.FileResponse(path, headers=headers)
        return handle_file

    async def config(_request):
        return web.Response(
            body=client_config(server_offset, direct_sockets), content_type="application/xml"
        )

    app = web.Application()
    app.on_response_prepare.append(add_headers)
    app.router.add_get(r"/socket/{port:\d+}", relay)

    if native:
        app.router.add_get("/", serve_file(NATIVE_ROOT / "index.html"))
        for filename in (
            "client.js", "style.css", "transport.js", "session.js",
            "wire.js", "srp.js", "login.js",
        ):
            app.router.add_get(f"/{filename}", serve_file(NATIVE_ROOT / filename))

        asset_urls = dict.fromkeys(NATIVE_ASSETS)
        for kind, path in native_asset_files(assets).items():
            url = f"/public/{NATIVE_ASSETS[kind]}"
            asset_urls[kind] = url
            app.router.add_get(url, serve_file(path))

        async def services(_request):
            return web.json_response({"services": [
                {"name": name, "port": port, "ping": ping, "pong": pong}
                for name, port, ping, pong in SERVICES
            ]})

        async def assets_info(_request):
            return web.json_response(asset_urls)

        app.router.add_get("/api/services", services)
        app.router.add_get("/api/assets", assets_info)
        return app

    index_path = ROOT / "index.html"
    if tcn_device_font is None:
        app.router.add_get("/", serve_file(index_path))
    else:
        try:
            font_bytes = tcn_device_font.read_bytes()
        except OSError as error:
            raise ValueError(f"--tcn-device-font must point to a readable cwming.ttf: {error}") from error
        if sha256(font_bytes).hexdigest() != TCN_FONT_SHA256:
            raise ValueError("--tcn-device-font must match the pinned historical cwming.ttf SHA-256")
        font_tag = f'<meta name="unlight-tcn-device-font" content="{TCN_FONT_URL}">'
        index = index_path.read_text(encoding="utf-8").replace("</head>", f"  {font_tag}\n</head>", 1)

        async def font_index(_request):
            return web.Response(text=index, content_type="text/html")

        async def device_font(_request):
            return web.Response(body=font_bytes, content_type="font/ttf")

        app.router.add_get("/", font_index)
        app.router.add_get(TCN_FONT_URL, device_font)
    for filename in ("player.css", "player.js"):
        app.router.add_get(f"/{filename}", serve_file(ROOT / filename))
    app.router.add_get("/Unlight.swf", serve_file(client))
    app.router.add_get("/public/config.xml", config)
    app.router.add_get(
        "/public/news.xml",
        serve_file(news or PUBLIC_CONFIG / "news.xml.orig", {"Content-Type": "application/xml"}),
    )
    app.router.add_get("/public/{filename:.*}", static_asset)
    app.router.add_static("/ruffle/", ruffle)
    return app


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--client", type=Path, help="Compiled Unlight SWF")
    parser.add_argument("--assets", type=Path, help="Original assets' public directory")
    parser.add_argument("--ruffle", type=Path, help="Extracted Ruffle Web release")
    parser.add_argument("--news", type=Path, help="An existing original-client news.xml feed")
    parser.add_argument("--tcn-device-font", type=Path, help="Use the pinned historical cwming.ttf for Ruffle device text")
    parser.add_argument("--port", type=int, default=4330, help="HTTP port")
    parser.add_argument("--server-offset", type=int, default=0, help="Offset of legacy TCP ports")
    parser.add_argument("--preview-origin", type=https_origin, help="URL of an authenticated HTTP preview")
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--direct-sockets", action="store_true", help="Use TCP ports for Ruffle Desktop")
    modes.add_argument("--native", action="store_true", help="Serve loopback native diagnostics")
    args = parser.parse_args()
    if args.preview_origin and args.direct_sockets:
        parser.error("--direct-sockets is for a loopback Ruffle Desktop session")
    if not 0 < args.port <= 65535 or any(not 0 < port + args.server_offset <= 65535 for port in PORTS):
        parser.error("ports must be between 1 and 65535")
    if args.native:
        if args.client or args.ruffle or args.preview_origin or args.news:
            parser.error("--native accepts --assets but cannot use --client, --ruffle, --news, or --preview-origin")
        try:
            app = create_app(
                None, args.assets, None, args.port, args.server_offset,
                native=True, tcn_device_font=args.tcn_device_font,
            )
        except ValueError as error:
            parser.error(str(error))
    else:
        if not all((args.client, args.assets, args.ruffle)):
            parser.error("--client, --assets, and --ruffle are required in Ruffle mode")
        if not args.client.is_file():
            parser.error("--client must point to a compiled SWF")
        with args.client.open("rb") as file:
            if file.read(3) not in (b"FWS", b"CWS", b"ZWS"):
                parser.error("--client must point to a compiled SWF")
        if not (args.assets / "sound/bgm/ulbgm01.mp3").is_file():
            parser.error("--assets must point to the original public assets")
        if not (args.ruffle / "ruffle.js").is_file():
            parser.error("--ruffle must point to an extracted Ruffle Web release")
        if args.news:
            try:
                feed = ElementTree.parse(args.news).getroot()
            except (OSError, ElementTree.ParseError) as error:
                parser.error(f"--news must point to a readable news XML file: {error}")
            if feed.find("news") is None:
                parser.error("--news XML must have the original client's news element")
        try:
            app = create_app(
                args.client.resolve(), args.assets.resolve(), args.ruffle.resolve(),
                args.port, args.server_offset, args.preview_origin, args.direct_sockets,
                news=args.news.resolve() if args.news else None,
                tcn_device_font=args.tcn_device_font,
            )
        except ValueError as error:
            parser.error(str(error))
    web.run_app(app, host="0.0.0.0" if args.preview_origin else HOST, port=args.port)


if __name__ == "__main__":
    main()
