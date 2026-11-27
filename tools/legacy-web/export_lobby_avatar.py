#!/usr/bin/env python3
"""Rasterize the pinned original avatar components with the offline SWF fixture."""

import argparse
import asyncio
from hashlib import sha256
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from mimetypes import guess_type
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
from urllib.parse import urlsplit

from PIL import Image
from playwright.async_api import Error as PlaywrightError, async_playwright


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


async def capture_parts(args, responses, names, expected_anchors):
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

    class Server(ThreadingHTTPServer):
        request_queue_size = 64

    batches = asyncio.Queue()
    ordered = sorted(names)
    for start in range(0, len(ordered), args.batch_size):
        batches.put_nowait(ordered[start:start + args.batch_size])
    anchors, parts, errors = {}, {}, {}

    async def capture_batch(page, origin, batch):
        try:
            await page.goto(origin + "/")
            await page.evaluate("ids => exportAvatar(ids)", batch)
            await page.wait_for_function("capture.done || capture.error !== null", timeout=20000)
            result = await page.evaluate("capture")
        except PlaywrightError as error:
            result = {"error": str(error).splitlines()[0], "anchors": {}, "parts": {}}
        if set(result["anchors"]) == expected_anchors:
            if anchors and anchors != result["anchors"]:
                raise ValueError("Original rig anchors changed between batches")
            anchors.update(result["anchors"])
            parts.update({name: result["parts"][name] for name in batch if name in result["parts"]})
        missing = [name for name in batch if name not in parts]
        if len(batch) == 1 and missing:
            errors[batch[0]] = result["error"] or "Source clip could not be rasterized"
        if len(batch) > 1 and missing:
            split = (len(missing) + 1) // 2
            await capture_batch(page, origin, missing[:split])
            if missing[split:]:
                await capture_batch(page, origin, missing[split:])

    async def worker_batches(browser, origin):
        page = await browser.new_page()
        await page.route(lambda url: url.startswith(("http://", "https://"))
                         and not url.startswith(origin + "/"), lambda request: request.abort())
        try:
            while not batches.empty():
                await capture_batch(page, origin, batches.get_nowait())
                print(f"Rasterized {len(parts)} / {len(names)} clips ({len(errors)} unavailable)", flush=True)
        finally:
            await page.close()

    with Server(("127.0.0.1", 0), Handler) as server:
        worker = Thread(target=server.serve_forever, daemon=True)
        worker.start()
        try:
            async with async_playwright() as playwright:
                browser = await playwright.chromium.launch(executable_path=args.chromium, args=[
                    "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
                ])
                origin = f"http://127.0.0.1:{server.server_port}"
                await asyncio.gather(*(worker_batches(browser, origin) for _ in range(args.jobs)))
                await browser.close()
        finally:
            server.shutdown()
            worker.join()
    return anchors, parts, errors


def write_parts(output, anchors, parts, errors):
    output.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=output.parent) as scratch:
        cache = Path(scratch) / "avatar-rendered"
        layers = cache / "parts"
        layers.mkdir(parents=True)
        rendered = {}
        for name, part in parts.items():
            width, height = part["width"], part["height"]
            raw = bytes.fromhex(part.pop("argb"))
            part["src"] = None
            if (width, height) == (0, 0) and not raw:
                rendered[name] = part
                continue
            if not 0 < width <= 512 or not 0 < height <= 512 or len(raw) != width * height * 4:
                errors[name] = "Incorrect exported image dimensions"
                continue
            image = Image.frombytes("RGBA", (width, height), raw, "raw", "ARGB")
            if not image.getchannel("A").getbbox():
                errors[name] = "Original visible layer became blank"
                continue
            image.save(layers / f"{name}.png", optimize=True)
            part["src"] = f"./avatar-rendered/parts/{name}.png"
            rendered[name] = part
        index = {"anchors": anchors, "parts": rendered, "errors": errors}
        (cache / "index.json").write_text(json.dumps(index, indent=2, sort_keys=True) + "\n")
        cache.rename(output)
        return len(rendered)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("manifest", "mirror", "ruffle", "movie", "output"):
        parser.add_argument(f"--{name}", type=lambda value: Path(value).resolve(), required=True)
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    parser.add_argument("--jobs", type=int, choices=range(1, 9), default=3)
    parser.add_argument("--batch-size", type=int, choices=range(1, 129), default=48)
    args = parser.parse_args()
    if args.output.exists():
        parser.error("--output must be a new directory")
    manifest = json.loads(args.manifest.read_text())
    responses, names = source_responses(args, manifest)
    expected_anchors = set(manifest["anchorNames"])
    if not names:
        raise ValueError("No original avatar parts in manifest")
    anchors, parts, errors = asyncio.run(capture_parts(args, responses, names, expected_anchors))
    if set(anchors) != expected_anchors or set(parts) | set(errors) != names or not parts:
        raise ValueError("Incomplete avatar export")
    visible = write_parts(args.output, anchors, parts, errors)
    print(f"Exported {visible} source clips and {len(anchors)} bone anchors; {len(errors)} unavailable.")


if __name__ == "__main__":
    main()
