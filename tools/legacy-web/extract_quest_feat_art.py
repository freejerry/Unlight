#!/usr/bin/env python3
"""Export pinned original Quest FeatImage timelines without ActionScript.

python3 -B tools/legacy-web/extract_quest_feat_art.py ASSETS OUTPUT \
    --ffdec /path/to/ffdec_26.6.0/ffdec.jar
"""

import argparse
from hashlib import sha256
import json
from os import getpid
from pathlib import Path
from struct import pack, unpack_from
from subprocess import Popen
from tempfile import TemporaryDirectory
from time import monotonic, sleep
from zlib import decompress

from source_stage_art import tags


REVISION = "0ec2d2ffb0e294e46cd0edfb84c9778e3dd4ed0e"
FFDEC_SHA256 = "3f1b1993a8ab34d4910192931236074d2c69db23e23d69cd16848c851b1995c3"
FEATS = {
    "bash": {
        "ids": [25, 26], "name": "猛擊", "file": "public/image/cutinchara03_skl00.swf",
        "sha256": "59b8e17c44df7521e4887c7c2a0dda21d77a1fca1753263eb68f97c330eddf59",
        "frames": 41, "childStops": {21: 4, 25: 3},
    },
    "precision": {
        "ids": [1, 2], "name": "精密射擊", "file": "public/image/cutinchara01_skl00.swf",
        "sha256": "c7f34bfef8024daa333ede7e566e4e76900e2463b9fed22df4e36043590ccfb7",
        "frames": 48, "childStops": {20: 4},
    },
    "counter-guard": {
        "ids": [100], "name": "攻防抗衡", "file": "public/image/cutinchara09_skl01.swf",
        "sha256": "623ce272da2bbdeb65a89046097b347677b86e6b4f4466d5dc115eea8fe276b9",
        "frames": 46, "childStops": {}, "sourceCanvas": (944, 704),
    },
}
WIDTH, HEIGHT = 760, 680
VISIBLE_STAGE_WIDTH = 780
FPS = 24
RSS_BUDGET_KIB = 96 * 1024
CGROUP_MARGIN_BYTES = 160_000_000
END = b"\0\0"
FRAME = b"\x40\0"


def tag_bytes(kind, data):
    size = len(data)
    return pack("<H", (kind << 6) | min(size, 63)) + (pack("<I", size) if size >= 63 else b"") + data


def nested_tags(data):
    position = 4
    while position + 2 <= len(data):
        header = unpack_from("<H", data, position)[0]
        position += 2
        kind, size = header >> 6, header & 63
        if size == 63:
            size = unpack_from("<I", data, position)[0]
            position += 4
        if not kind:
            break
        yield kind, data[position:position + size]
        position += size


def export_movie(source, feat):
    raw = source.read_bytes()
    if sha256(raw).hexdigest() != feat["sha256"]:
        raise ValueError(f"Expected pinned original artifact {feat['file']}")
    body = decompress(raw[8:]) if raw[:3] == b"CWS" else raw[8:]
    rect_end = (5 + 4 * (body[0] >> 3) + 7) // 8
    fps, total = unpack_from("<HH", body, rect_end)
    if (fps, total) != (FPS * 256, feat["frames"]):
        raise ValueError(f"Unexpected FeatImage frame clock in {source.name}")
    result = bytearray(body[:rect_end + 4])
    prepared = set()
    for kind, payload in tags(source):
        # The external Loader composes transparent content. Drop publication
        # background, ABC, SymbolClass and Scene/FrameLabel scripting metadata.
        if kind in (9, 76, 82, 86):
            continue
        if kind == 39:
            symbol, frames = unpack_from("<HH", payload)
            if symbol in feat["childStops"]:
                stop = feat["childStops"][symbol]
                if not 0 < stop <= frames:
                    raise ValueError(f"Unexpected child stop in {source.name} symbol {symbol}")
                retained = bytearray()
                shown = 0
                for child_kind, data in nested_tags(payload):
                    if child_kind not in (1, 26, 28, 70):
                        raise ValueError(f"Unexpected child control tag in {source.name} symbol {symbol}")
                    retained.extend(tag_bytes(child_kind, data))
                    shown += child_kind == 1
                    if shown == stop:
                        break
                if shown != stop:
                    raise ValueError(f"Incomplete child timeline in {source.name} symbol {symbol}")
                # The only AVM2 frame actions are stop() at these source frames.
                # Keep displaying the stopped source composition to root end.
                payload = pack("<HH", symbol, total) + retained + FRAME * (total - stop) + END
                prepared.add(symbol)
        result.extend(tag_bytes(kind, payload))
    if prepared != feat["childStops"].keys():
        raise ValueError(f"Missing source child stop controls in {source.name}")
    result.extend(END)
    return b"FWS" + raw[3:4] + pack("<I", len(result) + 8) + result


def rss_kib(pid):
    path = Path(f"/proc/{pid}/status")
    try:
        return next(int(line.split()[1]) for line in path.read_text().splitlines() if line.startswith("VmRSS:"))
    except (FileNotFoundError, ProcessLookupError, StopIteration):
        return 0


def available_cgroup_memory():
    try:
        path = Path("/sys/fs/cgroup")
        return int((path / "memory.max").read_text()) - int((path / "memory.current").read_text())
    except (FileNotFoundError, ValueError):
        return None


def render_frames(ffdec, movie, destination):
    # A single interpreter worker avoids the Java JIT and GUI memory overhead.
    # Feed no ABC to FFDec. It rasterizes original SWF display-list primitives.
    command = [
        "java", "-Xint", "-Xms6m", "-Xmx24m", "-Xss192k", "-XX:MaxMetaspaceSize=18m",
        "-XX:CompressedClassSpaceSize=6m", "-XX:ReservedCodeCacheSize=3m",
        "-XX:ActiveProcessorCount=1", "-XX:+UseSerialGC", "-Djava.awt.headless=true",
        f"-Duser.home={destination}", "-jar", str(ffdec), "-onerror", "abort",
        "-format", "frame:png", "-export", "frame", str(destination), str(movie),
    ]
    destination.mkdir()
    with (destination.parent / f"{movie.stem}.log").open("w+") as log:
        with Popen(command, stdout=log, stderr=log) as process:
            deadline = monotonic() + 240
            while process.poll() is None:
                spare = available_cgroup_memory()
                if rss_kib(getpid()) + rss_kib(process.pid) > RSS_BUDGET_KIB or (
                    spare is not None and spare < CGROUP_MARGIN_BYTES
                ) or monotonic() > deadline:
                    process.kill()
                    raise RuntimeError(f"Stopped bounded frame export for {movie.stem}")
                sleep(.03)
            if process.returncode:
                log.seek(0)
                raise RuntimeError(log.read().strip())


def collect_frames(output, exports, index):
    from PIL import Image
    from extract_quest_detail_art import png_bytes

    definitions, provenance = index["feats"], index["provenance"]
    for key, frames_dir in exports.items():
        feat = FEATS[key]
        source_canvas = feat.get("sourceCanvas", (WIDTH, HEIGHT))
        frames, files = [], {}
        for number in range(1, feat["frames"] + 1):
            with Image.open(frames_dir / f"{number}.png") as original:
                image = original.convert("RGBA")
            if image.size != source_canvas:
                raise ValueError(f"Unexpected original stage crop for {key} frame {number}")
            # The Loader displays only the battle viewport, while the other
            # side still mirrors around Unlight.WIDTH (760px) in FeatImage.as.
            if image.width > VISIBLE_STAGE_WIDTH or image.height > HEIGHT:
                image = image.crop((0, 0, VISIBLE_STAGE_WIDTH, HEIGHT))
            bounds = image.getbbox()
            if bounds is None:
                frames.append(None)
                continue
            left, top, _, _ = bounds
            result = image.crop(bounds)
            png = png_bytes(result)
            digest = sha256(png).hexdigest()
            if digest not in files:
                file = f"{key}-{number:02}.png"
                (output / file).write_bytes(png)
                files[digest] = file
                provenance[file] = {"source": feat["file"], "sourceSha256": feat["sha256"],
                                    "sourceFrame": number, "sha256": digest}
            frames.append({"file": files[digest], "x": left, "y": top, "width": result.width, "height": result.height})
        if frames[-1] is not None or not any(frames):
            raise ValueError(f"Unexpected original final frame for {key}")
        data = {"name": feat["name"], "framesPerSecond": FPS, "frames": frames, "holdLast": False,
                "source": feat["file"], "sourceSha256": feat["sha256"], "sourceChildStops": feat["childStops"]}
        if "sourceCanvas" in feat:
            data["sourceCanvas"] = list(source_canvas)
        definitions.update((id, data) for id in feat["ids"])
    (output / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf8")


def extract(assets, output, ffdec, clip=None):
    if sha256(ffdec.read_bytes()).hexdigest() != FFDEC_SHA256:
        raise ValueError("Expected the pinned JPEXS FFDec 26.6.0 renderer")
    index = {"assetRevision": REVISION, "renderer": "JPEXS FFDec 26.6.0", "rendererSha256": FFDEC_SHA256,
             "stage": [WIDTH, HEIGHT], "depth": 33, "otherMirrorX": WIDTH, "cue": "/public/sound/se/ulse13.mp3",
             "feats": {}, "provenance": {}}
    if clip:
        previous = json.loads((output / "index.json").read_text(encoding="utf8"))
        if any(previous[key] != value for key, value in index.items() if key not in ("feats", "provenance")):
            raise ValueError("Feat art manifest uses different source or stage settings")
        index = previous
    with TemporaryDirectory(prefix="unlight-feat-render-") as directory:
        scratch = Path(directory)
        exports = {}
        for key in (clip,) if clip else FEATS:
            movie = scratch / f"{key}.swf"
            movie.write_bytes(export_movie(assets / FEATS[key]["file"], FEATS[key]))
            exports[key] = scratch / key
            render_frames(ffdec, movie, exports[key])
        output.mkdir(parents=True, exist_ok=True)
        collect_frames(output, exports, index)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("assets", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--ffdec", type=Path, required=True)
    parser.add_argument("--clip", choices=FEATS, help="refresh only this cut-in in an existing output")
    args = parser.parse_args()
    extract(args.assets, args.output, args.ffdec, args.clip)


if __name__ == "__main__":
    main()
