# 原生瀏覽器連線、登入與素材驗收

這個 HTML／JavaScript 入口連接既有 Ruby 服務，並直接載入原版 PNG 和 MP3。可以驗收服務連線、登入憑證、角色初始資料，以及面板九宮格縮放。角色建立、大廳操作和對局可透過原版相容入口試玩。[現代化計畫](../MODERNIZATION_PLAN.md) · [原版相容入口](../tools/legacy-web/README.md)

## 啟動

先啟動原版 Ruby。下例沿用繁中建置產生的 SQLite 主資料副本，並把 Ruby 服務埠平移 `1000`。[繁中 Flash 和主資料建置](../tools/legacy-build/README.md) · [Ruby 啟動說明](../tools/legacy-server/README.md)

```bash
unlight_build=/tmp/unlight-legacy-build
export BUNDLE_GEMFILE="$PWD/tools/legacy-build/Gemfile"
bundle exec python3 tools/legacy-server/run.py serve \
  --master "$unlight_build/runtime-probe/data/game_dev2.db" --port-offset 1000 \
  --playtest-user playtest
```

`--playtest-user` 會在隔離副本建立測試帳號，並在終端機提示輸入密碼。只測連線及素材時可省略此參數。若要使用已有角色的帳號，可加上 `--playtest-first-quest` 和獨立的 `--work-dir`。[首場 PvE 測試帳號](../tools/legacy-server/README.md#首場-pve-驗收資料)

在倉庫根目錄另開終端機，使用 Python 3.11 及 `aiohttp` 啟動瀏覽器入口。將 `unlight_build` 換成實際建置目錄，並使用和 Ruby 相同的埠偏移。

```bash
unlight_build=/tmp/unlight-legacy-build
python3 tools/legacy-web/serve.py --native --port 4334 --server-offset 1000 \
  --assets "$unlight_build/assets/public"
```

開啟 `http://127.0.0.1:4334/`，在「登入驗收」用剛建立的測試帳號登入。登入成功會顯示玩家 ID、三項服務的驗證狀態及角色摘要。未創角的帳號會顯示可選的起始外觀部件與角色卡數量。

面板使用與 `assets/public` 同層的 `assets/data/image/panel_gene.png`，程式在提供檔案前會核對固定版本的 SHA-256。這張圖可省略。省略 `--assets` 時仍可驗收連線及登入。

## 與原版核對

- **連線。** 依原版的 KeepAlive 命令向認證、大廳、資料、戰鬥、任務和全域聊天服務送出二進位訊息，逐位元組比對 Ruby 回應。單項失敗時可重試。[原版命令範例](../app/client/src/net/command/AuthCommand.as) · [原版封包格式](../app/client/src/net/ULSocket.as)
- **登入。** 瀏覽器以原版 SRP 協定計算認證證明，驗證伺服器憑證後，使用原版工作階段金鑰完成大廳、資料和全域聊天的交握。密碼在瀏覽器記憶體內處理。此入口供回環介面的隔離驗收使用。[原版認證流程](../app/client/src/net/server/AuthServer.as) · [原版大廳交握](../app/client/src/net/server/LobbyServer.as)
- **登入初始資料。** 收到原版 Data 服務的 15 個版本欄位後，唯讀解析角色摘要，或彙整未創角帳號收到的起始選項數量。登出或連線中斷時清空摘要。[原版客戶端 Data 流程](../app/client/src/net/server/DataServer.as) · [原生解析程式](data-bootstrap.js)
- **資源。** 從既有素材目錄讀取商店 PNG `item_id020.png` 和標題 MP3 `ulbgm01.mp3`，比對新入口與原版入口交付的位元組，再由 Chromium 解碼圖片並用使用者手勢確認音訊開始播放。[原版標題音樂的載入位置](../app/client/src/sound/bgm/TitleBGM.as)
- **九宮格。** Canvas 2D 使用 120 × 96 的原版面板圖與原始切片座標，並按可用寬度和裝置像素比重繪。驗收頁對 96、215、300 三種高度比對頂區及四角，也會檢查窄視窗。[原版切片設定](../app/client/data/css/UL.css.cn#L35) · [面板截圖](../docs/playtest/native/03-native-panel-slices.png)
- **對局紀錄。** 固定種子 `2026` 的 68 個事件作為日後對照的 Ruby 輸出，包含順序、回合、HP、卡牌、擲骰和勝負。[對局比對方式](../tools/legacy-server/README.md#對局基準)

啟動時提供 `--assets`，另依原版相容入口說明啟動 Ruffle，將兩個 HTTP 埠傳給瀏覽器驗收程式。此範例使用 Chromium 和 Python Playwright。

```bash
python3 tools/legacy-web/check_native_browser.py --port 4334 --legacy-port 4330
```

加上 `--screenshot /tmp/unlight-native-check.png` 可存下驗收頁。加上 `--panel-screenshot /tmp/unlight-native-panel.png` 可另存面板樣本。[連線驗收截圖](../docs/playtest/native/01-native-check.png)

登入驗收程式會提示輸入隔離測試帳號密碼。它會依序驗證未知帳號、錯誤密碼、成功登入、初始資料、登出和再次登入，並比對原版的回應命令。

```bash
python3 tools/legacy-web/check_native_session.py --port 4334 --username playtest
```

若第一個帳號已有角色，可加上 `--no-avatar-username` 和 `--no-avatar-password-file`，用同一個 Ruby 環境的第二個測試帳號驗證未創角回應。[有角色](../docs/playtest/native/04-native-initial-data.png) · [未創角](../docs/playtest/native/05-native-starter-data.png)
