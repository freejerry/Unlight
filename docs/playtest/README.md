# Unlight 原版相容試玩紀錄

在 Codex 雲端用 Ruffle 執行原版繁中 Flash 客戶端，並連接隔離的 Ruby 服務。這裡收錄桌面、瀏覽器和獨立 SWF 元件的原始截圖。

## 桌面 Ruffle

從登入、新手角色建立、教學和大廳進入魔女山谷，打完「落日大蝙蝠」對局。畫面確認「精密射擊」、第一回合勝利、獲得 10 Gem 與 25 Exp、角色升到 2 級，以及任務地圖進度 1/3。

[標題](desktop/01-title.jpg) · [開場](desktop/02-opening.jpg) · [建立虛擬人物](desktop/03-create-avatar.jpg) · [初始角色卡](desktop/04-starter-card.jpg) · [教學](desktop/05-tutorial.jpg) · [大廳](desktop/06-lobby.jpg) · [任務地圖](desktop/07-quest-map.jpg) · [對戰開場](desktop/08-quest-battle.jpg) · [移動階段](desktop/09-move-phase.jpg) · [技能](desktop/10-feat-attack.jpg) · [勝利結算](desktop/11-victory.jpg) · [任務通關](desktop/12-quest-clear.jpg)

## 瀏覽器 Ruffle

在啟用軟體 WebGL 2 的獨立 Chromium 中，驗證標題動畫、登入、大廳及魔女山谷。早期「落日大蝙蝠」試玩經過抽牌、移動、防禦、擲骰、玩家攻擊和第二回合抽牌，當時攻擊截圖的攻擊力為 0。後續試玩已完成首場通關。缺少 WebGL 2 的環境會顯示啟動錯誤並允許重試。[瀏覽器啟動與驗收](../../tools/legacy-web/README.md)

Chromium 156 使用 ANGLE SwiftShader 的標題量測中，900 × 760 視窗顯示 780 × 680 的播放器，390 × 844 視窗顯示 390 × 340。兩個播放器都維持原版比例，頁面沒有溢出。這次標題取樣在 1.20 秒收到 9 次瀏覽器畫面回呼，回呼間隔中位數為 175.1 毫秒，p95 與最大值均為 233.3 毫秒。這組結果記錄軟體渲染環境的瀏覽器排程，無法據此驗收 SWF 動畫流暢度。[量測腳本](../../tools/legacy-web/check_browser.py)

[標題](browser/01-browser-title.png) · [大廳](browser/02-browser-lobby.png) · [任務地圖](browser/03-browser-quest.png) · [對戰開場](browser/04-browser-battle.png) · [展示入口標題](browser/05-demo-title.png)

[任務啟動](browser/06-browser-quest-start.png) · [第一回合抽牌](browser/07-browser-draw.png) · [移動](browser/08-browser-move.png) · [玩家攻擊](browser/09-browser-attack.png)

### 首場 PvE 結算

在 Chromium 156、ANGLE SwiftShader、Ruffle Web 0.8.0 和合併相容 SWF `789ab2b8` 上，用新建的隔離測試帳號跑完魔女山谷的「落日大蝙蝠」。選取任務時可讀到繁中關卡名稱和描述。第一回合留在中距離，出一張槍牌後攻擊力為 5，原版 Ruby 回報獲勝。按下勝利畫面和通關提示的兩處 OK 後，回到魔女山谷，地圖進度由 0/3 變為 1/3。[關卡名稱與描述](browser/18-browser-pve-selected.png) · [首回合出牌](browser/19-browser-pve-attack.png) · [勝利畫面](browser/20-browser-pve-victory.png) · [通關提示](browser/21-browser-pve-clear.png) · [返回地圖](browser/22-browser-pve-map.png)

回到地圖後，Gem 由 100 變為 111、Exp 由 0 變為 15，角色從 Lv.1 升到 Lv.2。瀏覽器關閉後以唯讀 SQLite 複查，一筆勝利及一點任務進度已寫入，原任務從庫存移除。這一輪的戰鬥與勝利截圖保留了修正前殘留的大廳提示。[首戰隔離帳號](../../tools/legacy-server/README.md#首場-pve-驗收資料)

在 Web Audio 的混音中辨認出原始戰鬥 BGM、擲骰和勝利音效。依排定播放時間重組取樣後，各片段與原 MP3 的最高正規化相關係數分別為 0.988、0.959 和 0.966。另一輪進到移動階段時，階段切換音效為 0.530。每個判定都有多個 0.45 秒區段對上同一播放起點。這些數值來自瀏覽器混音取樣。[音訊取樣重跑方式](../../tools/legacy-web/README.md#首場-pve-及音效)

### 大廳提示退場

大廳「任務」按鈕的提示由 Flex 的獨立圖層持有。相容版在大廳開始淡出時卸除懸停事件和已建立的提示，場景移除時也會清理。繁中 SWF `602db88d` 的 Chromium 實測直接點擊已顯示提示的任務按鈕，在進入地圖時原提示已消失。關卡名稱與可開始的任務地點各自仍會顯示提示，移開游標後消失。[原版提示建立](../../app/client/src/view/scene/lobby/Entrance.as#L608) · [相容版補丁](../../tools/legacy-build/runtime-client.patch) · [大廳懸停](browser/23-browser-lobby-quest-tip.png) · [地圖關卡提示](browser/24-browser-map-quest-tip.png)

在任務地點再次懸停後立即點擊進入戰鬥。抽牌、移動、攻擊、勝利、通關和返回地圖的畫面均已清除先前的提示。該輪在第二回合獲勝，地圖進度為 1/3。SQLite 複查確認通關及 12 Gem、15 Exp。[抽牌畫面](browser/25-browser-draw-tip-cleared.png) · [修正後的攻擊畫面](browser/26-browser-attack-tip-cleared.png) · [修正前的勝利畫面](browser/20-browser-pve-victory.png) · [修正後的勝利畫面](browser/27-browser-victory-tip-cleared.png) · [返回地圖](browser/28-browser-map-tip-cleared.png)

另在同一個已通關的測試帳號中，從地圖按 `BACK` 回到大廳，確認再次懸停「任務」可顯示原提示，移開後會消失。

### 標題動畫取樣

原版、舊相容版與合併版 SWF 都宣告舞台為 780 × 680、24 FPS。三版的蝴蝶、標題背景和標誌 SWF 內嵌素材逐位元相同。淡入使用 ActionScript 的時間補間，蝴蝶移動在淡入完成後由 `ENTER_FRAME` 驅動。[舞台設定](../../app/client/src/Unlight-config_sandbox.xml#L189) · [標題淡入](../../app/client/src/view/TitleView.as#L150) · [蝴蝶移動](../../app/client/src/view/image/title/Ageha.as#L55)

在同一套 Chromium 156、Ruffle Web 0.8.0、ANGLE SwiftShader 上先後量測原版和兩個相容版。三次皆使用 900 × 760 視窗、裝置像素比 1，並停用測試公告。標題音樂已送到 Web Audio 後，先獨立取樣約一秒的瀏覽器回呼，再取樣約四秒的合成畫面。下列變化次數排除第一張基準影像。合成取樣最多縮到 320 × 280，擷取過程可跳過部分更新。[重跑指令](../../tools/legacy-web/README.md#驗收)

| SWF | 瀏覽器回呼 | 合成樣本 | 可見變化 | 變化間隔中位數／p95 |
| --- | --- | ---: | ---: | ---: |
| 原版 `2a375905` | 7 次／1.00 秒 | 18 | 17 | 183.3／433.3 ms |
| 舊相容版 `26364783` | 10 次／1.03 秒 | 16 | 15 | 216.7／483.3 ms |
| 合併版 `789ab2b8` | 7 次／1.18 秒 | 18 | 17 | 183.3／416.7 ms |

原版 SWF 的日誌會在預設入口觸發 `ExternalInterface` 錯誤。量測原版時，在獨立測試頁啟用日誌橋接並核對 SWF SHA-256。量測兩份相容版時採用預設入口。約四秒內個別更新間隔相差數百毫秒，動畫流暢度需要在目標硬體上另驗。[原版 JSON](browser/17-title-frames-original.json) · [舊相容版 JSON](browser/17-title-frames-baseline.json) · [合併版 JSON](browser/17-title-frames-merged.json)

[原版標題截圖](browser/17-browser-title-original.png) · [合併版標題截圖](browser/17-browser-title-cadence.png)

### 畫面驗收項目

| 畫面 | 驗收內容 | 目前觀察 |
| --- | --- | --- |
| 標題頁登入表單 | `Name`、`Pass` 和欄位都完整顯示，按鈕可操作 | 恢復九宮格後，登入淡色區下緣從 y≈89 回到 y≈51，帳號欄頂部仍為 y≈75。Chromium 實測開啟註冊與返回登入，欄位與按鈕皆可操作。 |
| 標題頁消息欄 | 標題、邊界、內文和捲動保持完整 | 消息欄淡色區下緣從 y≈545 回到 y≈511。指定 `--news` 與歷史裝置字型後，測試公告可顯示「臺灣」和 `Café Élan`，並可捲至末行。 |
| 登入提示 | 檢查原版錯誤提示的繁中文字及標題區 | 高度約 100 的錯誤框原本的接縫已接近原圖，修正後下緣約為 y≈321。選用歷史明體後，空白登入提示可顯示「請輸入名字。」，按下 `OK` 可返回。 |
| 登入後「最新消息」 | 核對公告內容來源、繁中字形、換行和捲動 | 使用同一份測試 XML 和歷史裝置字型，在原版「更新情報」視窗驗證繁中、重音字元和捲至末行。實際公告需用原始繁中檔案複驗，版本庫預設仍為歷史日文範例。 |
| 關卡與戰鬥 | 核對列表名稱、地圖標題、關卡描述和圖片圖層 | 原先魔女山谷的列表名稱空白。相容版指定既有內嵌明體後，已在實際魔女山谷確認「落日大蝙蝠」顯示。其他關卡文字和圖片圖層仍待實測。 |

面板圖 `panel_gene.png` 來源為已固定版本的 120 × 96 原圖。核對原版、舊相容版和兩份修正版 SWF 的無損位圖，四者的預乘 ARGB 像素皆與原圖相符。原版和舊相容版包含同一組九宮格座標，Ruffle 0.8 的實測結果顯示整張圖隨面板高度拉伸。修正版相容 SWF 用同一張圖及原始切片座標逐區繪製。登入後的「更新情報」取用獨立的 `info_login.swf`，四份客戶端內嵌的位元組均與原始素材相同。[修正前的重疊](browser/11-browser-tcn-alert.png) · [原版切片設定](../../app/client/data/css/UL.css.cn#L35) · [登入後公告版面](../../app/client/src/view/scene/lobby/NoticePanel.as#L1353)

此次從 HTTP 入口確認雲端 4330、4331 和 4332 還在提供舊相容版 `26364783`。在獨立入口提供修正版 `602db88d`、繁中測試公告和歷史明體，同一個 780 × 680 舞台實測登入淡色區下緣 y=51、帳號框頂部 y=76、消息欄淡色區下緣 y=511。舊相容版的登入與消息下緣分別為 y=89 和 y=545。已用建置檔驗證 HTTP 位元組比對會拒絕舊入口，修正版入口通過。[這次重測截圖](browser/29-browser-panel-current.png) · [版本核對指令](../../tools/legacy-web/README.md#驗收)

合併版在 390 CSS 像素寬的視窗維持 390 × 340 的播放器。裝置像素比為 2 時，登入淡色區下緣和帳號框頂部分別位於 y=51 與 y=76 CSS 像素，兩者仍分開。載入測試公告的合併版以軟體 WebGL 取樣 1.10 秒，共收到 8 次瀏覽器畫面回呼，間隔中位數為 200 毫秒、p95 為 400 毫秒。動畫流暢度仍待驗收。

[標題頁消息](browser/14-browser-title-news.png) · [標題頁消息末行](browser/15-browser-title-news-scrolled.png) · [登入後公告](browser/12-browser-latest-news.png) · [登入後公告末行](browser/13-browser-latest-news-scrolled.png) · [任務名稱修正](browser/10-browser-quest-name.png)

## 原生瀏覽器驗收

Chromium 直接連到原版 Ruby 的轉接服務。兩輪檢查的六項二進位 KeepAlive 都相符。模擬戰鬥服務無法連線時，該項顯示失敗並可單獨重試。原版道具 PNG 成功解碼，原版標題 MP3 在點擊播放後正常前進，截圖時已暫停。兩個素材的 SHA-256 與原版入口相同。[驗收截圖](native/01-native-check.png) · [重跑方式](../../web-client/README.md)

原生九宮格驗收以原版 120 × 96 圖片繪製三個高度為 96、215 和 300 CSS 像素的面板。Chromium 在裝置像素比 1 和 2 下比對四角及中間切片，頂部淡色區固定在第 31 個 CSS 像素列附近，切片交界無透明縫隙。也實測了 390 CSS 像素寬的視窗及比原版左右兩側切片總寬還窄的面板縮放。[三種高度截圖](native/03-native-panel-slices.png) · [原版切片設定](../../app/client/data/css/UL.css.cn#L35)

### 原生 WebGL 2 九宮格

Chromium 的 ANGLE SwiftShader 實測使用一個 WebGL 2 繪圖環境。讀回的 WebGL 2 繪圖緩衝和可見畫布都符合原版圖片、切片及最近鄰取樣規則。CSS 欄寬由 220 縮為 78 像素後可恢復。在視窗尺寸相同時，模擬 DPR 變動通知也會觸發重繪。實測 WebGL context loss 與 WebGL 2 不可用，預覽均可由 Canvas 2D 接手。[WebGL 2 截圖](native/09-native-panel-webgl2.png) · [Canvas 2D 接手截圖](native/10-native-panel-canvas-fallback.png) · [重跑方式](../../web-client/README.md)

另在 220 和 78 像素寬、三種面板高度下，比較兩種繪圖方式的 1,195,362 個可見畫布像素。DPR 1、2 的輸出逐像素一致。DPR 1.25 共 1,152 個像素不同，已驗證全都落在兩個來源像素等距的位置，而且各自取到等距的其中一個原色。合成半透明色的測例也通過 RGBA 比對。

### 原生面板內容排版

在九宮格驗收頁輸入文字並展開測試更新訊息。1240 CSS 像素寬時，預覽面板增高，外層格線保持同一高度，背景畫布仍隨這一個面板重繪。在 320 CSS 像素寬且 DPR 2 時，標題區下緣位於面板第 31 像素，輸入欄從第 65 像素開始，繁中文字和 `Café Élan` 可在面板內換行。WebGL 中斷並切換至 Canvas 2D 後，展開狀態和欄位內容持續保留，文字再次通過像素檢查。[窄視窗截圖](native/13-native-panel-content.png) · [原生驗收指令](../../web-client/README.md#與原版核對)

### 原生九宮格連續縮放

WebGL 2 以共用緩衝區畫出當次需要的矩形，只在容量不足時按軸擴張，並把有效區域送到面板的可見畫布。在 320 CSS 像素寬、DPR 2 的視窗連續變更欄寬 46 次，涵蓋 78 至 220 CSS 像素。四張畫布在下一次瀏覽器畫面回呼時均符合當前尺寸，標題分界維持在第 31 個 CSS 像素。第一輪擴張兩次，後續多輪共用緩衝區。164 像素寬時，WebGL 有效區域和可見畫布均通過原圖像素比對。[縮放後的實測畫面](native/14-native-panel-resize.png) · [重跑指令](../../web-client/README.md#與原版核對)

另以 Chromium 156 和 ANGLE SwiftShader，在 900 × 970 視窗、DPR 2 下交替跑兩個版本。欄寬週期性在 164 至 220 CSS 像素間變動，內容面板高度在 178 至 258 像素間變動。每輪暖機 25 次，再取樣 120 次。舊版每輪改變 WebGL 緩衝尺寸 600 次，改版後都為 0 次。瀏覽器畫面回呼的間隔中位數約 83 ms，舊版 p95 為 117 至 150 ms，改版為 133 至 150 ms。此結果記錄軟體渲染的縮放負載，動畫流暢度仍待目標裝置驗收。

### 原生九宮格批次繪製

每次版面更新會把尺寸改變的面板排入共用 WebGL 2 緩衝區，一次繪製，再把各區塊按原尺寸送回可見畫布。320 CSS 像素、DPR 2 的 46 次連續縮放各觸發一次 `drawArrays`。單獨展開說明時只重繪內容面板，其餘三張畫布的尺寸和像素保持一致。縮放後的 PNG 與前一輪存下的驗收畫面逐位元組相同。[縮放畫面](native/14-native-panel-resize.png) · [重跑指令](../../web-client/README.md#與原版核對)

沿用上述 900 × 970 的 120 次更新測例，對照 `da6ff18` 的逐面板繪製，WebGL 2 每輪的 `drawArrays` 從 480 次減為 120 次。兩版的瀏覽器畫面回呼間隔 p95 都落在約 117 至 133 ms。同一台雲端機器強制走 Canvas 2D 時，兩輪的 p95 約為 67 和 83 ms。整體流暢度仍待目標裝置驗收。

將可用 WebGL 緩衝區上限模擬為 600 像素後，四個面板合併超過上限。Chromium 確認 WebGL 在送出繪製前交由 Canvas 2D 接手，四張畫布正常呈現，訊息也可展開。

## 原生瀏覽器登入

先用 Ruffle 操作原版登入畫面，再用原生入口在同一套隔離 Ruby 服務上重測。兩者收到的認證命令一致。未註冊帳號收到 `3`，錯誤密碼收到挑戰 `1` 及拒絕 `9`，正確登入收到挑戰 `1` 及憑證 `2`。

原生入口簽入後以同一玩家 ID 完成大廳、資料與全域聊天的原版交握。按登出後四條連線都關閉，重新登入取得相同玩家 ID。測試也檢查密碼欄送出後清空、瀏覽器流量中沒有測試密碼。獨立測試中，資料連線中斷後會結束整個工作階段。[登入成功截圖](native/02-native-session.png) · [重跑方式](../../web-client/README.md)

兩個隔離測試帳號分別驗收有角色和未創角的初始回應。角色名稱、等級 1、100 Gem、0 Exp 及 4／5 AP 都與原版 SQLite 相符，重新登入結果一致。未創角的帳號顯示 24 個起始外觀部件和 5 張起始角色卡，數量與原版設定一致。此階段的範圍為登入後的唯讀資料檢查。[角色資料](native/04-native-initial-data.png) · [未創角資料](native/05-native-starter-data.png)

## 原生瀏覽器任務快照

用 Chromium 連到隔離 Ruby，核對三種測試帳號。新角色顯示一筆「落日大蝙蝠」，任務 ID 1、狀態 0，魔女山谷進度為 0/3。先前在原版客戶端完成首場 PvE 的帳號顯示空清單與 1/3。兩個帳號的任務清單上限均為 4。未創角帳號顯示原版的建立角色資料。[新任務截圖](native/06-native-quest-ready.png) · [已通關截圖](native/07-native-quest-cleared.png)

點擊讀取時，驗收確認既有 Ruby 連線的送出訊息數量未增加，清單、通關紀錄及獎勵欄位均與讀取前一致。名稱及通關門檻來自原始繁中資料。登出會清空畫面，重新登入取得同一份在該時點有效的快照。區域進度取自 Data 登入回覆的旗標和通關數。[任務清單原始格式](../../app/client/src/net/command/DataCommand.as#L426) · [重跑方式](../../web-client/README.md)

以 390 CSS 像素寬、裝置像素比 2 的 Chromium 視窗再次登入，仍可完整讀取任務列與 0/3 進度，頁面寬度維持在視窗內。[窄視窗截圖](native/08-native-quest-mobile.png)

## 原生對局紀錄回放

用原版 Ruby 重跑固定種子 `2026`，輸出的 68 筆事件與保存的基準逐位元組相同。原生對局紀錄頁由同源讀取該基準。Chromium 用鍵盤逐筆核對回合、階段、HP、各次抽牌數及原始事件 JSON。tick 0 有四筆紀錄，依輸出順序完整保留。第四回合在模擬時間 92.1 秒結算，玩家勝利，雙方 HP 為 5／0。[原版 Ruby 紀錄](../../tools/legacy-server/fixtures/trace-2026.json) · [抽牌截圖](native/11-native-replay-event.png) · [結算截圖](native/12-native-replay-finished.png)

瀏覽器驗證了播放、暫停、前後跳轉、結算時停止及重新播放。390 CSS 像素寬的視窗遇到 HTTP 503 或無效的紀錄資料時可重試。本次回放只讀取同源檔案，未啟動對局服務。[重跑方式](../../web-client/README.md#原版對局紀錄回放)

## 原始 SWF 元件

獨立播放標題背景、換角面板與戰鬥階段元件，確認可載入並繪製。這三個檔案的遊戲內操作和聲音由主客戶端另外觸發。

[標題背景](asset-preview/01-title.jpg) · [換角面板](asset-preview/02-character-panel.jpg) · [戰鬥階段](asset-preview/03-battle-phase.jpg)

《Unlight》原作與遊戲美術為 CPA。截圖用於記錄相容性驗收。所用素材的來源標示 CC BY-ND 4.0。[原版程式碼](https://github.com/freejerry/Unlight) · [素材來源](https://github.com/kashi29/Unlight-Images/tree/0ec2d2ffb0e294e46cd0edfb84c9778e3dd4ed0e) · [素材授權](https://creativecommons.org/licenses/by-nd/4.0/)
