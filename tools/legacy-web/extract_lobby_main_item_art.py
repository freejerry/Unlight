#!/usr/bin/env python3
"""Extract the original Traditional Chinese ItemView stage shell and art states.

python3 -B tools/legacy-web/extract_lobby_main_item_art.py ASSETS OUTPUT \
    --swfdump /path/to/Flex/bin/swfdump --tcn-device-font /path/to/cwming.ttf \
    --mincho-font /path/to/wt004.ttf
"""

import argparse
from csv import DictReader
from hashlib import sha256
import json
from pathlib import Path
from struct import unpack_from

from PIL import Image

from extract_character_card_art import FONT_SHA, REVISION, bitmap, checked_source
from extract_lobby_friend_art import font_subset
from extract_lobby_record_art import DEVICE_FONT
from extract_quest_bonus_item_art import button_records
from extract_quest_detail_art import (
    Movie, Primitive, TWIPS, authored_primitives, bounds, placed_primitives, png_bytes, rasterize, timeline,
)
from source_stage_art import tags


ITEM_DIR = "data/image/item"
REPO = Path(__file__).resolve().parents[2]
BACKGROUND = (f"{ITEM_DIR}/item_inventory_ch.swf", "58979cf575797c9745e7418b5adcc4c1a33516d3edcfe13f7d1d27a40f9ffa21")
PANEL = (f"{ITEM_DIR}/item_panel_ch.swf", "cbf82ae008ddc012c94bb33d0ccce6fa1ffbdb0247d0f7902bdc4b38251c8293")
TILE = (f"{ITEM_DIR}/item_base.swf", "c23eb83f57ebb441f9ecde51fffec8c539d5ebb20244f06485fb13e4c1897324")
# DefineShape2 ID 2 includes a solid path after its JPEG fill. These are its
# exact bounds in twips, including the overlap underneath depth 3's capacity art.
BACKGROUND_SOLID_BOUNDS = (10560, 12640, 15200, 13120)

# item_inventory_ch.swf places rectangular bitmap fills. Up/over/down use distinct
# symbols; some original over/down bitmap bytes alias, which the full Flex dump rejects.
OUTER_STATES = (
    ("items", (0, 0), 13, ((5, 6), (7, 8), (9, 10), (11, 12))),
    ("body", (95.95, 95.95), 22, ((14, 15), (16, 17), (18, 19), (20, 21))),
    ("clothes", (192, 191.9), 31, ((23, 24), (25, 26), (27, 28), (29, 30))),
    ("accessories", (287.75, 287.85), 40, ((32, 33), (34, 35), (36, 37), (38, 39))),
)
STATES = ("selected", "up", "over", "down")
TITLE_GLYPHS = "所持品訊息"
USE_PANEL_SOURCE = "app/client/src/view/image/item/UseSendPanel.as"
USE_CONFIRM = {
    "panel": [255, 230, 250, 150],
    "title": "確認",
    "message": {"text": "要使用此道具嗎？", "bounds": [268, 280, 200, 50]},
    "yes": {"text": "Yes", "bounds": [295, 330, 60, 23]},
    "no": {"text": "No", "bounds": [405, 330, 60, 23]},
}
LABEL_GROUPS = [
    ["虛擬人物", "任務", "對戰", "突擊", "特殊"],
    ["身體顏色", "眼睛", "嘴", "髮型"],
    ["上衣", "下衣", "禮服", "鞋"],
    ["頭", "手臂", "臉", "ETC"],
]
DETAIL_TEXT_SOURCES = (
    ("app/server/data/csv/ja/AvatarItems.csv", "4621c7cf928cb37c289637cfc632f7dac7c1deb36e1bbdcc60fe88f143d936f9"),
    ("app/server/data/csv/ja/AvatarParts.csv", "173518d3d7e1dcb75130ef1f1808d282bb5c4252c46d8bca2c7c5c3133eaa084"),
)
DETAIL_COLUMNS = ("name_tcn", "caption_tcn")
# ItemListPanel, ItemTileList, BodyListPanel and TimeFormat use these count and timer characters.
DETAIL_NUMERIC_GLYPHS = "0123456789x- /:[]DHmdh"
USE_ALERT_GLYPHS = "訊息使用了OK"
USE_ALERT_SOURCES = ("app/client/src/net/server/LobbyServer.as", "app/client/lib/Alerter.as")


def layer(file, x, y, width, height):
    return {"file": file, "x": x, "y": y, "width": width, "height": height}


def background_art(assets, publish):
    source = checked_source(assets, BACKGROUND)
    bitmaps = {unpack_from("<H", data)[0]: (tag, data) for tag, data in tags(source) if tag in (6, 20)}
    code, payload = bitmaps[1]
    if code != 6 or payload[2:4] != b"\xff\xd8" or payload[-2:] != b"\xff\xd9" or bitmap(source, code, payload).size != (760, 680):
        raise ValueError("Expected the original complete 760×680 ItemView JPEG")
    publish("background.jpg", payload[2:], BACKGROUND, sourceBitmap=1, sourceShape=2, sourceDepth=2)
    x, y, right, bottom = BACKGROUND_SOLID_BOUNDS
    background_rect = {
        "x": x // TWIPS, "y": y // TWIPS, "width": (right - x) // TWIPS, "height": (bottom - y) // TWIPS,
        "color": "#858585", "sourceShape": 2, "sourceDepth": 2,
    }

    def bitmap_layer(file, id, x, y, size, **evidence):
        image = bitmap(source, *bitmaps[id])
        if image.size != size:
            raise ValueError(f"Unexpected original bitmap dimensions for {file}")
        publish(file, png_bytes(image), BACKGROUND, sourceBitmap=id, **evidence)
        return layer(file, x, y, *size)

    capacity = bitmap_layer("capacity.png", 3, 352, 632, (184, 24), sourceShape=4, sourceDepth=3)
    tabs = []
    for index, (key, (selected_x, button_x), symbol, source_states) in enumerate(OUTER_STATES):
        states = {}
        by_bitmap = {}
        for name, (id, shape) in zip(STATES, source_states, strict=True):
            data = bitmaps[id][1][2:]
            if data in by_bitmap:
                reused, evidence = by_bitmap[data]
                evidence["sourceAliases"].append({"state": name, "bitmap": id, "shape": shape})
                states[name] = reused
                continue
            file = f"outer-{key}-{name}.png"
            x = selected_x if name == "selected" else button_x
            evidence = {"sourceShape": shape, "sourceInstance": f"btn_{chr(97 + index)}",
                        "sourceButton": symbol, "sourceState": name, "sourceAliases": []}
            states[name] = bitmap_layer(file, id, x, 32, (96, 22), **evidence)
            by_bitmap[data] = (states[name], evidence)
        tabs.append({"key": key, "hit": [button_x, 32, 95.95, 21.95], **states})
    return layer("background.jpg", 0, 0, 760, 680), background_rect, capacity, tabs


def lighten(background, foreground):
    """Composite the original Flash Lighten source with straight-alpha RGBA."""
    pixels = bytearray()
    for base, overlay in zip(background.get_flattened_data(), foreground.get_flattened_data(), strict=True):
        a, b = base[-1] / 255, overlay[-1] / 255
        combined = a + b - a * b
        if combined:
            pixels.extend(round((a * (1 - b) * x + b * (1 - a) * y + a * b * max(x, y)) / combined)
                          for x, y in zip(base[:3], overlay[:3], strict=True))
        else:
            pixels.extend((0, 0, 0))
        pixels.append(round(combined * 255))
    return Image.frombytes("RGBA", background.size, bytes(pixels))


def hit_rect(movie, node, records):
    parts = [part for record in records
             for part in placed_primitives([Primitive(bounds(movie.symbol(record)), "")], record["matrix"])]
    tracks = placed_primitives(parts, node["matrix"])
    left, top, right, bottom = zip(*(track.bounds for track in tracks), strict=True)
    x, y = min(left), min(top)
    return [value / TWIPS for value in (x, y, max(right) - x, max(bottom) - y)]


def source_art(assets, swfdump, pin, publish):
    movie = Movie(assets, Path(pin[0]).stem, swfdump, pin=pin)

    def save(file, image, x, y, **evidence):
        publish(file, png_bytes(image), pin, **evidence)
        return layer(file, x, y, *image.size)

    def draw(file, parts, *, crop=None, **evidence):
        pieces, shapes = authored_primitives(movie, parts, preserve_stroke_alpha=True)
        image, x, y = rasterize(pieces, crop)
        source_bitmaps = sorted({piece.bitmap_id for piece in pieces if piece.bitmap_id is not None})
        return save(file, image, x, y, sourceShapes=shapes, sourceBitmaps=source_bitmaps, **evidence)

    def button(file, instance, base=()):
        node = movie.instance(instance)
        states = button_records(movie, node)
        hit = hit_rect(movie, node, states["hitTest"])
        variants, results = {}, {}
        for state in ("up", "over", "down"):
            signature = tuple(tuple(sorted(record.items())) for record in states[state])
            if signature not in variants:
                variants[signature] = draw(
                    f"{file}-{state}.png", [*base, node | {"buttonState": state}],
                    sourceInstance=instance, sourceButton=movie.original_id(node),
                    sourceStates=[key for key in ("up", "over", "down") if states[key] == states[state]],
                )
            results[state] = variants[signature]
        return {"hit": hit, **results}

    return movie, save, draw, button


def panel_art(assets, swfdump, publish):
    movie, save, draw, button = source_art(assets, swfdump, PANEL, publish)
    _, root = next(timeline(movie.root))
    panel = draw("inner-panel.png", [node for node in root if "name" not in node], sourceFrame=1)
    selected = draw("inner-tab-selected.png", [movie.instance("tab_base_a") | {"matrix": "t0,0"}], sourceFrame=1)
    first = movie.instance("tab_a")
    states = button_records(movie, first)
    up = draw("inner-tab-up.png", states["up"], sourceButton=69, sourceStates=["up"])

    down_base, down_highlight = states["down"]
    if "hasBlendMode" not in down_highlight["states"].split(",") or movie.original_id(down_highlight) != 67:
        raise ValueError("Unexpected original ItemView inner-tab Down composition")
    (hover,) = states["over"]
    frames = list(timeline(movie.symbol(hover)))
    if len(frames) != 8 or movie.original_id(hover) != 68:
        raise ValueError("Unexpected original ItemView inner-tab hover timeline")

    def blended(file, back, front, **evidence):
        crop = (0, 0, 96 * TWIPS, 32 * TWIPS)
        backgrounds, rear_shapes = authored_primitives(movie, [back], preserve_stroke_alpha=True)
        highlights, front_shapes = authored_primitives(movie, [front], preserve_stroke_alpha=True)
        base, x, y = rasterize(backgrounds, crop)
        positive, _, _ = rasterize(highlights, crop)
        return save(file, lighten(base, positive), x, y, sourceShapes=rear_shapes + front_shapes,
                    sourceBlendMode=5, **evidence)

    down = blended("inner-tab-down.png", down_base, down_highlight, sourceButton=69, sourceStates=["down"])
    hover_frames = []
    for number, (_, (base, highlight)) in enumerate(frames, 1):
        if highlight.get("blendmode") != "5":
            raise ValueError("Unexpected original ItemView inner-tab hover blend mode")
        hover_frames.append(blended(
            f"inner-tab-hover-{number}.png", base, highlight, sourceButton=69, sourceSprite=68, sourceFrame=number,
            sourceMatrix=highlight["matrix"], sourceColorTransform=highlight["cxform"],
        ))

    def positioned(sprite, x, y):
        return sprite | {"x": x + sprite["x"], "y": y + sprite["y"]}

    tabs = []
    for i, letter in enumerate("abcde"):
        entry = movie.instance(f"tab_{letter}")
        hit = hit_rect(movie, entry, button_records(movie, entry)["hitTest"])
        x, y = hit[:2]
        position = [positioned(sprite, x, y) for sprite in hover_frames]
        tabs.append({
            "hit": hit, "label": [38 + 96 * i, 63, 80, 30],
            "selected": positioned(selected, x, y), "up": positioned(up, x, y),
            "over": position[0], "down": positioned(down, x, y),
            "hover": {"frames": position, "frameMs": 1000 / 24, "loop": False},
        })
    pager = {key: button(f"page-{key}", f"btn_p_{name}") for key, name in (
        ("first", "first"), ("previous", "back"), ("next", "next"), ("last", "end"),
    )}
    actions = {key: button(key, f"btn_{key}") for key in ("use", "remove", "drop", "sell")}
    return {"panel": panel, "tabs": tabs, "pager": pager, "actions": actions}


def tile_art(assets, swfdump, publish):
    movie, _, draw, button = source_art(assets, swfdump, TILE, publish)
    _, (base, _, equip) = next(timeline(movie.root))
    selected = draw("tile-selected.png", [base], sourceFrame=1)
    return {
        **button("tile", "btn_base", base=[base]),
        "selected": selected,
        "equip": draw("tile-equip.png", [equip], sourceInstance="equip", sourceFrame=1),
    }


def detail_font(source, output, provenance):
    from fontTools.ttLib import TTFont

    glyphs = set(DETAIL_NUMERIC_GLYPHS + USE_ALERT_GLYPHS)
    for pin in DETAIL_TEXT_SOURCES:
        with checked_source(REPO, pin).open(encoding="utf-8-sig", newline="") as master:
            for row in DictReader(master):
                glyphs.update(char for key in DETAIL_COLUMNS for char in row[key] if char.isprintable())
    with TTFont(source, lazy=True) as original:
        coverage = set(map(chr, original.getBestCmap()))

    file = "main-item-detail.woff"
    value = font_subset(source, output, file, DEVICE_FONT, "".join(glyphs & coverage), provenance)
    provenance[file]["detailText"] = [
        {"source": path, "sourceSha256": digest, "columns": list(DETAIL_COLUMNS)}
        for path, digest in DETAIL_TEXT_SOURCES
    ]
    provenance[file]["useAlertText"] = [
        {"source": path, "sourceSha256": sha256((REPO / path).read_bytes()).hexdigest()}
        for path in USE_ALERT_SOURCES
    ]
    provenance[file]["missingGlyphs"] = "".join(sorted(glyphs - coverage))
    return value


def extract(args):
    args.output.mkdir(parents=True, exist_ok=True)
    provenance = {}

    def publish(file, content, pin, **evidence):
        (args.output / file).write_bytes(content)
        provenance[file] = {"source": pin[0], "sourceSha256": pin[1],
                            "sha256": sha256(content).hexdigest(), **evidence}

    background, background_rect, capacity_plate, outer_tabs = background_art(args.assets, publish)
    inner = panel_art(args.assets, args.swfdump, publish)
    tile = tile_art(args.assets, args.swfdump, publish)
    fonts = {
        "title": font_subset(args.tcn_device_font, args.output, "main-item-title.woff", DEVICE_FONT,
                             TITLE_GLYPHS + USE_CONFIRM["title"], provenance),
        "labels": font_subset(args.mincho_font, args.output, "main-item-labels.woff", ("res/data/wt004.ttf", FONT_SHA),
                              "".join(label for group in LABEL_GROUPS for label in group) + USE_CONFIRM["message"]["text"],
                              provenance),
        "detail": detail_font(args.tcn_device_font, args.output, provenance),
    }
    index = {
        "assetRevision": REVISION, "background": background, "backgroundRect": background_rect, "capacityPlate": capacity_plate,
        "capacity": [449, 630, 100, 25], "outerTabs": outer_tabs, "inner": inner, "tile": tile,
        "grid": {"x": 24, "y": 104, "columns": 5, "rows": 3, "stepX": 95, "stepY": 95},
        "page": [242, 392, 30, 20], "fonts": fonts, "labels": LABEL_GROUPS, "useConfirm": USE_CONFIRM,
        "layoutSources": [
            "app/client/src/view/ItemView.as", "app/client/src/view/image/item/ItemInventoryImage.as",
            "app/client/src/view/image/item/ItemInventoryPanelImage.as", "app/client/src/view/scene/common/BaseItemListPanel.as",
            "app/client/src/view/scene/item/ItemTileList.as", USE_PANEL_SOURCE, "app/client/src/model/AvatarItem.as",
            "app/client/src/model/AvatarPart.as", "app/client/data/css/UL.css.cn",
        ],
        "provenance": provenance,
    }
    (args.output / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("assets", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--swfdump", required=True)
    parser.add_argument("--tcn-device-font", type=Path, required=True)
    parser.add_argument("--mincho-font", type=Path, required=True)
    extract(parser.parse_args())


if __name__ == "__main__":
    main()
