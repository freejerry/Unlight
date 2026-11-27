"""Serve the existing Unlight client and forward its sockets to loopback."""

import argparse
import asyncio
from contextlib import suppress
from pathlib import Path
from xml.etree import ElementTree

from aiohttp import WSMsgType, web
from yarl import URL


HOST = "127.0.0.1"
PORTS = (12001, 12002, 12003, 12004, 12005, 12020)
ROOT = Path(__file__).resolve().parent
PUBLIC_CONFIG = ROOT.parents[1] / "app/client/public"


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


def create_app(client, assets, ruffle, listen_port, server_offset, preview_origin=None, direct_sockets=False):
    origins = {f"http://{HOST}:{listen_port}"}
    socket_sources = [f"ws://{HOST}:{listen_port}"]
    if preview_origin:
        origins.add(preview_origin)
        socket_sources.append("wss://" + URL(preview_origin).host_port_subcomponent)
    csp = "; ".join((
        "default-src 'self'",
        "script-src 'self' 'wasm-unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
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
    app.router.add_get("/", serve_file(ROOT / "index.html"))
    for filename in ("player.css", "player.js", "protocol.mjs"):
        app.router.add_get(f"/{filename}", serve_file(ROOT / filename))
    app.router.add_get("/Unlight.swf", serve_file(client))
    app.router.add_get("/public/config.xml", config)
    app.router.add_get(
        "/public/news.xml",
        serve_file(PUBLIC_CONFIG / "news.xml.orig", {"Content-Type": "application/xml"}),
    )
    app.router.add_get("/public/{filename:.*}", static_asset)
    app.router.add_get(r"/socket/{port:\d+}", relay)
    app.router.add_static("/ruffle/", ruffle)
    return app


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--client", type=Path, required=True, help="Compiled Unlight SWF")
    parser.add_argument("--assets", type=Path, required=True, help="Original assets' public directory")
    parser.add_argument("--ruffle", type=Path, required=True, help="Extracted Ruffle Web release")
    parser.add_argument("--port", type=int, default=4330, help="HTTP port")
    parser.add_argument("--server-offset", type=int, default=0, help="Offset of legacy TCP ports")
    parser.add_argument("--preview-origin", type=https_origin, help="URL of an authenticated HTTP preview")
    parser.add_argument("--direct-sockets", action="store_true", help="Use TCP ports for Ruffle Desktop")
    args = parser.parse_args()
    if args.preview_origin and args.direct_sockets:
        parser.error("--direct-sockets is for a loopback Ruffle Desktop session")
    if not 0 < args.port <= 65535 or any(not 0 < port + args.server_offset <= 65535 for port in PORTS):
        parser.error("ports must be between 1 and 65535")
    if not args.client.is_file():
        parser.error("--client must point to a compiled SWF")
    with args.client.open("rb") as file:
        if file.read(3) not in (b"FWS", b"CWS", b"ZWS"):
            parser.error("--client must point to a compiled SWF")
    if not (args.assets / "sound/bgm/ulbgm01.mp3").is_file():
        parser.error("--assets must point to the original public assets")
    if not (args.ruffle / "ruffle.js").is_file():
        parser.error("--ruffle must point to an extracted Ruffle Web release")
    app = create_app(
        args.client.resolve(), args.assets.resolve(), args.ruffle.resolve(),
        args.port, args.server_offset, args.preview_origin, args.direct_sockets,
    )
    web.run_app(app, host="0.0.0.0" if args.preview_origin else HOST, port=args.port)


if __name__ == "__main__":
    main()
