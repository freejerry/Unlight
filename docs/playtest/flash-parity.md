# 《Unlight》Flash 原版移植驗收

以固定版本的繁中 Flash 客戶端、ActionScript 和 Ruby 服務核對新版 `/source-login/`。新版固定為 780 × 680，沿用原始版面、字體、美術、音訊、動畫與玩家操作。驗收分別記錄原始碼規格、原版實跑結果、新版可操作範圍及兩版差異。每個功能在正常遊戲入口驗證，階段成果推送到 `codex/unlight-source-login`。

## 對照版本與證據

| 項目 | 基準 |
| --- | --- |
| Flash 舞台 | Flex 編譯的繁中版 780 × 680、24 FPS。原版編譯 SWF SHA-256 `2a375905f3effc06476cd99f578f48d3040a2e9eecbbc6cfd33ce5d5f34ddc44`。Ruffle 本機服務相容版 SHA-256 `263647832e0132f07a17f1d547913dab8c45a26ffff2b9ceace6fd428c8103b9`。每份畫面證據註明使用的版本。[來源及編譯](../../tools/legacy-build/README.md) |
| 原始素材 | 固定的 Unlight-Images 版本 `0ec2d2ffb0e294e46cd0edfb84c9778e3dd4ed0e`。依 SWF 的圖層、時間軸和事件使用來源圖像。保留來源路徑和雜湊，便於重跑資產擷取。[大廳素材清單](../../source-login/lobby-art/sources.json) |
| Ruby | 參考 `ee38622` 的隔離運行副本。兩版使用同源的繁中資料和獨立測試帳號，戰鬥重跑時記下牌組與亂數輸入。在 SQLite 核對操作結果。[建立測試服務](../../tools/legacy-server/README.md) |
| 新版起始基線 | `cc2ef53`，已實跑標題、驗證後的玫瑰、角色建立、簡要新手指引及大廳。任務目前開啟唯讀清單。每列標註的完成狀態只涵蓋該列列出的行為。[固定舞台啟動](../../source-login/README.md) |

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
| [共用渲染、時間軸、字型與音訊](flash-parity/renderer.md) | **部分** WebGL 2／Wasm 標題、原版玫瑰、裝備圖集、部分面板及場景音訊。 | 用實際 Login／Register／News 面板核對原始九宮格和透明邊角。另比對原版登入 BGM 的 2 秒淡出與角色開場曲銜接。 |
| [大廳功能、選項與社交](flash-parity/lobby-views.md) | **部分**大廳 14 個入口圖示與公告。原版子場景依各自的資料與素材接入。 | 從選項設定開始，以 BGM／SE 刻度、保存、返回及同一登入為第一條可操作驗收。 |
| [任務、探索、PvE 與報酬](flash-parity/quest-pve.md) | **部分**固定舞台任務庫存與共用 Ruby 協定。歷史首戰證據依入口分開記錄。 | 同次登入進真實任務地圖並返回，再逐次接上探索和首戰。 |
| [多人對戰、旁觀與襲擊](flash-parity/multiplayer.md) | **待接通或驗證**原版選頻道、房間及襲擊服務。 | 以隔離服務驗證原版頻道及真實對手，再接遊戲流程。 |
| [環境、測例和截圖來源](flash-parity/qa.md) | **已實跑**既有原版與固定舞台測例。截圖記錄區分實際入口及版本。 | 讓新增流程都有同次對照的操作證據與回歸檢查。 |

## 里程碑紀錄

### 註冊完成與接續登入

- **Flash 原版實跑**。繁中相容 SWF 連到隔離 Ruby。出現「登錄完畢」時，資料庫已有新帳號，登入狀態仍為 0。按 OK 後連線進入原版開場，登入狀態轉為 1。Esc 的行為由 Adobe Flex 3.6 `AlertForm.keyDownHandler` 的關閉事件、`Alerter.closeOffHandler` 與 `TitleCtrl.registToLoginHandler` 核對。 [原版成功畫面](/workspace/shared/unlight-web-port/flash-parity/registration/03-original-registration-success.png) · [原版開場](/workspace/shared/unlight-web-port/flash-parity/registration/06-original-registration-onboarding.png) · [原版接續登入](../../app/client/src/controller/TitleCtrl.as#L425)
- **新版實跑**。在兩個隔離角色上驗證滑鼠 OK 與鍵盤 Esc、同一帳號憑證驗證、接續到新手開場及再登入。另驗證同名拒絕、帳號已建但離頁放棄登入，以及既有的大廳回歸。完成視窗的字重、文字顏色、按鈕焦點框及背後模糊取樣有可見差異，列入共用面板驗收。 [完成視窗並排比對](/workspace/shared/unlight-web-port/flash-parity/registration/registration-dialog-comparison.png) · [新版開場](/workspace/shared/unlight-web-port/flash-parity/registration/13-native-automatic-onboarding.png) · [新版測例](../../tools/legacy-web/check_source_lobby.py)
