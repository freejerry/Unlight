#!/usr/bin/env python3
"""Extract the original castle battle layers and candle loop after Quest detail art.

Use: python3 -B tools/legacy-web/extract_quest_stage0_art.py ASSET_ROOT \
    source-login/quest-art --swfdump /path/to/Flex/bin/swfdump --ffdec /path/to/ffdec.jar
"""

import argparse
from hashlib import sha256
import json
from pathlib import Path
from subprocess import DEVNULL, run
from tempfile import TemporaryDirectory

from PIL import Image

from extract_battle_card_art import FFDEC_SHA256
from extract_quest_detail_art import (
    Movie, QUEST_STAGE_FRAME_RATE, REVISION, TWIPS, authored_primitives, png_bytes,
    rasterize, swf_affine, timeline,
)


CANDLE_FRAME_COUNT = 41
ATLAS_COLUMNS = 7
CANDLE_EXTENT = (-112, -464, 224, 472)


def candle_frames(movie, placements, folder, ffdec):
    sprite_id, = {movie.original_id(part) for part in placements}
    sprite = movie.symbol(placements[0])
    count = len(list(timeline(sprite)))
    if count != CANDLE_FRAME_COUNT:
        raise ValueError(f"Unexpected candle timeline in {movie.path}")
    folder.mkdir()
    run([
        "java", "-Djava.awt.headless=true", f"-Duser.home={folder}", "-Xmx256m", "-jar", ffdec,
        "-onerror", "abort", "-selectid", str(sprite_id), "-select", f"{sprite_id}:1-{count}",
        "-format", "sprite:png", "-export", "sprite", folder, movie.source,
    ], check=True, stdout=DEVNULL)
    files = folder / f"DefineSprite_{sprite_id}"
    frames = [Image.open(files / f"{frame}.png").convert("RGBA") for frame in range(1, count + 1)]
    if not all(frame.size == CANDLE_EXTENT[2:] and frame.getbbox() for frame in frames):
        raise ValueError(f"Unexpected original candle bounds in {movie.path}")
    return sprite_id, frames


def extract(asset_root, art, swfdump, ffdec):
    if sha256(ffdec.read_bytes()).hexdigest() != FFDEC_SHA256:
        raise ValueError("Expected ffdec.jar from the JPEXS 26.6.0 ZIP release")
    index = art / "sources.json"
    manifest = json.loads(index.read_text())
    if manifest["assetRevision"] != REVISION:
        raise ValueError("Quest art manifest uses a different asset revision")
    stages = manifest["battle"]["stages"]
    moving_far = stages["2"]["layers"][0]
    far_file = moving_far["file"]
    far_source = manifest["layers"][far_file]
    if (far_file != "quest-battle-stage02-far.png" or far_source["source"] != "data/image/bg/bg_btl00a_far.swf"
            or sha256((art / far_file).read_bytes()).hexdigest() != far_source["sha256"]):
        raise ValueError("Expected the original shared Stage 2 scroll band from the Quest detail extractor")

    castle = Movie(asset_root, "bg_btl00a", swfdump)
    near = Movie(asset_root, "bg_btl00a_book", swfdump)
    _, castle_display = next(timeline(castle.root))
    _, front_candles = next(timeline(near.root))
    backing, *back_candles, barrier = castle_display
    if len(back_candles) != 4 or len(front_candles) != 2:
        raise ValueError("Unexpected original castle candle placements")

    generated = {}

    def publish(source, file, image, x, y, space, **evidence):
        data = png_bytes(image)
        generated[file] = data
        geometry = dict(x=x, y=y, width=image.width, height=image.height)
        manifest["layers"][file] = dict(source=source.path.as_posix(), sourceSha256=source.digest,
                                        coordinateSpace=space, **evidence, **geometry, sha256=sha256(data).hexdigest())
        return dict(file=file, depth=0, **geometry)

    def static(file, part, crop):
        pieces, shapes = authored_primitives(castle, [part])
        image, x, y = rasterize(pieces, crop)
        return publish(castle, file, image, x, y, "stage", sourceFrame=1, sourceDepth=int(part["depth"]),
                       shapeIds=shapes, bitmapIds=[piece.bitmap_id for piece in pieces if piece.bitmap_id is not None])

    castle_art = static("quest-battle-stage00-castle.png", backing, (0, 0, 15200, 13600))
    barrier_art = static("quest-battle-stage00-barrier.png", barrier, (0, 6400, 15200, 7220))
    with TemporaryDirectory(prefix="unlight-stage0-candles-") as directory:
        temporary = Path(directory)
        back_id, frames = candle_frames(castle, back_candles, temporary / "castle", ffdec)
        front_id, near_frames = candle_frames(near, front_candles, temporary / "near", ffdec)
    if any(back.tobytes() != front.tobytes() for back, front in zip(frames, near_frames, strict=True)):
        raise ValueError("The original foreground and background candle clips no longer match")

    x, y, width, height = CANDLE_EXTENT
    atlas = Image.new("RGBA", (ATLAS_COLUMNS * width, ((len(frames) + ATLAS_COLUMNS - 1) // ATLAS_COLUMNS) * height))
    for i, image in enumerate(frames):
        atlas.paste(image, (i % ATLAS_COLUMNS * width, i // ATLAS_COLUMNS * height))
    animation = dict(columns=ATLAS_COLUMNS, frameCount=len(frames), framesPerSecond=QUEST_STAGE_FRAME_RATE,
                     frameWidth=width, frameHeight=height)
    atlas_art = publish(
        castle, "quest-battle-stage00-candle-atlas.png", atlas, x, y, "candle-atlas",
        sourceSpriteId=back_id, sourceFrames=list(range(1, len(frames) + 1)),
        equivalentSource=near.path.as_posix(), equivalentSourceSha256=near.digest, equivalentSpriteId=front_id,
        renderer="JPEXS FFDec 26.6.0", rendererSha256=FFDEC_SHA256, animation=animation,
    )

    def candle(part, depth):
        sx, skew_y, skew_x, sy, tx, ty = swf_affine(part["matrix"])
        if skew_x or skew_y or sx <= 0 or sy <= 0:
            raise ValueError(f"Unsupported original castle candle matrix {part['matrix']}")
        return dict(file=atlas_art["file"], x=tx / TWIPS + x * sx, y=ty / TWIPS + y * sy,
                    width=width * sx, height=height * sy, depth=depth, sourceDepth=int(part["depth"]),
                    animation=animation)

    layers = [moving_far, castle_art, *(candle(part, 0) for part in back_candles), barrier_art,
              *(candle(part, 3) for part in front_candles)]
    manifest["battle"]["stages"] = {
        "0": dict(layers=layers, bgm="/public/sound/bgm/bgm000.mp3"),
        **{stage_id: stage for stage_id, stage in stages.items() if stage_id != "0"},
    }
    for file, data in generated.items():
        (art / file).write_bytes(data)
    index.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print("Extracted three Stage 0 files and six placements from the original castle display lists.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("asset_root", type=Path)
    parser.add_argument("art_dir", type=Path)
    parser.add_argument("--swfdump", default="swfdump", help="Apache Flex SDK swfdump")
    parser.add_argument("--ffdec", type=Path, required=True, help="ffdec.jar from the JPEXS 26.6.0 ZIP release")
    args = parser.parse_args()
    extract(args.asset_root, args.art_dir, args.swfdump, args.ffdec)
