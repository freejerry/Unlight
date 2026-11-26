#!/usr/bin/env bash
set -euo pipefail

source "$(dirname -- "${BASH_SOURCE[0]}")/rust-env.sh"
cd -- "$modern_dir"

cargo build --locked --release -p naval-engine --target wasm32-unknown-unknown
mkdir -p web/public
cp target/wasm32-unknown-unknown/release/naval_engine.wasm web/public/naval_engine.wasm
npm --prefix web ci --no-audit --no-fund --cache "${FOGTIDE_NPM_CACHE:-$modern_dir/.npm-cache}"
npm --prefix web run build
cargo build --locked -p naval-server
