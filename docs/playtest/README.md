# Unlight 原版相容試玩紀錄

在 Codex 雲端用 Ruffle 執行原版繁中 Flash 客戶端，並連接隔離的 Ruby 服務。這裡收錄桌面、瀏覽器和獨立 SWF 元件的原始截圖。

## 桌面 Ruffle

從登入、新手角色建立、教學和大廳進入魔女山谷，打完「落日大蝙蝠」對局。畫面確認「精密射擊」、第一回合勝利、獲得 10 Gem 與 25 Exp、角色升到 2 級，以及任務地圖進度 1/3。

[標題](desktop/01-title.jpg) · [開場](desktop/02-opening.jpg) · [建立虛擬人物](desktop/03-create-avatar.jpg) · [初始角色卡](desktop/04-starter-card.jpg) · [教學](desktop/05-tutorial.jpg) · [大廳](desktop/06-lobby.jpg) · [任務地圖](desktop/07-quest-map.jpg) · [對戰開場](desktop/08-quest-battle.jpg) · [移動階段](desktop/09-move-phase.jpg) · [技能](desktop/10-feat-attack.jpg) · [勝利結算](desktop/11-victory.jpg) · [任務通關](desktop/12-quest-clear.jpg)

## 瀏覽器 Ruffle

在啟用軟體 WebGL 2 的獨立 Chromium 中，驗證標題動畫、登入、大廳、魔女山谷與對戰開場。標題的 Web Audio 輸出量到非零波形，戰鬥也請求了原版 BGM。各別戰鬥音效、瀏覽器版通關結算和部分彈窗的繁中字型仍待核對。缺少 WebGL 2 的環境會顯示啟動錯誤並允許重試。[瀏覽器啟動與驗收](../../tools/legacy-web/README.md)

[標題](browser/01-browser-title.png) · [大廳](browser/02-browser-lobby.png) · [任務地圖](browser/03-browser-quest.png) · [對戰開場](browser/04-browser-battle.png) · [展示入口標題](browser/05-demo-title.png)

## 原生瀏覽器驗收

Chromium 直接連到原版 Ruby 的轉接服務。兩輪檢查的六項二進位 KeepAlive 都相符。模擬戰鬥服務無法連線時，該項顯示失敗並可單獨重試。原版道具 PNG 成功解碼，原版標題 MP3 在點擊播放後正常前進，截圖時已暫停。兩個素材的 SHA-256 與原版入口相同。[驗收截圖](native/01-native-check.png) · [重跑方式](../../web-client/README.md)

## 原始 SWF 元件

獨立播放標題背景、換角面板與戰鬥階段元件，確認可載入並繪製。這三個檔案的遊戲內操作和聲音由主客戶端另外觸發。

[標題背景](asset-preview/01-title.jpg) · [換角面板](asset-preview/02-character-panel.jpg) · [戰鬥階段](asset-preview/03-battle-phase.jpg)

《Unlight》原作與遊戲美術為 CPA。截圖用於記錄相容性驗收。所用素材的來源標示 CC BY-ND 4.0。[原版程式碼](https://github.com/freejerry/Unlight) · [素材來源](https://github.com/kashi29/Unlight-Images/tree/0ec2d2ffb0e294e46cd0edfb84c9778e3dd4ed0e) · [素材授權](https://creativecommons.org/licenses/by-nd/4.0/)
