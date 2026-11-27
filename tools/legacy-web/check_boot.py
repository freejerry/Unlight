#!/usr/bin/env python3
"""Read-only verification of the legacy client's loopback HTTP prerequisites."""

import argparse
from hashlib import sha256
import http.client
from pathlib import Path
import sys
from xml.etree import ElementTree


def get(port, path, length=None):
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    try:
        connection.request("GET", path)
        response = connection.getresponse()
        if response.status != 200:
            raise ValueError(f"{path} returned HTTP {response.status}")
        return response.read(length)
    finally:
        connection.close()


def check_config(port):
    endpoint = "/public/config.xml?42"
    config = ElementTree.fromstring(get(port, endpoint))
    if config.findtext("version", "").strip() != "multi_servers_111003":
        raise ValueError(f"{endpoint} has the wrong version")
    host = config.find("host")
    if host is None or host.findtext("state", "").strip() not in {"0", "1"}:
        raise ValueError(f"{endpoint} has no valid server state")
    groups = (
        "auth_servers", "lobby_servers", "data_servers", "quest_servers", "raid_servers",
        "raid_chat_servers", "raid_data_servers", "raid_rank_servers", "global_chat_servers",
    )
    print("Loopback endpoints declared by original client configuration:")
    for name in groups:
        entries = host.findall(f"{name}/*")
        if not entries:
            raise ValueError(f"{endpoint} has no {name} entries")
        addresses = []
        for entry in entries:
            address = entry.findtext("name", "").strip()
            if address != "127.0.0.1":
                raise ValueError(f"{name} host must be 127.0.0.1 for this isolated check")
            addresses.append(f"{address}:{entry.findtext('port', '').strip() or entry.findtext('ports', '').strip()}")
        print(f"  {name}: {', '.join(addresses)}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("port", type=int, help="The loopback HTTP port serving the original client")
    parser.add_argument("--expected-swf", type=Path, help="Compare the served SWF with this local build by SHA-256")
    arguments = parser.parse_args()
    port = arguments.port

    if arguments.expected_swf is None:
        swf_header = get(port, "/Unlight.swf", 8)
    else:
        expected_digest = sha256(arguments.expected_swf.read_bytes()).hexdigest()
        swf = get(port, "/Unlight.swf")
        received_digest = sha256(swf).hexdigest()
        if received_digest != expected_digest:
            raise ValueError(
                f"/Unlight.swf SHA-256 mismatch (expected {expected_digest}, received {received_digest})"
            )
        swf_header = swf[:8]
    if len(swf_header) != 8 or swf_header[:3] not in {b"FWS", b"CWS", b"ZWS"}:
        raise ValueError("/Unlight.swf did not return a Flash movie header")
    print(f"Original client path serves a Flash movie, SWF version {swf_header[3]}")
    if arguments.expected_swf is not None:
        print(f"Served SWF SHA-256 matches the local build ({received_digest})")
    check_config(port)
    ElementTree.fromstring(get(port, "/public/news.xml?42"))
    if not get(port, "/public/sound/bgm/ulbgm01.mp3", 8):
        raise ValueError("Original title BGM response was empty")
    print("Original config, news and title audio responded over loopback HTTP")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, ElementTree.ParseError, http.client.HTTPException) as error:
        print(error, file=sys.stderr)
        sys.exit(1)
