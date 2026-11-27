# 原版繁中「選項設定」交接

基準是 Ruffle 執行的原版繁中 Flash 客戶端，已連隔離 Ruby 服務。三張截圖均為舞台本身的 780×680 PNG，DPR 1。座標從舞台左上角算起。

## 實機畫面與操作

| 區域 | 動作與觀察 |
| --- | --- |
| 大廳入口 | 點齒輪旁的 `OPTION`，可用畫面座標約 `(575,176)`。設定另開整個舞台。原版共用角色、底欄 `Name`／`Gem`／`Exp`、AP、決鬥次數與右側 `RECORD`／`FRIENDLIST`／`ITEM` 仍在。設定背景的原始圖層寬 760，右側 `x=760–779` 保留暗色帶。 [設定穩定畫面](/workspace/shared/unlight-web-port/flash-parity/title-panel-audio/08-flash-option-settled.png) |
| `Help Option` | 外框橫跨 `x=230–529`，外形高約 100 px，從 `y=100` 開始。兩個勾選中心約 `(297,154)`、`(297,174)`，文字為「顯示工具提示」和「顯示箭形符號嚮導」。實測關掉第一項，第二項維持勾選。 [修改後](/workspace/shared/unlight-web-port/flash-parity/title-panel-audio/09-flash-option-edited.png) |
| `Sound Option` | 外框同寬，從 `y=210` 到 `484`。畫面三排 `BGM`／`SE`／`VOICE`，軌道約 `x=286–473`，水平線在 `y=310/380/450`。穩定畫面的 BGM 拇指中心 `x≈380`，修改後 `x≈323`，變動像素只落在 BGM 滑桿和第一個勾選。可重跑從 `(380,316)` 朝 `(323,316)` 拖曳。SE 和 VOICE 在這次實測各維持 50。 [修改後](/workspace/shared/unlight-web-port/flash-parity/title-panel-audio/09-flash-option-edited.png) |
| 返回 | 共用 `BACK` 原圖與點擊區是 `(712,0)` 起 48×32，可點 `(736,16)`。實機返回同一大廳，角色與底欄數值仍顯示。 [返回大廳](/workspace/shared/unlight-web-port/flash-parity/title-panel-audio/11-flash-lobby-returned.png) |

原版比較擷取含 Debug HUD，部分遮住左上 `Option`／「選項設定」。畫面也保留先前滑入 `OPTION` 的浮動提示，返回圖仍可見。這批像素可以佐證面板範圍、順序、對齊和控制項動作。音訊是否連續、重開瀏覽器後偏好是否保存、SE／VOICE 實際聲道以及字形粗細需要個別驗收。這套原版 Ruffle 的一般 `Panel` 淺色區會隨面板高度伸展，原始 CSS 九宮格另有固定的邊界資料。

## 原版程式與素材依據

- `LobbyView.as` 501–507、706–744、817–845。原入口播放 `ulse02`，依既有節流做角色資料更新，切到 `STATE_OPTION=6`。先退出大廳再顯示設定。`OptionView.as` 81–84、122–165、179–253 規定 `Option` 放在 `(15,5)`、「選項設定」放在 `(100,12)`，進頁標題淡入約 471 ms，離頁 1 秒再清理共用角色約 294 ms。Back 播放 `ulse01`，回 `STATE_LOBBY`。原版共享控制與設定值的驗收可分開。
- `HelpPanel.as` 44–51、115–169 與 `SoundPanel.as` 53–149。實際繁中建置開啟 `VOICE_ON`。三個滑桿範圍 0–100，刻度間隔 10，標籤為 0／50／100，拖曳和提交均更新音量。兩個勾選預設開啟，三種音量各預設 50。`Option.as` 27–38、66–104、113–173 使用本機 `volume`，鍵為 `bgm`、`se`、`cv`、`toolTip`、`arrow`。工具提示更新 `ToolTipManager.enabled`。箭頭開關作用於 `ActionCardButton.as` 58–76、116–134 的戰鬥行動牌導引。驗收應包含重開後保留、各通道獨立、拖動時即時更新、歸零再恢復，以及 Back 保留原登入。
- `LobbyCtrl.as` 303–326、`LobbyView.as` 308–315 與 `SoundCtrl.as` 29–39、70–94。大廳 `ulbgm02.mp3` 在設定進出沿用既有通道與播放位置，音量值除以 100 即時更新，滑到零仍保留播放。設定資料本身沒有送到 Ruby。另一路的標題與角色建立各有自己的 `ulbgm01.mp3` 播放實例，標題在確認登入後兩秒淡出，角色建立開始時從零播相同檔案。
- 原版開啟設定依序播放入口音、試送無參數 `Lobby CS17`，再淡出大廳。Back 先退出設定，大廳自身等背景、立繪、角色和入口顯示後進行同一個刷新，接著檢查公告。`LobbyCtrl` 跨場景共用 2 秒節流。Ruby 在可回復 AP 時更新資料庫並可能連送多筆 `SC17`，每筆同時攜帶目前 AP 與恢復秒數。`SC18` 是 AP 上限，`SC25` 是 Gem，`SC42` 是 `i8` 免費決鬥次數。Flash 的 Lobby `SC21` Exp 更新停在註解，`SC22` 等級只有紀錄。[大廳顯示後刷新](../../../app/client/src/view/LobbyView.as#L308) · [設定入口](../../../app/client/src/view/LobbyView.as#L501) · [兩秒節流](../../../app/client/src/controller/LobbyCtrl.as#L619) · [原版處理推送](../../../app/client/src/net/server/LobbyServer.as#L1039) · [Ruby 恢復與推送](../../../app/server/src/model/avatar.rb#L1451)
- AP 恢復時間另有專用滑入提示。原版從 `y=610`、右緣 `x=760` 淡入，200 ms，繁中顯示「到下一次回復還剩…。」或「現在的AP是最大值。」倒數到期只請求 Ruby 更新，由伺服器決定 AP。[AP 原版計時及指標事件](../../../app/client/src/view/image/common/ActionPointGauge.as#L224)
- 原始 `data/image/option/config.swf` 為單幀，內含 760×680 JPEG。SWF SHA-256 `2e9e56e2e17697194309e6fe37f73fcff5d6e5c460a18d8841e79f59ca65f077`，JPEG SHA-256 `a95d64dd4156d50f7dcbdcb6b7ebbd8af60a5ce9fb1faa33f835f7c7da350416`。共用框架與 Back 來自 `data/image/common/gene.swf`。`UL.css.cn` 35–45 的面板圖為 120×96 原始 `panel_gene.png`，X 分界 42／78、Y 分界 60／64。可用原始檔與座標直接追溯背景、面板和共用導覽。

## 新版操作與差異

| 項目 | 實作與驗收 |
| --- | --- |
| 舞台與素材 | 原始背景、Back 預設與懸停圖樣沿用原位置。設定角色使用 `PL_AVATAR_MATCH` 的 `(525,230)` 和原裝備圖層。原版實跑以相同角色確認相對大廳往右 36 px，Y 座標一致。新版測例核對角色畫布像素與 Ruby 裝備紀錄，返回後恢復原大廳座標。[素材雜湊](../../../source-login/option-art/sources.json) · [原版模式設定](../../../app/client/src/view/OptionView.as#L81) |
| 轉場 | 大廳設定入口淡出約 471 ms，設定標題淡入約 471 ms，角色為約 294 ms 純淡入。Back 的場景淡出約 1 秒，清理約 294 ms，再返回大廳。測例涵蓋轉場中輸入鎖定及縮減動態效果。大廳各圖層離場目前合成為場景淡出，原有立繪滑出仍待移植。[原版大廳離場](../../../app/client/src/view/LobbyView.as#L706) · [新版切場](../../../source-login/login.js) |
| 操作與音訊 | 支援滑鼠拖曳、勾選、Back，以及鍵盤方向鍵／Home／End 和 Enter。BGM 即時套用音量，進出設定和調到 0 時保持同一播放實例。SE 立即套用於點擊聲，進入 `ulse02`、返回 `ulse01`。三種音量與兩個勾選儲存在瀏覽器，在同一來源重新載入可復原。VOICE、箭頭待有對應場景後驗收，工具提示目前涵蓋大廳與設定的既有角色名稱、免費決鬥次數。[新版音訊](../../../source-login/bgm.js) · [偏好儲存](../../../source-login/preferences.js) |
| 控件細節 | 面板按原始九宮格切線繪製。滑桿與勾選為瀏覽器控件，外觀、焦點框、數字顏色與 Ruffle 的 Flex Halo 繪製仍有差異。方向鍵目前移動 1 個百分點，原版 Flex 按軌道像素移動。 |
| 服務同步 | 開設定時在轉場前試送 `Lobby CS17`。初次進大廳與 Back 返回則在入場後試送，兩處共用同一條 Lobby 連線及兩秒節流。切頁不依賴回覆。有效的 AP、AP 上限、Gem 及免費決鬥次數推送會更新共用 HUD。AP 的原始恢復秒數隨資料保留，AP 滑入倒數及到期請求尚待移植。[新版切場](../../../source-login/login.js) · [新版會話](../../../web-client/session.js) |

### 原版 AP 回復的顯示差異

在同一次原版登入，大廳顯示 `4/5`。把隔離測試角色的 `last_recovery_at` 設為已到期，按下 OPTION 後由 Ruby 依原規則回復到 `5/5`。第一次設定畫面的心形已填滿，數字仍為 `4/5`。Back 回大廳後及第二次進設定時均顯示 `5/5`。原版共用 AvatarView 離場暫時移除 HUD 的更新監聽，重掛已初始化的畫面時沿用既有數字。原始數字和心形可在切場期間各自更新的情形已留存。新版由共用會話接收 AP，畫面消費同一份已確認的數值，切場後重新掛載的數字和心形也使用同一份資料。[大廳原版 `4/5`](/workspace/shared/unlight-web-port/flash-parity/lobby-refresh/01-flash-lobby-ap4.png) · [第一次設定的原版差異](/workspace/shared/unlight-web-port/flash-parity/lobby-refresh/02-flash-option-full-gauge-stale-ap4.png) · [原版 Back 後 `5/5`](/workspace/shared/unlight-web-port/flash-parity/lobby-refresh/03-flash-lobby-back-ap5.png) · [原版顯示監聽](../../../app/client/src/view/scene/common/AvatarView.as#L277)

原版獨立重跑在點擊標記約 111 ms 後收到三筆真正的 `SC17(5,0)`，接著收到 `SC42(3)`。這批收包時間與前一組截圖分屬兩次執行。[原版回覆紀錄](/workspace/shared/unlight-web-port/flash-parity/lobby-refresh/07-flash-authenticated-wire.json) · [原版倒數提示](/workspace/shared/unlight-web-port/flash-parity/lobby-refresh/04-flash-lobby-ap-countdown.png) · [原版 AP 滿值提示](/workspace/shared/unlight-web-port/flash-parity/lobby-refresh/05-flash-lobby-ap-full-tooltip.png)

用隔離 Ruby、原版繁中客戶端及 Chromium 的固定舞台重跑。新版測例從註冊與登入開始，實際操作入口、滑桿及 Back，也核對偏好保存、角色資料與連線。[隔離環境與指令](qa.md#可重跑的隔離環境) · [正式測例](../../../tools/legacy-web/check_source_lobby.py)

並排畫面分別取自兩個隔離環境的測試角色，髮型、AP 及裝備可能不同。各張新版 PNG 為 780×680 舞台擷取。[原版與新版並排](/workspace/shared/unlight-web-port/flash-parity/options-native/option-side-by-side.png) · [預設值](/workspace/shared/unlight-web-port/flash-parity/options-native/01-native-options-default-780.png) · [修改後](/workspace/shared/unlight-web-port/flash-parity/options-native/02-native-options-edited-780.png) · [返回大廳](/workspace/shared/unlight-web-port/flash-parity/options-native/03-native-lobby-returned-780.png) · [重新登入後](/workspace/shared/unlight-web-port/flash-parity/options-native/04-native-options-persisted-780.png)
