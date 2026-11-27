#!/usr/bin/env python3
"""Copy the pinned original avatar rig, part movies and license into a standalone bundle."""

import argparse
import csv
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import re
import subprocess
from tempfile import TemporaryDirectory


REPO = Path(__file__).resolve().parents[2]
MANIFEST = REPO / "source-login/avatar-loadouts.json"
PART_DIRECTORY = "public/image/avatar_parts"
PART_NAME = re.compile(r"[A-Za-z0-9_]+_p[0-9]+")


def git_mirror(repo, *args, input=None):
    process = subprocess.run(
        ["git", "--no-replace-objects", "-C", repo, *args], input=input, capture_output=True, check=False,
    )
    if process.returncode != 0:
        raise ValueError(process.stderr.decode(errors="replace").strip())
    return process.stdout


def part_paths(manifest):
    source = REPO / manifest["coverage"]["catalogPath"]
    if sha256(source.read_bytes()).hexdigest() != manifest["coverage"]["catalogSha256"]:
        raise ValueError("AvatarParts.csv does not match the manifest")
    with source.open(encoding="utf-8-sig", newline="") as contents:
        names = {name for row in csv.DictReader(contents) for name in row["image"].split("+") if name}
    if not names or any(not PART_NAME.fullmatch(name) for name in names):
        raise ValueError("Unexpected AvatarParts.csv image name")
    return {f"{PART_DIRECTORY}/{name}.swf" for name in names}


def asset_objects(mirror, manifest, referred):
    rig = manifest["rig"]["path"]
    license_path = manifest["assetLicense"]["originalPath"]
    desired = referred | {rig, license_path}
    tree = git_mirror(mirror, "ls-tree", "-r", "-z", manifest["assetRevision"], "--",
                      PART_DIRECTORY, rig, license_path)
    objects = {}
    for entry in tree.split(b"\0"):
        if not entry:
            continue
        info, name = entry.split(b"\t", 1)
        mode, kind, oid = info.split()
        path = name.decode()
        if kind == b"blob" and mode in (b"100644", b"100755") and path in desired:
            objects[path] = oid
    if sorted(desired - objects.keys()) != manifest["coverage"]["missingSwfPaths"]:
        raise ValueError("The pinned source asset set differs from the manifest")
    return dict(sorted(objects.items()))


def read_originals(mirror, objects):
    requests = b"\n".join(objects.values()) + b"\n"
    contents = BytesIO(git_mirror(mirror, "cat-file", "--batch", input=requests))
    for path, expected in objects.items():
        oid, kind, count = contents.readline().rstrip(b"\n").split()
        if oid != expected or kind != b"blob" or not count.isdigit():
            raise ValueError(f"Invalid original object for {path}")
        original = contents.read(int(count))
        if len(original) != int(count) or contents.read(1) != b"\n":
            raise ValueError(f"Incomplete original object for {path}")
        if path.endswith(".swf") and original[:3] not in (b"CWS", b"FWS", b"ZWS"):
            raise ValueError(f"Invalid original SWF header for {path}")
        yield path, original


def package(mirror, destination):
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    objects = asset_objects(mirror, manifest, part_paths(manifest))
    license_path = manifest["assetLicense"]["originalPath"]
    pinned = {**manifest["assets"], license_path: manifest["assetLicense"]}
    if not pinned.keys() <= objects.keys():
        raise ValueError("One of the required sample assets is unavailable")

    target = destination / "avatar-assets"
    if target.exists():
        raise ValueError(f"Destination already exists: {target}")
    destination.mkdir(parents=True, exist_ok=True)
    digests = []
    with TemporaryDirectory(prefix=".avatar-assets-", dir=destination) as scratch:
        temporary = Path(scratch)
        for path, original in read_originals(mirror, objects):
            digest = sha256(original).hexdigest()
            if path in pinned and (digest != pinned[path]["sha256"] or len(original) != pinned[path]["bytes"]):
                raise ValueError(f"Original bytes do not match the manifest: {path}")
            output = temporary / path
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_bytes(original)
            digests.append(f"{digest}  {path}\n")
        (temporary / "SHA256SUMS").write_text("".join(digests), encoding="ascii")
        temporary.rename(target)
    return target, len(objects)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mirror", type=Path, help="Unlight-Images git checkout containing the pinned revision")
    parser.add_argument("destination", type=Path, help="standalone bundle root")
    args = parser.parse_args()
    try:
        target, count = package(args.mirror, args.destination)
    except (OSError, ValueError) as error:
        parser.error(str(error))
    print(f"Packaged {count} unchanged source files in {target}")


if __name__ == "__main__":
    main()
