#!/usr/bin/env python3
"""Export the normal Quest duel and quest result art from the pinned mirror.

Use: python3 -B tools/legacy-web/extract_quest_result_art.py ASSET_ROOT OUTPUT \
    --ffdec /path/to/ffdec_26.6.0/ffdec.jar --mincho-font /path/to/wt004.ttf
"""

import argparse
from hashlib import sha256
import json
from pathlib import Path
from struct import pack, unpack_from
from subprocess import check_output
from tempfile import TemporaryDirectory

from PIL import Image

from extract_battle_card_art import FFDEC_SHA256
from extract_character_card_art import FONT_REVISION, FONT_SHA, REVISION, bitmap, checked_source, write_font
from extract_quest_detail_art import DEFINITION_TAGS, QUEST_STAGE_FRAME_RATE, TWIPS, nested_tags, png_bytes
from extract_quest_hit_art import bits, swf_tag
from source_stage_art import tags


PINS = {
    "maincall": ("data/image/game/result/maincall.swf", "2a29d06ae9bb830ffee6c22ba33a79ee7e21cb9a602390ecd5d2620080552f86"),
    "rewards": ("data/image/game/result/result_ch.swf", "7e7b71f9e2539620ed6e0faee0f18adc67ef9fd0e5bd089b72d4663da6d499f0"),
    "duelOk": ("data/image/game/result/result_ok.swf", "313d69ab0e025130b96dcf836cb7d52d9b4cf7e4241acf34b0124777e5def82a"),
    "quest": ("data/image/quest/quest_result_ch.swf", "84939f95d91964da4c22301c98b8ecfb37e02eee235bf3d7cdab2f1dc5de3c32"),
    "treasureBack": ("data/image/quest/quest_treasure.swf", "7dcb2412ac8705ecfa4ade71fcb9986914334ac0224ff0c20d222f049dcec19c"),
    "gemFrame": ("data/image/item_cardframe.swf", "ccc9f157c5cabcf205d290a96911436882ff9b2942bde277ea53dd21baf1383e"),
    "gemIcon": ("public/image/avatar_items/item_a_a001.swf", "5ddf65c7bcf5692af534021694e9019ed771735bbf9fb02159e46e6e4bc05d3e"),
    "levelUp": ("data/image/game/result/lvup_avatar.swf", "38bf03a787bc280add1f96b0e7be6621a9a6348eeca435f6dae60943d788c2f8"),
}
TREASURE_SOUND = ("public/sound/se/ulse23.mp3", "35144255330e5f81d9445b831f4df7e0ee769191eaed509e6c7d53c5a594a430")
GEM_TITLE = "GET GEM!!"
STAGE = (760, 680)
RESULT_ORIGIN = (380, 250)
# ResultImage.as uses gotoAndPlay(1), then maincall's child scripts stop on these frames.
OUTCOMES = {"win": (18, 28), "lose": (34, 26), "draw": (43, 24)}
LEVEL_UP_STOP = 50
LEVEL_UP_COUNT = 80


def named_instance(records, name):
    suffix = name.encode("ascii") + b"\0"
    (placement,) = [data for code, data in records if code == 26 and data[0] & 32 and data.endswith(suffix)]
    if not placement[0] & 2:
        raise ValueError(f"Missing character for original result instance {name}")
    return unpack_from("<H", placement, 3)[0], placement


def stage_movie(source, count, content):
    width, height = (extent * TWIPS for extent in STAGE)
    extent_bits = max(width, height).bit_length() + 1
    rect = bits([(extent_bits, 5), *((value, extent_bits) for value in (0, width, 0, height))])
    body = rect + pack("<HH", 24 * 256, count) + content + swf_tag(0)
    return b"FWS" + source.read_bytes()[3:4] + pack("<I", len(body) + 8) + body


def gem_frame_movie(source, records):
    # CardFrame.FRAME_BLUE is frame 4 with its `rare` child hidden.
    _, hidden = named_instance(records, "rare")
    definitions = bytearray()
    controls = bytearray()
    frame = 0
    for code, data in records:
        if code in DEFINITION_TAGS or code == 8:
            definitions.extend(swf_tag(code, data))
        elif code == 26 and data != hidden:
            controls.extend(swf_tag(code, data))
        elif code == 1:
            frame += 1
            if frame == 4:
                break
    if frame != 4:
        raise ValueError("Original blue Gem card frame was not found")
    return stage_movie(source, 1, definitions + controls + swf_tag(1))


def gem_icon_movie(source, records):
    definitions = bytearray()
    controls = bytearray()
    for code, data in records:
        if code in DEFINITION_TAGS or code == 8:
            definitions.extend(swf_tag(code, data))
        elif code == 26:
            controls.extend(swf_tag(code, data))
    if sum(code == 1 for code, _ in records) != 1 or not controls:
        raise ValueError("Unexpected original Gem icon timeline")

    # Keep the original movie registration point and place it at GemCardClip's (83,100).
    character = 100
    sprite = swf_tag(39, pack("<HH", character, 1) + controls + swf_tag(1) + swf_tag(0))
    x, y = 83 * TWIPS, 100 * TWIPS
    offset_bits = max(x, y).bit_length() + 1
    offset = bits([(0, 2), (offset_bits, 5), (x, offset_bits), (y, offset_bits)])
    placement = swf_tag(26, pack("<BHH", 6, 1, character) + offset)
    return stage_movie(source, 1, definitions + sprite + placement + swf_tag(1))


def outcome_movie(source, records, name, sprite_id, stop_frame):
    character, root = named_instance(records, name)
    if character != sprite_id or root[5] != 0:
        raise ValueError(f"Unexpected placement of the original result clip {name}")
    (sprite,) = [data for code, data in records if code == 39 and unpack_from("<H", data)[0] == sprite_id]
    if unpack_from("<H", sprite, 2)[0] != stop_frame:
        raise ValueError(f"Unexpected original stop frame in {name}")

    definitions = bytearray()
    for code, data in records:
        if code in DEFINITION_TAGS and (code != 39 or unpack_from("<H", data)[0] == 13):
            # Sprite 13 is the original one-frame translucent back plate shared by all outcomes.
            if unpack_from("<H", data)[0] >= 100:
                raise ValueError(f"Unexpected definition outside assigned export range in {name}")
            definitions.extend(swf_tag(code, data))

    # Flatten only time selection. Copy authored shapes, masks, morph ratios and
    # transforms verbatim into one static sprite per chosen frame for FFDec.
    controls = bytearray()
    stage = bytearray()
    x, y = (value * TWIPS for value in RESULT_ORIGIN)
    offset_bits = max(x, y).bit_length() + 1
    offset = bits([(0, 2), (offset_bits, 5), (x, offset_bits), (y, offset_bits)])
    character = 100
    for code, data in nested_tags(sprite):
        if code in (26, 28):
            controls.extend(swf_tag(code, data))
        elif code == 1:
            definitions.extend(swf_tag(39, pack("<HH", character, 1) + controls + swf_tag(1) + swf_tag(0)))
            if character > 100:
                stage.extend(swf_tag(28, pack("<H", 1)))
            stage.extend(swf_tag(26, pack("<BHH", 6, 1, character) + offset) + swf_tag(1))
            character += 1
        else:
            raise ValueError(f"Unexpected original result control {code} in {name}")
    if character - 100 != stop_frame:
        raise ValueError(f"Incomplete original timeline in {name}")

    return stage_movie(source, stop_frame, definitions + stage)


def level_up_movie(source, records):
    if sum(code == 1 for code, _ in records) != LEVEL_UP_COUNT:
        raise ValueError("Unexpected original Level Up movie duration")
    content = bytearray()
    frame = 0
    for code, data in records:
        if code == 39:
            sprite_id = unpack_from("<H", data)[0]
            stop = {12: 13, 21: 15}[sprite_id]
            sprite = bytearray(pack("<HH", sprite_id, LEVEL_UP_STOP))
            child_frame = 0
            for tag, payload in nested_tags(data):
                sprite.extend(swf_tag(tag, payload))
                if tag == 1:
                    child_frame += 1
                    if child_frame == stop:
                        break
            if child_frame != stop:
                raise ValueError("Incomplete original Level Up burst")
            # Keep the last child frame to mirror its original stop() instead of
            # FFDec's automatic timeline wrap during the parent clip.
            sprite.extend(swf_tag(1) * (LEVEL_UP_STOP - stop) + swf_tag(0))
            content.extend(swf_tag(code, sprite))
        elif code in DEFINITION_TAGS or code in (1, 26, 28, 70):
            content.extend(swf_tag(code, data))
            if code == 1:
                frame += 1
                if frame == LEVEL_UP_STOP:
                    break
    return stage_movie(source, LEVEL_UP_STOP, content)


def reward_positions():
    # ResultFrame is offset by y=5 in ResultScene. The first four fields in each
    # row share the same top edge; the total is larger and aligned 10px higher.
    return {row: [{"x": x, "y": y - (10 if x == 378 else 0), "width": 170 if x == 378 else 60, "height": 40}
                  for x in (83, 161, 225, 305, 378)] for row, y in (("gems", 597), ("exp", 642))}


def generate(args):
    if sha256(args.ffdec.read_bytes()).hexdigest() != FFDEC_SHA256:
        raise ValueError("Expected ffdec.jar from the JPEXS 26.6.0 ZIP release")
    args.output.mkdir(parents=True, exist_ok=True)
    provenance = {}

    def publish(filename, image, pin, x, y, **extra):
        content = png_bytes(image)
        (args.output / filename).write_bytes(content)
        provenance[filename] = {"source": PINS[pin][0], "sourceSha256": PINS[pin][1],
                                "sha256": sha256(content).hexdigest(), **extra}
        return {"file": filename, "x": x, "y": y, "width": image.width, "height": image.height}

    paths = {name: checked_source(args.assets, pin) for name, pin in PINS.items()}
    records = {name: list(tags(path)) for name, path in paths.items()}

    def emit_bitmap(pin, bitmap_id, filename, size, x, y, **extra):
        (image_tag,) = [(code, data) for code, data in records[pin]
                        if code in (6, 20, 35, 36) and unpack_from("<H", data)[0] == bitmap_id]
        image = bitmap(paths[pin], *image_tag)
        if image.size != size:
            raise ValueError(f"Unexpected original bitmap dimensions for {filename}")
        return publish(filename, image, pin, x, y, sourceBitmap=bitmap_id, **extra)

    def render_track(name, pin, stop_frame, movie_bytes, **evidence):
        frames, saved = [], {}
        with TemporaryDirectory(prefix="unlight-result-frames-") as directory:
            scratch = Path(directory)
            movie = scratch / f"{name}.swf"
            movie.write_bytes(movie_bytes)
            check_output(["java", "-Xmx256m", "-Djava.awt.headless=true", f"-Duser.home={scratch}", "-jar", args.ffdec,
                          "-onerror", "abort", "-format", "frame:png", "-export", "frame", scratch, movie])
            for index in range(1, stop_frame + 1):
                with Image.open(scratch / f"{index}.png") as raw:
                    image = raw.convert("RGBA")
                if image.size != STAGE:
                    raise ValueError(f"Incorrect FFDec output geometry in {name}")
                crop = image.getchannel("A").getbbox()
                if crop is None:
                    frames.append(None)
                    continue
                trimmed = image.crop(crop)
                key = sha256(trimmed.tobytes()).digest(), crop
                if key not in saved:
                    filename = f"{name}.png" if stop_frame == 1 else f"{name}-{index:02}.png"
                    saved[key] = publish(filename, trimmed, pin, crop[0], crop[1],
                                         sourceFrame=index, **evidence)
                frames.append(saved[key])
        if frames[-1] is None:
            raise ValueError(f"Unexpected transparent final {name} frame")
        return {"frames": frames, "framesPerSecond": QUEST_STAGE_FRAME_RATE, "holdLast": True}

    outcomes = {}
    for name, (sprite_id, stop_frame) in OUTCOMES.items():
        movie = outcome_movie(paths["maincall"], records["maincall"], name, sprite_id, stop_frame)
        outcomes[name] = render_track(name, "maincall", stop_frame, movie, sourceInstance=name, sourceSprite=sprite_id)
    level_movie = level_up_movie(paths["levelUp"], records["levelUp"])
    level_up = render_track("level-up", "levelUp", LEVEL_UP_STOP, level_movie, sourceSprite=0)
    level_up["waitMs"] = LEVEL_UP_COUNT * 42

    plate = emit_bitmap("rewards", 59, "reward-plate.png", (760, 96), 0, 585, sourceInstance="text_result",
                        sourceSprite=61, sourceFrame=1)
    duel_up = emit_bitmap("duelOk", 1, "duel-ok-up.png", (160, 32), 576, 600,
                          sourceButton=5, sourceStates=["up"])
    duel_over = emit_bitmap("duelOk", 3, "duel-ok-over.png", (160, 32), 576, 600,
                            sourceButton=5, sourceStates=["over", "down", "hitTest"])
    quest_up = emit_bitmap("quest", 3, "quest-ok-up.png", (160, 40), 0, 0,
                           sourceButton=7, sourceStates=["up"])
    quest_over = emit_bitmap("quest", 5, "quest-ok-over.png", (160, 40), 0, 0,
                             sourceButton=7, sourceStates=["over", "down", "hitTest"])

    quest = {}
    for name, bitmap_id, y, height, button_y, sprite_id in (("clear", 9, 184, 144, 288, 11),
                                                          ("failed", 1, 208, 104, 272, 8)):
        panel = emit_bitmap("quest", bitmap_id, f"quest-{name}.png", (368, height), 48, y,
                            sourceInstance=name, sourceSprite=sprite_id, sourceFrame=1)
        # The nested button record has a one-twip x translation within the button.
        up = quest_up | {"x": 152.05, "y": button_y}
        over = quest_over | {"x": 152.05, "y": button_y}
        quest[name] = {"panel": panel, "ok": {"up": up, "over": over, "down": over,
                                            "hit": [152.05, button_y, 159.95, 39.95]}}

    chest = emit_bitmap("quest", 12, "quest-treasure.png", (224, 320), 120, 96,
                        sourceInstance="get_tbox", sourceSprite=14, sourceFrame=1)
    # TreasureCardClip's pivot is (224,260). The closed card's container and
    # authored back frame together offset it by (-79.95,-119.95).
    card_back = emit_bitmap("treasureBack", 1, "treasure-card-back.png", (168, 240), 144.05, 140.05,
                            sourceLabel="red", sourceShape=2, sourceFrame=1)
    chest_up = quest_up | {"x": 152.05, "y": 376}
    chest_over = quest_over | {"x": 152.05, "y": 376}
    checked_source(args.assets, TREASURE_SOUND)
    gem_frame = render_track("treasure-gem-frame", "gemFrame", 1, gem_frame_movie(paths["gemFrame"], records["gemFrame"]),
                             originalFrame=4, hiddenInstance="rare")["frames"][0]
    gem_icon = render_track("treasure-gem-icon", "gemIcon", 1, gem_icon_movie(paths["gemIcon"], records["gemIcon"]),
                            anchor=[83, 100])["frames"][0]
    font = args.output / "treasure-gem-name.woff"
    write_font(args.mincho_font, font, [{"name_tcn": GEM_TITLE}])
    provenance[font.name] = {"source": "res/data/wt004.ttf", "sourceRevision": FONT_REVISION, "sourceSha256": FONT_SHA,
                             "sha256": sha256(font.read_bytes()).hexdigest(), "glyphs": GEM_TITLE}
    treasure = {
        "panel": chest,
        "ok": {"up": chest_up, "over": chest_over, "down": chest_over, "hit": [152.05, 376, 159.95, 39.95]},
        "card": {"back": card_back, "face": {"x": 144, "y": 140, "width": 168, "height": 240}, "pivot": [224, 260]},
        "gem": {"frame": gem_frame, "icon": gem_icon,
                "title": {"text": GEM_TITLE, "font": font.name, "x": 0, "y": 5, "width": 164, "height": 100},
                "caption": {"x": 15, "y": 178, "width": 150, "height": 100}},
        "motion": {"slideDelayMs": 300, "slideFromY": -420, "slideDurationMs": 130, "slideEasing": "sine-out",
                   "holdMs": 400, "flipDurationMs": 300, "flipDegrees": 180, "flipEasing": "expo-out", "showFaceAtDeg": 94},
        "flipSound": {"url": "/" + TREASURE_SOUND[0], "sha256": TREASURE_SOUND[1]},
    }

    index = {"assetRevision": REVISION, "assetRepository": "https://github.com/ni-light/Unlight-Images",
             "assetLicense": "CC-BY-ND-4.0", "renderer": "JPEXS FFDec 26.6.0", "rendererSha256": FFDEC_SHA256,
             "outcomes": outcomes, "rewards": {"plate": plate, "labels": reward_positions()},
             "ok": {"up": duel_up, "over": duel_over, "down": duel_over, "hit": [576, 600, 159.95, 31.95]},
             "quest": quest, "levelUp": level_up, "treasure": treasure, "provenance": provenance}
    (args.output / "index.json").write_text(json.dumps(index, indent=2) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("assets", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--ffdec", type=Path, required=True)
    parser.add_argument("--mincho-font", type=Path, required=True)
    generate(parser.parse_args())


if __name__ == "__main__":
    main()
