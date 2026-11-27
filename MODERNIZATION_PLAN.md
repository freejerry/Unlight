# Unlight 現代化與視覺更新計畫

在 Codex 雲端工作區現代化《Unlight》。以現有 Ruby 後端、繁中資料和 Flash 原始碼建立工程基準，再驗證 Rust 戰鬥核心和 TypeScript／WebGL2 前端。產品名稱沿用《Unlight》。視覺更新以現代網頁介面為範圍。第一個里程碑是讓現有 Ruby 引擎跑完一場單人 PvE，留下可重播的對局紀錄。

## 目前進度

原生 HTML／JavaScript 驗收入口已接上原版 Ruby。認證、大廳、資料、戰鬥、任務及全域聊天六項 KeepAlive 按原版 ActionScript 的命令碼逐位元組驗收。原版道具 PNG 和標題 MP3 直接載入，與原版入口的 SHA-256 相同，並通過 Chromium 解碼及播放測試。這一階段涵蓋連線和原版素材的載入。[啟動與驗收](web-client/README.md) · [實測截圖](docs/playtest/native/01-native-check.png)

原生登入以同一個隔離帳號對照原版 Flash 畫面的輸入，核對未註冊、錯誤密碼及成功三種認證回應。瀏覽器驗證 Ruby 的 SRP 憑證後，使用同一玩家 ID 完成大廳、資料與全域聊天交握。實測涵蓋登出和重新登入。[登入驗收紀錄](docs/playtest/README.md#原生瀏覽器登入) · [登入截圖](docs/playtest/native/02-native-session.png)

原生驗收頁用同一張原版圖及原始切片座標實作 Canvas 2D 九宮格繪製，已測三種面板高度、窄欄與兩種裝置像素比。登入後已唯讀驗證原版 Data 服務的兩種初始回應，有角色的摘要對照 SQLite，未創角的起始選項數量對照原版設定。原生遊玩流程、動畫流暢度與整體視覺一致性仍待驗收。[面板截圖](docs/playtest/native/03-native-panel-slices.png) · [角色資料截圖](docs/playtest/native/04-native-initial-data.png) · [未創角資料截圖](docs/playtest/native/05-native-starter-data.png)

原版相容入口的 Chromium 試玩已進到首場 PvE 的第二回合，並以原有內嵌明體恢復任務列表的繁中名稱。相容版已用原圖恢復登入和消息面板的九宮格縮放，並以測試 XML 驗收標題頁消息與登入後的最新消息。軟體 WebGL 的標題回呼取樣仍不足以驗收動畫流暢度。[原版畫面驗收](docs/playtest/README.md#畫面驗收項目)

《霧潮航線》位於 `modern/`，是一個獨立的技術試驗，已驗證 Rust／Wasm 回放、Axum、WebSocket 和瀏覽器端出牌流程。[技術試驗](modern/README.md)

舊版 Ruby 後端以 `015d92e4` 啟動在雲端隔離環境，使用獨立 SQLite 與 Memcached。認證、大廳、資料、戰鬥、任務及全域聊天六個服務均通過 KeepAlive。測試副本已匯入 30 張原版資料表，共 54,034 列，並以原版初始化建立 1,614 副 CPU 牌組。[舊版啟動與檢查程式](tools/legacy-server/run.py)

`open-unlight/legacy-unlight-docker` 指定素材子模組版本 `0ec2d2ff`，已在公開 fork 確認同一個 Git commit。對照前端的 388 個靜態 `Embed` 路徑，332 個可直接對上，45 個可依原版繁中檔名規則對上。其餘 11 個位於停用的編譯分支或未被現行入口引用的類別，完整編譯已確認這組設定不需要它們。已取回 `as3crypto.swc`，完整素材鏡像供編譯及試玩讀取。素材標示為 CC BY-ND 4.0。[舊版部署說明](https://github.com/open-unlight/legacy-unlight-docker/blob/master/README.zh-TW.md) · [固定版本的原始素材](https://github.com/ni-light/Unlight-Images/tree/0ec2d2ffb0e294e46cd0edfb84c9778e3dd4ed0e)

已從 npm 封裝取得 Adobe Flex 3.6.0 build 16995 與 Flash Player 10.0 的 `playerglobal.swc`，並從 UnlightCloud 歷史客戶端取回 `cwming.ttf`、`wt004.ttf` 和含額外符號的 `nbr.ttf`。實際以目標 `10.0.12` 編譯了三款字型的嵌入測例，產出 SWF 10。已另外驗證 Apache Flex 4.16.1 可編譯最小測例，預設輸出 SWF 38。UnlightCloud 發布的 Windows ZIP 確實含有社群版 `Unlight.swf`，可供另外測試。已用 Adobe Flex 3.6.0 完成繁中原版客戶端編譯，產出 17,540,885 bytes 的 `Unlight.swf`。建置說明記錄版本、字形與 SHA-256。[Flex 3.6 npm 封裝](https://www.npmjs.com/package/flex-sdk/v/3.6.0-0) · [歷史字型](https://github.com/UnlightCloud/shell/tree/4e7b49ea6e0dd3bf78275cc3977fe8be8ae754cc/res/data) · [社群版發布](https://github.com/UnlightCloud/shell/releases/tag/v0.1.0-preview%2B6)

第一個舊版對局測例已跑完。以固定種子 `2026`、測試牌組及原版內建 AI 直接執行 Ruby 引擎，第四回合以 5 比 0 結算。兩次獨立執行的 68 筆事件完全一致。此測例涵蓋牌序、移動、攻防、擲骰、傷害和勝負。技能覆蓋仍待擴充。這份固定種子回放可獨立於客戶端重跑。[驗證摘要](tools/legacy-server/README.md) · [對局紀錄](tools/legacy-server/fixtures/trace-2026.json)

雲端 Ruffle Desktop 已用軟體 Vulkan 跑通原版登入、繁中開場、創角、初始卡牌、布勞教學、大廳及魔女山谷任務，並實際打完「落日大蝙蝠」。第一回合在中距離打出兩張槍牌，發動「精密射擊」，擲骰後勝利。原版結算給予 10 Gem 和 25 Exp，角色升至 2 級，返回地圖時魔女山谷進度為 1/3。資料庫確認通關和獎勵已寫入。測試用 Flash 編譯副本加入 `ExternalInterface` 檢查，Ruby 執行副本套用 Open Unlight 的加密回覆補丁、Sequel 的 `blank` 擴充與 AI 名稱的 Ruby 字串相容修正。雲端 Chrome 的 Canvas 後備渲染仍缺少 `BitmapData.draw`，桌面環境未提供音訊輸出。[原版編譯說明](tools/legacy-build/README.md) · [階段截圖](docs/playtest/README.md)

第一個瀏覽器相容移植已使用 Ruffle Web 的 Wasm 與 WGPU WebGL 後端執行繁中原版程式。獨立 Chromium 測試從標題登入，通過 Auth、Data、GlobalChat 與 Lobby，再進入魔女山谷和「落日大蝙蝠」對戰開場。原版標題及戰鬥 BGM 成功載入，標題播放和對戰場景都有可測的 Web Audio 訊號。共享 Chrome 的 WebGL 2 能力仍受雲端環境限制，測試使用獨立 Chromium 軟體 WebGL。動畫依原始程式的事件與時間軸驗收。瀏覽器的擲骰個別音效、整場結算與所有動畫場景的覆蓋仍待驗證。[移植說明](tools/legacy-web/README.md) · [瀏覽器對戰開場](docs/playtest/browser/04-browser-battle.png)

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

## 開工條件

- **雲端工具鏈。** 工作區已有 Node.js、npm、Rust 與 Wasm 建置目標。技術試驗的建置說明記錄了版本和指令。[雲端建置說明](modern/README.md)
- **舊版資料。** 已建立隔離的繁中測試資料及舊版對局基準。匯入流程保留原版 ID，只有繁中來源缺少的資料分表使用原部署流程指定的日文來源。[繁中資料匯入](tools/legacy-build/README.md)
- **素材進場。** 素材格式和可用範圍影響轉換工時。可先以版本庫中的程式和資料建立對局基準，再依接入的素材做試轉。
