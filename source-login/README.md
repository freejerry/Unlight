# 原始素材登入頁

舞台固定為 780 × 680。Rust 編譯成 WebAssembly，從原始背景 SWF 讀取內嵌 JPEG，WebGL 2 繪製原始 760 × 680 背景。Logo、蝴蝶和載入動畫直接讀取三份原始 SWF 的向量及時序，並在 WebGL 2 合成。Logo 與標題面板採用 ActionScript 指定的入場曲線，蝴蝶依 24 FPS 舞台節奏振翅和追蹤游標。光暈依原始色彩及範圍繪製，使用網頁漸層近似 Flash 濾鏡。

登入面板採用原版 `Login`、`Name:`、`Pass:` 字樣與同行欄位。右下方 News 讀取 `/public/news.xml`，預設是本目錄的三筆繁中測試公告。使用 `--news /path/to/news.xml` 可覆寫。啟用減少動態效果時，舞台直接顯示入場完成狀態。

## 啟動

先依照 [Ruby 驗收環境](../tools/legacy-server/README.md) 啟動隔離服務，備妥一組測試帳號。以下範例以 Ruby 連接埠偏移 7800 為準。

在倉庫根目錄執行。素材目錄須包含固定版 [Unlight-Images](https://github.com/ni-light/Unlight-Images/tree/0ec2d2ffb0e294e46cd0edfb84c9778e3dd4ed0e) 的 `public` 及 `data`，並安裝 Rust 的 `wasm32-unknown-unknown` 目標。

```bash
source modern/rust-env.sh
unlight_decoder_dir=$(mktemp -d)
rustc --edition=2021 --crate-type=cdylib --target=wasm32-unknown-unknown -O -C strip=symbols \
  source-login/swf-bitmap.rs -o "$unlight_decoder_dir/asset-decoder.wasm"
python3 tools/legacy-web/serve.py --native --port 4389 --server-offset 7800 \
  --assets /path/to/Unlight-Images/public \
  --source-login-wasm "$unlight_decoder_dir/asset-decoder.wasm"
```

開啟 `http://127.0.0.1:4389/source-login/`。使用測試帳號驗證。成功時等本次 Ruby 連線關閉後，同一頁會顯示成功訊息並重新啟用已清空的表單。被拒絕時會清空密碼，可立即重試。

程式來源依本倉庫的 [MIT 授權](../LICENSE)。原版美術 © CPA。素材原檔來自上述素材鏡像，依 [CC BY-ND 4.0](https://creativecommons.org/licenses/by-nd/4.0/) 使用。登入文字載入歷史 `nbr.ttf` 原檔，檔內標示 Bradley Gratis、Justin Callaghan 與公有領域授權。[歷史字型來源](https://github.com/UnlightCloud/shell/tree/4e7b49ea6e0dd3bf78275cc3977fe8be8ae754cc/res/data)
