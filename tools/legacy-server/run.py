#!/usr/bin/env python3
"""Run the original Ruby services or record a deterministic duel in a scratch copy."""

import argparse
import contextlib
import getpass
import json
import os
from pathlib import Path
import secrets
import shutil
import signal
import socket
import sqlite3
import struct
import subprocess
import tempfile
import time
import uuid

from compare_trace import BASELINE, decode_trace, describe_difference, load_trace


HERE = Path(__file__).resolve().parent
LOOPBACK = "127.0.0.1"
SERVICES = (
    ("auth", "authentication", 12001, 6, 7),
    ("lobby", "lobby", 12002, 3, 35),
    ("data", "data_lobby", 12003, 3, 3),
    ("game", "game", 12004, 3, 3),
    ("quest", "quest", 12005, 3, 3),
    ("global-chat", "global_chat", 12020, 3, 3),
)


@contextlib.contextmanager
def scratch_directory(path):
    if path:
        path.mkdir(parents=True)
        yield path
    else:
        with tempfile.TemporaryDirectory(prefix="unlight-legacy-") as path:
            yield Path(path)


def available_port(port, excluded=()):
    for _ in range(10):
        with socket.socket() as listener:
            listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            listener.bind((LOOPBACK, port))
            resolved = listener.getsockname()[1]
        if resolved not in excluded:
            return resolved
    raise RuntimeError("Could not find an available loopback port.")


def stage_server(run_dir, checkout, revision, cache_port, master, compatibility):
    commit = subprocess.check_output(
        ["git", "rev-parse", "--verify", "--end-of-options", f"{revision}^{{commit}}"],
        cwd=checkout,
        text=True,
    ).strip()
    # Export tracked source so local credentials, databases and caches stay outside the copy.
    archive = subprocess.check_output(["git", "archive", commit, "app/server"], cwd=checkout)
    subprocess.run(["tar", "-xf", "-", "-C", str(run_dir)], input=archive, check=True)
    server = run_dir / "app/server"
    (server / "bin/pids").mkdir(exist_ok=True)
    shutil.copyfile(server / "src/net/crypt.rb_orig", server / "src/net/crypt.rb")
    shutil.copyfile(
        server / "src/constants/locale_constants.rb_sb",
        server / "src/constants/locale_constants.rb",
    )
    if compatibility:
        subprocess.run(
            ["patch", "--batch", "--forward", "-p0", "-i", str(HERE / "compat.patch")],
            cwd=server.parent,
            stdout=subprocess.DEVNULL,
            check=True,
        )

    (server / "src/db_config.rb").write_text(
        "module Unlight\n"
        "  STORE_TYPE = :sqlite3\n"
        f"  MEMCACHE_CONFIG = '{LOOPBACK}:{cache_port}'\n"
        "  MEMCACHE_OPTIONS = { timeout: 1, namespace: 'legacy-server' }\n"
        "end\n",
        encoding="utf-8",
    )
    keys = server / "script/constdata_keys.rb"
    descriptor = os.open(keys, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as output:
        output.write(
            f'CONSTDATA_ENCRYPTKEY = "{secrets.token_hex(24)}"\n'
            f'IMAGEFILE_HASHKEY = "{secrets.token_hex(24)}"\n'
        )

    if master:
        source_uri = f"{master.as_uri()}?mode=ro"
        database = server / "data/game_dev2.db"
        with (
            contextlib.closing(sqlite3.connect(source_uri, uri=True)) as source,
            contextlib.closing(sqlite3.connect(database)) as target,
        ):
            source.backup(target)

    (server / ".legacy-server-staging").touch()
    (run_dir / "revision.txt").write_text(commit + "\n", encoding="utf-8")
    return server, commit


def service_environment(run_dir, server):
    # Authentication's external IP lookup is redundant inside a loopback run.
    wget = run_dir / "wget"
    wget.write_text('#!/bin/sh\nprintf "%s\\n" 127.0.0.1\n', encoding="utf-8")
    wget.chmod(0o700)
    return dict(
        os.environ,
        PATH=f"{run_dir}{os.pathsep}{os.environ.get('PATH', os.defpath)}",
        UNLIGHT_LEGACY_STAGE=str(server),
        TZ="UTC",
    )


def stop(process):
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()


def start_process(stack, run_dir, name, command, server, env):
    log = run_dir / f"{name}.log"
    with log.open("w") as output:
        process = subprocess.Popen(
            command, cwd=server, env=env, stdout=output, stderr=subprocess.STDOUT
        )
    stack.callback(stop, process)
    return process, log


def error_from_log(message, log):
    detail = "\n".join(log.read_text(errors="replace").splitlines()[-24:])
    return RuntimeError(f"{message}\n{detail}")


def connect_when_ready(port, process, log):
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline and process.poll() is None:
        try:
            return socket.create_connection((LOOPBACK, port), timeout=3)
        except ConnectionRefusedError:
            time.sleep(0.08)
    raise error_from_log(f"Port {port} did not start.", log)


def start_cache(stack, run_dir, server, env, port):
    cache, log = start_process(
        stack,
        run_dir,
        "cache",
        ["memcached", "-l", LOOPBACK, "-p", str(port), "-U", "0", "-m", "32"],
        server,
        env,
    )
    with connect_when_ready(port, cache, log) as conn, conn.makefile("rb") as stream:
        conn.sendall(b"version\r\n")
        if not stream.readline().startswith(b"VERSION "):
            raise RuntimeError("Memcached readiness check failed.")
    return cache


def run_ruby(script, arguments, server, env, log, stdin=None):
    with log.open("w") as output:
        result = subprocess.run(
            ["ruby", str(HERE / script), *arguments],
            cwd=server,
            env=env,
            input=stdin,
            stdout=output,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=120,
        )
    if result.returncode:
        raise error_from_log(f"{script} failed.", log)


def request(connection, stream, command, arguments=b""):
    body = struct.pack("!H", command) + arguments
    connection.sendall(struct.pack("!H", len(body)) + body + b"\n")
    header = stream.read(4)
    if len(header) != 4:
        raise RuntimeError("Incomplete legacy response header.")
    return stream.read(struct.unpack("!I", header)[0] + 1)


def start_services(stack, run_dir, server, env, offset):
    running = []
    for label, entrypoint, port, ping, pong in SERVICES:
        port += offset
        command = [
            "ruby", "-r", "optparse", "-r", str(HERE / "loopback.rb"),
            f"src/{entrypoint}.rb", "-p", str(port),
        ]
        if label == "game":
            command.extend(("-i", "1"))
        process, log = start_process(stack, run_dir, label, command, server, env)
        running.append(process)
        with connect_when_ready(port, process, log) as conn, conn.makefile("rb") as stream:
            if request(conn, stream, ping) != struct.pack("!H", pong) + b"\n":
                raise RuntimeError(f"{label}: unexpected KeepAlive response.")
            print(f"{label}: KeepAlive OK on {port}", flush=True)
            if label == "auth":
                name = f"baseline-{uuid.uuid4().hex}".encode()
                argument = struct.pack("!H", len(name)) + name + b"\x00\x0202"
                if request(conn, stream, 1, argument) != b"\x00\x03\n":
                    raise RuntimeError("auth: unexpected response for unregistered player.")
                print("auth: unregistered player rejected", flush=True)
    return running


def characterize(args, run_dir, server, env):
    log = run_dir / "characterize.log"
    run_ruby(
        "duel.rb",
        [str(server / "data/csv/ja"), str(args.seed)],
        server,
        env,
        log,
    )
    marker = "CHARACTERIZATION "
    line = next(
        (line for line in log.read_text().splitlines() if line.startswith(marker)), None
    )
    if line is None:
        raise error_from_log("The duel did not produce its trace.", log)
    raw_trace = line[len(marker):]
    if args.check:
        trace = decode_trace(raw_trace)
        difference = describe_difference(load_trace(BASELINE), trace)
        if difference:
            raise RuntimeError(f"Duel trace diverged from the seed-2026 fixture at {difference}.")
        print(f"Seed {args.seed} matched all {len(trace['trace'])} trace events.")
        if not args.output:
            return
    trace = json.loads(raw_trace)
    if args.output:
        args.output.write_text(json.dumps(trace, ensure_ascii=False, indent=2) + "\n")
    else:
        print(json.dumps(trace, ensure_ascii=False, indent=2))


def main(args):
    port_offset = args.port_offset
    services = args.mode in {"serve", "smoke"}
    service_ports = tuple(s[2] + port_offset for s in SERVICES) if services else ()
    for port in service_ports:
        if not 1 <= port <= 65535:
            raise ValueError(f"Invalid service port {port}.")
        available_port(port)
    if not 0 <= args.cache_port <= 65535 or args.cache_port in service_ports:
        raise ValueError("Invalid or conflicting Memcached port.")
    cache_port = available_port(args.cache_port, service_ports)

    password = None
    if args.playtest_user:
        password = getpass.getpass("Playtest password for this isolated server: ")
        if not password:
            raise ValueError("The playtest password cannot be empty.")

    with scratch_directory(args.work_dir) as run_dir, contextlib.ExitStack() as stack:
        server, revision = stage_server(
            run_dir, args.checkout, args.revision, cache_port, args.master, args.mode == "serve"
        )
        env = service_environment(run_dir, server)
        cache = start_cache(stack, run_dir, server, env, cache_port)
        prep_args = [args.playtest_user] if args.playtest_user else []
        if args.playtest_first_quest:
            prep_args.append("first-quest")
        # Bootstrap the schema before loading models and their column accessors again.
        run_ruby("prepare.rb", prep_args, server, env, run_dir / "prepare.log", stdin=password)
        if not services:
            characterize(args, run_dir, server, env)
            return

        print(f"Legacy source {revision[:8]} · {run_dir}", flush=True)
        running = start_services(stack, run_dir, server, env, port_offset)
        print(f"All {len(SERVICES)} original Ruby services ready on loopback.", flush=True)
        if args.mode == "serve":
            while all(process.poll() is None for process in [cache, *running]):
                time.sleep(1)
            raise RuntimeError(f"A legacy process exited. See server logs in {run_dir}.")


def stop_on_sigterm(_signal, _frame):
    raise SystemExit(0)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("serve", "smoke", "characterize"))
    parser.add_argument("--checkout", type=lambda path: Path(path).resolve(), default=HERE.parents[1])
    parser.add_argument("--revision", default="HEAD")
    parser.add_argument("--work-dir", type=lambda path: Path(path).resolve())
    parser.add_argument("--master", type=lambda path: Path(path).resolve())
    parser.add_argument(
        "--cache-port", type=int, default=os.environ.get("UNLIGHT_CACHE_PORT", "0")
    )
    parser.add_argument(
        "--port-offset", type=int, default=os.environ.get("UNLIGHT_BACKEND_PORT_OFFSET", "0")
    )
    parser.add_argument("--playtest-user", help="Prompt for a local playtest account password.")
    parser.add_argument(
        "--playtest-first-quest", action="store_true",
        help="Prepare the original first quest for a disposable playtest account.",
    )
    parser.add_argument("--seed", type=int, default=2026)
    parser.add_argument("--check", action="store_true", help="Compare the duel to the included fixture.")
    parser.add_argument("--output", type=Path, help="Write the duel's JSON to a file.")
    args = parser.parse_args()
    if args.playtest_first_quest and (args.mode != "serve" or not args.playtest_user or not args.master):
        parser.error("--playtest-first-quest requires serve, --playtest-user and --master")
    if args.mode == "characterize" and (args.master or args.playtest_user):
        parser.error("characterize always uses a fresh database without any accounts.")
    if args.mode != "characterize" and (args.check or args.output):
        parser.error("--check and --output are only used in characterize mode.")
    try:
        signal.signal(signal.SIGTERM, stop_on_sigterm)
        main(args)
    except KeyboardInterrupt:
        raise SystemExit(130) from None
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        parser.exit(1, f"{error}\n")
