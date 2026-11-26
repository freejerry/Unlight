#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ $# != 1 ]]; then
  printf 'Usage: bash %s <new-work-directory>\n' "$0" >&2
  exit 2
fi

tools_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo_dir=$(git -C "$tools_dir" rev-parse --show-toplevel)
source_revision=015d92e4493f81a8e7975f60f7473e156322187b
asset_revision=0ec2d2ffb0e294e46cd0edfb84c9778e3dd4ed0e
recipe_revision=0ac93015da404cda8202c0daaab3d0a39bd25fe4
font_revision=4e7b49ea6e0dd3bf78275cc3977fe8be8ae754cc

git -C "$repo_dir" cat-file -e "$source_revision^{commit}"
export BUNDLE_GEMFILE="$tools_dir/Gemfile"
export BUNDLE_FROZEN=true
bundle check
mkdir -- "$1"
work_dir=$(cd "$1" && pwd)
printf 'Legacy build directory: %s\n' "$work_dir"
mkdir "$work_dir/inputs" "$work_dir/dist"

verify_sha256() {
  if ! printf '%s  %s\n' "$1" "$2" | sha256sum --check --status; then
    printf 'SHA-256 mismatch or unreadable file: %s\n' "$2" >&2
    return 1
  fi
}

fetch_file() {
  curl --fail --location --silent --show-error --retry 2 --max-time 180 --output "$2" "$1"
}

checkout_input() {
  local remote=$1 revision=$2 destination=$3 provided=$4
  if [[ -n "$provided" ]]; then
    provided=$(cd "$provided" && pwd)
    ln -s -- "$provided" "$destination"
  else
    git init -q "$destination"
    git -C "$destination" fetch --no-tags --depth 1 "$remote" "$revision"
    git -C "$destination" -c advice.detachedHead=false checkout --detach "$revision"
  fi
  if [[ $(git -C "$destination" rev-parse HEAD) != "$revision" ]]; then
    printf 'Expected %s at %s\n' "$revision" "$destination" >&2
    return 1
  fi
}

checkout_input https://github.com/ni-light/Unlight-Images.git "$asset_revision" \
  "$work_dir/assets" "${UNLIGHT_LEGACY_ASSETS:-}"
checkout_input https://github.com/open-unlight/legacy-unlight-docker.git "$recipe_revision" \
  "$work_dir/inputs/recipe" "${UNLIGHT_LEGACY_RECIPE:-}"

font_dir=${UNLIGHT_LEGACY_FONTS:-"$work_dir/inputs/fonts"}
if [[ -z ${UNLIGHT_LEGACY_FONTS:-} ]]; then
  mkdir "$font_dir"
  for font in wt004.ttf cwming.ttf nbr.ttf; do
    fetch_file "https://raw.githubusercontent.com/UnlightCloud/shell/$font_revision/res/data/$font" "$font_dir/$font"
  done
fi
verify_sha256 33ade736c8df39fe207a5b7dddbf2c3c6ee1f6283eaed10297b2d02e2a247a6e "$font_dir/wt004.ttf"
verify_sha256 094a5c7340f181059baf2c574da05f558a3dfe6b12d6323349354c64c0ecbb5e "$font_dir/cwming.ttf"
verify_sha256 fd3f93f469227f2c796f60cf9984baa351f5ed13e1e7d86dedae0241efa83520 "$font_dir/nbr.ttf"

sdk_dir=${UNLIGHT_LEGACY_FLEX:-"$work_dir/inputs/flex"}
if [[ -z ${UNLIGHT_LEGACY_FLEX:-} ]]; then
  flex_archive="$work_dir/inputs/flex-sdk-3.6.0-0.tgz"
  player_archive="$work_dir/inputs/playerglobal-0.1.9.tgz"
  fetch_file https://registry.npmjs.org/flex-sdk/-/flex-sdk-3.6.0-0.tgz "$flex_archive"
  verify_sha256 86860d748df1e814277f49f574c62a1e44d2f3505425c54d2b4f84de5e6c5e3d "$flex_archive"
  fetch_file https://registry.npmjs.org/playerglobal/-/playerglobal-0.1.9.tgz "$player_archive"
  verify_sha256 373c2c05fb93cbf881e3abc38f931bb0f49efd6b9e94d2b3108dce1a1f82a708 "$player_archive"
  mkdir "$sdk_dir"
  tar -xzf "$flex_archive" -C "$sdk_dir" --strip-components=3 package/lib/flex_sdk
  chmod +x "$sdk_dir/bin/mxmlc"
  mkdir -p "$sdk_dir/frameworks/libs/player/10"
  tar -xOzf "$player_archive" package/lib/10.0/playerglobal.swc > "$sdk_dir/frameworks/libs/player/10/playerglobal.swc"
fi
sdk_dir=$(cd "$sdk_dir" && pwd)
verify_sha256 4fc079b9f923cdbc765375042bcfccd95f8670ec9de9a17efa5fb74d055ce778 \
  "$sdk_dir/frameworks/libs/player/10/playerglobal.swc"
if [[ $("$sdk_dir/bin/mxmlc" -version) != 'Version 3.6.0 build 16995' ]]; then
  printf 'Expected Adobe Flex 3.6.0 build 16995.\n' >&2
  exit 1
fi

git -C "$repo_dir" archive "$source_revision" app/client app/server | tar -xf - -C "$work_dir"
client_dir="$work_dir/app/client"
server_dir="$work_dir/app/server"
recipe_dir="$work_dir/inputs/recipe"

mkdir -p "$server_dir/bin/pids" "$server_dir/data/backup" "$client_dir/script/data"
cp "$server_dir/src/net/crypt.rb_orig" "$server_dir/src/net/crypt.rb"
cp "$tools_dir/sqlite-build-config.rb" "$server_dir/src/db_config.rb"
cp "$server_dir/src/constants/locale_constants.rb_sb" "$server_dir/src/constants/locale_constants.rb"
cp "$server_dir/src/constants/locale_constants.rb_sb" "$server_dir/src/constants/locale_constants.rb_tcn"
cp "$client_dir/src/Unlight-config_sandbox.xml" "$client_dir/src/Unlight-config.xml"
cp "$client_dir/data/css/UL.css.cn" "$client_dir/data/css/UL.css"
cp "$client_dir/public/config.xml.orig" "$client_dir/public/config.xml"
cp "$client_dir/public/news.xml.orig" "$client_dir/public/news.xml"
cp "$font_dir"/{wt004.ttf,cwming.ttf,nbr.ttf} "$client_dir/data/"
git -C "$recipe_dir" show "$recipe_revision:client/lib/as3crypto.swc" > "$client_dir/lib/as3crypto.swc"
verify_sha256 0d57bcd5788598f148960424da2dada1352e63b19594099c86f5054361225940 "$client_dir/lib/as3crypto.swc"

for patch_name in patches/Unlight-config.xml.patch patches/create_font_swf.rb.patch \
  patches/create_const_data.rb.patch patches/compile/002_ProfoundNoticePanel.as.patch \
  patches/compile/003_register_tweener.patch; do
  git -C "$recipe_dir" show "$recipe_revision:$patch_name" | patch -d "$work_dir/app" --batch --forward -p0
done

python3 - "$client_dir/script/create_const_data.rb" <<'PY'
from pathlib import Path
import sys

program = Path(sys.argv[1])
text = program.read_text(encoding="utf-8")
start = text.index("\n  DB = Sequel.mysql2(nil,MYSQL_CONFIG)\n")
end = text.index("\n  opt.on('-s',", start)
program.write_text(text[:start] + text[end:], encoding="utf-8")
PY

python3 "$tools_dir/prepare-assets.py" "$work_dir/assets" "$client_dir"
bash "$tools_dir/with-cache.sh" "$work_dir" bash "$tools_dir/generate-tcn.sh" "$work_dir"

cd "$client_dir"
bundle exec ruby script/update_version_file.rb
"$sdk_dir/bin/mxmlc" -output="$work_dir/dist/Unlight.swf" ./src/Unlight.mxml 2>&1 | tee "$work_dir/compile.log"

cp -a "$client_dir" "$work_dir/app/client-runtime"
patch -d "$work_dir/app/client-runtime" --batch --forward -p0 < "$tools_dir/runtime-client.patch"
cd "$work_dir/app/client-runtime"
"$sdk_dir/bin/mxmlc" -output="$work_dir/dist/Unlight-local-runtime.swf" ./src/Unlight.mxml 2>&1 \
  | tee "$work_dir/compile-local-runtime.log"

ln -s "$client_dir/public" "$work_dir/dist/public"
sha256sum "$work_dir/dist/Unlight.swf" "$work_dir/dist/Unlight-local-runtime.swf"
