#!/usr/bin/env bash
set -euo pipefail

work_dir=$1
shift
cache_port=$(python3 - <<'PY'
import socket
with socket.socket() as listener:
    listener.bind(("127.0.0.1", 0))
    print(listener.getsockname()[1])
PY
)
memcached -l 127.0.0.1 -p "$cache_port" -U 0 -m 32 > "$work_dir/memcached.log" 2>&1 &
cache_pid=$!
trap 'kill "$cache_pid" 2>/dev/null || true; wait "$cache_pid" 2>/dev/null || true' EXIT

python3 - "$cache_port" "$cache_pid" <<'PY'
import os
import socket
import sys
import time

port, pid = map(int, sys.argv[1:])
for _ in range(50):
    os.kill(pid, 0)
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=1) as connection:
            connection.sendall(b"version\r\n")
            if connection.recv(64).startswith(b"VERSION "):
                break
    except OSError:
        time.sleep(0.05)
else:
    raise SystemExit("Isolated Memcached did not start")
PY

export UNLIGHT_DATA_WORK_CACHE_PORT="$cache_port"
"$@"
