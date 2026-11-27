# 原生瀏覽器連線、登入與素材驗收

這個 HTML／JavaScript 入口連接既有 Ruby 服務，並直接載入原版 PNG 和 MP3。可以驗收服務連線、登入憑證、角色與任務初始資料，以及面板九宮格縮放。角色建立、大廳操作和對局可透過原版相容入口試玩。[現代化計畫](../MODERNIZATION_PLAN.md) · [原版相容入口](../tools/legacy-web/README.md)

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

有角色的帳號可按「讀取任務資料」，查看登入完成時的清單、任務狀態、清單上限和普通區域通關數。繁中名稱及通關門檻取自版本庫的原版 CSV。按鈕讀取已收到的快照，再查詢同源名稱資料。原版 Data 登入仍會執行既有的任務清理，驗收時使用隔離帳號。[原版登入流程](../app/server/src/controller/data_controller.rb#L208)

面板使用與 `assets/public` 同層的 `assets/data/image/panel_gene.png`，程式在提供檔案前會核對固定版本的 SHA-256。這張圖可省略。省略 `--assets` 時仍可驗收連線、登入及任務快照。

## 與原版核對

- **連線。** 依原版的 KeepAlive 命令向認證、大廳、資料、戰鬥、任務和全域聊天服務送出二進位訊息，逐位元組比對 Ruby 回應。單項失敗時可重試。[原版命令範例](../app/client/src/net/command/AuthCommand.as) · [原版封包格式](../app/client/src/net/ULSocket.as)
- **登入。** 瀏覽器以原版 SRP 協定計算認證證明，驗證伺服器憑證後，使用原版工作階段金鑰完成大廳、資料和全域聊天的交握。密碼在瀏覽器記憶體內處理。此入口供回環介面的隔離驗收使用。[原版認證流程](../app/client/src/net/server/AuthServer.as) · [原版大廳交握](../app/client/src/net/server/LobbyServer.as)
- **登入初始資料。** 收到原版 Data 服務的 15 個版本欄位後，唯讀解析角色摘要，或彙整未創角帳號收到的起始選項數量。登出或連線中斷時清空摘要。[原版客戶端 Data 流程](../app/client/src/net/server/DataServer.as) · [原生解析程式](data-bootstrap.js)
- **任務快照。** 沿用同一份 Data 角色回覆讀取庫存、旗標與通關數。區域進度依原版規則，使用旗標加一取得地圖，並以該地圖門檻為顯示上限。找不到名稱時仍可查看原始欄位。[任務解析](quest-data.js) · [原版區域進度](../app/client/src/view/scene/quest/QuestClearGauge.as#L189)
- **資源。** 從既有素材目錄讀取商店 PNG `item_id020.png` 和標題 MP3 `ulbgm01.mp3`，比對新入口與原版入口交付的位元組，再由 Chromium 解碼圖片並用使用者手勢確認音訊開始播放。[原版標題音樂的載入位置](../app/client/src/sound/bgm/TitleBGM.as)
- **九宮格。** WebGL 2 和 Canvas 2D 共用 120 × 96 的原版面板圖、原始切片座標與幾何計算。預覽共用一個 WebGL 2 繪圖環境，將結果放到原有的可見畫布。WebGL 2 無法繪製或圖形環境中斷時，Canvas 2D 會接手重繪。面板會按可用寬度和裝置像素比更新。[原版切片設定](../app/client/data/css/UL.css.cn#L35) · [繪圖驗收](../docs/playtest/README.md#原生-webgl-2-九宮格)
- **對局紀錄。** 固定種子 `2026` 的 68 個事件作為日後對照的 Ruby 輸出，包含順序、回合、HP、卡牌、擲骰和勝負。[對局比對方式](../tools/legacy-server/README.md#對局基準)

啟動時提供 `--assets`，另依原版相容入口說明啟動 Ruffle，將兩個 HTTP 埠傳給瀏覽器驗收程式。此範例使用 Chromium 和 Python Playwright。

```bash
python3 tools/legacy-web/check_native_browser.py --port 4334 --legacy-port 4330
```

加上 `--screenshot /tmp/unlight-native-check.png` 可存下驗收頁。加上 `--panel-screenshot /tmp/unlight-native-panel.png` 可另存面板樣本。[連線驗收截圖](../docs/playtest/native/01-native-check.png)

加入 `--software-webgl` 可用 Chromium 的 ANGLE SwiftShader 驗收 WebGL 2。腳本會核對實際繪圖緩衝、可見畫布、DPR 變換、窄欄與 Canvas 2D 接手後的像素。

「面板九宮格」中的內容預覽會隨更新訊息展開而改變高度。驗收程式比對標題區、輸入欄、消息內文與各自畫布的尺寸。用 `--panel-content-screenshot /tmp/unlight-native-panel-content.png` 可存下窄視窗的展開畫面。[內容排版截圖](../docs/playtest/native/13-native-panel-content.png)

驗收也會連續變更欄寬，核對每個面板的畫布尺寸、標題分界及 WebGL 2 緩衝區重用。可用 `--panel-resize-screenshot /tmp/unlight-native-panel-resize.png` 保存最後一次縮放後的畫面。[連續縮放驗收](../docs/playtest/README.md#原生九宮格連續縮放)

登入驗收程式會提示輸入隔離測試帳號密碼。它會依序驗證未知帳號、錯誤密碼、成功登入、初始資料、登出和再次登入，並比對原版的回應命令。

```bash
python3 tools/legacy-web/check_native_session.py --port 4334 --username playtest
```

若第一個帳號已有角色，可加上 `--no-avatar-username` 和 `--no-avatar-password-file`，用同一個 Ruby 環境的第二個測試帳號驗證未創角回應。[有角色](../docs/playtest/native/04-native-initial-data.png) · [未創角](../docs/playtest/native/05-native-starter-data.png)

加上 `--quest-database` 並指定該次 Ruby 測試環境的 `app/server/data/game_dev2.db`，可用唯讀連線核對實際清單及區域進度。腳本會比對按下讀取前後的資料及 Ruby 通訊。[任務快照驗收](../docs/playtest/README.md#原生瀏覽器任務快照)

## 原版對局紀錄回放

從首頁選「對局紀錄」，或直接開啟 `http://127.0.0.1:4348/replay/`。回放頁可用播放、暫停、上一筆、下一筆及鍵盤操作的滑桿逐筆查看。抽牌事件顯示該筆發給雙方的牌數。

只驗收回放時，可直接啟動原生入口。頁面從同源讀取版本庫保存的固定種子對局紀錄，可獨立於 Ruby 服務與遊戲素材執行。

```bash
python3 tools/legacy-web/serve.py --native --port 4348
```

另開終端機，以 Chromium 和 Python Playwright 驗收 68 筆事件、操作、窄版及錯誤重試，並存下結算畫面。

```bash
python3 tools/legacy-web/check_native_replay.py --port 4348 \
  --screenshot /tmp/unlight-native-replay.png
```

驗收頁固定每 600 毫秒前進一筆。畫面中的 Ruby tick 每格為 0.1 秒的模擬時間，同一 tick 的各筆事件仍照原始順序顯示。[Ruby 時鐘](../tools/legacy-server/duel.rb#L44) · [回放驗收紀錄](../docs/playtest/README.md#原生對局紀錄回放)
