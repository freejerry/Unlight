# Unlight 現代化與視覺更新計畫

目前的遊戲交付與完成條件以 [Flash 原版移植驗收](docs/playtest/flash-parity.md) 為準。此頁保存早期工程計畫、獨立技術試驗和基準紀錄。

在 Codex 雲端工作區現代化《Unlight》。以現有 Ruby 後端、繁中資料和 Flash 原始碼建立工程基準，再驗證 Rust 戰鬥核心和 TypeScript／WebGL2 前端。產品名稱沿用《Unlight》。視覺更新以現代網頁介面為範圍。第一個里程碑是讓現有 Ruby 引擎跑完一場單人 PvE，留下可重播的對局紀錄。

## 可啟動入口

| 入口 | 範圍及啟動方式 |
| --- | --- |
| 原生服務驗收 | `serve.py --native` 的首頁 `/`。連到隔離 Ruby 後可操作連線檢查、登入及唯讀角色與任務快照。範例埠為 4334。[啟動方式](web-client/README.md#啟動) |
| 原生對局回放 | `serve.py --native` 的 `/replay/`。獨立讀取保存的 68 筆 Ruby 基準事件，範例埠為 4348。[回放方式](web-client/README.md#原版對局紀錄回放) |
| 原生搜尋示範 | `tools/native-deadlines` 提供固定 8 秒的搜尋、結果及最近紀錄，使用隔離 SQLite，預設埠為 4356。[搜尋方式](web-client/README.md#原生搜尋倒數示範) |
| 《霧潮航線》 | `modern/` 的獨立 Rust／Wasm 卡牌技術原型，可操作出牌、AI 和對局結算，預設埠為 3000。[原型啟動方式](modern/README.md#雲端建置與啟動) |
| 原版相容客戶端 | 透過 Ruffle 執行相容 SWF，連接隔離 Ruby，可重跑原版登入、任務與 PvE。範例埠為 4330。[啟動及 SWF 版本核對](tools/legacy-web/README.md) |

完整原生版仍需串起登入後的角色與大廳操作、任務及戰鬥結算，並通過完整 PvE 驗收。

## 目前進度

原生 HTML／JavaScript 驗收入口已接上原版 Ruby。認證、大廳、資料、戰鬥、任務及全域聊天六項 KeepAlive 按原版 ActionScript 的命令碼逐位元組驗收。原版道具 PNG 和標題 MP3 直接載入，與原版入口的 SHA-256 相同，並通過 Chromium 解碼及播放測試。這一階段涵蓋連線和原版素材的載入。[啟動與驗收](web-client/README.md) · [實測截圖](docs/playtest/native/01-native-check.png)

原生登入以同一個隔離帳號對照原版 Flash 畫面的輸入，核對未註冊、錯誤密碼及成功三種認證回應。瀏覽器驗證 Ruby 的 SRP 憑證後，使用同一玩家 ID 完成大廳、資料與全域聊天交握。實測涵蓋登出和重新登入。[登入驗收紀錄](docs/playtest/README.md#原生瀏覽器登入) · [登入截圖](docs/playtest/native/02-native-session.png)

原生驗收頁用同一張原版圖及原始切片座標實作 Canvas 2D 九宮格繪製，已測三種面板高度、窄欄與兩種裝置像素比。登入後已唯讀驗證原版 Data 服務的兩種初始回應，有角色的摘要對照 SQLite，未創角的起始選項數量對照原版設定。原生遊玩流程、動畫流暢度與整體視覺一致性仍待驗收。[面板截圖](docs/playtest/native/03-native-panel-slices.png) · [角色資料截圖](docs/playtest/native/04-native-initial-data.png) · [未創角資料截圖](docs/playtest/native/05-native-starter-data.png)

原生驗收頁可讀取登入回覆中的任務清單和區域進度，並用原始資料表補上繁中名稱及門檻。新角色與先前完成原版首場 PvE 的角色分別核對到魔女山谷 0/3 與 1/3。兩種快照均已用原版 SQLite 驗證。[任務快照驗收](docs/playtest/README.md#原生瀏覽器任務快照)

原生九宮格已接上 WebGL 2，沿用原版面板圖並與 Canvas 2D 共用切片幾何。Chromium 已驗證窄欄、DPR 變動、像素取樣及圖形環境中斷後的 Canvas 2D 接手。個別面板會隨訊息展開而重繪，並有實際輸入欄、標題與消息內文的排版測例。[WebGL 2 面板驗收](docs/playtest/README.md#原生-webgl-2-九宮格) · [內容排版驗收](docs/playtest/README.md#原生面板內容排版)

原生九宮格連續縮放時會重用同一個 WebGL 2 繪圖緩衝區，把同次更新的面板合併繪製，再各自裁回可見畫布。已驗證連續變更尺寸時的像素與繪製次數。[連續縮放驗收](docs/playtest/README.md#原生九宮格連續縮放) · [批次驗收](docs/playtest/README.md#原生九宮格批次繪製)

原生對局紀錄頁已驗收固定種子 `2026` 的 68 筆原版 Ruby 事件。Chromium 逐筆核對順序、回合、抽牌數、HP 及勝負，並驗證事件播放進度、暫停接續和定位。瀏覽器主執行緒暫停後，播放會依順序逐筆繼續。[回放驗收](docs/playtest/README.md#原生對局紀錄回放)

獨立的 Rust 搜尋示範已用 Chromium 驗收固定 8 秒的倒數、伺服器確認結果、重新整理和斷線重試。桌面及 320 像素窄版都可完成操作。重啟 Rust 程序並沿用原 SQLite 檔後，可查回相同結果。原生任務、戰鬥與結算的串接仍待完成。[啟動與驗收](web-client/README.md#原生搜尋倒數示範) · [搜尋完成截圖](docs/playtest/native/16-native-search-ready.png)

搜尋示範已用 Chromium 驗收最近紀錄。展開先前結果時，目前搜尋繼續倒數。重新整理會恢復儲存的紀錄，包括舊版只保存一筆編號的情況。批次查詢失敗時，畫面會保留已確認的結果供查閱及重試。[最近搜尋紀錄](web-client/README.md#最近搜尋紀錄) · [倒數中查看舊結果](docs/playtest/native/18-native-search-history-during.png)

原版相容入口的 Chromium 已跑完首場 PvE「落日大蝙蝠」，核對繁中關卡描述、勝利畫面、地圖進度及 Ruby 寫入的 11 Gem 與 15 Exp。戰鬥 BGM、擲骰、勝利及階段切換音效已比對 Web Audio 混音與原 MP3。相容版用原圖修正登入、錯誤提示和標題頁消息的九宮格。標題頁消息及登入後的「更新情報」已用測試 XML 驗收，實際繁中公告仍需原始 XML。標題動畫已量測軟體渲染下的畫面更新，目標硬體的流暢度仍待驗收。[首場 PvE](docs/playtest/README.md#首場-pve-結算) · [原版畫面驗收](docs/playtest/README.md#畫面驗收項目) · [標題量測](docs/playtest/README.md#標題動畫取樣)

大廳淡出時會清理它持有的提示框。Chromium 實測直接點擊仍顯示提示的「任務」按鈕，進入地圖與戰鬥時提示都已清除。正常的地圖懸停提示也已驗證。[提示退場驗收](docs/playtest/README.md#大廳提示退場)

相容版的地形名稱與描述使用既有內嵌明體。首場任務已驗證地形名稱和兩行描述，並從編譯後的 SWF 核對 5,557 筆繁中任務、地圖和地形資料所需的字形。其他關卡的文字欄寬和圖層仍待逐畫面驗收。[繁中地形文字驗收](docs/playtest/README.md#繁中關卡地形文字)

《霧潮航線》位於 `modern/`，是一個獨立的技術試驗，已驗證 Rust／Wasm 回放、Axum、WebSocket 和瀏覽器端出牌流程。[技術試驗](modern/README.md)

舊版 Ruby 後端以 `015d92e4` 啟動在雲端隔離環境，使用獨立 SQLite 與 Memcached。認證、大廳、資料、戰鬥、任務及全域聊天六個服務均通過 KeepAlive。測試副本已匯入 30 張原版資料表，共 54,034 列，並以原版初始化建立 1,614 副 CPU 牌組。[舊版啟動與檢查程式](tools/legacy-server/run.py)

`open-unlight/legacy-unlight-docker` 指定素材子模組版本 `0ec2d2ff`，已在公開 fork 確認同一個 Git commit。對照前端的 388 個靜態 `Embed` 路徑，332 個可直接對上，45 個可依原版繁中檔名規則對上。其餘 11 個位於停用的編譯分支或未被現行入口引用的類別，完整編譯已確認這組設定不需要它們。已取回 `as3crypto.swc`，完整素材鏡像供編譯及試玩讀取。素材標示為 CC BY-ND 4.0。[舊版部署說明](https://github.com/open-unlight/legacy-unlight-docker/blob/master/README.zh-TW.md) · [固定版本的原始素材](https://github.com/ni-light/Unlight-Images/tree/0ec2d2ffb0e294e46cd0edfb84c9778e3dd4ed0e)

已從 npm 封裝取得 Adobe Flex 3.6.0 build 16995 與 Flash Player 10.0 的 `playerglobal.swc`，並從 UnlightCloud 歷史客戶端取回 `cwming.ttf`、`wt004.ttf` 和含額外符號的 `nbr.ttf`。實際以目標 `10.0.12` 編譯了三款字型的嵌入測例，產出 SWF 10。已另外驗證 Apache Flex 4.16.1 可編譯最小測例，預設輸出 SWF 38。UnlightCloud 發布的 Windows ZIP 確實含有社群版 `Unlight.swf`，可供另外測試。已用 Adobe Flex 3.6.0 完成繁中原版客戶端編譯，產出 17,540,885 bytes 的 `Unlight.swf`。建置說明記錄版本、字形與 SHA-256。[Flex 3.6 npm 封裝](https://www.npmjs.com/package/flex-sdk/v/3.6.0-0) · [歷史字型](https://github.com/UnlightCloud/shell/tree/4e7b49ea6e0dd3bf78275cc3977fe8be8ae754cc/res/data) · [社群版發布](https://github.com/UnlightCloud/shell/releases/tag/v0.1.0-preview%2B6)

第一個舊版對局測例已跑完。以固定種子 `2026`、測試牌組及原版內建 AI 直接執行 Ruby 引擎，第四回合以 5 比 0 結算。兩次獨立執行的 68 筆事件完全一致。此測例涵蓋牌序、移動、攻防、擲骰、傷害和勝負。技能覆蓋仍待擴充。這份固定種子回放可獨立於客戶端重跑。[驗證摘要](tools/legacy-server/README.md) · [對局紀錄](tools/legacy-server/fixtures/trace-2026.json)

雲端 Ruffle Desktop 已用軟體 Vulkan 跑通原版登入、繁中開場、創角、初始卡牌、布勞教學、大廳及魔女山谷任務，並實際打完「落日大蝙蝠」。第一回合在中距離打出兩張槍牌，發動「精密射擊」，擲骰後勝利。原版結算給予 10 Gem 和 25 Exp，角色升至 2 級，返回地圖時魔女山谷進度為 1/3。資料庫確認通關和獎勵已寫入。測試用 Flash 編譯副本加入 `ExternalInterface` 檢查，Ruby 執行副本套用 Open Unlight 的加密回覆補丁、Sequel 的 `blank` 擴充與 AI 名稱的 Ruby 字串相容修正。雲端 Chrome 的 Canvas 後備渲染仍缺少 `BitmapData.draw`，桌面環境未提供音訊輸出。[原版編譯說明](tools/legacy-build/README.md) · [階段截圖](docs/playtest/README.md)

瀏覽器相容入口使用 Ruffle Web 的 Wasm 與 WGPU WebGL 後端執行繁中原版程式。獨立 Chromium 測試從標題登入，通過 Auth、Data、GlobalChat 與 Lobby，再進入魔女山谷。共享 Chrome 的 WebGL 2 能力仍受雲端環境限制，試玩使用獨立 Chromium 軟體 WebGL。其他關卡及動畫場景的覆蓋仍待驗證。[相容入口說明](tools/legacy-web/README.md) · [瀏覽器對戰開場](docs/playtest/browser/04-browser-battle.png)

## 技術設計

| 模組 | 做法 |
| --- | --- |
| 戰鬥核心 | 用獨立 Rust crate 接受對局狀態、玩家操作與亂數輸入，產生新狀態和有順序的事件。需要計時的規則由外部傳入時間。資料庫、連線與動畫由外層處理。 |
| 主機服務 | 用 Axum 在原生 Rust 執行核心。HTTP 提供開局及資料查詢，WebSocket 傳送操作與事件。伺服器驗證操作，按玩家視角傳送狀態，避免暴露對手手牌。 |
| 瀏覽器 | 用 TypeScript 直接操作 WebGL2。第一版渲染器支援 2D 卡牌、圖集、透明混合、動畫時間軸和拖放。牌面說明與結算等文字介面使用 HTML。 |
| WebAssembly | 同一個 Rust 核心編成 Wasm，先在瀏覽器回放固定對局，驗證原生與 Wasm 的事件序列一致。離線對局可沿用這個介面。 |
| 資料與素材 | 用可重複執行的匯入工具讀取小批 CSV，保留資料 ID 並檢查關聯。素材使用獨立 ID，圖像輸出圖集，影格、定位點和事件標記輸出動畫資料。 |

## 介面與素材

- **視覺方向。** 以《Unlight》的繁中術語和既有操作流程為基準，評估新版的字體、配色、資訊層級與操作回饋。涉及正式名稱或世界觀的變更由使用者另行決定。
- **素材清冊。** 以既有原始素材為輸入，按格式、來源、用途和事件標記盤點。瀏覽器可解碼的圖像及音訊直接載入原檔，並對照原版入口核對內容。需要其他載入流程的素材先記錄原本的定位點、播放順序與事件標記。
- **內容與引擎分離。** 介面文案、美術與音效由內容資料載入。角色卡、技能及任務資料保留來源 ID，方便核對繁中內容和對局紀錄。
- **面板九宮格縮放。** 素材資料保留原始圖片尺寸和四條切片座標。繪製時固定角落尺寸，邊緣沿各自的軸向伸縮，中央隨容器填滿。驗收登入、註冊、錯誤和消息面板在不同高度、窄視窗與高像素密度下的邊框、標題及內文。以共用面板圖為例，原圖為 120 × 96，水平切片座標為 42、78，垂直切片座標為 60、64。登入面板的淡色區下緣須在帳號欄上方。[原版面板切片](app/client/data/css/UL.css.cn#L35) · [面板畫面驗收](docs/playtest/README.md#畫面驗收項目)

## 工作順序與驗收

| 里程碑 | 交付 | 驗收 |
| --- | --- | --- |
| 舊版行為基準 | 在隔離的 SQLite 開發資料庫匯入固定牌組、技能與 CPU 所需的最小資料。從 Ruby 執行一場對局，擷取操作、抽牌、擲骰、技能觸發與回合結果。 | 能重播完整對局。至少包含一個會影響結算順序的技能，並可指出觸發前後的狀態。 |
| Rust 核心與素材試轉 | 用錄製的操作和亂數驗證核心重寫。同時盤點一組素材並驗證新版介面的文字和動畫流程。 | Rust 與 Ruby 的回合事件、HP 和勝負依對局紀錄比對。素材在 WebGL2 測試場景按預期播放。 |
| 雲端可玩版本 | 接上對局服務、WebSocket 和 WebGL2 介面，提供雲端預覽。 | 玩家能開局、操作手牌、讓 AI 行動並打到結算。Wasm 回放與伺服器結果一致。記錄參考裝置的幀時間與操作延遲。 |
| 後續範圍 | 依原型的資料覆蓋率、素材工時和使用體驗安排牌組編輯、任務內容、PvP 或其他系統。 | 以實測成本決定納入範圍、先後順序和工期。 |

每個可玩里程碑都由驗收員在雲端瀏覽器親自走完主要流程，附上開局、對局中和結算的實際截圖。修正介面問題時，以修正後的畫面交付。

## 新舊相容驗收

每個測例固定舊版程式版本、測試資料、操作順序及亂數。將舊版實際輸出當成基準，逐項比對新版的資料欄位、有效與無效操作、回合狀態、結算結果和事件順序。驗收報告列出通過、差異和未測項目，採用同一份輸入重跑。

### Rust 任務搜尋的到期判定

`tools/native-deadlines` 用隔離的示範資料驗證計時流程。Rust 在 SQLite 保存絕對截止時間，並在 HTTP 回覆中提供截止時間及伺服器當前時間，單位為毫秒。瀏覽器以單調時鐘更新倒數。狀態以伺服器回覆為準，重送相同 ID 沿用既有搜尋。

原版任務接入時，需要沿用原版規則算出的 `find_at`、任務庫存及結算資料。比對範圍包括截止前 1 毫秒、恰好截止、截止後重試、背景分頁恢復和斷線重連。原版 Flash 的相容層處理搜尋欄位時仍使用整秒。[示範驗收方式](web-client/README.md#原生搜尋倒數示範) · [原版整秒欄位](app/server/src/model/avatar.rb#L757)

## 開工條件

- **雲端工具鏈。** 工作區已有 Node.js、npm、Rust 與 Wasm 建置目標。技術試驗的建置說明記錄了版本和指令。[雲端建置說明](modern/README.md)
- **舊版資料。** 已建立隔離的繁中測試資料及舊版對局基準。匯入流程保留原版 ID，只有繁中來源缺少的資料分表使用原部署流程指定的日文來源。[繁中資料匯入](tools/legacy-build/README.md)
- **素材進場。** 素材格式和可用範圍影響轉換工時。可先以版本庫中的程式和資料建立對局基準，再依接入的素材做試轉。
