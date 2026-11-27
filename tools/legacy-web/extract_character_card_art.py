#!/usr/bin/env python3
"""Extract authored character card layers from the pinned asset mirror."""

import argparse
from base64 import b64encode
from csv import DictReader
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import re
from struct import unpack_from
from subprocess import check_output
from xml.etree import ElementTree
from zlib import decompress

from PIL import Image

from extract_quest_detail_art import kind, png_bytes, rasterize_svg, shape_paths
from source_stage_art import indexed_png, straight_component, tags


REVISION = "0ec2d2ffb0e294e46cd0edfb84c9778e3dd4ed0e"
FONT_REVISION = "4e7b49ea6e0dd3bf78275cc3977fe8be8ae754cc"
FONT_SHA = "33ade736c8df39fe207a5b7dddbf2c3c6ee1f6283eaed10297b2d02e2a247a6e"
CSV = Path(__file__).resolve().parents[2] / "app/server/data/csv/ja/CharaCards.csv"
CARD_SIZE = (168, 240)
PLACEMENT = bytes.fromhex("060100020000")
RECTANGLES = {bytes.fromhex(value) for value in (
    "02007000068f800095f801430100d93fe7a4ffbbc0001013d8d1ff14affb25c3e36a0800",
    "0200700006900000960001430100d9400005000000001013d8d20f14b03b25c1e36a0000",
    "0200700006900000960001410100d9400005000000001013d8d20f14b03b25c1e36a0000",
)}
BITMAP_TAGS = {6, 20, 35, 36}
STARTERS = {
    1: ("cc01_01", "9974558ec450c26b0a757e1c93e1b870cafec48537f04016a8ed0857452cfd29"),
    21: ("cc03_01", "524c6943068066b2d7451de87ddd52f4906d2870ebe71afafeb5484294fbcd65"),
    31: ("cc04_01", "b91ccf50e66f23c19e9e095e05e1b15e902e720e4f922fa09ef50f34824f1c03"),
    101: ("cc11_01", "91f702ef1236adf503fa2112c3a8ed349a704f8a8ade052d25181eab58e32898"),
    111: ("cc12_01", "b97442277dbbc526e99a9a8a6efc00d52ee9217e05df8a43f389f1a7945b19d2"),
}
FRAME = ("data/image/ccframe_a.swf", "ce17bc134ef39b8aced7ef5a382ab9b21b83bf4091abc4bcf5475771be2e18ec")
OVERLAYS = {
    "normal": ("data/image/ccframe_a_over.swf", "b1dbca3f720850122eef106f688fa5dc6bb5f196523567a56f52c8bca1b7a267"),
    "reborn": ("data/image/ccframe_b_over.swf", "0af93b453b47676f5b17594956e31455f7c7b368683f61155a202547dd7a002e"),
    "episode": ("data/image/ccframe_c_over.swf", "bc4f47ee3a34a4745406ea17d78c0ddfdb97833fed61646bf5e368b5b903ca8f"),
}
STAR = ("data/image/common/ccframe_star.swf", "d19fdceebee9fbd644b6c44446137c1650c026e7625bc232636c083cdb5c547e")
OVERLAY_SKIP = {"turn", "rare", "atk_plus", "atk_plus_s", "atk_plus_l", "def_plus", "def_plus_s", "def_plus_l"}
CHANNELS = ((1, 1, 1), (0, 0, 0), (1, 0, 0), (0, 1, 0), (0, 0, 1), (1, 1, 0), (1, 0, 1))


def bitmap(path, code, payload):
    bitmap_id = unpack_from("<H", payload)[0]
    if code == 6:
        jpeg = payload[2:]
        if not jpeg.startswith(b"\xff\xd8") or not jpeg.endswith(b"\xff\xd9"):
            raise ValueError(f"Incomplete original JPEG in {path.name}")
        return Image.open(BytesIO(jpeg)).convert("RGBA")
    if code == 35:
        length = unpack_from("<I", payload, 2)[0]
        rgb = Image.open(BytesIO(payload[6:6 + length])).convert("RGB")
        alpha = decompress(payload[6 + length:])
        data = rgb.tobytes()
        pixels = zip(data[::3], data[1::3], data[2::3], alpha, strict=True)
        size = rgb.size
    else:
        form, width, height = unpack_from("<BHH", payload, 2)
        size = width, height
        if form == 3:
            return Image.open(BytesIO(indexed_png(
                path, size=size, bitmap_id=bitmap_id, with_alpha=code == 36,
            ))).convert("RGBA")
        if form != 5:
            raise ValueError(f"Unsupported original bitmap format in {path.name}")
        data = decompress(payload[7:])
        if code == 20:
            opaque = Image.frombytes("RGBX", size, data)
            return Image.merge("RGB", opaque.split()[1:]).convert("RGBA")
        pixels = zip(data[1::4], data[2::4], data[3::4], data[::4], strict=True)
    straight = bytes(component for r, g, b, a in pixels
                     for component in (min(255, straight_component(r, a)), min(255, straight_component(g, a)),
                                       min(255, straight_component(b, a)), a))
    return Image.frombytes("RGBA", size, straight)


def decode_card_illustration(path):
    """Return a PNG for a supported original single-frame card image."""
    records = list(tags(path))
    structural = [(code, data) for code, data in records if code not in {1, 8, 9, 69}]
    if len(structural) != 3 or sum(code == 1 for code, _ in records) != 1:
        return None
    (code, payload), shape, placement = structural
    if code not in BITMAP_TAGS or payload[:2] != b"\x01\x00" or shape[0] != 2 or shape[1] not in RECTANGLES \
            or placement != (26, PLACEMENT):
        return None
    output = bitmap(path, code, payload)
    return png_bytes(output) if output.size == CARD_SIZE else None


def checked_source(root, pin):
    relative, digest = pin
    path = root / relative
    if sha256(path.read_bytes()).hexdigest() != digest:
        raise ValueError(f"Incorrect source digest for {relative}")
    return path


def matrix(value):
    sx = sy = 1.0
    skew_x = skew_y = tx = ty = 0.0
    for part in value.split():
        a, b = map(float, part[1:].split(","))
        if part.startswith("s"):
            sx, sy = a, b
        elif part.startswith("r"):
            skew_x, skew_y = a, b
        elif part.startswith("t"):
            tx, ty = a, b
        else:
            raise ValueError(f"Unknown card matrix {value}")
    return sx, skew_x, skew_y, sy, tx, ty


def timeline(container):
    display = {}
    for tag in container:
        name = kind(tag)
        if name in ("PlaceObject2", "PlaceObject3"):
            depth = int(tag.attrib["depth"])
            display[depth] = display.get(depth, {}) | tag.attrib
        elif name == "RemoveObject2":
            display.pop(int(tag.attrib["depth"]), None)
        elif name == "ShowFrame":
            yield [display[depth] for depth in sorted(display)]


class DisplayList:
    def __init__(self, source, swfdump):
        self.source = source
        self.movie = ElementTree.fromstring(check_output([swfdump, source]))
        self.symbols = {node.attrib["id"]: node for node in self.movie if "id" in node.attrib}
        self.bitmaps = {str(unpack_from("<H", data)[0]): (code, data)
                        for code, data in tags(source) if code in BITMAP_TAGS}
        self.images = {}
        self.next_fill = 0

    def frame(self, content, frame_no):
        return next((placements for index, placements in enumerate(timeline(content), 1) if index == frame_no), [])

    def render(self, frame_no, size, *, skip=(), symbol=None):
        content = self.movie if symbol is None else self.symbols[symbol]
        markup = self.placements(self.frame(content, frame_no), skip=skip)
        width, height = size
        drawing = (
            f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
            f'width="{width}" height="{height}" viewBox="0 0 {width * 20} {height * 20}">{markup}</svg>'
        )
        return rasterize_svg(drawing.encode(), width, height)

    def placements(self, placements, skip=()):
        markup = []
        for placement in placements:
            if placement.get("name") in skip:
                continue
            if "clipDepth" in placement or placement.get("blendmode", "1") not in ("0", "1"):
                raise ValueError(f"Unsupported placement in {self.source.name}: {placement}")
            node = self.symbols[placement["idref"]]
            transform = ",".join(map(str, matrix(placement.get("matrix", "t0,0"))))
            if kind(node) == "DefineSprite":
                artwork = self.placements(self.frame(node, 1))
            elif kind(node) in {"DefineShape", "DefineShape2", "DefineShape3", "DefineShape4"}:
                artwork = self.shape(node)
            else:
                raise ValueError(f"Unexpected card shape {kind(node)} in {self.source.name}")
            if cxform := placement.get("cxform"):
                components = re.fullmatch(r"(-?\d+)r([+-]\d+) (-?\d+)g([+-]\d+) "
                                          r"(-?\d+)b([+-]\d+) (-?\d+)a([+-]\d+)", cxform)
                if not components:
                    raise ValueError(f"Unsupported color transform in {self.source.name}: {cxform}")
                coefficients = map(int, components.groups())
                self.next_fill += 1
                key = f"color-{self.next_fill}"
                functions = "".join(
                    f'<feFunc{channel} type="linear" slope="{slope / 256}" intercept="{offset / 255}"/>'
                    for channel, (slope, offset) in zip("RGBA", zip(coefficients, coefficients, strict=True), strict=True)
                )
                artwork = (f'<defs><filter id="{key}" color-interpolation-filters="sRGB">'
                           f'<feComponentTransfer>{functions}</feComponentTransfer></filter></defs>'
                           f'<g filter="url(#{key})">{artwork}</g>')
            markup.append(f'<g transform="matrix({transform})">{artwork}</g>')
        return "".join(markup)

    def image(self, bitmap_id):
        if bitmap_id not in self.images:
            image = bitmap(self.source, *self.bitmaps[bitmap_id])
            self.images[bitmap_id] = image.size, b64encode(png_bytes(image)).decode("ascii")
        return self.images[bitmap_id]

    def shape(self, node):
        markup = []
        for style, path in shape_paths(node):
            attributes = style.attrib
            self.next_fill += 1
            key = f"fill-{self.next_fill}"
            if kind(style) == "linestyle":
                color = attributes["color"]
                markup.append(f'<path d="{path}" fill="none" stroke="{color[:7]}" '
                              f'stroke-width="{attributes["width"]}" />')
            elif attributes["type"] == "0":
                color = attributes["color"]
                opacity = int(color[7:], 16) / 255 if len(color) > 7 else 1
                markup.append(f'<path d="{path}" fill="{color[:7]}" fill-opacity="{opacity}" fill-rule="evenodd"/>')
            elif attributes["type"] in {"65", "67"}:
                (w, h), payload = self.image(attributes["idref"])
                transform = ",".join(map(str, matrix(attributes["matrix"])))
                markup.append(
                    f'<defs><clipPath id="{key}"><path d="{path}" clip-rule="evenodd"/></clipPath></defs>'
                    f'<g clip-path="url(#{key})"><image width="{w}" height="{h}" transform="matrix({transform})" '
                    f'xlink:href="data:image/png;base64,{payload}"/></g>'
                )
            elif attributes["type"] == "16":
                transform = ",".join(map(str, matrix(attributes["matrix"])))
                stops = attributes["gradient"].split()
                stops = "".join(f'<stop offset="{int(p) / 255}" stop-color="{c[:7]}"/>'
                                for p, c in zip(stops[::2], stops[1::2], strict=True))
                markup.append(
                    f'<defs><linearGradient id="{key}" gradientUnits="userSpaceOnUse" x1="-16384" y1="0" '
                    f'x2="16384" y2="0" gradientTransform="matrix({transform})">{stops}</linearGradient></defs>'
                    f'<path d="{path}" fill="url(#{key})" fill-rule="evenodd"/>'
                )
            else:
                raise ValueError(f"Unsupported card fill in {self.source.name}: {attributes}")
        return "".join(markup)


def write_font(source, destination, cards):
    from fontTools import subset
    if sha256(source.read_bytes()).hexdigest() != FONT_SHA:
        raise ValueError("Card font must be the historical wt004.ttf (minchoB)")
    options = subset.Options()
    options.name_IDs += [0, 13, 14]
    font = subset.load_font(source, options)
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(text="".join(card["name_tcn"] for card in cards))
    subsetter.subset(font)
    font.flavor = "woff"
    font.recalcTimestamp = False
    font.save(destination)


def generate(args):
    args.output.mkdir(parents=True, exist_ok=True)
    layers = {}
    def save(name, data, source, number=1):
        (args.output / name).write_bytes(data)
        layers[name] = {"source": source[0], "sourceSha256": source[1], "sourceFrame": number,
                        "sha256": sha256(data).hexdigest()}
        return name

    base_movie = DisplayList(checked_source(args.assets, FRAME), args.swfdump)
    base = {}
    for frame in (2, 7, 8, 9):
        name = f"frame-{frame}.png"
        base[str(frame)] = save(name, png_bytes(base_movie.render(frame, CARD_SIZE)), FRAME, frame)

    overlays, empty_slots = {}, {}
    for group, pin in OVERLAYS.items():
        movie = DisplayList(checked_source(args.assets, pin), args.swfdump)
        overlays[group] = {}
        for n in range(1, len(list(timeline(movie.movie))) + 1):
            result = movie.render(n, CARD_SIZE, skip=OVERLAY_SKIP)
            if result.getbbox():
                overlays[group][str(n)] = save(f"overlay-{group}-{n}.png", png_bytes(result), pin, n)
        rare = next(item["idref"] for item in movie.frame(movie.movie, 1) if item.get("name") == "rare")
        empty = movie.render(1, (70, 15), symbol=rare)
        empty_slots[group] = save(f"slots-{group}.png", png_bytes(empty), pin)

    star_movie = DisplayList(checked_source(args.assets, STAR), args.swfdump)
    star = star_movie.render(1, (10, 10))
    assert star.getbbox()
    red, green, blue, alpha = star.split()
    black = Image.new("L", star.size)
    stars = {
        str(index): save(f"star-{index}.png", png_bytes(Image.merge(
            "RGBA", tuple(channel if active else black for channel, active in zip((red, green, blue), color)) + (alpha,),
        )), STAR)
        for index, color in enumerate(CHANNELS, 1)
    }
    illustrations = {}
    for card_id, (stem, digest) in STARTERS.items():
        pin = (f"public/image/{stem}.swf", digest)
        data = decode_card_illustration(checked_source(args.assets, pin))
        if data is None:
            raise ValueError(f"Unexpected original illustration {pin[0]}")
        illustrations[str(card_id)] = save(f"illustration-{card_id}.png", data, pin)

    with CSV.open(encoding="utf-8-sig", newline="") as source:
        cards = list(DictReader(source))
    write_font(args.font, args.output / "card-names.woff", cards)
    filenames = sorted({card["chara_image"] for card in cards})
    pinned_illustrations = {}
    for filename in filenames:
        if not re.fullmatch(r"[a-zA-Z0-9_]+\.swf", filename):
            raise ValueError(f"Unexpected character card source path {filename!r}")
        image_source = args.assets / "public" / "image" / filename
        if image_source.is_file():
            pinned_illustrations[filename] = sha256(image_source.read_bytes()).hexdigest()
    (args.output / "illustration-sources.json").write_text(json.dumps(
        {"assetRevision": REVISION, "files": pinned_illustrations}, indent=2,
    ) + "\n")
    manifest = {
        "assetRevision": REVISION, "assetRepository": "https://github.com/ni-light/Unlight-Images",
        "assetLicense": "CC-BY-ND-4.0", "width": CARD_SIZE[0], "height": CARD_SIZE[1],
        "base": base, "overlays": overlays, "emptySlots": empty_slots, "stars": stars,
        "illustrations": illustrations,
        "font": {"file": "card-names.woff", "source": "res/data/wt004.ttf",
                 "repository": "https://github.com/UnlightCloud/shell", "revision": FONT_REVISION,
                 "sourceSha256": FONT_SHA, "sha256": sha256((args.output / "card-names.woff").read_bytes()).hexdigest()},
        "layers": layers,
    }
    (args.output / "index.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("assets", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--swfdump", type=Path, required=True)
    parser.add_argument("--font", type=Path, required=True)
    generate(parser.parse_args())
