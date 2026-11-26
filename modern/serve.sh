#!/usr/bin/env bash
set -euo pipefail

source "$(dirname -- "${BASH_SOURCE[0]}")/rust-env.sh"
cd -- "$modern_dir"

# The managed preview passes the host and port as npm script arguments.
while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) export HOST="$2"; shift 2 ;;
    --port) export PORT="$2"; shift 2 ;;
    --strictPort) shift ;;
    *) printf 'Unknown preview argument: %s\n' "$1" >&2; exit 2 ;;
  esac
done

if [[ ! -x target/debug/naval-server || ! -s web/dist/index.html ]]; then
  bash ./build.sh
fi

export HOST="${HOST:-0.0.0.0}"
export WEB_DIST="${WEB_DIST:-$modern_dir/web/dist}"
exec ./target/debug/naval-server
