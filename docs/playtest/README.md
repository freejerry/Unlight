# Unlight 原版相容試玩紀錄

在 Codex 雲端用 Ruffle 執行原版繁中 Flash 客戶端，並連接隔離的 Ruby 服務。這裡收錄桌面、瀏覽器和獨立 SWF 元件的原始截圖。

## 桌面 Ruffle

從登入、新手角色建立、教學和大廳進入魔女山谷，打完「落日大蝙蝠」對局。畫面確認「精密射擊」、第一回合勝利、獲得 10 Gem 與 25 Exp、角色升到 2 級，以及任務地圖進度 1/3。

[標題](desktop/01-title.jpg) · [開場](desktop/02-opening.jpg) · [建立虛擬人物](desktop/03-create-avatar.jpg) · [初始角色卡](desktop/04-starter-card.jpg) · [教學](desktop/05-tutorial.jpg) · [大廳](desktop/06-lobby.jpg) · [任務地圖](desktop/07-quest-map.jpg) · [對戰開場](desktop/08-quest-battle.jpg) · [移動階段](desktop/09-move-phase.jpg) · [技能](desktop/10-feat-attack.jpg) · [勝利結算](desktop/11-victory.jpg) · [任務通關](desktop/12-quest-clear.jpg)

## 瀏覽器 Ruffle

在啟用軟體 WebGL 2 的獨立 Chromium 中，驗證標題動畫、登入、大廳及魔女山谷。啟動「落日大蝙蝠」後實際經過抽牌、移動、防禦、擲骰、玩家攻擊和第二回合抽牌。攻擊截圖當下的攻擊力為 0。原版標題及戰鬥 BGM 成功載入，並測到 Web Audio 混音輸出。擲骰和勝利音效檔皆回傳 HTTP 200，屬於戰前預載。個別音效的觸發和瀏覽器通關結算仍待驗收。缺少 WebGL 2 的環境會顯示啟動錯誤並允許重試。[瀏覽器啟動與驗收](../../tools/legacy-web/README.md)

Chromium 156 使用 ANGLE SwiftShader 的標題量測中，900 × 760 視窗顯示 780 × 680 的播放器，390 × 844 視窗顯示 390 × 340。兩個播放器都維持原版比例，頁面沒有溢出。這次標題取樣在 1.20 秒收到 9 次瀏覽器畫面回呼，回呼間隔中位數為 175.1 毫秒，p95 與最大值均為 233.3 毫秒。這組結果記錄軟體渲染環境的瀏覽器排程，無法據此驗收 SWF 動畫流暢度。[量測腳本](../../tools/legacy-web/check_browser.py)

[標題](browser/01-browser-title.png) · [大廳](browser/02-browser-lobby.png) · [任務地圖](browser/03-browser-quest.png) · [對戰開場](browser/04-browser-battle.png) · [展示入口標題](browser/05-demo-title.png)

[任務啟動](browser/06-browser-quest-start.png) · [第一回合抽牌](browser/07-browser-draw.png) · [移動](browser/08-browser-move.png) · [玩家攻擊](browser/09-browser-attack.png)

### 畫面驗收項目

| 畫面 | 驗收內容 | 目前觀察 |
| --- | --- | --- |
| 標題頁登入表單 | `Name`、`Pass` 和欄位都完整顯示，按鈕可操作 | 恢復九宮格後，登入淡色區下緣從 y≈89 回到 y≈51，帳號欄頂部仍為 y≈75。Chromium 實測開啟註冊與返回登入，欄位與按鈕皆可操作。 |
| 標題頁消息欄 | 標題、邊界、內文和捲動保持完整 | 消息欄淡色區下緣從 y≈545 回到 y≈511。指定 `--news` 與歷史裝置字型後，測試公告可顯示「臺灣」和 `Café Élan`，並可捲至末行。 |
| 登入提示 | 檢查原版錯誤提示的繁中文字及標題區 | 高度約 100 的錯誤框原本的接縫已接近原圖，修正後下緣約為 y≈321。選用歷史明體後，空白登入提示可顯示「請輸入名字。」，按下 `OK` 可返回。 |
| 登入後「最新消息」 | 核對公告內容來源、繁中字形、換行和捲動 | 使用同一份測試 XML 和歷史裝置字型，在原版「更新情報」視窗驗證繁中、重音字元和捲至末行。實際公告需用原始繁中檔案複驗，版本庫預設仍為歷史日文範例。 |
| 關卡與戰鬥 | 核對列表名稱、地圖標題、關卡描述和圖片圖層 | 原先魔女山谷的列表名稱空白。相容版指定既有內嵌明體後，已在實際魔女山谷確認「落日大蝙蝠」顯示。其他關卡文字和圖片圖層仍待實測。 |

面板圖 `panel_gene.png` 來源為已固定版本的 120 × 96 原圖。逐像素核對原版和舊相容版 SWF 中的無損位圖，RGBA 全部相符，SWF 亦包含原版九宮格切片。Ruffle 0.8 的實測結果則顯示整張圖隨面板高度拉伸。新版相容 SWF 用同一張圖及原始切片座標繪製。[修正前的重疊](browser/11-browser-tcn-alert.png) · [修正後的三個面板](browser/16-browser-panel-alignment.png) · [原版切片設定](../../app/client/data/css/UL.css.cn#L35)

合併版在 390 CSS 像素寬的視窗維持 390 × 340 的播放器。裝置像素比為 2 時，登入淡色區下緣和帳號框頂部分別位於 y=51 與 y=76 CSS 像素，兩者仍分開。載入測試公告的合併版以軟體 WebGL 取樣 1.10 秒，共收到 8 次瀏覽器畫面回呼，間隔中位數為 200 毫秒、p95 為 400 毫秒。動畫流暢度仍待驗收。

[標題頁消息](browser/14-browser-title-news.png) · [標題頁消息末行](browser/15-browser-title-news-scrolled.png) · [登入後公告](browser/12-browser-latest-news.png) · [登入後公告末行](browser/13-browser-latest-news-scrolled.png) · [任務名稱修正](browser/10-browser-quest-name.png)

## 原生瀏覽器驗收

Chromium 直接連到原版 Ruby 的轉接服務。兩輪檢查的六項二進位 KeepAlive 都相符。模擬戰鬥服務無法連線時，該項顯示失敗並可單獨重試。原版道具 PNG 成功解碼，原版標題 MP3 在點擊播放後正常前進，截圖時已暫停。兩個素材的 SHA-256 與原版入口相同。[驗收截圖](native/01-native-check.png) · [重跑方式](../../web-client/README.md)

## 原生瀏覽器登入

先用 Ruffle 操作原版登入畫面，再用原生入口在同一套隔離 Ruby 服務上重測。兩者收到的認證命令一致。未註冊帳號收到 `3`，錯誤密碼收到挑戰 `1` 及拒絕 `9`，正確登入收到挑戰 `1` 及憑證 `2`。

原生入口簽入後以同一玩家 ID 完成大廳、資料與全域聊天的原版交握。按登出後四條連線都關閉，重新登入取得相同玩家 ID。測試也檢查密碼欄送出後清空、瀏覽器流量中沒有測試密碼。獨立測試中，資料連線中斷後會結束整個工作階段。[登入成功截圖](native/02-native-session.png) · [重跑方式](../../web-client/README.md)

## 原始 SWF 元件

獨立播放標題背景、換角面板與戰鬥階段元件，確認可載入並繪製。這三個檔案的遊戲內操作和聲音由主客戶端另外觸發。

[標題背景](asset-preview/01-title.jpg) · [換角面板](asset-preview/02-character-panel.jpg) · [戰鬥階段](asset-preview/03-battle-phase.jpg)

《Unlight》原作與遊戲美術為 CPA。截圖用於記錄相容性驗收。所用素材的來源標示 CC BY-ND 4.0。[原版程式碼](https://github.com/freejerry/Unlight) · [素材來源](https://github.com/kashi29/Unlight-Images/tree/0ec2d2ffb0e294e46cd0edfb84c9778e3dd4ed0e) · [素材授權](https://creativecommons.org/licenses/by-nd/4.0/)
