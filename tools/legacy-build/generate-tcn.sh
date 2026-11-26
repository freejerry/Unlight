#!/usr/bin/env bash
set -euo pipefail

tools_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
work_dir=$(cd "$1" && pwd)
export TZ=UTC
cp "$tools_dir"/{import-tcn,bootstrap-cpu}.rb "$work_dir/"

cd "$work_dir/app/server"
bundle exec ruby -E UTF-8 "$work_dir/import-tcn.rb" > "$work_dir/import.log" 2>&1
bundle exec ruby -E UTF-8 script/update_const_keys.rb
cp script/constdata_keys_jp.rb script/constdata_keys_tcn.rb
cp script/constdata_keys_tcn.rb script/constdata_keys.rb
bundle exec ruby -E UTF-8 script/backup_db.rb > "$work_dir/backup.log" 2>&1
bundle exec ruby -E UTF-8 script/create_font_swf.rb -c > "$work_dir/font.log" 2>&1

cd "$work_dir/app/client"
bundle exec ruby -E UTF-8 script/create_const_data.rb > "$work_dir/constants.log" 2>&1

cp -a "$work_dir/app/server" "$work_dir/runtime-probe"
cd "$work_dir/runtime-probe"
bundle exec ruby -E UTF-8 -rsequel -rsequel/extensions/blank "$work_dir/bootstrap-cpu.rb" 2>&1 | tee "$work_dir/cpu.log"

python3 - "$work_dir" <<'PY'
from pathlib import Path
import sqlite3
import sys

root = Path(sys.argv[1])
for relative in ("app/server", "runtime-probe"):
    database = root / relative / "data" / "game_dev2.db"
    with sqlite3.connect(database.as_uri() + "?mode=ro", uri=True) as db:
        result = db.execute("PRAGMA quick_check").fetchall()
        if result != [("ok",)]:
            raise SystemExit(f"Invalid SQLite database {database}: {result}")
        print(f"SQLite quick_check OK: {database}")
PY
