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
| [大廳功能、選項與社交](flash-parity/lobby-views.md) | **已實跑**設定與音量偏好、大廳 AP 到期刷新、首次登入成就、q3 返回獎勵、Lv3 可選角色卡、右側紀錄與道具速查、中央整頁道具四分類及魔女秘藥、好友清單、搜尋、定時刷新及邀請碼。好友已驗申請、認證、刪除、封鎖、解除、容量警告及首位好友成就。**部分**其餘大廳入口。 | 整頁道具接續驗其他消耗、滿 AP，以及裝備、卸下、丟棄。道具 #1、#2、任務寄送、註冊邀請碼兌換、VOICE 和箭頭偏好在各自入口驗收。[整頁道具瀏覽](/workspace/shared/unlight-web-port/flash-parity/lobby-main-item-live/README.md) · [魔女秘藥確認與使用](/workspace/shared/unlight-web-port/flash-parity/lobby-main-item-potion-live/README.md) · [好友刷新與邀請碼](/workspace/shared/unlight-web-port/flash-parity/lobby-friend-invite-refresh-live/README.md) · [好友寫入](/workspace/shared/unlight-web-port/flash-parity/lobby-friend-write-live/README.md) · [道具速查](/workspace/shared/unlight-web-port/flash-parity/lobby-item-quick-live/README.md) · [設定對照](flash-parity/options-reference.md) |
| [任務、探索、PvE 與報酬](flash-parity/quest-pve.md) | **已實跑**地圖、搜尋、任務詳情、牌組切換、開場、攻守互換、次回合、落日大蝙蝠勝敗、大蝙蝠之群兩戰及蝙蝠卡寶箱、山丘矮人勝利、紫色泥沼澤2左右線及左線先鋒卡。q568 已實跑獎勵骰敗猜、重擲、補正、終局空獎品 Exit、直接 Get 與返回。新版另實跑落日大蝙蝠 18 回合和局與山丘矮人敗北。Q82 主動換角、Q1 死亡換角、我方候補翻面、Q1 敵方單卡、Q970 敵方雙卡與 Q4 擲骰圖層已有實戰證據。**部分**戰鬥 HUD 與其他高低獎勵。 | Q970 敵方接替、三張敵方卡、跨主戰與候補的翻面狀態、終局實體獎品、繁中 Flash 落日大蝙蝠和局、山丘矮人敗北與 AP 更新時點。 [戰鬥九項驗收](flash-parity/battle-regressions.md) |
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
- 原版有一次設定進出時心形滿值但數字暫留 `4/5`，回大廳後為 `5/5`。新版取同一次已確認更新繪製數字和心形。[原版重跑及差異](flash-parity/options-reference.md#原版-ap-回復的顯示差異)
- 兩版實跑大廳右下心形的分鐘及秒數提示、移開後收合及自然回復。滿值提示的外框、黑底與文字外接框在 780×680 正式舞台取樣一致。新版另從鍵盤進入提示，倒數到期送一筆 `CS17`，在真 `SC17` 暫緩期間保持 `4/5`，放行後顯示 `5/5`。原版共用 AP 提示在設定與任務畫面的移植仍待驗收。[秒數並排](/workspace/shared/unlight-web-port/flash-parity/lobby-ap-tooltip-live/countdown-seconds-comparison.png) · [滿值並排](/workspace/shared/unlight-web-port/flash-parity/lobby-ap-tooltip-live/full-ap-comparison.png) · [重跑大廳 AP](flash-parity/qa.md#重跑大廳-ap-懸停與到期)

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
- 真實 Ruby 回覆逐張核對己方五張行動牌和一張事件牌的 ID、順序與朝向。本方與原版各自實跑，牌面及 CPU 放置張數會隨該場資料變動。收到遮蔽的 CPU `SC61` 後，新版把一張匿名牌背移至桌面。暫緩及遲到的 `SC46` 測例驗證等待期間與逾時後的畫面，同一局僅發一次 Ready。[原版封包](/workspace/shared/unlight-web-port/flash-parity/quest-opening-original/wire.json) · [新版獨立驗收封包](/workspace/shared/unlight-web-port/flash-parity/quest-opening-live/root-opening-wire.json) · [分項差異](flash-parity/quest-pve.md#首戰開場抽牌與移動階段)

### 首回合玩家移動及結果

- 固定舞台已接上方向、手牌和桌面牌的旋轉、放置、收回、重新放置及一次完成命令。原版方向、牌面和實際落點依 Ruby 各自回覆更新。原畫面 60 秒倒數自然到期時也只送一次完成。按 OK 後遇到實際回覆延遲及出牌遺失的案例已分別驗證，保留同一條 Quest 與最後確認狀態。[方向滑入並排](/workspace/shared/unlight-web-port/flash-parity/quest-movement-live/direction-hover-comparison.png) · [出牌並排](/workspace/shared/unlight-web-port/flash-parity/quest-movement-live/card-on-table-comparison.png) · [新版自然逾時封包](/workspace/shared/unlight-web-port/flash-parity/quest-movement-live/root/root-timer-wire.json)
- 由 `SC47` 關閉輸入，待 `SC48` 才翻牌及顯示距離和先手。兩版保留各場真正抽到的牌並以原版尺寸比對。新版實跑另核對鍵盤聚焦過程舞台固定、雙方 56×86 卡牌、階段音、切入肖像及距離箭頭。計時條從移動停止後保留到攻防開始。換角和戰鬥日誌待驗。[結算並排](/workspace/shared/unlight-web-port/flash-parity/quest-movement-live/movement-result-comparison.png) · [原版抵銷箭頭](/workspace/shared/unlight-web-port/flash-parity/quest-movement-original/final/07-move-result-original.png) · [逐項驗證](flash-parity/quest-pve.md#首回合移動操作與結果)

### 首回合第一組攻防

- 落日大蝙蝠首戰已從移動接到原版等待、防禦、翻牌、擲骰和攻防結算。兩版各用真正的 Ruby 出牌與骰值。新版依當次攻守使用原始黑白骰貼圖，在 WebGL 繪製原始 COLLADA 模型，並核對擲骰聲、遠距離命中聲及生命值 7/7 → 6/7。[防禦桌面並排](/workspace/shared/unlight-web-port/flash-parity/quest-combat-live/defense-table-comparison.png) · [擲骰並排](/workspace/shared/unlight-web-port/flash-parity/quest-combat-live/rolling-dice-comparison.png) · [新版生命值](/workspace/shared/unlight-web-port/flash-parity/quest-combat-live/qa-06-authoritative-defense-result.png)
- 真實回覆延遲測例驗證同一連線只出牌一次，等待期間保留最後確認的牌面。原版再驗確認本方 7/7 → 4/7，並在回合 1 收到下一筆 `SC51` 後開啟本方攻擊。新版已驗到同一組攻防的權威結算。角色姿勢、血花等戰鬥效果、第二組攻防及終局畫面仍待接續。[原版扣血及下一階段](/workspace/shared/unlight-web-port/flash-parity/quest-combat-original/hp-proof/23-original-hp-changed.png) · [原版及新版逐項驗收](flash-parity/quest-pve.md#首回合第一組攻防) · [實機重跑](flash-parity/qa.md#重跑首回合第一組攻防)

### 同回合攻守互換與次回合

- 原版與新版都從落日大蝙蝠的遠距離防禦走到回合 1 的我方攻擊。空攻擊略過擲骰視覺及聲音，實際進入 Draw／Move。新版保持同一條 Quest，正確顯示第二組初始點數 0 與 1、原始回合字圖，並把同場實際補入的事件牌 259 接到剩餘手牌後方。暫緩 `SC51`、`SC46` 及本方方向 `SC60` 的實跑均核對到輸入交接和單次 Ready。[攻守互換並排](/workspace/shared/unlight-web-port/flash-parity/quest-next-turn-live/second-attack-comparison.png) · [第二回合 Move 並排](/workspace/shared/unlight-web-port/flash-parity/quest-next-turn-live/turn-two-move-comparison.png) · [新版封包](/workspace/shared/unlight-web-port/flash-parity/quest-next-turn-live/qa-native-next-turn-wire.json) · [重跑](flash-parity/qa.md#重跑同回合攻守互換與次回合)
- 近距離和遠距離試玩保留原始攻擊姿勢、斬擊、槍擊、血花及音效。兩場各扣 3 點和 1 點，生命值在動畫中更新並延續到第二回合。下一段核對勝敗、換角及結算後回任務地圖。[新版斬擊](/workspace/shared/unlight-web-port/flash-parity/quest-next-turn-live/root/root-02c-exchange-1-slash.png) · [新版槍擊](/workspace/shared/unlight-web-port/flash-parity/quest-next-turn-live/root-final/root-02c-exchange-1-bullet.png) · [原版規格及分項驗收](flash-parity/quest-pve.md#同回合攻守互換與次回合)

### 單格任務勝利、報酬與返回

- 原版與新版均用原始 Ruby 完成落日大蝙蝠勝利、戰鬥 OK、任務結算 OK 及地圖 Back。新版沿用原始 Win 圖、角色動作、報酬框、升級動畫及兩處按鈕圖。兩次確認維持同一條 Quest，直到地圖 Back 才關閉。SQLite 驗證報酬、任務歸檔、區域進度 1/3 和牌組解鎖。另有原版 Lv2 升級畫面及正常新版播放紀錄。[勝利並排](/workspace/shared/unlight-web-port/flash-parity/quest-terminal-live/duel-result-comparison.png) · [任務結算並排](/workspace/shared/unlight-web-port/flash-parity/quest-terminal-live/quest-clear-comparison.png) · [返回地圖並排](/workspace/shared/unlight-web-port/flash-parity/quest-terminal-live/quest-map-comparison.png) · [原版升級](/workspace/shared/unlight-web-port/flash-parity/quest-terminal-original/11-original-duel-reward.png) · [新版音訊和封包](/workspace/shared/unlight-web-port/flash-parity/quest-terminal-live/root-full-motion/root-terminal-wire.json)
- 正常案例及真 `SC24` 逾時案例各有實跑。正常回覆啟用返回，頁面使用 Ruby 的實際報酬及任務進度。逾時時保留勝利結果和最後可確認的狀態。敗北、和局與獎勵骰的實機分支在矩陣繼續驗證。[正常及逾時封包](/workspace/shared/unlight-web-port/flash-parity/quest-terminal-live/qa-native-terminal-wire.json) · [逐項規格](flash-parity/quest-pve.md#單格任務的勝敗報酬與返回) · [重跑終局](flash-parity/qa.md#重跑單格任務終局)

### 第一戰後的下一格及敗北

- 原版與新版實跑大蝙蝠之群，第一戰勝利後一次 OK 回到原任務詳情，再由同一 Quest 進到第二格。兩版實測都確認 3 點損傷、同一牌組及持有 ID。兩戰皆用舞台 11 的原版戰鬥曲，中間返回任務曲。新版第二戰進入 Move，生命為 4/7。[同一任務地圖並排](/workspace/shared/unlight-web-port/flash-parity/quest-next-land-live/q3-retained-detail-comparison.png) · [第二戰開場並排](/workspace/shared/unlight-web-port/flash-parity/quest-next-land-live/q3-second-opening-comparison.png) · [逐項來源](flash-parity/quest-pve.md#非終點獲勝後接續下一格)
- 完整動畫的升級案例在同一詳情驗到原 Lobby 的實際 AP 回覆及 AP 6/6。較早的 Lobby 回覆不會蓋掉較新的 Quest AP，既有 Lobby 刷新節奏也已回歸。[升級後畫面](/workspace/shared/unlight-web-port/flash-parity/quest-next-land-live/root-full-motion/root-03-same-detail-after-ok.png) · [原版 AP 封包](/workspace/shared/unlight-web-port/flash-parity/quest-next-land-live/root-full-motion/root-intermediate-wire.json)
- 繁中原版及新版實際從 1 HP 敗北，依序確認 Lose、任務失敗和地圖 Back。兩版各得 3 Gem、2 Exp，SQLite 核對原持有列歸檔及牌組解鎖。原版混音確認敗北音、任務曲與大廳曲。[敗北並排](/workspace/shared/unlight-web-port/flash-parity/quest-next-land-live/q1-lose-comparison.png) · [任務失敗並排](/workspace/shared/unlight-web-port/flash-parity/quest-next-land-live/q1-quest-failed-comparison.png) · [原版混音](/workspace/shared/unlight-web-port/flash-parity/quest-next-terrain-original/q1-loss-verified/audio-samples.json)
- 新版搭配實際 Ruby 計時，在隔離的固定種子 5 對局跑完 18 回合，雙方各剩 1 HP，36 組骰與原版模型吻合。收真正的和局和任務失敗後，實際完成兩次確認與返回大廳。繁中 Flash 的完整和局操作待實跑。[新版 Draw](/workspace/shared/unlight-web-port/flash-parity/quest-draw-live/seed5-verified/28-verified-duel-result.png) · [新版操作及 SQLite](/workspace/shared/unlight-web-port/flash-parity/quest-draw-live/seed5-verified/README.md) · [原版模型](/workspace/shared/unlight-web-port/flash-parity/quest-outcome-model/q1-draw-trace.json)

### 末格蝙蝠卡寶箱與隱者之道

- 原版與新版均實際完成兩場勝利，依序確認戰鬥結果、蝙蝠卡及任務完成。兩版都沿用原 Quest 連線，資料庫確認只增加一張蝙蝠卡、一次通關、牌組解鎖及區域旗標 1／計數 0。新版另外暫緩真 `SC25`，證明實體 `SC13` 先入庫時，畫面維持原結果，直到其餘結算確認。翻牌使用原圖、時序及 `ulse23.mp3`，最後 Back 正常關閉任務。[蝙蝠卡寶箱並排](/workspace/shared/unlight-web-port/flash-parity/quest-treasure-live/treasure-comparison.png) · [任務完成並排](/workspace/shared/unlight-web-port/flash-parity/quest-treasure-live/quest-clear-comparison.png) · [新區域並排](/workspace/shared/unlight-web-port/flash-parity/quest-treasure-live/hermit-road-comparison.png) · [逐項規格](flash-parity/quest-pve.md#末格蝙蝠卡寶箱與區域解鎖)

### 空地與固定 Gem 接續戰鬥

- 原版與新版都實跑「山丘矮人」首格空地至道路戰鬥，以及「紫色泥沼澤2」30 Gem 寶箱至泥潭戰鬥。新版另實跑 Gem 寶箱的右支線道路戰鬥。實機驗到兩種原始 BGM、同一 Quest、牌組鎖、既有傷勢和每場唯一一次 Ready。寶箱在首次戰鬥前也會播放原始翻牌音，按 OK 後開放已確認的路線。[道路戰場並排](/workspace/shared/unlight-web-port/flash-parity/quest-peaceful-live/q4-stage2-comparison.png) · [Gem 寶箱並排](/workspace/shared/unlight-web-port/flash-parity/quest-peaceful-live/q32-gem-comparison.png) · [泥潭戰場並排](/workspace/shared/unlight-web-port/flash-parity/quest-peaceful-live/q32-stage3-comparison.png) · [逐項規格](flash-parity/quest-pve.md#非戰鬥地形與續戰)

### 道路終局與泥潭右線

- 繁中 Flash 與新版已實跑山丘矮人勝利和返回，以及紫色泥沼澤2右線 `1→5→8→10`。右線四筆各自的寶箱為 30、30、50、30 Gem。戰果、寶箱、通關依序各按一次 OK。末戰選「原地」後 HP 由 3 回到 4，再承受 3 點傷害。兩版核對同一套 Ruby 結算中的持有列、通關紀錄、AP 和牌組解鎖。新版另實跑山丘矮人敗北。[山丘矮人通關並排](/workspace/shared/unlight-web-port/flash-parity/quest-peaceful-complete-live/q4-clear-comparison.png) · [50 Gem 寶箱並排](/workspace/shared/unlight-web-port/flash-parity/quest-peaceful-complete-live/q32-slot8-gem-comparison.png) · [右線通關並排](/workspace/shared/unlight-web-port/flash-parity/quest-peaceful-complete-live/q32-clear-comparison.png) · [逐項規格](flash-parity/quest-pve.md#道路終局與泥潭後續格)

### 泥潭左線城堡與先鋒卡

- 繁中 Flash 與新版已跑完 `1→3→6→10`。戰鬥用原版 Ruby 實際發牌、擲骰與計時，兩版八組攻防骰眼、放獎順序與任務存檔一致。格 6 顯示城堡、六處同步燈火與原版場曲，戰後依入庫和寶箱回覆顯示先鋒卡。末戰從 1 回復至 2 HP，再依序完成戰果、寶箱、通關及大廳返回。新版用兩位獨立角色重跑。[城堡並排](/workspace/shared/unlight-web-port/flash-parity/quest-q32-left-live/q32-left-slot6-castle-move-comparison.png) · [先鋒卡並排](/workspace/shared/unlight-web-port/flash-parity/quest-q32-left-live/q32-left-slot6-card-comparison.png) · [通關並排](/workspace/shared/unlight-web-port/flash-parity/quest-q32-left-live/q32-left-clear-comparison.png) · [左線逐項規格](flash-parity/quest-pve.md#泥潭左線與先鋒卡)

### 魯比歐那的殘渣1獎勵骰

- q568 第 1 格的 30 Gem 和第 5 格的獎勵骰各有獨立戰果。繁中 Flash 和新版均由同一 Quest 走到第 5 格初始候選。固定舞台使用原版候選素材與 WebGL 六面骰，Lv5 猜高得到同點 `7→7`，原版 Ruby 寫入一個時間沙漏。SQLite 核對進度 34、傷勢 4、Deck 1 保持鎖定。新版經升級提示和最終 OK 在原任務開放格 7。[同條件候選並排](/workspace/shared/unlight-web-port/flash-parity/quest-high-low-live/lv5-offer-comparison.png) · [新版時間沙漏收據](/workspace/shared/unlight-web-port/flash-parity/quest-high-low-live/qa-item/quest-high-low-wire.json) · [逐項規格](flash-parity/quest-pve.md#高低獎勵骰)
- 新版 R5 猜高 `8→8`，原版 Ruby 發放一張古魯瓦爾多 Lv3，SQLite 核對新卡進入 Binder。領取回覆完整且一次確認後，回到原 Quest 開放格 7。實機也驗過延遲及連點時只發一次操作。[猜高結果](/workspace/shared/unlight-web-port/flash-parity/quest-high-low-live/qa-high/09-authoritative-high-low-decision.png) · [返回格 7](/workspace/shared/unlight-web-port/flash-parity/quest-high-low-live/qa-high/12-return-on-the-same-active-quest.png) · [重跑](flash-parity/qa.md#重跑高低獎勵骰)
- 另一位 R5 角色直接領取 `320% EXP`，原版 Ruby 確認額外 66 EXP、升為 Lv7 並補到 8 AP。新版等候 `SC38` 與 `SC126` 齊全才允許返回原任務，SQLite 為 149 Gem／276 EXP，兩戰與領取只使用一條 Quest。[候選佈局並排](/workspace/shared/unlight-web-port/flash-parity/quest-high-low-live/offer-next-get-comparison.png) · [新版直接領取](/workspace/shared/unlight-web-port/flash-parity/quest-high-low-live/root-get/quest-high-low-wire.json)
- 繁中 Flash 與新版以同一 Lv5 條件實跑 Next、High、Get。兩版都看到 `1,6→6,1` 同點成功，各寫入一個時間沙漏。結算同為 11 Gem／70 EXP，帳戶均達 151 Gem／290 EXP、Lv7、AP 8/8。兩次 OK 依序顯示升級及返回原任務，原連線保留進度 34、傷勢 4 與 Deck 1 鎖定，第 7 格可操作。繁中 Flash 混音確認按鍵、擲骰、成功音及返回任務曲。新版已實跑驗證升級後保留既有 AP 上限，返回時也顯示紅心 8/8。[領取並排](/workspace/shared/unlight-web-port/flash-parity/quest-high-low-live/lv5-full-payout-comparison.png) · [升級並排](/workspace/shared/unlight-web-port/flash-parity/quest-high-low-live/lv5-full-level-comparison.png) · [返回並排](/workspace/shared/unlight-web-port/flash-parity/quest-high-low-live/lv5-full-ap-and-map-comparison.png) · [兩版操作與截圖](/workspace/shared/unlight-web-port/flash-parity/quest-high-low-live/README.md)
- 兩版以同一場 q568 實跑先猜高失敗、四葉草重擲、再猜低失敗。骰差 2 時，兩版都保留石楠1，消耗石楠3後成功補正，各只領一個時間沙漏並返回原 Quest。新版測試另暫緩效果及領取封包，確認使用提示、操作時點與連點只發一次。原版混音已核對失敗、使用提示、成功及返回任務曲。[兩版驗收紀錄](/workspace/shared/unlight-web-port/flash-parity/quest-high-low-item-live/README.md) · [道具選擇並排](/workspace/shared/unlight-web-port/flash-parity/quest-high-low-item-live/clover-selected-comparison.png) · [重擲過場並排](/workspace/shared/unlight-web-port/flash-parity/quest-high-low-item-live/clover-transition-comparison.png)

### 魯比歐那的殘渣1終局獎勵

- 原版與新版都用 Lv5 古魯瓦爾多從 q568 首格勝利打到第 5 格敗北。Deck 1 在同一任務歸檔後解鎖，保留進度 2。猜高 `1,6→1,2` 失敗後按 Exit，仍得戰鬥原有的 2 Gem／6 EXP，已開道具窗留在結算畫面。直接 Get 另發 3 Gem，Back 前兩版帳戶均為 145 Gem。兩條路徑都先確認戰果，再確認任務失敗。Back 才送一次 `CS2` 並只關閉 Quest。[Exit 結算並排](/workspace/shared/unlight-web-port/flash-parity/quest-highlow-terminal-live/exit-terminal-settlement-comparison.png) · [直接 Get 結算並排](/workspace/shared/unlight-web-port/flash-parity/quest-highlow-terminal-live/direct-terminal-settlement-comparison.png) · [兩版驗收證據](/workspace/shared/unlight-web-port/flash-parity/quest-highlow-terminal-live/README.md) · [逐項規格](flash-parity/quest-pve.md#終局獎勵與敗猜後-exit)

### 大廳 Record 直接成就獎勵

- 兩版實跑首次登入的三件抽獎券，以及同一角色重新登入後完成 q3 兩戰。旗標 0→1，Back 前 124 Gem。回到同一條 Lobby 後確實加發兩件道具、七張記憶的碎片和 3,000 Gem。四張 Record 依序顯示抽獎券、記憶的碎片、Gem、魔女秘藥。新版另實跑逐張翻牌聲和本機 OK、底層入口互斥、焦點恢復與再次返回時的防重。[首次登入並排](/workspace/shared/unlight-web-port/flash-parity/quest-lobby-record-live/q3/initial-record-ticket-comparison.png) · [返回大廳的逐項畫面與封包](/workspace/shared/unlight-web-port/flash-parity/quest-lobby-record-live/q3/README.md)
- 已重跑設定、大廳、搜尋、重新登入及 q568 終局直接 Get。起始旗標 21 的 q568 隔離角色於進任務前已由 Lobby 發放成就 31，首戰前為 3,100 Gem。Quest 的直接 Get 仍只額外發 3 Gem，兩個 OK 後正常返回。[設定返回大廳](/workspace/shared/unlight-web-port/flash-parity/quest-lobby-record-live/q3/regressions/options-return-to-lobby.png) · [q568 回歸封包](/workspace/shared/unlight-web-port/flash-parity/quest-lobby-record-live/q3/regressions/q568-terminal-get-wire.json)

### 大廳新挑戰與可選角色卡

- 首次登入實跑 #1 抽獎券後的 #2、#31、#180 新挑戰。玩家逐一確認後返回同一大廳，SQLite 只增加原始三件抽獎券。固定繁中 Ruffle 的 #2 畫面可見，該次三處 OK 實點未能關閉。新版使用原始大廳外框、一般與新手「新挑戰」標誌及 ActionScript 的本機確認流程。[新挑戰並排](/workspace/shared/unlight-web-port/flash-parity/quest-record-choice-live/new-challenge-comparison.png) · [原版點擊紀錄](/workspace/shared/unlight-web-port/flash-parity/quest-record-choice-original/README.md)
- Lv3 可選角色卡實跑核對 21 個原始選項、選取音、翻牌聲及登入後的待領狀態。實際 `CS51` 只送一次，暫緩 `SC72` 時不提前顯示成功，放行後 SQLite 的 Binder 只有一張新增角色卡，重新登入沒有再次發放。固定 Flash 先前會顯示領取提示，但 `CS52` 和 `CS37` 清除待領且沒有實體卡。兩版保留獨立的封包與存檔證據。[選卡及確認並排](/workspace/shared/unlight-web-port/flash-parity/quest-record-choice-live/README.md) · [重跑可選角色卡](flash-parity/qa.md#重跑可選角色卡)
- 新版與未改動的 Ruby 重跑 q3 兩戰、寶箱及返回。四筆直接獎勵後依序顯示 #3、#32 新挑戰。再次進出任務沒有重發，舊 Ruby 的 `26:2` 持續待領。[#3 新挑戰](/workspace/shared/unlight-web-port/flash-parity/quest-record-choice-live/q3-return/42-record-new-challenge.png) · [#32 新挑戰](/workspace/shared/unlight-web-port/flash-parity/quest-record-choice-live/q3-return/42-record-hexrealm-challenge.png) · [回歸封包](/workspace/shared/unlight-web-port/flash-parity/quest-record-choice-live/q3-return/lobby-achievement-wire.json)

### 右側紀錄清單

- 原版與新版都從正常的大廳與設定入口展開「紀錄」，核對固定 648×520 面板、進行中與完成、六個分類以及來源詳情。新版實跑以 Data `SC7` 對照 SQLite，核對「虛擬人物Lv到達3」的 1/3。操作過程四條現有連線沒有新增送出封包，設定保持大廳 BGM 的原播放位置，關閉後回到入口焦點。[進行中並排](/workspace/shared/unlight-web-port/flash-parity/lobby-record-list-live/active-records-comparison.png) · [驗收紀錄與截圖](/workspace/shared/unlight-web-port/flash-parity/lobby-record-list-live/README.md) · [重跑右側紀錄](flash-parity/qa.md#重跑右側紀錄清單)
- 兩版用相同的 18 筆進行中、1 筆完成及 1 筆失敗紀錄的隔離存檔，實跑前後翻頁及失敗詳情。原版通關存檔重登與新版同登入的 q3 兩戰都顯示 #2 與 #31 完成。新版另外核對同一 Lobby 的實際 `SC56`、原四張獎勵通知與 SQLite。[第二頁並排](/workspace/shared/unlight-web-port/flash-parity/lobby-record-list-live/second-page-comparison.png) · [q3 通關後的成就並排](/workspace/shared/unlight-web-port/flash-parity/lobby-record-list-live/q3-finished-region-comparison.png)
