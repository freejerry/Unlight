# 《Unlight》Flash 原版移植驗收

以固定版本的繁中 Flash 客戶端、ActionScript 和 Ruby 服務核對新版 `/source-login/`。新版固定為 780 × 680，沿用原始版面、字體、美術、音訊、動畫與玩家操作。驗收分別記錄原始碼規格、原版實跑結果、新版可操作範圍及兩版差異。每個功能在正常遊戲入口驗證，階段成果推送到 `codex/unlight-source-login`。

## 對照版本與證據

| 項目 | 基準 |
| --- | --- |
| Flash 舞台 | Flex 編譯的繁中版 780 × 680、24 FPS。原版編譯 SWF SHA-256 `2a375905f3effc06476cd99f578f48d3040a2e9eecbbc6cfd33ce5d5f34ddc44`。Ruffle 本機服務相容版 SHA-256 `263647832e0132f07a17f1d547913dab8c45a26ffff2b9ceace6fd428c8103b9`。每份畫面證據註明使用的版本。[來源及編譯](../../tools/legacy-build/README.md) |
| 原始素材 | 固定的 Unlight-Images 版本 `0ec2d2ffb0e294e46cd0edfb84c9778e3dd4ed0e`。依 SWF 的圖層、時間軸和事件使用來源圖像。保留來源路徑和雜湊，便於重跑資產擷取。[大廳素材清單](../../source-login/lobby-art/sources.json) |
| Ruby | 參考 `ee38622` 的隔離運行副本。兩版使用同源的繁中資料和獨立測試帳號，戰鬥重跑時記下牌組與亂數輸入。在 SQLite 核對操作結果。[建立測試服務](../../tools/legacy-server/README.md) |
| 新版起始基線 | `cc2ef53`，已實跑標題、驗證後的玫瑰、角色建立、簡要新手指引及大廳。後續里程碑記錄設定、角色刷新與普通任務地圖。每列標註的完成狀態只涵蓋列出的行為。[固定舞台啟動](../../source-login/README.md) |

## 驗收方式

1. 從原始入口、原始 UI 類別、素材和伺服器命令定義頁面的正常、空白、拒絕、取消、返回與重進路徑。記錄編譯旗標、權限或遊戲狀態對入口的影響。
2. 用相同舞台尺寸、語系和可重現玩家狀態擷取兩版可見畫面。依序核對位置、遮擋、九宮格、字形、游標命中、動畫及轉場。音訊核對原檔、觸發點、音量、循環和淡出。動畫節奏從原始時間軸取得，實跑畫面用來確認播放順序和交接。
3. 在隔離 Ruby 服務完成玩家操作，核對回覆、持久化資料、斷線和回到原場景。通過後更新本表的狀態與證據，提交已驗收範圍，附上截圖或影片及可重跑的測試。

## 執行順序

| 階段 | 交付範圍 |
| --- | --- |
| 已交付 | 註冊成功視窗、按 OK 或 Esc 接續原版 Auth 與玫瑰，以及註冊拒絕後的錯誤流程。 |
| 起始流程與大廳共用行為 | 補齊建角開場和原始四段教學、公告、選項及音量與引導偏好。核對每個已移植場景的九宮格、文字、轉場、BGM 與音效。 |
| 任務與 PvE | 原版大廳進任務、地圖及返回，再依序串接探索、倒數、關卡、戰鬥和結算。相同帳號及關卡從原版與新版完整跑通。 |
| 大廳分支與多人對戰 | 平行處理互不相依的入口。依各入口所需的服務和驗收資料，完成牌組、道具、獎勵、社交、商店、故事、對戰及襲擊。 |

## 完成狀態

**已實跑**記錄已有可重現證據的操作範圍。**部分**指出已接入的功能和待做差異。**待移植**適用於已從原版辨識、尚未在新版遊戲接入的畫面。**待接通或驗證**指出服務、編譯設定或測試帳號尚須核對。編譯停用與測試入口另列來源依據。

| 工作項目 | 目前可確認的範圍 | 下一個驗收點 |
| --- | --- | --- |
| [標題、帳號、建角、教學與大廳](flash-parity/shell.md) | **已實跑**標題、註冊及接續登入、驗證失敗、玫瑰轉場、建角資料、大廳素材與懸停。**部分**新手引導、公告及共同控制。 | 驗收原版教學播放、進度保存及返回大廳。 |
| [共用渲染、時間軸、字型與音訊](flash-parity/renderer.md) | **已實跑**標題面板透明邊角、分數像素比切片與登入 BGM 交接。**部分**其餘共用面板與場景音訊。 | 依來源校正完成視窗的字重、焦點框和模糊遮罩，接續建角曲的退場。 |
| [大廳功能、選項與社交](flash-parity/lobby-views.md) | **已實跑**設定、音量與偏好保存、大廳原連線刷新角色及 AP 恢復。**部分**大廳其他入口及共用提示。 | 驗收 AP 的滑入倒數與到期刷新。VOICE 和箭頭偏好在對應場景驗收。[設定對照與差異](flash-parity/options-reference.md) |
| [任務、探索、PvE 與報酬](flash-parity/quest-pve.md) | **已實跑**地圖、搜尋與到期、任務詳情、牌組切換、起始卡面、空牌組警告及落日大蝙蝠的首戰開場、抽牌與第一個移動畫面。**部分**首戰 HUD 與移動。 | 用原版實跑核對方向、卡片放置和收回、旋轉、確認、超時及移動結果。 |
| [多人對戰、旁觀與襲擊](flash-parity/multiplayer.md) | **待接通或驗證**原版選頻道、房間及襲擊服務。 | 以隔離服務驗證原版頻道及真實對手，再接遊戲流程。 |
| [環境、測例和截圖來源](flash-parity/qa.md) | **已實跑**既有原版與固定舞台測例。截圖記錄區分實際入口及版本。 | 讓新增流程都有同次對照的操作證據與回歸檢查。 |

## 里程碑紀錄

### 註冊完成與接續登入

- **Flash 原版實跑**。繁中相容 SWF 連到隔離 Ruby。出現「登錄完畢」時，資料庫已有新帳號，登入狀態仍為 0。按 OK 後連線進入原版開場，登入狀態轉為 1。Esc 的行為由 Adobe Flex 3.6 `AlertForm.keyDownHandler` 的關閉事件、`Alerter.closeOffHandler` 與 `TitleCtrl.registToLoginHandler` 核對。 [原版成功畫面](/workspace/shared/unlight-web-port/flash-parity/registration/03-original-registration-success.png) · [原版開場](/workspace/shared/unlight-web-port/flash-parity/registration/06-original-registration-onboarding.png) · [原版接續登入](../../app/client/src/controller/TitleCtrl.as#L425)
- **新版實跑**。在兩個隔離角色上驗證滑鼠 OK 與鍵盤 Esc、同一帳號憑證驗證、接續到新手開場及再登入。另驗證同名拒絕、帳號已建但離頁放棄登入，以及既有的大廳回歸。完成視窗的字重、文字顏色、按鈕焦點框及背後模糊取樣有可見差異，列入共用面板驗收。 [完成視窗並排比對](/workspace/shared/unlight-web-port/flash-parity/registration/registration-dialog-comparison.png) · [新版開場](/workspace/shared/unlight-web-port/flash-parity/registration/13-native-automatic-onboarding.png) · [新版測例](../../tools/legacy-web/check_source_lobby.py)

### 標題面板底圖與登入音樂交接

- Login、Register、News 與 Alert 使用 `panel_gene.png` 的四條原始切線，半透明及透明像素按原圖與舞台合成。DPR 1、1.25、2 各比對正常置中及半像素偏移，共 24 組。Login、Register 與 News 的底圖與切片基準一致。Alert 在整數 DPR 最多 4 個像素差 1 個 RGB 色階。測例涵蓋實際頁面的登入／註冊狀態和原版 Ruby 拒絕彈窗。[實際標題](/workspace/shared/unlight-web-port/flash-parity/title-panel-audio/21-native-title-transparent-780.png) · [分數比例註冊](/workspace/shared/unlight-web-port/flash-parity/title-panel-audio/24-native-register-dpr125.png) · [24 組像素比對](/workspace/shared/unlight-web-port/flash-parity/title-panel-audio/panel-raster-metrics.json)
- 真實 Auth 通過後，標題音樂觀測到從 0.50 到 0 的十一個音量狀態，對應十次 200 ms 衰減。新手開場在另一聲道從頭播原本的 `ulbgm01.mp3`，接續原版教學與大廳曲。Auth 拒絕時，標題聲道維持 0.50 並繼續播放。嚴格與允許自動播放的 Chromium 驗收均通過。[原版音量衰減](../../app/client/src/sound/BaseSound.as#L268) · [新版登入驗收](../../tools/legacy-web/check_source_lobby.py)
- 原版設定頁已用隔離帳號進入，實際拖曳 BGM、切換工具提示及按 Back 返回。畫面、來源和下一階段的偏好驗收都記在設定頁交接。[設定頁交接](flash-parity/options-reference.md) · [原版設定畫面](/workspace/shared/unlight-web-port/flash-parity/title-panel-audio/08-flash-option-settled.png)

### 大廳選項設定

- `/source-login/` 大廳的 `OPTION` 開啟固定舞台的設定頁，使用原版設定背景、Back 圖樣、面板切片及角色裝備。角色在設定使用 `(525,230)` 與約 294 ms 淡入。Back 返回大廳的 `(489,230)` 與原入場位移。進入及返回分別觸發 `ulse02.mp3`、`ulse01.mp3`。[原始素材及座標](../../source-login/option-art/sources.json) · [角色入場來源](../../app/client/src/view/scene/common/AvatarClip.as#L315)
- 在隔離 Ruby 連線中驗證大廳→設定→大廳，包含滑鼠拖曳、鍵盤、偏好重新載入、原角色與四條既有連線，以及歸零後仍繼續的 BGM 播放位置。Flex 控件外觀、場景各圖層的淡出與全域工具提示仍有待對齊的項目。[原版與新版並排](/workspace/shared/unlight-web-port/flash-parity/options-native/option-side-by-side.png) · [逐項驗收](flash-parity/options-reference.md) · [可重跑腳本](../../tools/legacy-web/check_source_lobby.py)

### 大廳角色與 AP 刷新

- 原版與新版都在開啟設定時用已登入的 Lobby 執行 Ruby 恢復檢查，從 `4/5` 回復至 `5/5`。新版暫緩真 `SC17` 時可進入設定且保持 `4/5`，放行後同時更新數字和心形。驗收保留原四條連線、BGM 播放和原裝備。約 328 ms 返回大廳未再送請求，約 2115 ms 返回時只再送一次無參數 `CS17`。[階段畫面](/workspace/shared/unlight-web-port/flash-parity/lobby-refresh/ap-refresh-comparison.png) · [封包與時序](/workspace/shared/unlight-web-port/flash-parity/lobby-refresh/qa-native-refresh-evidence.json)
- 原版有一次設定進出時心形滿值但數字暫留 `4/5`，回大廳後為 `5/5`。新版取同一次已確認更新繪製數字和心形。原版 AP 滑入提示的繁中文字與畫面已留存，倒數及到期檢查仍待移植。[原版重跑及差異](flash-parity/options-reference.md#原版-ap-回復的顯示差異) · [重跑設定頁 AP 回復](flash-parity/qa.md#重跑設定頁-ap-回復)

### 第一張普通任務地圖

- 大廳任務入口已在 `/source-login/` 切入同次登入的 780×680 原版地圖。從原始 SWF 沿用底圖、滑入地標、清單容量幀、任務列圖示、牌組底板和 Back。使用原來的 `ulbgm03.mp3`、入口 `ulse02` 與 Back `ulse01`。列表顯示真實繁中資料、原版進度與實際選定牌組，卡位目前顯示真卡名。[素材與來源雜湊](../../source-login/quest-art/sources.json) · [原版空清單](/workspace/shared/unlight-web-port/flash-parity/quest-map/01-map1-empty-original.png)
- 隔離 Ruby 實跑開圖、讀到已發現和搜尋中兩筆庫存、返回及認證延遲時取消。每次正常進入只保留一條 Quest，Back 發一次 `CS2` 並等該連線關閉。四條原本登入連線、AP、庫存與裝備均通過核對。[原版與新版並排](/workspace/shared/unlight-web-port/flash-parity/quest-map/quest-map-inventory-comparison.png) · [可重跑測例](flash-parity/qa.md#重跑任務地圖的庫存及返回)

### 任務選區、搜尋預覽與音樂淡出

- 依原版旗標顯示六張普通地圖與 MemoryLand。原始 MAP 選區按鈕與 300 ms 滑入、地名飾帶的點擊範圍與即時預覽均接入遊戲。實跑核對 11 個時間選項、原始縮圖與 AP 費用，保留同次任務中關閉前的時間。兩個視窗操作全程維持原五條連線，角色 AP、庫存及裝備均維持原資料。[原版時間重開測試](/workspace/shared/unlight-web-port/flash-parity/quest-map/picker-preview/README.md) · [選單並排](/workspace/shared/unlight-web-port/flash-parity/quest-preview/qa-comparison-map-picker.png) · [搜尋並排](/workspace/shared/unlight-web-port/flash-parity/quest-preview/qa-comparison-search-3m.png)
- 真實 Chromium 量到大廳及任務兩方向各十步音量衰減，均約 2001 ms，切換時前後 BGM 可重疊。MemoryLand 保留原版可見飾帶，以真實解鎖旗標提供可操作地標。未修補 Ruffle 曾保留前一張底圖，新版依已選區域換圖。[MemoryLand 並排](/workspace/shared/unlight-web-port/flash-parity/quest-preview/qa-comparison-memoryland.png) · [原始模式與來源驗收](flash-parity/quest-pve.md#map-選區搜尋預覽與音樂)

### 魔女山谷即時與定時搜尋

- 原版繁中 SWF 與新版固定舞台皆使用隔離 Ruby 的真正搜尋。即時顯示落日大蝙蝠「取得」，3 分鐘搜尋自然到期後將同一持有項目更新為 NEW。每次扣 1 AP，同一 Quest 內從 AP 5/5、庫存 0/4 到 AP 3/5、庫存 2/4。Back 只關閉 Quest 連線。新版在原連線與重新登入兩條路徑分別在 Ruby 截止時間約 38 ms、889 ms 後送出唯一的到期查詢。[即時取得並排](/workspace/shared/unlight-web-port/flash-parity/quest-search-live/instant-acquisition-comparison.png) · [搜尋中並排](/workspace/shared/unlight-web-port/flash-parity/quest-search-live/timed-pending-comparison.png) · [到期並排](/workspace/shared/unlight-web-port/flash-parity/quest-search-live/timed-found-comparison.png) · [到期測例](flash-parity/qa.md#重跑定時任務搜尋)
- 真實 Ruby 拒絕 AP 不足時顯示「警告」，AP 和庫存維持原值。測試暫緩真正的搜尋成功通知時，畫面不提前追加任務。通知確定遺失時鎖住重送，重新登入後讀到 Ruby 已保存的唯一任務及扣除後的 AP。[AP 不足](/workspace/shared/unlight-web-port/flash-parity/quest-search-live/qa-06-native-rejected-ap.png) · [結果不明提示](/workspace/shared/unlight-web-port/flash-parity/quest-search-live/qa-07-native-search-uncertain.png) · [新版脫敏封包](/workspace/shared/unlight-web-port/flash-parity/quest-search-live/qa-native-search-wire.json)

### 任務詳情、地形及牌組

- 從正常遊戲進入魔女山谷，選「落日大蝙蝠」即展開詳情。收到 Ruby 對同一持有 ID 的確認後，NEW 變成未完成。地形滑入會填入高原圖與繁中說明，移出清空。地圖內返回、重開與牌組箭頭全程保留同一條 Quest 與背景音樂。牌組經已登入的 Lobby 確認，已驗兩個空牌組及左右循環，AP 維持 4/5。[任務詳情並排](/workspace/shared/unlight-web-port/flash-parity/quest-details-live/detail-comparison.png) · [地形滑入並排](/workspace/shared/unlight-web-port/flash-parity/quest-details-live/terrain-hover-comparison.png) · [空牌組並排](/workspace/shared/unlight-web-port/flash-parity/quest-details-live/empty-deck-comparison.png) · [可重跑測例](flash-parity/qa.md#重跑任務詳情與牌組切換)
- 暫緩及遺失回覆使用 Ruby 真確認。遺失後同一場景重開維持待確認狀態。回大廳重進後，原版清單回播同一筆未完成任務，未重送確認。舊 Flash 的地形說明缺字，新版以原版繁中資料顯示。寶箱閃光循環、丟棄與贈送待接入。[新版封包](/workspace/shared/unlight-web-port/flash-parity/quest-details-live/qa-native-detail-wire.json) · [任務頁狀態與素材](flash-parity/quest-pve.md#任務詳情的來源規格)

### 起始卡面、開始任務與首格

- 原版與新版實跑落日大蝙蝠。Deck 2 為空時顯示原版警告與按鈕聚焦，Ruby 未收到開始封包。切回 Deck 1 後，開始只送一次，Ruby 確認進行中及牌組鎖定，棋子出現、可走首格高亮，任務 AP 仍為 4/5。五張起始角色卡沿用原插畫、卡框、槽色與字型。實跑牌組以卡 21 核對實際卡位和屬性。[空牌組警告並排](/workspace/shared/unlight-web-port/flash-parity/quest-start-live/empty-deck-warning-comparison.png) · [開始與棋子並排](/workspace/shared/unlight-web-port/flash-parity/quest-start-live/quest-started-comparison.png)
- 保留同條 Quest，原版 Ruby 確認首格 `SC128` 後才更新棋子座標。收到遭遇和配牌後，按來源時序燃燒轉場至舞台 11，任務曲淡出並由原曲 `bgm000.mp3` 接續。[首格滑入並排](/workspace/shared/unlight-web-port/flash-parity/quest-start-live/first-land-hover-comparison.png) · [首戰背景並排](/workspace/shared/unlight-web-port/flash-parity/quest-start-live/first-battle-comparison.png) · [新版轉場](/workspace/shared/unlight-web-port/flash-parity/quest-start-live/qa-05-first-terrain-burn.png)
- 兩個真回覆遺失的案例各只送一次操作。遺失開始確認時保持原畫面，Ruby 資料已保存牌組鎖。首格已收到位置時會到格，遺失其後的配牌回覆時保留同一格與 Quest，戰鬥背景尚未開啟。[新版雙向測試記錄](/workspace/shared/unlight-web-port/flash-parity/quest-start-live/qa-native-start-wire.json) · [重跑首格驗收](flash-parity/qa.md#重跑開始任務與首格入場)

### 首戰開場、抽牌與移動畫面

- 繁中 Flash 和固定舞台實跑落日大蝙蝠。開場用來源上下幕、VS 姓名框、角色、已裝備的虛擬人物及卡面。開場結束後沿用同一條 Quest 送一次無參數 Ready。玩家與敵方 HP 分別是 7/7、1/1，並顯示同場中距離、原始階段素材、60 秒畫面倒數、`bgm000.mp3`、Draw／Move 音和發牌聲。[開場並排](/workspace/shared/unlight-web-port/flash-parity/quest-opening-live/intro-comparison.png) · [Draw 並排](/workspace/shared/unlight-web-port/flash-parity/quest-opening-live/draw-comparison.png) · [移動畫面並排](/workspace/shared/unlight-web-port/flash-parity/quest-opening-live/move-comparison.png)
- 真實 Ruby 回覆逐張核對己方五張行動牌和一張事件牌的 ID、順序與朝向。本方與原版各自實跑，牌面及 CPU 放置張數會隨該場資料變動。收到遮蔽的 CPU `SC61` 後，新版把一張匿名牌背移至桌面。暫緩及遲到的 `SC46` 測例驗證等待期間與逾時後的畫面，同一局僅發一次 Ready。移動、出牌及確認仍待接入。[原版封包](/workspace/shared/unlight-web-port/flash-parity/quest-opening-original/wire.json) · [新版獨立驗收封包](/workspace/shared/unlight-web-port/flash-parity/quest-opening-live/root-opening-wire.json) · [分項差異與下一段](flash-parity/quest-pve.md#首戰開場抽牌與移動階段)
