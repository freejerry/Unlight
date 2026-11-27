# 原始素材登入頁

舞台固定為 780 × 680。Rust 編譯成 WebAssembly，從原始背景 SWF 讀取內嵌 JPEG，WebGL 2 繪製原始 760 × 680 背景。Logo、蝴蝶和載入動畫直接讀取三份原始 SWF 的向量及時序，並在 WebGL 2 合成。Logo 與標題面板採用 ActionScript 指定的入場曲線，蝴蝶依 24 FPS 舞台節奏振翅和追蹤游標。光暈依原始色彩及範圍繪製，使用網頁漸層近似 Flash 濾鏡。

登入面板採用原版 `Login`、`Name:`、`Pass:` 字樣與同行欄位。登入按鈕下方的 `Create New Account` 會切換至原版帳號註冊。左下 News 位於原始的 (15, 480)，大小為 220 × 200。News 讀取 `/public/news.xml`，預設是本目錄的三筆繁中測試公告，內容可以捲動。使用 `--news /path/to/news.xml` 可覆寫。

原始標題 MP3 在入場時以 50% 音量循環播放。瀏覽器需要使用者互動時，首次點擊或鍵盤操作後開始播放。登入與註冊共用原版按鈕音 `ulse01.mp3`，錯誤視窗開啟使用 `ulse02.mp3`。啟用減少動態效果時，舞台直接顯示入場完成狀態。

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

在隔離 Ruby 測試服務可以建立新帳號。成功後回到登入表單並保留帳號名稱，重新輸入密碼即可登入。Email 欄位依原版介面驗證；原版 Auth 註冊指令未傳送這個欄位。

可在預設測試公告啟用時，用 Chromium 跑標題頁驗收。測例向隔離 Ruby 送出一筆不存在的測試帳號登入，檢查錯誤視窗、焦點與原始音效。

```bash
python3 tools/legacy-web/check_source_login.py --port 4389
```

## 標題頁逐項比對

[原版正常畫面](../docs/playtest/browser/29-browser-panel-current.png) · [原版錯誤視窗](../docs/playtest/browser/11-browser-tcn-alert.png)

| 項目 | 來源與驗收 |
| --- | --- |
| 舞台 | 固定為 780 × 680，視窗較高時垂直置中，較矮時保留可捲動高度。 |
| 背景、Logo、蝴蝶與過場 | 使用原始 SWF 的 JPEG、向量與時間軸。入場與追蹤讀取原版 [TitleView](../app/client/src/view/TitleView.as) 和 [Ageha](../app/client/src/view/image/title/Ageha.as) 的設定。 |
| 登入框與標題 | [LoginPanel](../app/client/src/view/image/title/LoginPanel.as) 定位 (500, 20)，英文字樣與同行欄位依來源。面板標題使用與原版 Flex 標題欄相近的裝置字型，Name／Pass 使用歷史字型原檔。 |
| News | [NewsPanel](../app/client/src/view/image/title/NewsPanel.as) 定位 (15, 480)，220 × 200。驗證同源三則 XML 公告，以及內容可捲閱。 |
| 註冊與返回 | 表單底部的 Create New Account 切換至 Register。原始 Auth 指令建立帳號，完成後回登入表單，重新輸入密碼即可登入。 |
| 登入失敗 | [TitleCtrl](../app/client/src/controller/TitleCtrl.as) 使用 Error 警示。780 × 680 舞台以 Flex 的 50% 淺色遮罩和 3px 模糊覆蓋，確認後焦點回密碼。 |
| BGM 與音效 | [TitleBGM](../app/client/src/sound/bgm/TitleBGM.as) 循環播放，登入與註冊提交使用 [ClickSE](../app/client/src/sound/se/ClickSE.as)，[Alerter](../app/client/lib/Alerter.as) 開啟錯誤視窗時使用 [Click2SE](../app/client/src/sound/se/Click2SE.as)。 |

已知視覺差異包括 Logo 光暈的近似濾鏡、裝置字型的渲染差異，以及署名列目前位於舞台外。

程式來源依本倉庫的 [MIT 授權](../LICENSE)。原版美術 © CPA。素材原檔來自上述素材鏡像，依 [CC BY-ND 4.0](https://creativecommons.org/licenses/by-nd/4.0/) 使用。登入文字載入歷史 `nbr.ttf` 原檔，檔內標示 Bradley Gratis、Justin Callaghan 與公有領域授權。[歷史字型來源](https://github.com/UnlightCloud/shell/tree/4e7b49ea6e0dd3bf78275cc3977fe8be8ae754cc/res/data)
