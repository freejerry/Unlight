#!/usr/bin/env python3
"""Extract regular quest detail art from the pinned mirror.

Use: python3 -B tools/legacy-web/extract_quest_detail_art.py ASSET_ROOT \
    source-login/quest-art --swfdump /path/to/Flex/bin/swfdump

Requires Pillow, Cairo and librsvg. Input SWFs are pinned;
swfdump reads the original tags and timelines without running ActionScript.
"""

import argparse
import ctypes
import json
import re
import subprocess
from base64 import b64decode, b64encode
from collections import defaultdict
from dataclasses import dataclass
from functools import cache
from hashlib import sha256
from io import BytesIO
from math import ceil
from pathlib import Path
from struct import unpack_from
from xml.etree import ElementTree
from zlib import decompress

from PIL import Image

from source_stage_art import straight_component, tags


REVISION = "0ec2d2ffb0e294e46cd0edfb84c9778e3dd4ed0e"
QUEST_DIR = Path("data/image/quest")
NS = "{http://macromedia/2003/swfx}"
TWIPS = 20
DEFINITION_TAGS = {
    2: "DefineShape", 22: "DefineShape2", 32: "DefineShape3", 83: "DefineShape4",
    34: "DefineButton2", 39: "DefineSprite", 46: "DefineMorphShape", 84: "DefineMorphShape2",
    35: "DefineBitsJPEG3", 36: "DefineBitsLossless2",
}
SOURCE_DIGESTS = {
    "btn_mapback_ch": "b7fcfdaef7346263f02b5fe5887ec05861a2b24af4fd05669053184059f36804",
    "btn_quest": "3cdd8a9f8cd256058566c581c6813c0d20146172d95a1753960152778ee5b237",
    "map_data": "c8a1784e2202fa4e317482fdd7ece2b93f910fbf220b30aa3dd3a8cb0a2fd81e",
    "map_base": "ad46a98e104990e973acbbda008885f5f6edea70184c9d49514c7b4206b6b0b2",
    "map_pass_left": "7b0ff0c731d731e9281d0cab72ec3582725035b54f4df90307af87b80ffcccd6",
    "map_pass_center": "616902b636e1b3ba84714d0da944ced1326ad9f1150dcb6bce674cd4acba2e32",
    "map_pass_right": "2e2b5d3e2cd95897ba4600317f7739ca994b659de713d6f45e0c56f12bf3f3cf",
    "land_al_arch": "f3bb1f02b2893fdaab92e600634bd70538f47a2c10f32b97de32fff6abe87cbf",
    "land_am_stone": "35a0e8cac598ac45282bf7478abde867b2a78e6cc026bee0c574d0edc4656070",
    "land_am_wasteland": "e9308b1f98ca2fc7891c2576ed9f78d7874dcefddda9ae799b366b8179618683",
    "land_end_throne": "abea4c5b314b9fb89529f7cd1c38925b9fc80a15be51864e5d20058c66111224",
    "land_event": "a027f4784a036a7de5fd649fd489edb2113838e675fe29ff5924ac7e293044e9",
    "land_subevent": "25153e5cf9ee0b0babec7437384d4efde122702a9857a7032fe941dc9285a2d9",
    "land_ml_castle": "8534bb571facbff22927873edc90d9655641ebddd9f899cb49e072b2a4349862",
    "land_sl_gate": "8534bb571facbff22927873edc90d9655641ebddd9f899cb49e072b2a4349862",
    "land_sl_cemetery": "4911aec7b51eecab416ca5fc0f583189db33d56d70b81e330a4a52b562d93a8c",
    "land_sl_forest": "58c8b3e2dc400dee3044364f112c83aee84a4d6e5ea23b8fddec374069fbe5e0",
    "land_sl_lake": "46064debc1f45793462218d136436db4fb28d7e22a8fd535161130ff7b01b44c",
    "land_sl_road": "cd92e79b679c1af7822083b58311d85b054dc1907c5db72b395df4535f22a9fb",
    "land_sl_ruin": "e3d23d732faa68f1960a79ff47b18f5fa4305f861df928593cc5236405381334",
    "land_sl_village": "db90d3151fe0cbfbec795ae93ecb473587c9e5f0602f5c5d1c9c6d55ed8ce4ea",
    "land_sl_wilderness": "caa2df1f24e0afffe26ee6ac19f46fda75d137ca28f2837c3ac01dfe04ff4740",
}

# Source vector order in MapStageImage.as. Stages 8, 9 and 12 use the lake SWF.
TERRAIN = (
    "land_sl_gate", "land_sl_forest", "land_sl_road", "land_sl_lake",
    "land_sl_cemetery", "land_sl_village", "land_sl_wilderness", "land_sl_ruin",
    "land_sl_lake", "land_sl_lake", "land_ml_castle", "land_am_wasteland",
    "land_sl_lake", "land_am_stone", "land_al_arch", "land_end_throne",
)
# Label indexing in MapEventImage.as and MapSubEventImage.as.
EVENTS = ("enemy", "tbox_red_g", "tbox_green_s", "tbox_blue_s", "tbox_white_s", "jem_g", "enemy", "enemy_hl")
SUB_EVENTS = ("tbox_red_s", "tbox_red_g", "tbox_green_s", "tbox_blue_s", "tbox_white_s", "jem_g", "exp_s", "highlow")


def kind(tag):
    return tag.tag.removeprefix(NS)


def translation(matrix):
    match = re.fullmatch(r"t(-?\d+),(-?\d+)", matrix)
    if not match:
        raise ValueError(f"Unsupported detail placement matrix {matrix!r}")
    return tuple(map(int, match.groups()))


def bounds(tag):
    value = tag.get("bounds")
    if re.fullmatch(r"\d+x\d+", value):
        return (0, 0, *map(int, value.split("x")))
    return tuple(map(int, re.findall(r"-?\d+", value)))


def timeline(container):
    """Follow PlaceObject2 replacements/retained attributes at each depth."""
    display = {}
    label = None
    for tag in container:
        name = kind(tag)
        if name == "PlaceObject2":
            depth = int(tag.attrib["depth"])
            display[depth] = display.get(depth, {}) | tag.attrib
        elif name == "RemoveObject2":
            del display[int(tag.attrib["depth"])]
        elif name == "FrameLabel":
            label = tag.attrib["label"]
        elif name == "ShowFrame":
            yield label, [display[depth] for depth in sorted(display)]
            label = None


@dataclass(frozen=True)
class Primitive:
    # Coordinates and bounds are kept in original twips until writing the PNG.
    bounds: tuple
    markup: str
    bitmap_id: int | None = None
    image: Image.Image | None = None


class Movie:
    def __init__(self, asset_root, name, swfdump):
        self.path = QUEST_DIR / f"{name}.swf"
        source = asset_root / self.path
        self.digest = sha256(source.read_bytes()).hexdigest()
        if self.digest != SOURCE_DIGESTS[name]:
            raise ValueError(f"Incorrect pinned digest for {self.path}")
        self.root = ElementTree.fromstring(subprocess.check_output([swfdump, "-encode", source]))
        self.symbols = {tag.get("id"): tag for tag in self.root if "id" in tag.attrib}
        self.classes = {
            tag.attrib["className"]: tag.attrib["idref"]
            for tag in self.root.findall(f"{NS}SymbolClass/{NS}Symbol")
        }
        self.bitmaps, self.binary_ids = {}, {}
        # Flex renumbers display IDs in land_event.swf. Keep original binary IDs in the manifest.
        xml_definitions = (tag for tag in self.root if kind(tag) in DEFINITION_TAGS.values())
        binary_definitions = ((tag, data) for tag, data in tags(source) if tag in DEFINITION_TAGS)
        for node, (tag, data) in zip(xml_definitions, binary_definitions, strict=True):
            if kind(node) != DEFINITION_TAGS[tag]:
                raise ValueError(f"Definition order differs in SWF dump of {self.path}")
            xml_id = node.attrib["id"]
            self.binary_ids[xml_id] = unpack_from("<H", data)[0]
            if tag not in (35, 36):
                continue
            if tag == 36:
                if data[2] != 5:
                    raise ValueError(f"Unsupported lossless bitmap in {self.path}")
                original = decompress(data[7:])
            else:
                jpeg_length = unpack_from("<I", data, 2)[0]
                original = data[6:6 + jpeg_length]
            xml_bytes = b"".join(b64decode(line) for line in node.text.split())
            if original != xml_bytes:
                raise ValueError(f"Bitmap contents differ in SWF dump of {self.path}")
            self.bitmaps[xml_id] = (tag, data)

    @cache
    def bitmap(self, bitmap_id):
        tag, data = self.bitmaps[bitmap_id]
        if tag == 35:
            jpeg_length = unpack_from("<I", data, 2)[0]
            image = Image.open(BytesIO(data[6:6 + jpeg_length])).convert("RGB")
            rgb = image.tobytes()
            alpha = decompress(data[6 + jpeg_length:])
            pixels = zip(rgb[::3], rgb[1::3], rgb[2::3], alpha, strict=True)
            size = image.size
        else:
            size = unpack_from("<HH", data, 3)
            argb = decompress(data[7:])
            pixels = zip(argb[1::4], argb[2::4], argb[3::4], argb[::4], strict=True)
        straight = bytes(
            component
            for red, green, blue, alpha in pixels
            for component in (*[min(255, straight_component(value, alpha)) for value in (red, green, blue)], alpha)
        )
        if len(straight) != size[0] * size[1] * 4:
            raise ValueError(f"Unexpected bitmap byte count for {self.path} bitmap {bitmap_id}")
        return Image.frombytes("RGBA", size, straight)

    def instance(self, name):
        _, placements = next(timeline(self.root))
        if name is None:
            (only,) = placements
            return only
        return next(placement for placement in placements if placement.get("name") == name)

    def symbol(self, placement):
        reference = placement["idref"]
        return self.symbols[self.classes.get(reference, reference)]

    def original_id(self, placement):
        return self.binary_ids[self.symbol(placement).attrib["id"]]

    def frame(self, placement, selector):
        for index, (label, contents) in enumerate(timeline(self.symbol(placement)), 1):
            if selector in (index, label):
                return index, [self.offset(child, placement) for child in contents]
        raise ValueError(f"Missing frame {selector!r} in {self.path}")

    @staticmethod
    def offset(child, parent):
        x, y = translation(child["matrix"])
        dx, dy = translation(parent["matrix"])
        return child | {"matrix": f"t{x + dx},{y + dy}"}

    def state(self, button, state):
        return [
            self.offset(record.attrib, button) for record in self.symbol(button)
            if kind(record) == "buttonRecord" and state in record.attrib["states"].split(",")
        ]

    def primitives(self, placements):
        pieces, shapes = [], []
        for placement in placements:
            shape = self.symbol(placement)
            if kind(shape) == "DefineSprite":
                _, first_frame = self.frame(placement, 1)
                layers, nested_shapes = self.primitives(first_frame)
                pieces.extend(layers)
                shapes.extend(nested_shapes)
            else:
                shapes.append(self.original_id(placement))
                pieces.extend(self.shape(shape, translation(placement["matrix"])))
        return pieces, shapes

    def shape(self, shape, offset):
        name = kind(shape)
        if name == "DefineMorphShape":
            return [morph_start(shape, offset)]
        if name not in ("DefineShape", "DefineShape3", "DefineShape4"):
            raise ValueError(f"Unsupported detail shape {name}")
        x0, y0, x1, y1 = bounds(shape)
        dx, dy = offset
        extent = (x0 + dx, y0 + dy, x1 + dx, y1 + dy)
        pieces = []
        for style, path in shape_paths(shape):
            if kind(style) == "linestyle":
                if style.attrib["flags"] != "320":
                    raise ValueError(f"Unexpected line style {style.attrib}")
                markup = (
                    f'<path d="{path}" fill="none" stroke="{style.attrib["color"][:7]}" '
                    f'stroke-width="{int(style.attrib["width"])}" stroke-linecap="butt" transform="translate({dx} {dy})"/>'
                )
            elif style.attrib["type"] == "0":
                markup = color_path(path, style.attrib["color"], dx, dy)
            elif style.attrib["type"] == "67":
                bitmap_id = style.attrib["idref"]
                image = self.bitmap(bitmap_id)
                matrix = re.fullmatch(r"s[\d.]+,[\d.]+ (t-?\d+,-?\d+)", style.attrib["matrix"])
                if not matrix:
                    raise ValueError(f"Unexpected bitmap fill matrix {style.attrib}")
                bx, by = translation(matrix[1])
                if (bx, by, bx + image.width * TWIPS - 1, by + image.height * TWIPS - 1) != (x0, y0, x1, y1) and not (
                    bx == x0 and by == y0 and x1 == bx + image.width * TWIPS and y1 == by + image.height * TWIPS
                ):
                    # The button's plate extends one twip farther than its separate image.
                    raise ValueError(f"Unexpected rectangular image area in shape {shape.attrib}")
                left, top = bx + dx, by + dy
                width, height = image.width * TWIPS, image.height * TWIPS
                url = b64encode(png_bytes(image)).decode("ascii")
                markup = (
                    f'<image x="{left}" y="{top}" width="{width}" height="{height}" '
                    f'xlink:href="data:image/png;base64,{url}"/>'
                )
                pieces.append(Primitive((left, top, left + width, top + height), markup, self.binary_ids[bitmap_id], image))
                continue
            else:
                raise ValueError(f"Unexpected fill {style.attrib}")
            pieces.append(Primitive(extent, markup))
        return pieces


def shape_paths(shape):
    """Turn the pinned SWF edge records into closed fills and open strokes."""
    styles = {"fillstyle": [], "linestyle": []}
    pending = defaultdict(list)
    sections = []
    left = right = stroke = None
    point = (0, 0)

    def flush():
        sections.extend((style, edges) for key, values in styles.items()
                        for index, style in enumerate(values) if (edges := pending.get((key, index))))

    for record in shape:
        name = kind(record)
        if name in styles:
            styles[name].append(record)
            continue
        if name == "styleChange":
            attrs = record.attrib
            if "dx" in attrs or "dy" in attrs:
                point = (int(attrs.get("dx", 0)), int(attrs.get("dy", 0)))
            if "fillStyle0" in attrs:
                left = int(attrs["fillStyle0"]) - 1
            if "fillStyle1" in attrs:
                right = int(attrs["fillStyle1"]) - 1
            if "lineStyle" in attrs:
                stroke = int(attrs["lineStyle"]) - 1
            if len(record):
                flush()
                pending.clear()
                styles = {key: record.findall(f"{NS}{key}") for key in styles}
            continue
        if name not in ("line", "curve"):
            raise ValueError(f"Unexpected edge record {name}")
        attrs = record.attrib
        control = (point[0] + int(attrs["cdx"]), point[1] + int(attrs["cdy"])) if name == "curve" else None
        end = ((control or point)[0] + int(attrs["dx"]), (control or point)[1] + int(attrs["dy"]))
        pending["fillstyle", left].append((end, point, control))
        pending["fillstyle", right].append((point, end, control))
        pending["linestyle", stroke].append((point, end, control))
        point = end
    flush()
    for style, segments in sections:
        yield style, edge_path(segments, closed=(kind(style) == "fillstyle"))


def edge_path(segments, *, closed):
    remaining = list(segments)
    commands = []
    while remaining:
        start, end, control = remaining.pop(0)
        commands.append(f"M{start[0]},{start[1]}")
        while True:
            commands.append(f"Q{control[0]},{control[1]} {end[0]},{end[1]}" if control else f"L{end[0]},{end[1]}")
            if end == start:
                if closed:
                    commands.append("Z")
                break
            index = next((index for index, item in enumerate(remaining) if item[0] == end), None)
            if index is None:
                if closed:
                    raise ValueError("Open fill in pinned quest art")
                break
            _, end, control = remaining.pop(index)
    return " ".join(commands)


def color_path(path, color, dx, dy):
    alpha = int(color[7:9], 16) / 255 if len(color) == 9 else 1
    return (
        f'<path d="{path}" fill="{color[:7]}" fill-opacity="{alpha}" fill-rule="evenodd" '
        f'transform="translate({dx} {dy})"/>'
    )


def morph_start(shape, offset):
    """Render the true first frame of the nested chest sparkle (morph ratio 0)."""
    fill = shape.find(f"{NS}fillstyle")
    match = re.fullmatch(r"s([\d.]+),([\d.]+) t0,0", fill.attrib["startMatrix"])
    if fill.attrib["type"] != "18" or not match:
        raise ValueError("Unexpected original chest sparkle gradient")
    sx, sy = map(float, match.groups())
    colors = fill.attrib["gradient"].split()
    stops = "".join(
        f'<stop offset="{int(position.split(",")[0]) / 255}" stop-color="{color[:7]}"/>'
        for position, color in zip(colors[::2], colors[1::2], strict=True)
    )
    # All source stroke widths and alphas are zero. The first edge record selects the radial fill.
    start = ElementTree.Element("start")
    ElementTree.SubElement(start, f"{NS}fillstyle")
    start.extend(shape.find(f"{NS}start"))
    ((_, outline),) = shape_paths(start)
    dx, dy = offset
    x0, y0, x1, y1 = bounds({"bounds": shape.attrib["startBounds"]})
    gradient = f'gradient-{shape.attrib["id"]}'
    markup = (
        f'<g transform="translate({dx} {dy})"><defs><radialGradient id="{gradient}" gradientUnits="userSpaceOnUse" '
        f'cx="0" cy="0" r="16384" gradientTransform="scale({sx} {sy})">{stops}</radialGradient></defs>'
        f'<path fill="url(#{gradient})" d="{outline}"/></g>'
    )
    return Primitive((x0 + dx, y0 + dy, x1 + dx, y1 + dy), markup)


def png_bytes(image):
    stream = BytesIO()
    image.save(stream, format="PNG", optimize=True)
    return stream.getvalue()


def native_function(library, name, result, *arguments):
    function = getattr(library, name)
    function.restype = result
    function.argtypes = arguments
    return function


def rasterize_svg(markup, width, height):
    pointer, integer = ctypes.c_void_p, ctypes.c_int
    cairo = ctypes.CDLL("libcairo.so.2")
    rsvg = ctypes.CDLL("librsvg-2.so.2")
    gobject = ctypes.CDLL("libgobject-2.0.so.0")
    new_svg = native_function(rsvg, "rsvg_handle_new_from_data", pointer, ctypes.c_char_p, ctypes.c_size_t, pointer)
    draw = native_function(rsvg, "rsvg_handle_render_cairo", integer, pointer, pointer)
    release_svg = native_function(gobject, "g_object_unref", None, pointer)
    new_surface = native_function(cairo, "cairo_image_surface_create", pointer, integer, integer, integer)
    new_context = native_function(cairo, "cairo_create", pointer, pointer)
    destroy_surface = native_function(cairo, "cairo_surface_destroy", None, pointer)
    destroy_context = native_function(cairo, "cairo_destroy", None, pointer)
    callback = ctypes.CFUNCTYPE(integer, pointer, pointer, ctypes.c_uint)
    write_png = native_function(cairo, "cairo_surface_write_to_png_stream", integer, pointer, callback, pointer)
    output = BytesIO()

    @callback
    def collect(_, chunk, length):
        output.write(ctypes.string_at(chunk, length))
        return 0

    svg = new_svg(markup, len(markup), None)
    if not svg:
        raise ValueError("Unable to decode SVG for original quest vectors")
    surface = new_surface(0, width, height)  # CAIRO_FORMAT_ARGB32
    context = new_context(surface)
    try:
        if not draw(svg, context) or write_png(surface, collect, None):
            raise ValueError("Unable to rasterize original quest vectors")
    finally:
        destroy_context(context)
        destroy_surface(surface)
        release_svg(svg)
    return Image.open(output).convert("RGBA")


def rasterize(pieces):
    if len(pieces) == 1 and pieces[0].image is not None:
        first = pieces[0]
        return first.image, first.bounds[0] / TWIPS, first.bounds[1] / TWIPS
    x0 = min(piece.bounds[0] for piece in pieces)
    y0 = min(piece.bounds[1] for piece in pieces)
    x1 = max(piece.bounds[2] for piece in pieces)
    y1 = max(piece.bounds[3] for piece in pieces)
    width, height = ceil((x1 - x0) / TWIPS), ceil((y1 - y0) / TWIPS)
    markup = (
        f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'width="{width}" height="{height}" viewBox="{x0} {y0} {width * TWIPS} {height * TWIPS}">'
        + "".join(piece.markup for piece in pieces) + "</svg>"
    )
    image = rasterize_svg(markup.encode(), width, height)
    if image.size != (width, height) or not image.getbbox():
        raise ValueError("Quest detail vector rasterization failed")
    return image, x0 / TWIPS, y0 / TWIPS


def extract(asset_root, art, swfdump):
    manifest_path = art / "sources.json"
    manifest = json.loads(manifest_path.read_text())
    if manifest["assetRevision"] != REVISION:
        raise ValueError("Quest art manifest uses a different asset revision")
    manifest["layers"] = {
        name: layer for name, layer in manifest["layers"].items() if not name.startswith("quest-detail-")
    }

    @cache
    def movie(name):
        return Movie(asset_root, name, swfdump)

    def add(source, filename, placements, coordinate_space, frame=1, **extra):
        pieces, shapes = source.primitives(placements)
        image, x, y = rasterize(pieces)
        name = f"quest-detail-{filename}.png"
        content = png_bytes(image)
        geometry = dict(x=x, y=y, width=image.width, height=image.height)
        manifest["layers"][name] = dict(
            source=source.path.as_posix(), sourceSha256=source.digest, sourceFrame=frame,
            coordinateSpace=coordinate_space, shapeIds=shapes,
            bitmapIds=[piece.bitmap_id for piece in pieces if piece.bitmap_id is not None],
            **extra, **geometry, sha256=sha256(content).hexdigest(),
        )
        (art / name).write_bytes(content)
        return dict(file=name, **geometry)

    def button(source, instance, filename):
        source_button = source.instance(instance)
        (hit,) = source.state(source_button, "hitTest")
        x0, y0, x1, y1 = bounds(source.symbol(hit))
        dx, dy = translation(hit["matrix"])
        states = {
            state: add(source, f"{filename}-{state}", source.state(source_button, state), "stage",
                       sourceInstance=instance, buttonId=source.original_id(source_button), sourceState=state)
            for state in ("up", "over")
        }
        return dict(**states, hit=[(x0 + dx) / TWIPS, (y0 + dy) / TWIPS, (x1 - x0) / TWIPS, (y1 - y0) / TWIPS])

    def frames(source, instance, selectors, filename, coordinate_space):
        placed = source.instance(instance)
        selected = {}
        for selector in selectors:
            index, objects = source.frame(placed, selector)
            selected[str(selector)] = add(
                source, f"{filename}-{selector}", objects, coordinate_space, index,
                sourceInstance=instance, spriteId=source.original_id(placed),
                **({"nestedAnimationFrame": 1} if any(kind(source.symbol(item)) == "DefineSprite" for item in objects) else {}),
                **({"sourceLabel": selector} if isinstance(selector, str) else {}),
            )
        return selected

    panel = movie("map_data")
    _, data = next(timeline(panel.root))
    detail = {
        "back": button(movie("btn_mapback_ch"), None, "back"),
        "commands": {
            key: button(movie("btn_quest"), instance, key)
            for key, instance in (
                ("start", "btn_map_start"), ("drop", "btn_map_drop"),
                ("present", "btn_map_pres"), ("quit", "btn_map_give"),
            )
        },
        "data": [
            add(panel, f"data-{key}", [placement], "stage", sourceDepth=int(placement["depth"]))
            for key, placement in zip(("plate", "label"), data, strict=True)
        ],
        "bases": frames(movie("map_base"), "map_base", range(1, 6), "base", "cell"),
        "terrain": {},
        "paths": {
            side: frames(movie(f"map_pass_{side}"), f"map_pass_{side}", range(1, count + 1),
                         f"path-{side}", "path")
            for side, count in (("left", 4), ("center", 11), ("right", 4))
        },
        "events": frames(movie("land_event"), "event", dict.fromkeys(EVENTS), "event", "terrain"),
        "subEvents": frames(movie("land_subevent"), "subevent", dict.fromkeys(SUB_EVENTS), "sub-event", "terrain"),
        "eventByTreasure": list(EVENTS),
        "subEventByTreasure": list(SUB_EVENTS),
    }
    terrains = {}
    for stage, stem in enumerate(TERRAIN):
        if stem not in terrains:
            source = movie(stem)
            terrains[stem] = add(source, f"{stem.replace('_', '-')}-dis", [source.instance("dis")], "terrain",
                                 sourceInstance="dis")
        detail["terrain"][str(stage)] = {"dis": terrains[stem]}

    manifest["detail"] = detail
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(f"Extracted {sum(name.startswith('quest-detail-') for name in manifest['layers'])} quest detail PNGs.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("asset_root", type=Path)
    parser.add_argument("art_dir", type=Path)
    parser.add_argument("--swfdump", default="swfdump", help="Apache Flex SDK swfdump")
    args = parser.parse_args()
    extract(args.asset_root, args.art_dir, args.swfdump)
