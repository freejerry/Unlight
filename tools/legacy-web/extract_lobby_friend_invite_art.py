#!/usr/bin/env python3
"""Extract the original Flex 3.6 TitleWindow Close artwork for Invite Code.

python3 -B tools/legacy-web/extract_lobby_friend_invite_art.py FLEX_SDK OUTPUT \
    --swfdump /path/to/Flex/bin/swfdump
"""

import argparse
from hashlib import sha256
import json
from pathlib import Path
from struct import pack, unpack_from
from tempfile import TemporaryDirectory
from zlib import decompress

from extract_character_card_art import checked_source
from extract_quest_detail_art import Movie, TWIPS, authored_primitives, png_bytes, rasterize, transformed
from source_stage_art import tags


ASSETS = (
    "frameworks/projects/framework/assets/Assets.swf",
    "b97f1a92a25208564686b23754538e2685ecf1fedd092305964842faa5558e49",
)
SYMBOLS = {
    "Up": (239, [235, 237]),
    "Over": (242, [240, 237]),
    "Down": (243, [235, 237]),
    "Disabled": (244, []),
}
ASSET_DEFINITIONS = (22, 32, 39)
TITLE_CLOSE_SIZE = 16
SOURCE_FRAME_SIZE = 14


def close_movie(source):
    raw = source.read_bytes()
    body = decompress(raw[8:]) if raw[:3] == b"CWS" else raw[8:]
    first_tag = (5 + 4 * (body[0] >> 3) + 7) // 8 + 4
    result = bytearray(body[:first_tag])
    exports = {}
    for tag, data in tags(source):
        if tag == 56:
            for name, (expected, _) in SYMBOLS.items():
                label = f"CloseButton{name}".encode("ascii") + b"\0"
                if data[4:] == label and data[:2] == b"\x01\0":
                    exports[name] = unpack_from("<H", data, 2)[0]
            continue
        if tag not in ASSET_DEFINITIONS or not 235 <= unpack_from("<H", data)[0] <= 244:
            continue
        size = len(data)
        result.extend(pack("<H", (tag << 6) | min(size, 63)))
        if size >= 63:
            result.extend(pack("<I", size))
        result.extend(data)
    if exports != {name: number for name, (number, _) in SYMBOLS.items()}:
        raise ValueError("Unexpected Flex CloseButton exports")
    result.extend(b"\x40\0\0\0")  # One empty root ShowFrame, followed by End.
    return b"FWS" + raw[3:4] + pack("<I", len(result) + 8) + result


def extract(flex_sdk, output, swfdump):
    source = checked_source(flex_sdk, ASSETS)
    # Flex swfdump rejects identical unrelated sprites in the full framework movie.
    # This scratch movie keeps the Close definitions and their dependencies byte-for-byte.
    close_swf = close_movie(source)
    output.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory() as directory:
        path = Path(directory) / "close-symbols.swf"
        path.write_bytes(close_swf)
        movie = Movie(path.parent, path.stem, swfdump, pin=(path.name, sha256(close_swf).hexdigest()))
        files = {}
        for name, (number, expected_shapes) in SYMBOLS.items():
            xml_id = next(key for key, value in movie.binary_ids.items() if value == number)
            placement = {"idref": xml_id, "matrix": "t0,0", "depth": "1"}
            primitives, shapes = authored_primitives(movie, [placement], preserve_stroke_alpha=True)
            if shapes != expected_shapes:
                raise ValueError(f"Unexpected Flex CloseButton{name} authored shape(s)")
            evidence = {"sourceSymbol": f"CloseButton{name}", "sourceId": number, "sourceFrame": 1, "shapeIds": shapes}
            if not primitives:
                if name != "Disabled":
                    raise ValueError(f"Missing original artwork in CloseButton{name}")
                files[name.lower()] = {"file": None, **evidence}
                continue
            # The nominal 14×14 frame includes the transparent backing of the up state.
            # Button.viewSkinForPhase sets SpriteAsset size to Panel's explicit 16×16.
            scale = TITLE_CLOSE_SIZE / SOURCE_FRAME_SIZE
            painted = list(transformed(primitives, scale, scale, 0, 0))
            end = TITLE_CLOSE_SIZE * TWIPS
            image, _, _ = rasterize(painted, (0, 0, end, end))
            file = f"close-{name.lower()}.png"
            png = png_bytes(image)
            (output / file).write_bytes(png)
            files[name.lower()] = {"file": file, "sha256": sha256(png).hexdigest(), **evidence}
    index = {
        "source": ASSETS[0], "sourceSha256": ASSETS[1], "flexVersion": "3.6.0 build 16995",
        "close": {"size": [TITLE_CLOSE_SIZE, TITLE_CLOSE_SIZE], "panelRight": 10, **files},
    }
    (output / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("flex_sdk", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--swfdump", required=True)
    args = parser.parse_args()
    extract(args.flex_sdk, args.output, args.swfdump)


if __name__ == "__main__":
    main()
