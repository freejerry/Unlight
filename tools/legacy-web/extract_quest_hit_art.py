#!/usr/bin/env python3
"""Export the original Quest hit sprites from the pinned asset mirror.

Use: python3 -B tools/legacy-web/extract_quest_hit_art.py ASSET_ROOT OUTPUT \
    --ffdec /path/to/ffdec_26.6.0/ffdec.jar
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
from extract_character_card_art import REVISION, checked_source
from extract_quest_detail_art import DEFINITION_TAGS, QUEST_STAGE_FRAME_RATE, TWIPS, nested_tags, png_bytes
from source_stage_art import tags


# Original child IDs, final reached frames (including AVM2 stop()), and parent lead-in frames.
TRACKS = {
    "slash": ("effect_hit_slash", "3592bda8ba161fa100cd8d4b9f1e5ff9faca666f588dfa7d2a8671534fa2dfa5", 11, 13, 0),
    "bullet": ("effect_hit_bullet", "042b91f16198b3fbaf423f1e51fd34567f01086d7b27b9b27a67e79d854c8b70", 5, 8, 1),
    "bulletOver": ("effect_hit_bullet_p", "86952ec2ba7a2d3a919c874a23e015545f194856f96fddf8efb7a3de84226637", 4, 8, 0),
    "blood": ("effect_dmg_blood", "c752bf12a45dbf75c2030c591023f1717d3f02de7abdd29ff32bb63c68173e30", 4, 5, 0),
}
VIEW_SIZE = 512
ORIGIN = VIEW_SIZE // 2


def bits(fields):
    encoded = "".join(f"{value & ((1 << width) - 1):0{width}b}" for value, width in fields)
    length = (len(encoded) + 7) // 8
    return int(encoded.ljust(length * 8, "0"), 2).to_bytes(length, "big")


def swf_tag(kind, data=b""):
    size = len(data)
    return pack("<H", (kind << 6) | min(size, 63)) + (pack("<I", size) if size >= 63 else b"") + data


def export_movie(source, sprite_id, stop_frame, lead_frames):
    records = list(tags(source))
    (sprite,) = [data for kind, data in records if kind == 39 and unpack_from("<H", data)[0] == sprite_id]
    first_placement = next(i for i, (kind, _) in enumerate(records) if kind == 26)
    if sum(kind == 1 for kind, _ in records[:first_placement]) != lead_frames:
        raise ValueError(f"Unexpected original sprite start in {source.name}")
    root = records[first_placement][1]
    if root[:6] != pack("<BHHB", 6 | (16 if lead_frames else 0), 1, sprite_id, 0):
        raise ValueError(f"Unexpected original hit registration point in {source.name}")

    # Render each original display list as a separate still on a known transparent viewport.
    # This retains the original PlaceObject operations and avoids advancing nested clips in the exporter.
    frames = []
    controls = bytearray()
    for kind, data in nested_tags(sprite):
        if kind == 1:
            frames.append(bytes(controls))
            if len(frames) == stop_frame:
                break
        elif kind in (26, 28):
            controls.extend(swf_tag(kind, data))
        else:
            raise ValueError(f"Unsupported original hit control tag {kind} in {source.name}")
    if len(frames) != stop_frame:
        raise ValueError(f"Incomplete original hit timeline in {source.name}")

    definitions = bytearray()
    for kind, data in records:
        if kind in DEFINITION_TAGS and kind != 39:
            if unpack_from("<H", data)[0] >= 100:
                raise ValueError(f"Unexpected original definition outside export range in {source.name}")
            definitions.extend(swf_tag(kind, data))

    # SWF RECT and MATRIX are signed bitfields in twips. The sole added transform
    # places registration (0,0) at the exact integer center of the export viewport.
    edge = VIEW_SIZE * TWIPS
    edge_bits = edge.bit_length() + 1
    rect = bits([(edge_bits, 5), *((value, edge_bits) for value in (0, edge, 0, edge))])
    shift = ORIGIN * TWIPS
    shift_bits = shift.bit_length() + 1
    matrix = bits([(0, 2), (shift_bits, 5), (shift, shift_bits), (shift, shift_bits)])
    stage = bytearray()
    for index, display in enumerate(frames, 100):
        definitions.extend(swf_tag(39, pack("<HH", index, 1) + display + swf_tag(1) + swf_tag(0)))
        if index > 100:
            stage.extend(swf_tag(28, pack("<H", 1)))
        stage.extend(swf_tag(26, pack("<BHH", 6, 1, index) + matrix))
        stage.extend(swf_tag(1))
    body = rect + pack("<HH", 24 * 256, stop_frame) + definitions + stage + swf_tag(0)
    return b"FWS" + source.read_bytes()[3:4] + pack("<I", len(body) + 8) + body


def generate(args):
    if sha256(args.ffdec.read_bytes()).hexdigest() != FFDEC_SHA256:
        raise ValueError("Expected ffdec.jar from the JPEXS 26.6.0 ZIP release")
    args.output.mkdir(parents=True, exist_ok=True)
    effects, provenance = {}, {}
    for key, (name, digest, sprite_id, stop_frame, lead_frames) in TRACKS.items():
        relative = f"data/image/game/{name}.swf"
        source = checked_source(args.assets, (relative, digest))
        frames = [None] * lead_frames
        files = {}
        with TemporaryDirectory(prefix="unlight-hit-frames-") as directory:
            scratch = Path(directory)
            movie = scratch / source.name
            movie.write_bytes(export_movie(source, sprite_id, stop_frame, lead_frames))
            check_output(["java", "-Xmx256m", "-Djava.awt.headless=true", f"-Duser.home={scratch}", "-jar", args.ffdec,
                          "-onerror", "abort", "-format", "frame:png", "-export", "frame", scratch, movie])
            for number in range(1, stop_frame + 1):
                with Image.open(scratch / f"{number}.png") as captured:
                    image = captured.convert("RGBA")
                if image.size != (VIEW_SIZE, VIEW_SIZE):
                    raise ValueError(f"Unexpected export viewport in {relative}")
                bounds = image.getchannel("A").getbbox()
                if bounds is None:
                    frames.append(None)
                    continue
                left, top, right, bottom = bounds
                if min(left, top) <= 0 or max(right, bottom) >= VIEW_SIZE:
                    raise ValueError(f"Original hit frame touches the export viewport edge in {relative}")
                cropped = image.crop(bounds)
                pixels = png_bytes(cropped)
                pixel_digest = sha256(pixels).hexdigest()
                if pixel_digest not in files:
                    filename = f"{key}-{number:02}.png"
                    (args.output / filename).write_bytes(pixels)
                    provenance[filename] = {"source": relative, "sourceSha256": digest,
                                            "sourceSprite": sprite_id, "sourceFrame": number, "sha256": pixel_digest}
                    files[pixel_digest] = filename
                frames.append({"file": files[pixel_digest], "x": left - ORIGIN, "y": top - ORIGIN,
                               "width": cropped.width, "height": cropped.height})
        effects[key] = {"frames": frames, "framesPerSecond": QUEST_STAGE_FRAME_RATE, "holdLast": frames[-1] is not None}
    manifest = {"assetRevision": REVISION, "assetRepository": "https://github.com/ni-light/Unlight-Images",
                "assetLicense": "CC-BY-ND-4.0", "renderer": "JPEXS FFDec 26.6.0", "rendererSha256": FFDEC_SHA256,
                "effects": effects, "provenance": provenance}
    (args.output / "index.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("assets", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--ffdec", type=Path, required=True)
    generate(parser.parse_args())


if __name__ == "__main__":
    main()
