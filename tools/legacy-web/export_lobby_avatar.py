#!/usr/bin/env python3
"""Rasterize the selected original avatar components using the offline SWF fixture."""

import argparse
from hashlib import sha256
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from mimetypes import guess_type
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
from urllib.parse import urlsplit

from PIL import Image
from playwright.sync_api import sync_playwright


PAGE = b"""<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,">
<script src="/ruffle.js"></script><script>
const capture = {anchors: {}, parts: {}, done: false, error: null};
window.avatarExportAnchor = (name, x, y) => { capture.anchors[name] = [x, y]; };
window.avatarExportPart = (name, x, y, width, height, argb) => {
  capture.parts[name] = {x, y, width, height, argb};
};
window.avatarExportDone = () => { capture.done = true; };
window.avatarExportFailed = error => { capture.error = error; };
async function exportAvatar(ids) {
  const player = RufflePlayer.newest().createPlayer();
  document.body.append(player);
  await player.ruffle().load({
    url: '/avatar-export.swf', allowScriptAccess: true, autoplay: 'on',
    unmuteOverlay: 'hidden', preferredRenderer: 'wgpu-webgl', splashScreen: false,
    parameters: {rig: '/bundle/data/image/avatar_rig.swf',
      partPrefix: '/bundle/public/image/avatar_parts/', parts: ids.join('|')},
  });
}
</script>"""


def source_responses(args, manifest):
    responses = {"/": PAGE, "/avatar-export.swf": args.movie.read_bytes()}
    for file in sorted(args.ruffle.iterdir()):
        if file.name == "ruffle.js" or file.suffix == ".wasm":
            responses[f"/{file.name}"] = file.read_bytes()
    names = set()
    for location, expected in manifest["assets"].items():
        file = (args.mirror / location).resolve()
        if not file.is_relative_to(args.mirror):
            raise ValueError(f"Asset outside the mirror: {location}")
        raw = file.read_bytes()
        if len(raw) != expected["bytes"] or sha256(raw).hexdigest() != expected["sha256"]:
            raise ValueError(f"Incorrect original asset: {location}")
        responses[f"/bundle/{location}"] = raw
        if location.startswith("public/image/avatar_parts/"):
            names.add(file.stem)
    return responses, names


def capture_parts(args, responses, names):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def do_GET(self):
            path = urlsplit(self.path).path
            if path not in responses:
                self.send_error(404)
                return
            data = responses[path]
            content_type = "text/html" if path == "/" else guess_type(path)[0] or "application/octet-stream"
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

    with ThreadingHTTPServer(("127.0.0.1", 0), Handler) as server:
        worker = Thread(target=server.serve_forever, daemon=True)
        worker.start()
        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(executable_path=args.chromium, args=[
                    "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
                ])
                page = browser.new_page()
                page.goto(f"http://127.0.0.1:{server.server_port}/")
                page.evaluate("ids => exportAvatar(ids)", sorted(names))
                page.wait_for_function("capture.done || capture.error !== null", timeout=30000)
                result = page.evaluate("capture")
                browser.close()
                return result
        finally:
            server.shutdown()
            worker.join()


def write_parts(output, anchors, parts):
    output.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=output.parent) as scratch:
        cache = Path(scratch) / "avatar-rendered"
        layers = cache / "parts"
        layers.mkdir(parents=True)
        for name, part in parts.items():
            width, height = part["width"], part["height"]
            raw = bytes.fromhex(part.pop("argb"))
            part["src"] = None
            if (width, height) == (0, 0) and not raw:
                continue
            if not 0 < width <= 512 or not 0 < height <= 512 or len(raw) != width * height * 4:
                raise ValueError(f"Incorrect exported image dimensions: {name}")
            image = Image.frombytes("RGBA", (width, height), raw, "raw", "ARGB")
            if not image.getchannel("A").getbbox():
                raise ValueError(f"Original visible layer became blank: {name}")
            image.save(layers / f"{name}.png", optimize=True)
            part["src"] = f"./avatar-rendered/parts/{name}.png"
        index = {"anchors": anchors, "parts": parts}
        (cache / "index.json").write_text(json.dumps(index, indent=2, sort_keys=True) + "\n")
        cache.rename(output)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("manifest", "mirror", "ruffle", "movie", "output"):
        parser.add_argument(f"--{name}", type=lambda value: Path(value).resolve(), required=True)
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    args = parser.parse_args()
    if args.output.exists():
        parser.error("--output must be a new directory")
    manifest = json.loads(args.manifest.read_text())
    responses, names = source_responses(args, manifest)
    result = capture_parts(args, responses, names)
    anchors, parts = result["anchors"], result["parts"]
    if result["error"] or set(anchors) != set(manifest["anchorNames"]) or set(parts) != names:
        raise ValueError(f"Incomplete avatar export: {result['error']}")
    write_parts(args.output, anchors, parts)
    print(f"Exported {len(parts)} source clips and {len(anchors)} bone anchors.")


if __name__ == "__main__":
    main()
