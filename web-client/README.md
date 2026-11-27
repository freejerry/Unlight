# 原生瀏覽器連線、登入與素材驗收

原生入口的首頁 `/` 連接既有 Ruby 服務，可驗收服務連線、登入憑證、角色與任務快照，以及原版素材和面板九宮格。`/replay/` 可獨立讀取保存的 Ruby 對局紀錄。角色建立、大廳操作和對局可透過原版相容入口試玩。[可啟動入口](../MODERNIZATION_PLAN.md#可啟動入口) · [原版相容入口](../tools/legacy-web/README.md)

另有可獨立啟動的 [原生搜尋倒數示範](#原生搜尋倒數示範)。

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

要驗收登入後的「最新消息」，在上述啟動指令加上 `--news /path/to/news.xml`，登入後展開該區塊。可用 `--news app/client/public/news.xml.orig` 查看庫內保存的日文範例。瀏覽器讀取 UTF-8 XML 的 `<XML><news>` 內容，保留來源文字和段落、粗體、清單等基本格式。省略 `--news` 時，首次展開後會隱藏此區塊。[原版讀取方式](../app/client/lib/News.as#L130) · [公告驗收](../docs/playtest/README.md#原生瀏覽器登入)

有角色的帳號可按「讀取任務資料」，查看清單、任務狀態、清單上限和普通區域通關數。清單以原版 Data 登入資料及本次登入收到的 Quest 回覆為準。展開「關卡說明」下的任務可讀取原始繁中敘述及地形名稱和描述。原版 Data 登入仍會執行既有的任務清理，驗收時使用隔離帳號。[原版登入流程](../app/server/src/controller/data_controller.rb#L208) · [任務快照驗收](../docs/playtest/README.md#原生瀏覽器任務快照)

讀取任務資料後，可在角色進度所指的普通區域按「開始搜尋」。頁面列出原版地圖資料中的行動力成本，並送出原版 3 分鐘設定，由 Ruby 驗證行動力與持有上限。若發送後無法確認結果，請重新登入查看清單與行動力。[開始搜尋驗收](../docs/playtest/README.md#開始搜尋)

搜尋中的任務會顯示「預估剩餘」，重讀任務資料沿用該次登入的計時起點。估計到期後，可按該列的「確認搜尋結果」。原版 Quest 確認後，頁面更新該筆任務的 ID、狀態與原始關卡說明。伺服器尚未確認或連線中斷時可重試。[倒數驗收](../docs/playtest/README.md#搜尋中任務的預估倒數) · [確認結果驗收](../docs/playtest/README.md#確認搜尋結果)

讀取已發現的任務後，先選「任務用牌組」，再按該列的「開始任務」。原版 Quest 會核對行動力、任務狀態與牌組。開始成功後，頁面顯示任務及牌組使用狀態。若開始結果未確認，可在同一次登入用「讀取任務服務清單」核對伺服器狀態。重新登入會依原版流程清退進行中的任務並釋放牌組。[開始任務驗收](../docs/playtest/README.md#開始任務)

開始任務後，第一格有原始繁中說明及敵方資料時，可按「進入首格地形」。頁面顯示原版 Quest 回傳的戰鬥開場資料，並保留連線到登出。等待確認及開場期間，其他 Quest 操作暫停，仍可重讀已收到的任務資料。[首格地形驗收](../docs/playtest/README.md#進入首格地形)

開場後按「開始第一回合」可查看本次補入的行動卡與事件卡，以及對手的補牌張數。我方牌面的基本類型及數值取自原版繁中卡牌表。可選擇行動卡的上半面或下半面後按「加入移動區」，也可從已選區「退回手牌」。可先確認移動方向，也可直接送出。第一回合的移動距離、先攻方及使用的牌張以原版 Quest 回覆為準。事件卡可在補牌區查看。[第一回合驗收](../docs/playtest/README.md#第一回合補牌與移動) · [移動選牌驗收](../docs/playtest/README.md#第一回合移動選牌)

移動完成後，「首次攻防」會依原版 Quest 回覆切換階段。我方攻擊或防禦時可選擇行動卡的牌面、退回已選牌，或直接空手送出。頁面顯示原版公開的牌張、骰面和傷害。若首輪攻防即結束任務，收到同一筆任務的結算回覆後才顯示任務結果。[首次攻防驗收](../docs/playtest/README.md#首次攻防)

同一區塊的「讀取區域地圖」會在按下後另開原版 Quest 連線，查詢固定的區域 0，按伺服器回覆順序列出地圖 ID。清單依原版資料的區域欄位分組，角色進度顯示在 Data 任務快照。Quest 連線在查詢結束後關閉，失敗時可再按同一按鈕重試。[原版地圖查詢](../app/server/src/controller/quest_controller.rb#L33) · [區域地圖驗收](../docs/playtest/README.md#區域地圖查詢)

按「讀取任務服務清單」會暫時連上原版 Quest 服務，顯示登入時重送的持有紀錄 ID、任務 ID 和狀態代碼。搜尋中的紀錄及區域進度可用「讀取任務資料」查看。兩個 Quest 讀取按鈕一次處理一項請求，失敗後可重試。[原版清單重送](../app/server/src/model/avatar.rb#L2653) · [任務服務清單驗收](../docs/playtest/README.md#任務服務清單)

面板使用與 `assets/public` 同層的 `assets/data/image/panel_gene.png`，程式在提供檔案前會核對固定版本的 SHA-256。這張圖可省略。省略 `--assets` 時仍可驗收連線、登入及任務快照。

## 與原版核對

- **連線。** KeepAlive 與登入共用請求封包編碼。依原版的 KeepAlive 命令向認證、大廳、資料、戰鬥、任務和全域聊天服務送出二進位訊息，逐位元組比對 Ruby 回應。單項失敗時可重試。[共用編碼](wire.js#L15) · [原版命令範例](../app/client/src/net/command/AuthCommand.as#L93) · [ActionScript 封包格式](../app/client/src/net/ULSocket.as#L85) · [Ruby 封包格式](../app/server/src/protocol/ulserver.rb#L107)
- **登入。** 瀏覽器以原版 SRP 協定計算認證證明，驗證伺服器憑證後，使用原版工作階段金鑰完成大廳、資料和全域聊天的交握。密碼在瀏覽器記憶體內處理。此入口供回環介面的隔離驗收使用。[原版認證流程](../app/client/src/net/server/AuthServer.as) · [原版大廳交握](../app/client/src/net/server/LobbyServer.as)
- **登入初始資料。** 收到原版 Data 服務的 15 個版本欄位後，唯讀解析角色摘要，或彙整未創角帳號收到的起始選項數量。登出或連線中斷時清空摘要。[原版客戶端 Data 流程](../app/client/src/net/server/DataServer.as) · [原生解析程式](data-bootstrap.js)
- **任務快照。** 沿用同一份 Data 角色回覆讀取庫存、旗標與通關數。區域進度依原版規則，使用旗標加一取得普通地圖 1 至 35 的資料，並以該地圖門檻為顯示上限。地形依原始欄位順序顯示，每個地形 ID 列一次。缺少說明時仍可查看原始欄位。[任務解析](quest-data.js) · [原版區域進度](../app/client/src/view/scene/quest/QuestClearGauge.as#L189)
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

驗收也會連續變更欄寬，核對每個面板的畫布尺寸、標題分界及 WebGL 2 緩衝區重用。每次欄寬更新驗證一次批次繪製，單獨展開說明時也會檢查其他畫布的像素。可用 `--panel-resize-screenshot /tmp/unlight-native-panel-resize.png` 保存最後一次縮放後的畫面。[連續縮放驗收](../docs/playtest/README.md#原生九宮格連續縮放) · [批次驗收](../docs/playtest/README.md#原生九宮格批次繪製)

登入驗收程式會提示輸入隔離測試帳號密碼。它會驗證未知帳號、錯誤密碼、成功登入、初始資料、登出和再次登入，並比對原版的回應命令。也會接上實際 Ruby 服務，模擬登入途中認證或大廳連線關閉，驗證失敗後可重新登入。

```bash
python3 tools/legacy-web/check_native_session.py --port 4334 --username playtest
```

加上 `--startup-disconnect-screenshot /tmp/unlight-native-startup-disconnect.png` 可保存 320 像素窄版的連線失敗畫面。[實測截圖](../docs/playtest/native/23-native-startup-disconnect.png)

若第一個帳號已有角色，可加上 `--no-avatar-username` 和 `--no-avatar-password-file`，用同一個 Ruby 環境的第二個測試帳號驗證未創角回應。[有角色](../docs/playtest/native/04-native-initial-data.png) · [未創角](../docs/playtest/native/05-native-starter-data.png)

加上 `--quest-database` 並指定該次 Ruby 測試環境的 `app/server/data/game_dev2.db`，可用唯讀連線核對實際清單及區域進度。腳本會比對按下讀取前後的資料及 Ruby 通訊。[任務快照驗收](../docs/playtest/README.md#原生瀏覽器任務快照)

## 原版對局紀錄回放

從首頁選「對局紀錄」，或直接開啟 `http://127.0.0.1:4348/replay/`。回放頁可用播放、暫停、上一筆、下一筆及鍵盤操作的滑桿逐筆查看。抽牌事件顯示該筆發給雙方的牌數。

只驗收回放時，可直接啟動原生入口。頁面從同源讀取版本庫保存的固定種子對局紀錄，可獨立於 Ruby 服務與遊戲素材執行。

```bash
python3 tools/legacy-web/serve.py --native --port 4348
```

另開終端機，以 Chromium 和 Python Playwright 驗收 68 筆事件、操作、窄版及錯誤重試，並存下結算和播放畫面。

```bash
python3 tools/legacy-web/check_native_replay.py --port 4348 \
  --screenshot /tmp/unlight-native-replay.png \
  --playback-screenshot-dir /tmp/unlight-native-replay-playback
```

「本筆播放進度」顯示目前事件的 600 毫秒播放區間。暫停會保留進度，再按播放時從剩餘時間接續。手動前後跳轉會重設本筆進度。切到背景分頁會暫停，回到頁面後可手動接續。啟用減少動態效果時，進度條以 200 毫秒為單位更新。畫面中的 Ruby tick 每格是 0.1 秒模擬時間，同一 tick 的各筆事件仍照原始順序顯示。[Ruby 時鐘](../tools/legacy-server/duel.rb#L44) · [回放驗收紀錄](../docs/playtest/README.md#原生對局紀錄回放)

## 原生搜尋倒數示範

Rust 服務在回環位址提供瀏覽器頁面及搜尋 API，使用獨立的 SQLite 檔和固定 8 秒的示範資料。從版本庫根目錄啟動，重啟時沿用相同的 `--db` 路徑即可保留測試資料。

```bash
source modern/rust-env.sh
cargo run --locked --manifest-path tools/native-deadlines/Cargo.toml -- \
  --db /tmp/native-deadlines.sqlite3 --port 4356
```

開啟 `http://127.0.0.1:4356/`，按「開始搜尋」。倒數取用伺服器提供的當前時間及截止時間。頁面收到完成狀態後會顯示「搜尋完成」及結果。以同一瀏覽器及網址重新整理，或斷線後恢復連線，都可查詢同一筆搜尋。

頁面以同源 `PUT /api/searches/{id}` 啟動搜尋，再用 `GET` 查詢狀態。以相同 UUID 重送 `PUT` 會沿用原截止時間，完成後的查詢會回傳同一個結果。

後端測試使用可控制的時鐘，檢查到期前一毫秒、恰好到期、回覆遺失後重送，以及重新開啟 SQLite 後取回結果。

```bash
source modern/rust-env.sh
cargo test --locked --manifest-path tools/native-deadlines/Cargo.toml
```

服務啟動後，另開終端機以 Chromium 和 Python Playwright 重跑瀏覽器驗收。腳本會驗證時鐘偏移、搜尋中及完成後重載、回覆遺失後重試、斷線後恢復，以及 320 像素窄版。

```bash
python3 -Bu tools/legacy-web/check_native_deadlines.py --port 4356 \
  --screenshot-dir /tmp/unlight-native-deadlines
```

瀏覽器漏收建立搜尋的回覆後，重試沿用原 UUID 和截止時間。測試流量只送往同源 Rust 的頁面、靜態檔及搜尋 API。另以相同 SQLite 檔重啟服務，確認可取回既有結果。[桌面搜尋中](../docs/playtest/native/15-native-search-pending.png) · [桌面搜尋完成](../docs/playtest/native/16-native-search-ready.png) · [320 像素窄版](../docs/playtest/native/17-native-search-mobile.png)

### 最近搜尋紀錄

在同一瀏覽器與網址連續執行搜尋，「最近搜尋」最多保留 16 個編號。展開一筆紀錄可查看完整編號及伺服器結果，目前的搜尋仍會繼續倒數。可按「更新紀錄」重新查詢。頁面重新整理會讀回已儲存的編號，也能接續舊版留在同一網址的一筆搜尋。

瀏覽器以同源 `POST /api/searches/query` 傳送 JSON 的 `ids` 陣列，每次最多 16 個 UUID。伺服器依首次出現的順序回傳已存在的紀錄，省略未知編號和重複項目。查詢沿用現有 SQLite 結構，並用同一個伺服器時間判定回覆中的搜尋狀態。

八項 Rust 測試通過，包含批次查詢的筆數上限、順序、截止時間，以及沿用前一版 SQLite 檔。使用上方的 Playwright 指令可重跑兩筆搜尋的倒數、展開舊結果、重載、批次查詢失敗後重試，以及舊版單筆編號的恢復。此次使用 4357 驗收。桌面和 320 像素窄版的請求均由同源 Rust 服務處理。[批次 HTTP 測試](../tools/native-deadlines/tests/http_contract.rs) · [倒數中查看舊結果](../docs/playtest/native/18-native-search-history-during.png) · [兩筆已完成結果](../docs/playtest/native/19-native-search-history-ready.png) · [320 像素窄版](../docs/playtest/native/20-native-search-history-mobile.png)
