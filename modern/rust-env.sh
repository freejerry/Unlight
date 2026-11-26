#!/usr/bin/env bash

# Load the checkout's cloud-provisioned Rust toolchain when present.
modern_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
cloud_tools=$(cd -- "$modern_dir/../.." && pwd)/.unlight-dev/modern-tools

if [[ -x "$cloud_tools/cargo/bin/cargo" ]]; then
  export CARGO_HOME="$cloud_tools/cargo"
  export RUSTUP_HOME="$cloud_tools/rustup"
  export PATH="$CARGO_HOME/bin:$PATH"
fi
