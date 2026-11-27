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

### 繁中關卡地形文字

以成品 SWF 的字元代碼表核對 3,216 筆任務、138 筆地圖及 2,203 筆地形。任務與地圖使用內嵌 `minchoB`，地形名稱與描述使用內嵌 `mincho`。5,557 筆資料中的非空白字元都有對應字形，原始資料共有 138 個空白欄位。此檢查涵蓋字形可用性，文字換行和欄寬仍需逐畫面驗收。[關卡資料檢查指令](../../tools/legacy-build/README.md#產物和驗證)

在 Chromium 和 Ruffle 用同一份隔離 Ruby 資料登入，兩個入口均未指定 `--tcn-device-font`。到魔女山谷選取「落日大蝙蝠」，把游標停在地形上。舊相容版 `602db88d` 的地形名稱只顯示 `1`，描述欄像素和空白狀態完全相同。改用內嵌明體的 `8e88e01f` 顯示「寬廣高原1」及兩行完整的「蝙蝠揮舞翅膀的廣大高原」。游標移開後，兩個欄位都回到原先的畫面。畫面測例涵蓋首場任務的地形欄，其他關卡的實際欄寬仍待驗收。[修正前](browser/30-browser-land-font-before.png) · [修正後](browser/31-browser-land-font-after.png)

### 任務搜尋倒數與提示

在隔離 Ruby 環境用原版模型建立「落日大蝙蝠」的搜尋中任務，兩個相容版入口都指定歷史繁中裝置字型。舊相容版 `8e88e01f` 正常連線時，比到期時間早 327 毫秒送出唯一一次完成查詢。Ruby 留下搜尋中狀態，客戶端停在 `00:00`。重跑舊版時，在測試入口延遲送往 Ruby 的任務訊息 1.1 秒以取得真實的完成回覆。任務列已顯示 `NEW` 與任務名稱，游標原地和移開再移入時依然沒有任務說明。[倒數停住](browser/32-browser-quest-timer-stalled.png) · [舊版完成後](browser/33-browser-quest-tooltip-before.png) · [原版剩餘時間格式](../../app/server/src/model/avatar.rb#L757) · [原版到期檢查](../../app/server/src/model/avatar_quest_inventory.rb#L120)

修正版 `cd228328` 把整秒截斷的誤差納入完成查詢時機，倒數最小顯示為 `00:00`。正常連線時，Ruby 在截止後 849 毫秒收到查詢，約 861 毫秒回覆 `NEW`。游標停在同一列便顯示「飛舞於山谷間的大蝙蝠，今晚也要搜尋犧牲者」。移開游標後，提示區域與未懸停畫面逐像素一致。原版 `BACK` 操作也已回到大廳，任務提示隨場景收起。[修正後](browser/34-browser-quest-tooltip-after.png) · [相容補丁](../../tools/legacy-build/runtime-client.patch)

瀏覽器腳本印出返回大廳的檢查成功後，以狀態 1 結束。另行比對截圖像素及 Ruby 寫入的任務狀態，結果符合預期。

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

在 Chromium 156 與 ANGLE SwiftShader，使用同一張原圖、900 × 970 視窗及 DPR 2，比較直接裁切 WebGL 2 畫布和先複製到中繼 Canvas 2D 再裁切。以原方案、中繼、中繼、原方案的順序各跑一輪，每輪暖機 25 次，量測 100 次欄寬與內容高度變更。畫面回呼間隔的中位數分別為 66.7 與 83.3 毫秒，p95 分別落在 100.0–116.7 與 116.7–133.3 毫秒。兩方案的可見畫布均及時更新尺寸，加入中繼時每次更新的複製次數從 4 增為 5。原方案中，四次裁切合計耗時中位數為 0.2 毫秒，`getError` 呼叫中位數為 59.9–67.4 毫秒，約占繪圖回呼耗時的 98%，包含對已排入繪圖工作的同步等待。保留直接裁切和 WebGL 失效時的 Canvas 2D 接手。量測涵蓋雲端軟體渲染的面板縮放，目標裝置的遊玩動畫仍待驗收。[既有縮放畫面](native/14-native-panel-resize.png)

## 原生瀏覽器登入

先用 Ruffle 操作原版登入畫面，再用原生入口在同一套隔離 Ruby 服務上重測。兩者收到的認證命令一致。未註冊帳號收到 `3`，錯誤密碼收到挑戰 `1` 及拒絕 `9`，正確登入收到挑戰 `1` 及憑證 `2`。

原生入口簽入後以同一玩家 ID 完成大廳、資料與全域聊天的原版交握。按登出後四條連線都關閉，重新登入取得相同玩家 ID。測試也檢查密碼欄送出後清空、瀏覽器流量中沒有測試密碼。獨立測試中，資料連線中斷後會結束整個工作階段。[登入成功截圖](native/02-native-session.png) · [重跑方式](../../web-client/README.md)

Chromium 在等待原版 Ruby 的 Data 登入回覆時，由測試程式模擬認證或大廳連線中斷。兩次交握都止於資料服務，三條已開啟的連線在驗收的 3 秒上限內關閉。頁面直接顯示「連線失敗」及可再次提交的登入表單。恢復正常傳遞回覆後，同一帳號可重新登入及登出。[320 像素實測](native/23-native-startup-disconnect.png) · [重跑方式](../../web-client/README.md#與原版核對)

兩個隔離測試帳號分別驗收有角色和未創角的初始回應。角色名稱、等級 1、100 Gem、0 Exp 及 4／5 AP 都與原版 SQLite 相符，重新登入結果一致。未創角的帳號顯示 24 個起始外觀部件和 5 張起始角色卡，數量與原版設定一致。此階段的範圍為登入後的唯讀資料檢查。[角色資料](native/04-native-initial-data.png) · [未創角資料](native/05-native-starter-data.png)

Chromium 連到隔離 Ruby 完成登入，再展開原生「最新消息」，核對同源取得的 UTF-8 `<XML><news>` 檔案位元組、公告文字和基本段落格式。庫內保存的是日文範例，繁中畫面採用明確標示的測試資料。在 320 CSS 像素、DPR 2 下驗證繁中字形及拉丁重音字元，並以鍵盤捲至末行。另驗證 HTTP 503 與無效 XML 可重試、同次登入重開沿用已取得的公告、登出會取消尚未完成的請求，以及未配置檔案時會隱藏區塊。[原始日文檔](../../app/client/public/news.xml.orig) · [日文實測](native/24-native-news-archive.png) · [繁中測例](native/25-native-news-tcn-sample.png) · [啟動方式](../../web-client/README.md#啟動)

## 原生瀏覽器任務快照

用 Chromium 連到隔離 Ruby，核對三種測試帳號。新角色顯示一筆「落日大蝙蝠」，任務 ID 1、狀態 0，魔女山谷進度為 0/3。先前在原版客戶端完成首場 PvE 的帳號顯示空清單與 1/3。兩個帳號的任務清單上限均為 4。未創角帳號顯示原版的建立角色資料。[新任務截圖](native/06-native-quest-ready.png) · [已通關截圖](native/07-native-quest-cleared.png)

點擊讀取時，驗收確認既有 Ruby 連線的送出訊息數量未增加，清單、通關紀錄及獎勵欄位均與讀取前一致。名稱及通關門檻來自原始繁中資料。登出會清空畫面，重新登入取得同一份在該時點有效的快照。區域進度取自 Data 登入回覆的旗標和通關數。[任務清單原始格式](../../app/client/src/net/command/DataCommand.as#L426) · [重跑方式](../../web-client/README.md)

以 390 CSS 像素寬、裝置像素比 2 的 Chromium 視窗再次登入，仍可完整讀取任務列與 0/3 進度，頁面寬度維持在視窗內。[窄視窗截圖](native/08-native-quest-mobile.png)

另用 Chromium 登入隔離 Ruby，以鍵盤展開「落日大蝙蝠」，逐字核對魔女山谷說明、任務敘述與「寬廣高原1」的名稱及描述。任務文字取自 `tcn/Quests.csv` 的 `name` 和 `caption`，地圖與地形使用原始資料表的 `name_tcn` 和 `caption_tcn`。桌面和 320 CSS 像素、DPR 2 的畫面都能讀到完整文字。重新讀取及展開時，未觀察到新增的 Ruby 訊息或 SQLite 資料變更。登出或大廳斷線後，延遲的文字回覆不會留在頁面。[原始任務](../../app/server/data/csv/tcn/Quests.csv) · [原始地圖](../../app/server/data/csv/ja/QuestMaps.csv) · [原始地形](../../app/server/data/csv/ja/QuestLands.csv) · [桌面實測](native/26-native-quest-details.png) · [320 像素實測](native/27-native-quest-details-mobile.png)

「讀取任務資料」提供唯讀資料核對。原版首場 PvE 的地形缺字修正有獨立的前後畫面，完整遊玩流程可在原版相容入口驗收。[地形修正前](browser/30-browser-land-font-before.png) · [地形修正後](browser/31-browser-land-font-after.png) · [原版首場 PvE](#首場-pve-結算)

### 開始搜尋

按「開始搜尋」時，原生頁面把登入旗標加一所得的當前普通區域，以及原版 3 分鐘設定的索引 `1`，送給 Quest 命令 `5`。地圖名稱及行動力成本取自原版資料表，由 Ruby 判定能否搜尋。頁面收到新增的搜尋紀錄 `6` 與行動力更新 `4` 後才顯示已開始。新紀錄用 Ruby 回覆的搜尋係數算出整秒時長，從收到回覆時估算剩餘時間。從 Data 登入資料恢復的倒數保留原本的一秒截斷餘裕。[原版命令](../../app/client/src/net/command/QuestCommand.as#L200) · [原版行動力與持有上限](../../app/server/src/model/avatar.rb#L2798) · [原版時間設定](../../app/server/src/model/avatar_quest_inventory.rb#L109)

隔離 Ruby 的魔女山谷測例以 5% 搜尋係數實際等待 9 秒，行動力由 5 降為 4，只新增一筆搜尋中紀錄。跨過真實截止後按「確認搜尋結果」，SQLite 狀態由 `4` 轉為 `0`，320 CSS 像素、DPR 2 的畫面顯示原始繁中關卡及地形說明。另在獨立測例中攔下 Ruby 已送出的搜尋紀錄與行動力回覆，同一次登入的重讀與再次操作都沒有送出第二筆搜尋。重新登入從 Data 取回同一筆搜尋中任務與已扣除的行動力。[桌面開始搜尋](native/36-native-quest-search-started.png) · [320 像素確認結果](native/37-native-quest-search-confirmed-mobile.png)

### 搜尋中任務的預估倒數

原版 Ruby 把搜尋中的剩餘時間換成向零截斷的相對整秒，隨 Data 登入回覆送出。原生頁面在收到完整回覆時用瀏覽器單調時鐘記下起點。非負秒數加一秒，涵蓋原本截去的不到一秒。負值直接顯示「預估已到期，待伺服器確認」。原版 Quest 的完成檢查 `17` 可寫入狀態，原生倒數只更新畫面，以登入快照為準。獨立的 Rust 搜尋示範由自身服務提供截止時間和已確認的結果。[原版整秒欄位](../../app/server/src/model/avatar.rb#L757) · [原版完成檢查](../../app/server/src/model/avatar_quest_inventory.rb#L120) · [Rust 搜尋示範](../../web-client/README.md#原生搜尋倒數示範)

Chromium 使用隔離 Ruby 的真實 Data 回覆，取得任務 ID `0`、狀態 `4` 及 1149 秒。以瀏覽器受控時間驗證登入後延遲讀取、重讀、分頁隱藏後再顯示，以及 320 CSS 像素、DPR 2 的估計到期畫面。當估計到期時，畫面仍為任務 ID `0`、狀態 `4`。快照顯示期間未新增 Ruby 命令，SQLite 中的任務與截止時間維持一致。登出及 Data 連線中斷都會清除畫面。[桌面倒數](native/32-native-quest-countdown.png) · [320 像素預估到期](native/33-native-quest-countdown-elapsed-mobile.png)

### 確認搜尋結果

按「確認搜尋結果」才建立原版 Quest 連線。服務尚未重送該筆已發現的任務時，原生頁面沿用原版命令 `17`，送出持有紀錄 ID，並檢查對應的任務狀態回覆。Ruby 以原版的嚴格時間條件判斷到期，寫入時同時核對持有人、待定狀態、截止時間和任務 ID。伺服器確認後，頁面更新該筆紀錄並讀取既有的繁中關卡及地形說明。[原版指令](../../app/client/src/net/command/QuestCommand.as#L316) · [狀態回覆](../../app/server/src/protocol/command/questcommand.rb#L466) · [Ruby 到期檢查](../../app/server/src/model/avatar_quest_inventory.rb#L119)

Chromium 以 320 CSS 像素、DPR 2 連到隔離 Ruby，先用受控瀏覽器時鐘讓按鈕在實際截止前約 4.2 秒出現。當時 Ruby 保留狀態 `4`，頁面顯示尚未確認。同一筆任務跨過真實截止後重試，原版回覆及 SQLite 都顯示狀態 `0`。畫面可讀到「落日大蝙蝠」與完整繁中說明，行動力、通關及獎勵資料維持一致。驗收也延遲真實回覆，確認重試可透過原版 Quest 登入補送取回結果，登出則會清除畫面並忽略延遲回覆。[尚未確認](native/34-native-quest-confirm-unconfirmed.png) · [確認後的繁中關卡資料](native/35-native-quest-confirm-discovered.png)

### 開始任務

原生頁面從 Data 登入資料列出第一格有角色卡且可用的牌組。按「開始任務」以原版 Quest 命令 `13` 送出任務持有紀錄 ID 及所選牌組索引。Ruby 以該任務的行動力成本驗證請求，先送出行動力回覆 `4`，再以狀態回覆 `17` 確認任務開始，並將該牌組標記為使用中。這一階段的驗收範圍到任務進行中，下一地形仍待接通。[原版開始命令](../../app/client/src/net/command/QuestCommand.as#L276) · [原版查核及寫入](../../app/server/src/model/avatar.rb#L3096)

在桌面 Chromium 開始「落日大蝙蝠」，並以 320 CSS 像素、DPR 2 重驗鍵盤操作。原版 Ruby 回覆狀態 `2`，SQLite 顯示使用牌組 `1`，行動力、通關及獎勵資料維持一致。關閉 Quest 連線與登出後仍可在資料庫看到該狀態。重新登入觸發原版 Data 清理，將任務標記為狀態 `5`、從角色清單移除並釋放牌組。[桌面實測](native/38-native-quest-entry-desktop.png) · [原版重新登入流程](../../app/server/src/controller/data_controller.rb#L227) · [任務清理](../../app/server/src/model/avatar.rb#L3455)

另一個隔離測例選牌組 `2` 開始「大蝙蝠之群」。Ruby 從 4 點扣到 3 點行動力，SQLite 確認僅牌組 `2` 進入使用中，另一筆任務及通關與獎勵資料維持原值。[320 像素實測](native/39-native-quest-entry-mobile.png)

另用隔離測例攔下 Ruby 的狀態回覆 `17`。同一次登入重讀後仍保留未確認提示，整段過程只送出一次開始指令。原版 Quest 的唯讀清單仍可核對到狀態 `2`，資料庫也只扣除一次行動力。重新登入觸發相同的原版清理流程。

### 區域地圖查詢

在 Chromium 用隔離 Ruby 帳號登入後，按「讀取區域地圖」才開啟 Quest 連線。瀏覽器依序送出交握 `0`、驗證 `1`、查詢區域 0 的 `6`，以及查詢結束後的 Quest 登出 `2`。原版 Quest 登入同時重送卡牌總數及未處於待定狀態的任務。回覆 `14` 含區域與地圖 ID，實測順序與 SQLite 的 44 筆區域 0 資料一致，包含 `201`、`1000` 和 `3011` 等 ID。清單取自區域索引，角色開放進度仍以登入快照為準。[原版封包](../../app/client/src/net/command/QuestCommand.as#L157) · [Quest 登入](../../app/server/src/controller/quest_controller.rb#L515) · [區域索引](../../app/server/src/model/quest_map.rb#L139)

桌面及 320 CSS 像素、DPR 2 的頁面都能讀到完整清單。查詢前後的任務庫存、進度、行動力及獎勵資料一致。等待回覆時中斷 Quest 連線，原本的登入工作階段可繼續使用，同一按鈕可重試。另驗證登出會清除查詢，延遲抵達的回覆不會重新顯示清單。[桌面實測](native/28-native-quest-region.png) · [320 像素實測](native/29-native-quest-region-mobile.png) · [操作方式](../../web-client/README.md#啟動)

### 任務服務清單

Chromium 登入隔離 Ruby 後，按「讀取任務服務清單」才開啟 Quest 連線，依序送出 `0`、`1`、`3`、`2`。原版 Quest 登入先重送卡牌總數及任務紀錄，略過待定狀態 `4`。原生頁面讀取收到的 `6`，以同一連線的 KeepAlive `3` 作為重送結束的標記。實際取得的持有紀錄 ID `1`、任務 ID `1`、狀態 `0` 均與 SQLite 相符。原生解析會略過贈送者欄位，畫面只顯示三個數字欄位。[原版登入](../../app/server/src/controller/quest_controller.rb#L515) · [重送條件](../../app/server/src/model/avatar.rb#L2653) · [KeepAlive](../../app/server/src/protocol/ulserver.rb#L235)

桌面和 320 CSS 像素、DPR 2 都顯示完整紀錄。延遲實際 KeepAlive 回覆時，頁面保持讀取中。Quest 連線中斷或逾時後仍可用同一登入重試，登出後延遲回覆不會重現紀錄。查詢前後的任務、行動力及獎勵資料一致。另以瀏覽器控制回覆驗證空清單、略過待定紀錄和贈送者欄位的處理。[桌面實測](native/30-native-quest-service-inventory.png) · [320 像素實測](native/31-native-quest-service-inventory-mobile.png) · [操作方式](../../web-client/README.md#啟動)

## 原生對局紀錄回放

用原版 Ruby 重跑固定種子 `2026`，輸出的 68 筆事件與保存的基準逐位元組相同。原生對局紀錄頁由同源讀取該基準。Chromium 用鍵盤逐筆核對回合、階段、HP、各次抽牌數及原始事件 JSON。tick 0 有四筆紀錄，依輸出順序完整保留。第四回合在模擬時間 92.1 秒結算，玩家勝利，雙方 HP 為 5／0。[原版 Ruby 紀錄](../../tools/legacy-server/fixtures/trace-2026.json) · [抽牌截圖](native/11-native-replay-event.png) · [結算截圖](native/12-native-replay-finished.png)

瀏覽器驗證了播放、暫停、前後跳轉、結算時停止及重新播放。390 CSS 像素寬的視窗遇到 HTTP 503 或無效的紀錄資料時可重試。本次回放只讀取同源檔案，未啟動對局服務。[重跑方式](../../web-client/README.md#原版對局紀錄回放)

Chromium 156 在獨立的 4358 入口讀取同一份基準，驗證自動播放依序到達全部 68 筆事件，結算仍為 5／0。每筆進度條在 600 毫秒內推進，暫停接續保留當筆進度，手動定位會重設。測試用受控時鐘驗證停頓後只前進一筆，並模擬分頁隱藏及 `pagehide` 確認返回後仍為暫停。減少動態效果時以 200 毫秒為單位更新。使用正常瀏覽器時鐘，在 1120 和 320 CSS 像素畫面都觀察到第二筆抽牌事件的進度在兩次取樣間增加。流量限於同源的頁面、靜態檔和基準 JSON。[桌面播放中](native/21-native-replay-playback.png) · [320 像素播放中](native/22-native-replay-playback-mobile.png)

## 原始 SWF 元件

獨立播放標題背景、換角面板與戰鬥階段元件，確認可載入並繪製。這三個檔案的遊戲內操作和聲音由主客戶端另外觸發。

[標題背景](asset-preview/01-title.jpg) · [換角面板](asset-preview/02-character-panel.jpg) · [戰鬥階段](asset-preview/03-battle-phase.jpg)

《Unlight》原作與遊戲美術為 CPA。截圖用於記錄相容性驗收。所用素材的來源標示 CC BY-ND 4.0。[原版程式碼](https://github.com/freejerry/Unlight) · [素材來源](https://github.com/kashi29/Unlight-Images/tree/0ec2d2ffb0e294e46cd0edfb84c9778e3dd4ed0e) · [素材授權](https://creativecommons.org/licenses/by-nd/4.0/)
