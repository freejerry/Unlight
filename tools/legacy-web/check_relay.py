#!/usr/bin/env python3
"""Verify legacy KeepAlive frames over the isolated browser socket relay."""

import argparse
import asyncio
import struct
import sys

from aiohttp import ClientSession, ClientTimeout, WSMsgType, WSServerHandshakeError


SERVICES = (
    ("Auth", 12001, 6, 7),
    ("Lobby", 12002, 3, 35),
    ("Data", 12003, 3, 3),
    ("Game", 12004, 3, 3),
    ("Quest", 12005, 3, 3),
    ("GlobalChat", 12020, 3, 3),
)


async def check_service(session, origin, port, ping, pong):
    try:
        async with session.ws_connect(f"{origin}/socket/{port}", origin=origin) as relay:
            await relay.send_bytes(struct.pack("!HH", 2, ping) + b"\n")
            expected = struct.pack("!IH", 2, pong) + b"\n"
            received = bytearray()
            while len(received) < len(expected):
                message = await relay.receive(timeout=3)
                if message.type != WSMsgType.BINARY:
                    return f"expected a binary response, got {message.type.name}"
                received.extend(message.data)
            if received != expected:
                return f"incorrect response: {received.hex()}"
    except WSServerHandshakeError as error:
        return f"HTTP {error.status} during WebSocket handshake"
    except (OSError, TimeoutError) as error:
        return f"{type(error).__name__}: {error}"
    return None


async def main(port):
    origin = f"http://127.0.0.1:{port}"
    all_passed = True
    async with ClientSession(timeout=ClientTimeout(total=6)) as session:
        results = await asyncio.gather(*(
            check_service(session, origin, tcp_port, ping, pong)
            for _, tcp_port, ping, pong in SERVICES
        ))
        for (name, _, _, _), error in zip(SERVICES, results):
            print(f"{name}: {error or 'binary KeepAlive matched'}")
            all_passed = all_passed and error is None
        try:
            async with session.ws_connect(f"{origin}/socket/12001", origin="http://unrelated.invalid"):
                print("Incorrectly accepted an unrelated WebSocket origin")
                all_passed = False
        except WSServerHandshakeError as error:
            print(f"Unrelated WebSocket origin returned HTTP {error.status}")
            all_passed = all_passed and error.status == 403
    return 0 if all_passed else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("port", type=int, help="The loopback HTTP port serving the relay")
    sys.exit(asyncio.run(main(parser.parse_args().port)))
