# 原生瀏覽器連線、登入與素材驗收

原生入口的首頁 `/` 連接既有 Ruby 服務，先顯示登入表單。登入後可展開「最新消息」。未創角帳號可建立角色，已有角色的帳號可查看任務資料。頂部「連線診斷」通往下方的原版協定、素材與面板檢查，「對局紀錄」通往獨立的 `/replay/`。原版教學及大廳操作可透過原版相容入口試玩。[可啟動入口](../MODERNIZATION_PLAN.md#可啟動入口) · [首頁驗收](../docs/playtest/README.md#原生入口版面) · [原版相容入口](../tools/legacy-web/README.md)

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

開啟 `http://127.0.0.1:4334/`，用剛建立的測試帳號登入。登入成功會顯示玩家 ID 和三項服務的驗證狀態。已有角色的帳號會顯示角色摘要。

未創角時，填寫 3 至 12 字的角色名稱，再選素體、眼睛、嘴型、髮型和一張起始角色卡。選單以原版 Data 回傳的選項為準，名稱來自原始繁中資料。按「建立角色」後，原版大廳先確認名稱是否可用，再處理建立。畫面顯示角色已建立後，登出並重新登入即可讀取原版角色摘要及任務資料。若送出後無法確認結果，也請重新登入查詢。[創角驗收](../docs/playtest/README.md#原生建立角色) · [原版大廳流程](../app/server/src/controller/lobby_controller.rb#L86)

要從空帳號開始玩首場任務，只使用 `--playtest-user` 準備帳號。建立角色並重新登入後，讀取空的任務清單，再到魔女山谷按「開始搜尋」。預設搜尋時間為 3 分鐘，消耗 1 點行動力。時間到後，按「確認搜尋結果」，便能用第一個牌組中的單張起始角色卡開始「落日大蝙蝠」。結算後按「返回任務清單」，可在同一次登入繼續操作。[從創角到首場任務](../docs/playtest/README.md#從創角到首場任務)

在「角色牌組」可查看第一個牌組的三個欄位及卡冊。牌組可編輯時，選一張卡冊中的角色卡並按「加入牌組」，送往下一個空欄位。已在牌組中的同一角色無法重複加入。伺服器處理後，以同一帳號登出並重新登入，頁面會根據原版 Data 回覆確認卡片的位置。[角色牌組驗收](../docs/playtest/README.md#角色牌組加入卡片)

要驗收登入後的「最新消息」，在上述啟動指令加上 `--news /path/to/news.xml`，登入後展開該區塊。可用 `--news app/client/public/news.xml.orig` 查看庫內保存的日文範例。瀏覽器讀取 UTF-8 XML 的 `<XML><news>` 內容，保留來源文字和段落、粗體、清單等基本格式。省略 `--news` 時，首次展開後會隱藏此區塊。[原版讀取方式](../app/client/lib/News.as#L130) · [公告驗收](../docs/playtest/README.md#原生瀏覽器登入)

有角色的帳號可按「讀取任務資料」，查看清單、任務狀態、清單上限和普通區域通關數。清單以原版 Data 登入資料及本次登入收到的 Quest 回覆為準。展開「關卡說明」下的任務可讀取原始繁中敘述及地形名稱和描述。原版 Data 登入仍會執行既有的任務清理，驗收時使用隔離帳號。[原版登入流程](../app/server/src/controller/data_controller.rb#L208) · [任務快照驗收](../docs/playtest/README.md#原生瀏覽器任務快照)

讀取後，「我的任務」以卡片顯示名稱、狀態與可用操作。需要核對持有紀錄 ID、任務 ID 或狀態代碼時，展開該張卡片的「原版資料」。畫面同時顯示目前區域、通關進度與行動力。可按「開始搜尋」送出原版 3 分鐘設定，實際倒數依 Ruby 回覆的搜尋係數估算。若發送後無法確認結果，請重新登入查看清單與行動力。[原生任務版面](../docs/playtest/README.md#原生任務版面) · [開始搜尋驗收](../docs/playtest/README.md#開始搜尋)

搜尋中的任務會顯示「預估剩餘」，重讀任務資料沿用該次登入的計時起點。估計到期後，可按卡片上的「確認搜尋結果」。原版 Quest 確認後，頁面更新該筆任務的狀態與原始關卡說明。伺服器尚未確認或連線中斷時可重試。[倒數驗收](../docs/playtest/README.md#搜尋中任務的預估倒數) · [確認結果驗收](../docs/playtest/README.md#確認搜尋結果)

讀取已發現的任務後，先選「任務用牌組」，再按該張卡片的「開始任務」。原版 Quest 會核對行動力、任務狀態與牌組。開始成功後，頁面顯示任務及牌組使用狀態。若開始結果未確認，可在同一次登入展開「原版資料與服務」，按「讀取任務服務清單」核對伺服器狀態。重新登入會依原版流程清退進行中的任務並釋放牌組。[開始任務驗收](../docs/playtest/README.md#開始任務)

開始任務後，可按「進入首格地形」進入有原始繁中說明的戰鬥地形。頁面顯示原版 Quest 回傳的戰鬥開場資料，並沿用該連線處理對局。等待確認及開場期間，其他 Quest 操作暫停，仍可重讀已收到的任務資料。[首格地形驗收](../docs/playtest/README.md#進入首格地形)

在普通區域，首格沒有敵人、寶箱或事件，且原始路徑直接通往戰鬥地形時，也可按「進入首格地形」。等原版確認通過後，在「下一格地形」選擇「進入地形」。戰鬥沿用同一條 Quest 連線和牌組。[由無戰鬥地形進入戰鬥](../docs/playtest/README.md#由無戰鬥地形進入戰鬥)

普通區域的無戰鬥首格若有原版固定 Gem 寶箱，且直接通往戰鬥地形，可沿用同一操作。頁面等原版確認地形進度、寶箱金額與帳上餘額後，才顯示獎勵並開放「下一格地形」。[固定 Gem 寶箱](../docs/playtest/README.md#固定-gem-寶箱)

開場後按一次「開始第一回合」即可進入「對戰」。頁面保留未使用的手牌，顯示每回合補入的行動卡、事件卡及對手補牌張數。我方牌面的基本類型及數值取自原版繁中卡牌表。可選擇行動卡與支援事件卡的上半面或下半面後按「加入移動區」，也可從已選區「退回手牌」。可先確認移動方向，也可直接送出。移動距離、先攻方及使用牌張以原版 Quest 回覆為準。支援的事件卡是從原版服務補入、且原始資料標記為無特殊效果的一般事件牌。[第一回合驗收](../docs/playtest/README.md#第一回合補牌與移動) · [移動選牌驗收](../docs/playtest/README.md#第一回合移動選牌) · [事件卡驗收](../docs/playtest/README.md#無特殊效果的事件卡)

「對戰」在寬版並排顯示手牌及移動操作，窄版改為上下排列。確認補牌、加入或退回牌張及移動結果時會播放短暫轉場。啟用「減少動態效果」時直接更新畫面。[移動版面與轉場](../docs/playtest/README.md#移動版面與轉場)

戰鬥開場後可直接操作「開始第一回合」，需要核對原始地形或牌組的回覆時再展開「原版伺服器資料」。對戰區依原版確認切換攻擊與防禦，顯示公開牌張、實際骰面、傷害與結果。啟用「減少動態效果」時直接顯示這些資料。[原生對戰版面](../docs/playtest/README.md#原生對戰版面)

要主動換角，在移動方向選擇「換角」，確認後送出移動。原版開放選擇後，可選另一個存活欄位，或按「保留出戰角色」。出戰角色倒下且原版要求選擇接替角色時，可從存活欄位選擇。頁面顯示伺服器確認的出戰欄位，並優先顯示原始繁中角色名稱，再接續攻防或下一回合。[換角流程](../docs/playtest/README.md#換角)

首場通關取得的角色卡加入第一個牌組後，可以用這組牌再搜尋及挑戰魔女山谷，並在對戰中切換至新加入的角色。普通任務勝利後會增加目前區域的通關數。[雙角色牌組續遊](../docs/playtest/README.md#雙角色牌組續遊)

移動完成後，「對戰」依原版 Quest 回覆切換攻防階段。我方攻擊或防禦時可選擇行動卡與支援事件卡的牌面、退回已選牌，或直接空手送出。原版開始下一段攻防或下一回合時，頁面會接續同一場對局，可查看「上一段攻防」的已確認牌張、骰面和傷害。收到同一筆任務的結算回覆後顯示任務結果。[接續攻防與下一回合](../docs/playtest/README.md#接續攻防與下一回合)

一場戰鬥獲勝後，若原版路徑還有可進入的戰鬥地形，「下一格地形」會在伺服器確認本格進度與牌組損傷後列出選項。按「進入地形」沿用目前的任務連線和牌組，等待原版確認新地形及開場後再開始該場的第一回合。[接續戰鬥地形](../docs/playtest/README.md#接續戰鬥地形)

普通任務結算後會顯示原版回傳的 Gem、Exp、等級、區域通關數，以及實際獲得的角色卡。按「返回任務清單」會等原版 Quest 連線關閉，再恢復本次登入的任務操作。已結束的任務會移出清單，該筆任務用過的牌組可再選用。[任務結算與返回驗收](../docs/playtest/README.md#任務結算與返回)

展開「原版資料與服務」後，按「讀取區域地圖」另開原版 Quest 連線，查詢固定的區域 0，按伺服器回覆順序列出地圖 ID。清單依原版資料的區域欄位分組，角色進度顯示在任務上方。Quest 連線在查詢結束後關閉，失敗時可再按同一按鈕重試。[原版地圖查詢](../app/server/src/controller/quest_controller.rb#L33) · [區域地圖驗收](../docs/playtest/README.md#區域地圖查詢)

按「讀取任務服務清單」會暫時連上原版 Quest 服務，顯示登入時重送的持有紀錄 ID、任務 ID 和狀態代碼。搜尋中的紀錄及區域進度可用「讀取任務資料」查看。兩個 Quest 讀取按鈕一次處理一項請求，失敗後可重試。[原版清單重送](../app/server/src/model/avatar.rb#L2653) · [任務服務清單驗收](../docs/playtest/README.md#任務服務清單)

面板使用與 `assets/public` 同層的 `assets/data/image/panel_gene.png`，程式在提供檔案前會核對固定版本的 SHA-256。這張圖可省略。省略 `--assets` 時仍可驗收連線、登入及任務快照。

## 與原版核對

- **連線。** KeepAlive 與登入共用請求封包編碼。依原版的 KeepAlive 命令向認證、大廳、資料、戰鬥、任務和全域聊天服務送出二進位訊息，逐位元組比對 Ruby 回應。單項失敗時可重試。[共用編碼](wire.js#L15) · [原版命令範例](../app/client/src/net/command/AuthCommand.as#L93) · [ActionScript 封包格式](../app/client/src/net/ULSocket.as#L85) · [Ruby 封包格式](../app/server/src/protocol/ulserver.rb#L107)
- **登入。** 瀏覽器以原版 SRP 協定計算認證證明，驗證伺服器憑證後，使用原版工作階段金鑰完成大廳、資料和全域聊天的交握。密碼在瀏覽器記憶體內處理。此入口供回環介面的隔離驗收使用。[原版認證流程](../app/client/src/net/server/AuthServer.as) · [原版大廳交握](../app/client/src/net/server/LobbyServer.as)
- **登入初始資料。** 收到原版 Data 服務的 15 個版本欄位後，讀取角色摘要，或取得未創角帳號可用的外觀部件及起始角色卡 ID。登出或連線中斷時清空資料。[原版客戶端 Data 流程](../app/client/src/net/server/DataServer.as) · [原生解析程式](data-bootstrap.js)
- **任務快照。** 沿用同一份 Data 角色回覆讀取庫存、旗標與通關數。區域進度依原版規則，使用旗標加一取得普通地圖 1 至 35 的資料，並以該地圖門檻為顯示上限。地形依原始欄位順序顯示，每個地形 ID 列一次。缺少說明時仍可查看原始欄位。[任務解析](quest-data.js) · [原版區域進度](../app/client/src/view/scene/quest/QuestClearGauge.as#L189)
- **資源。** 從既有素材目錄讀取商店 PNG `item_id020.png` 和標題 MP3 `ulbgm01.mp3`，比對新入口與原版入口交付的位元組，再由 Chromium 解碼圖片並用使用者手勢確認音訊開始播放。[原版標題音樂的載入位置](../app/client/src/sound/bgm/TitleBGM.as)
- **九宮格。** 「連線診斷」的 WebGL 2 和 Canvas 2D 預覽共用 120 × 96 的原版面板圖、原始切片座標與幾何計算，按可用寬度和裝置像素比更新。WebGL 2 無法繪製或圖形環境中斷時，Canvas 2D 會接手重繪。首頁的登入及消息區塊使用 CSS 排版。[原版切片設定](../app/client/data/css/UL.css.cn#L35) · [繪圖驗收](../docs/playtest/README.md#原生-webgl-2-九宮格)
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
