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

## 後續實作與驗收依據

- `LobbyView.as` 501–507、706–744、817–845。原入口播放 `ulse02`，依既有節流做角色資料更新，切到 `STATE_OPTION=6`。先退出大廳再顯示設定。`OptionView.as` 81–84、122–165、179–253 規定 `Option` 放在 `(15,5)`、「選項設定」放在 `(100,12)`，進頁標題淡入約 471 ms，離頁 1 秒再清理共用角色約 294 ms。Back 播放 `ulse01`，回 `STATE_LOBBY`。原版共享控制與設定值的驗收可分開。
- `HelpPanel.as` 44–51、115–169 與 `SoundPanel.as` 53–149。實際繁中建置開啟 `VOICE_ON`。三個滑桿範圍 0–100，刻度間隔 10，標籤為 0／50／100，拖曳和提交均更新音量。兩個勾選預設開啟，三種音量各預設 50。`Option.as` 27–38、66–104、113–173 使用本機 `volume`，鍵為 `bgm`、`se`、`cv`、`toolTip`、`arrow`。工具提示更新 `ToolTipManager.enabled`。箭頭開關作用於 `ActionCardButton.as` 58–76、116–134 的戰鬥行動牌導引。驗收應包含重開後保留、各通道獨立、拖動時即時更新、歸零再恢復，以及 Back 保留原登入。
- `LobbyCtrl.as` 303–326、`LobbyView.as` 308–315 與 `SoundCtrl.as` 29–39、70–94。大廳 `ulbgm02.mp3` 在設定進出沿用既有通道與播放位置，音量值除以 100 即時更新，滑到零仍保留播放。設定資料本身沒有送到 Ruby。另一路的標題與角色建立各有自己的 `ulbgm01.mp3` 播放實例，標題在確認登入後兩秒淡出，角色建立開始時從零播相同檔案。
- 原始 `data/image/option/config.swf` 為單幀，內含 760×680 JPEG。SWF SHA-256 `2e9e56e2e17697194309e6fe37f73fcff5d6e5c460a18d8841e79f59ca65f077`，JPEG SHA-256 `a95d64dd4156d50f7dcbdcb6b7ebbd8af60a5ce9fb1faa33f835f7c7da350416`。共用框架與 Back 來自 `data/image/common/gene.swf`。`UL.css.cn` 35–45 的面板圖為 120×96 原始 `panel_gene.png`，X 分界 42／78、Y 分界 60／64。可用原始檔與座標直接追溯背景、面板和共用導覽。
