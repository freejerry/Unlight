#!/usr/bin/env python3
"""Extract the original TCN Record viewer and its public achievement definitions.

python3 -B tools/legacy-web/extract_lobby_record_art.py ASSETS CONST_DATA OUTPUT \
    --swfdump /path/to/Flex/bin/swfdump --tcn-device-font /path/to/cwming.ttf

CONST_DATA is the generated TCN app/client/src/model/utils/ConstData.as.
The inputs are pinned. Generation does not load an avatar or run ActionScript.
"""

import argparse
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import re
from struct import unpack_from

from extract_character_card_art import FONT_REVISION, REVISION, bitmap, checked_source
from extract_quest_detail_art import Movie, authored_primitives, png_bytes, rasterize, timeline
from source_stage_art import tags


PANEL = ("data/image/achievement/achievement_ch.swf",
         "a13595f7e7224c67d465b3d71a037265c5fd4eca2ab702bdb80fcd18dc58b31e")
ROWS = ("data/image/achievement/achievement_list.swf",
        "59788994a394463cdba4a96a29ce6fda001ff85cce0cc6afbcc5ffba7f24922c")
CONST_DATA_DIGEST = "25650a53f776cfa60c175d70fb977d86c6942e45099cb58e65ccb858d9e1e798"
CONDITION_SOURCE = "app/client/src/model/Achievement.as"
CONDITION_DIGEST = "f8b166518af9903e936180ab0907901f837e1f88ec9fd7ee093908775fe23340"
CONST_DATA_SOURCE = "app/client/src/model/utils/ConstData.as"
MASTER_SOURCE = "app/server/data/csv/tcn/Achievements.csv"
DEVICE_FONT = ("res/data/cwming.ttf", "094a5c7340f181059baf2c574da05f558a3dfe6b12d6323349354c64c0ecbb5e")
RECORD_LABEL_GLYPHS = "紀錄成就進行中完成上一頁下一頁全部類別關閉有效期限達成代碼尚未收到完整紀錄。日一二三四五六\u00a0"
REPO = Path(__file__).resolve().parents[2]


def layer(file, x, y, width, height):
    return {"file": file, "x": x, "y": y, "width": width, "height": height}


def panel_art(assets, publish):
    source = checked_source(assets, PANEL)
    bitmaps = {unpack_from("<H", payload)[0]: (code, payload)
               for code, payload in tags(source) if code in (20, 36)}

    def publish_bitmap(file, bitmap_id, geometry, size, **selectors):
        image = bitmap(source, *bitmaps[bitmap_id])
        if image.size != size:
            raise ValueError(f"Unexpected original Record bitmap size for {file}")
        publish(file, png_bytes(image), PANEL, sourceBitmap=bitmap_id, **selectors)
        return layer(file, *geometry)

    panel = publish_bitmap("panel.png", 1, (0, 0, 648, 520), (648, 520),
                           sourceShape=2, sourceDepth=1, sourceFrame=1)

    # Flex swfdump rejects the eight duplicate title bitmap tags. All eight have identical painted bytes.
    title_ids = list(range(3, 18, 2))
    if any(payload[2:] != bitmaps[3][1][2:] for _, payload in (bitmaps[id] for id in title_ids)):
        raise ValueError("Unexpected original recordname title frame contents")
    title = publish_bitmap("category-title.png", 3, (8, 344, 632, 32), (632, 32),
                           sourceBitmaps=title_ids, sourceShapes=list(range(4, 19, 2)),
                           sourceInstance="recordname", sourceSprite=19, sourceFrames=list(range(1, 9)))

    def button(key, instance, symbol, ids, shapes, size, geometry, scale=65536):
        # Use the original button shape endpoint (one twip shy of the bitmap) for its hit geometry.
        width, height = ((20 * n - 1) * scale / (20 * 65536) for n in size)
        up_position, over_position = geometry
        up = publish_bitmap(f"{key}-up.png", ids[0], (*up_position, width, height), size,
                            sourceInstance=instance, sourceButton=symbol, sourceShape=shapes[0], sourceStates=["up"])
        over = publish_bitmap(f"{key}-over.png", ids[1], (*over_position, width, height), size,
                              sourceInstance=instance, sourceButton=symbol, sourceShape=shapes[1],
                              sourceStates=["over", "down", "hitTest"])
        return {"up": up, "over": over, "down": over, "hit": [*over_position, width, height]}

    tabs = [
        button("tab-ongoing", "tab_a", 29, (25, 27), (26, 28), (96, 24), ((8, 24), (8, 24))),
        button("tab-finished", "tab_b", 24, (20, 22), (21, 23), (96, 24), ((104, 24), (104, 24))),
    ]
    arrow_scale = 65331 / 65536
    previous_x = 608.1 - 15.95 * arrow_scale
    buttons = {
        "close": button("close", "btn_close", 34, (30, 32), (31, 33), (24, 24), ((624, 0), (624, 0)), 65380),
        "previous": button("previous", "btn_back", 39, (35, 37), (36, 38), (16, 16),
                           ((previous_x, 327.95), (previous_x, 327.95 + .05 * arrow_scale)), 65331),
        "next": button("next", "btn_next", 44, (40, 42), (41, 43), (16, 16),
                       ((608.1, 327.95 + .05 * arrow_scale), (608.1 + .05 * arrow_scale, 327.95)), 65331),
    }
    return panel, tabs, buttons, [title] * len(title_ids)


def row_art(assets, swfdump, publish):
    source = Movie(assets, "achievement_list", swfdump, pin=ROWS)

    def capture(file, placements, **selectors):
        pieces, shapes = authored_primitives(source, placements, preserve_stroke_alpha=True)
        image, x, y = rasterize(pieces)
        publish(file, png_bytes(image), ROWS, sourceShapes=shapes, **selectors)
        return layer(file, x, y, image.width, image.height)

    icons = []
    icon = source.instance("icon_category")
    for frame_no in range(1, 9):
        icons.append(capture(f"row-category-{frame_no}.png", [icon | {"spriteFrame": frame_no}],
                             sourceInstance="icon_category", sourceSprite=17, sourceFrame=frame_no))
    _, contents = next(timeline(source.root))
    row_button = next(entry for entry in contents if source.original_id(entry) == 21)
    if row_button.get("blendmode") != "4":
        raise ValueError("Expected the original row button screen blending")
    over = capture("row-over.png", [row_button | {"buttonState": "over"}], sourceButton=21,
                   sourceStates=["over", "down"], sourceBlendMode=4)
    selected = capture("row-selected.png", [source.instance("select")], sourceInstance="select", sourceSprite=23)
    return {
        "icons": icons,
        "panel": {"up": None, "over": over, "down": over, "hit": [32, 0, 576, 16], "blendMode": "screen"},
        "selected": selected,
    }


def const_rows(source, table):
    text = re.search(rf"public static const {table}_DATA:Array\s*=\s*\[\n(.*?)\n\s*\];", source, re.DOTALL)[1]
    # Skip the source's id-zero sentinel, including the empty ActionScript-only array slot in CHARA_CARD_DATA.
    records = (line.strip().rstrip(",") for line in text.splitlines())
    return [json.loads(line) for line in records if line and not line.startswith("[0,")]


def condition_labels():
    source = checked_source(REPO, (CONDITION_SOURCE, CONDITION_DIGEST)).read_text()
    tcn = dict(re.findall(r'CONFIG::LOCALE_TCN\s+private static const (_TRANS_MSG_\w+):String\s*=\s*("[^"\n]*")', source))
    labels = re.search(r"public static const COND_MSG_SET:Array = \[(.*?)\];", source, re.DOTALL)[1]
    return [json.loads(tcn.get(value, value)) for value in re.findall(r'^\s*(_TRANS_MSG_\w+|""),?', labels, re.MULTILINE)]


def catalogue(const_data):
    source = const_data.read_bytes()
    if sha256(source).hexdigest() != CONST_DATA_DIGEST:
        raise ValueError("Expected the original generated TCN ConstData.as")
    source = source.decode("utf-8")
    entries = {}
    for id, kind, caption, deadline, success, condition_info, explanation, _ in const_rows(source, "ACHIEVEMENT"):
        if id < 1 or id in entries or kind not in range(5):
            raise ValueError(f"Unexpected original Record id/category: {id}, {kind}")
        condition_type, separator, condition = condition_info.partition(":")
        entries[id] = {"kind": kind, "caption": caption, "deadline": deadline, "successCondition": success,
                       "conditionType": int(condition_type) if separator else None,
                       "condition": condition if separator else condition_info,
                       "explanation": explanation}

    labels = condition_labels()
    if len(labels) != 35 or len(entries) != 1205:
        raise ValueError("Unexpected original Record catalogue size")
    names = {}
    for types, table in (((2, 8), "QUEST"), ((4, 16), "AVATAR_ITEM"), ((6, 7), "CHARA_CARD"), ((29,), "AVATAR_PART")):
        table_rows = {row[0]: (f"Lv{row[3]}{row[1]}" if table == "CHARA_CARD" else row[1])
                      for row in const_rows(source, table)}
        for type in types:
            ids = {int(component.split(",")[0]) for record in entries.values()
                   if record["conditionType"] == type and record["successCondition"] > 0
                   for component in record["condition"].split("_") if component.split(",")[0].isdecimal()}
            names[type] = {id: table_rows[id] for id in sorted(ids) if id in table_rows}
    return {
        "entries": entries,
        "conditionLabels": labels,
        "conditionNames": names,
        "provenance": {"source": CONST_DATA_SOURCE, "sourceSha256": CONST_DATA_DIGEST,
                       "master": MASTER_SOURCE, "generator": "app/client/script/create_const_data.rb",
                       "fieldLabels": CONDITION_SOURCE, "fieldLabelsSha256": CONDITION_DIGEST},
    }


def record_font(source, definitions):
    from fontTools import subset

    if sha256(source.read_bytes()).hexdigest() != DEVICE_FONT[1]:
        raise ValueError("Expected the original Ruffle TCN cwming.ttf device font")
    glyphs = set(range(32, 127))  # Source categories, numerals, date punctuation and completion codes.
    glyphs.update(map(ord, RECORD_LABEL_GLYPHS))
    strings = definitions["conditionLabels"] + [name for names in definitions["conditionNames"].values() for name in names.values()]
    for record in definitions["entries"].values():
        strings.extend((record["caption"], record["explanation"]))
    glyphs.update(ord(char) for value in strings for char in value if char.isprintable())

    options = subset.Options()
    options.name_IDs += [0, 13, 14]
    font = subset.load_font(source, options)
    coverage = set(font.getBestCmap())
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=glyphs & coverage)
    subsetter.subset(font)
    font.flavor = "woff"
    font.recalcTimestamp = False
    buffer = BytesIO()
    font.save(buffer)
    return buffer.getvalue(), len(glyphs & coverage), "".join(map(chr, sorted(glyphs - coverage)))


def extract(assets, const_data, output, swfdump, tcn_device_font):
    definitions = catalogue(const_data)
    output.mkdir(parents=True, exist_ok=True)
    provenance = {}

    def publish(file, content, pin, **selectors):
        (output / file).write_bytes(content)
        provenance[file] = {"source": pin[0], "sourceSha256": pin[1], "sha256": sha256(content).hexdigest(), **selectors}

    panel, tabs, buttons, titles = panel_art(assets, publish)
    rows = row_art(assets, swfdump, publish)
    catalogue_file = "catalogue.json"
    payload = (json.dumps(definitions, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    publish(catalogue_file, payload, (CONST_DATA_SOURCE, CONST_DATA_DIGEST), sourceTable="ACHIEVEMENT_DATA")
    font = "record-device.woff"
    font_data, codepoints, missing = record_font(tcn_device_font, definitions)
    publish(font, font_data, DEVICE_FONT, sourceRevision=FONT_REVISION, codepoints=codepoints, missingGlyphs=missing)
    manifest = {"assetRevision": REVISION, "origin": [52, 100], "panel": panel, "tabs": tabs, "buttons": buttons,
                "categoryTitles": titles, "rows": rows, "catalogue": catalogue_file, "font": {"file": font},
                "provenance": provenance}
    (output / "index.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("assets", type=Path)
    parser.add_argument("const_data", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--swfdump", type=Path, required=True)
    parser.add_argument("--tcn-device-font", type=Path, required=True)
    args = parser.parse_args()
    extract(args.assets, args.const_data, args.output, args.swfdump, args.tcn_device_font)
