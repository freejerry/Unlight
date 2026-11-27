# 原始素材登入頁

第一個瀏覽器移植畫面。HTML 表單沿用 ActionScript 指定的右上角位置，舞台固定為 780 × 680。Rust 編譯成 WebAssembly，從原始背景 SWF 讀取內嵌 JPEG。瀏覽器直接解碼 JPEG，以 WebGL 2 顯示原始 760 × 680 背景。這個版本驗證背景、登入面板和認證流程。原版標題的 Logo 與蝴蝶向量圖層還在移植範圍中。

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

程式來源依本倉庫的 [MIT 授權](../LICENSE)。原版美術 © CPA。背景與面板原檔來自上述素材鏡像，依 [CC BY-ND 4.0](https://creativecommons.org/licenses/by-nd/4.0/) 使用。
