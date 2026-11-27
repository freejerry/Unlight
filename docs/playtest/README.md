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

### 原生入口版面

原生首頁先顯示登入表單。登入後可展開「最新消息」，頂部可跳往下方的「連線診斷」及獨立的「對局紀錄」。Chromium 連到隔離 Ruby，在同一頁切換 1120、390 和 320 CSS 像素寬度，確認表單標題與欄位有間距，消息標題高度維持約 46 CSS 像素。以鍵盤登入後，使用 `Home`／`End` 捲動公告，核對繁中測例的字形、拉丁重音字元和末行。另以庫內日文原檔實測，確認同源回應逐位元組相同並可讀到末尾。窄視窗公告截圖已遮蔽測試角色名稱。[桌面登入](native/56-native-ui-login-desktop.png) · [320 像素登入](native/57-native-ui-login-mobile.png) · [320 像素繁中公告測例](native/58-native-ui-news-mobile.png) · [原始日文公告](../../app/client/public/news.xml.orig) · [啟動方式](../../web-client/README.md#啟動)

登入及消息區塊使用 CSS 排版。「連線診斷」另使用原始面板圖測試 WebGL 2 九宮格。以 Chromium 的 SwiftShader 軟體圖形環境確認 46 次縮放各提交一次批次，核對 DPR 1、1.25 和 2 的圖像分界，並驗證圖形環境中斷後由 Canvas 2D 重繪。這組結果的量測範圍是面板繪製，遊玩動畫與裝置效能另行驗收。[九宮格縮放與備援](#原生九宮格連續縮放) · [既有縮放畫面](native/14-native-panel-resize.png)

## 原生瀏覽器任務快照

用 Chromium 連到隔離 Ruby，核對三種測試帳號。新角色顯示一筆「落日大蝙蝠」，任務 ID 1、狀態 0，魔女山谷進度為 0/3。先前在原版客戶端完成首場 PvE 的帳號顯示空清單與 1/3。兩個帳號的任務清單上限均為 4。未創角帳號顯示原版的建立角色資料。[新任務截圖](native/06-native-quest-ready.png) · [已通關截圖](native/07-native-quest-cleared.png)

點擊讀取時，驗收確認既有 Ruby 連線的送出訊息數量未增加，清單、通關紀錄及獎勵欄位均與讀取前一致。名稱及通關門檻來自原始繁中資料。登出會清空畫面，重新登入取得同一份在該時點有效的快照。區域進度取自 Data 登入回覆的旗標和通關數。[任務清單原始格式](../../app/client/src/net/command/DataCommand.as#L426) · [重跑方式](../../web-client/README.md)

以 390 CSS 像素寬、裝置像素比 2 的 Chromium 視窗再次登入，仍可完整讀取任務列與 0/3 進度，頁面寬度維持在視窗內。[窄視窗截圖](native/08-native-quest-mobile.png)

另用 Chromium 登入隔離 Ruby，以鍵盤展開「落日大蝙蝠」，逐字核對魔女山谷說明、任務敘述與「寬廣高原1」的名稱及描述。任務文字取自 `tcn/Quests.csv` 的 `name` 和 `caption`，地圖與地形使用原始資料表的 `name_tcn` 和 `caption_tcn`。桌面和 320 CSS 像素、DPR 2 的畫面都能讀到完整文字。重新讀取及展開時，未觀察到新增的 Ruby 訊息或 SQLite 資料變更。登出或大廳斷線後，延遲的文字回覆不會留在頁面。[原始任務](../../app/server/data/csv/tcn/Quests.csv) · [原始地圖](../../app/server/data/csv/ja/QuestMaps.csv) · [原始地形](../../app/server/data/csv/ja/QuestLands.csv) · [桌面實測](native/26-native-quest-details.png) · [320 像素實測](native/27-native-quest-details-mobile.png)

「讀取任務資料」提供唯讀資料核對。原版首場 PvE 的地形缺字修正有獨立的前後畫面，完整遊玩流程可在原版相容入口驗收。[地形修正前](browser/30-browser-land-font-before.png) · [地形修正後](browser/31-browser-land-font-after.png) · [原版首場 PvE](#首場-pve-結算)

### 原生任務版面

任務頁上方顯示原版繁中區域名稱、通關進度、行動力及搜尋操作。「我的任務」卡片呈現任務名稱、狀態與可執行的操作，原版數值收在卡片的「原版資料」。展開「原版資料與服務」可主動讀取區域 0 的原版地圖 ID 或任務服務清單。區域 0 查詢的 44 筆 ID 保留原版回傳順序，目前區域和通關數取自角色的任務進度。[原版區域索引](../../app/server/src/model/quest_map.rb#L139) · [區域查詢驗收](#區域地圖查詢)

搜尋使用原版 3 分鐘設定。隔離測例採用原版 5% 搜尋係數，對應 9 秒。頁面以 Ruby 的回覆更新行動力及搜尋狀態，到期後仍由玩家按「確認搜尋結果」，等原版回覆才更新任務卡片。[原版搜尋時間](../../app/server/src/model/avatar_quest_inventory.rb#L109)

以 Chromium 連到隔離 Ruby，在 1120、650、390 和 320 CSS 像素寬度核對任務版面。桌面畫面顯示魔女山谷進度 0／3、行動力 4／5 及「落日大蝙蝠」卡片。以 320 像素畫面從鍵盤開始任務，進入首格並抵達可開始第一回合的戰鬥開場。展開「原版資料與服務」時沒有新增查詢，按「讀取區域地圖」才查詢原版服務，收到依原順序排列的 44 筆 ID。查詢前後的 SQLite 資料一致。[桌面任務版面](native/74-native-quest-workspace-desktop.png)

窄版測例以原版模型將隔離角色的進度旗標設為 `8`，以固定種子 `1` 取得任務 `178`。320 CSS 像素、DPR 2 的畫面可讀到食人鬼村的完整繁中說明、進度 0／22、行動力 1／5 及「潛伏在叢林裏的殺人鬼1」的完整名稱。原版資料顯示搜尋和該任務的開始成本均為 3 點行動力。透過鍵盤開始另一張「落日大蝙蝠」卡片並進入地形後，任務 `178` 的持有紀錄與狀態仍一致。[320 像素任務版面](native/75-native-quest-workspace-mobile.png) · [原版任務](../../app/server/data/csv/tcn/Quests.csv#L179) · [原版地圖](../../app/server/data/csv/ja/QuestMaps.csv#L10)

另在 320 CSS 像素畫面用原版 5% 搜尋係數測試。Ruby 保存的開始與截止時間相隔 9 秒，並只扣除 1 點行動力。到期前卡片的原版任務 ID 為 `0`。倒數到期後等待使用者確認，期間沒有開啟新的 Quest 連線。以鍵盤按「確認搜尋結果」後，同一張卡片更新為「落日大蝙蝠」，焦點保留在卡片內，既有的另一張任務卡片維持原值。

獨立的 320 CSS 像素、DPR 2 測例使用原版 100% 搜尋係數，實際等待完整 180 秒。原版只扣 1 點行動力，由 4 降至 3。倒數歸零及重讀原有資料後，任務仍為搜尋中、原版任務 ID 仍為 `0`，期間未額外送出 Quest 命令。以鍵盤確認後暫緩交付原版 `17`，畫面繼續顯示搜尋中。收到回覆才在同一卡片顯示「落日大蝙蝠」及「新任務」，焦點移到確認結果。登出後，延遲抵達的地圖資料未重新顯示。[320 像素開始搜尋](native/76-native-quest-search-started-mobile.png) · [320 像素確認搜尋結果](native/77-native-quest-search-confirmed-mobile.png)

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

原生頁面從 Data 登入資料列出第一格有角色卡且可用的牌組。按「開始任務」以原版 Quest 命令 `13` 送出任務持有紀錄 ID 及所選牌組索引。Ruby 以該任務的行動力成本驗證請求，先送出行動力回覆 `4`，再以狀態回覆 `17` 確認任務開始，並將該牌組標記為使用中。[原版開始命令](../../app/client/src/net/command/QuestCommand.as#L276) · [原版查核及寫入](../../app/server/src/model/avatar.rb#L3096)

在桌面 Chromium 開始「落日大蝙蝠」，並以 320 CSS 像素、DPR 2 重驗鍵盤操作。原版 Ruby 回覆狀態 `2`，SQLite 顯示使用牌組 `1`，行動力、通關及獎勵資料維持一致。關閉 Quest 連線與登出後仍可在資料庫看到該狀態。重新登入觸發原版 Data 清理，將任務標記為狀態 `5`、從角色清單移除並釋放牌組。[桌面實測](native/38-native-quest-entry-desktop.png) · [原版重新登入流程](../../app/server/src/controller/data_controller.rb#L227) · [任務清理](../../app/server/src/model/avatar.rb#L3455)

另一個隔離測例選牌組 `2` 開始「大蝙蝠之群」。Ruby 從 4 點扣到 3 點行動力，SQLite 確認僅牌組 `2` 進入使用中，另一筆任務及通關與獎勵資料維持原值。[320 像素實測](native/39-native-quest-entry-mobile.png)

另用隔離測例攔下 Ruby 的狀態回覆 `17`。同一次登入重讀後仍保留未確認提示，整段過程只送出一次開始指令。原版 Quest 的唯讀清單仍可核對到狀態 `2`，資料庫也只扣除一次行動力。重新登入觸發相同的原版清理流程。

### 進入首格地形

第一格的位置取自原版任務表第一欄。首格是戰鬥地形時，頁面以該格的原始繁中說明及敵方資料提供「進入首格地形」。按下後以原版 Quest 命令 `16` 送出持有紀錄 ID、牌組索引與地形位置。收到移動回覆 `128`、戰鬥資料 `37` 和戰鬥開場 `40` 後，才顯示戰鬥開場。[原版首格位置](../../app/client/src/model/Quest.as#L241) · [原版下一地形與戰鬥流程](../../app/server/src/controller/quest_controller.rb#L116)

以桌面及 320 CSS 像素、DPR 2 的 Chromium 驗收「落日大蝙蝠」。Ruby 確認位置 `1` 和戰場 `11`，畫面依原版地形表顯示地形 `201` 的「寬廣高原1」及完整繁中描述。戰鬥開場回覆的行動牌張數為 52、雙方事件牌組各 18 張、初始距離代碼為 `2`。Quest 連線保持開啟，頁面仍可重讀快照。登出關閉五條連線，SQLite 的任務進度和獎勵維持原值。[桌面實測](native/40-native-quest-first-land-desktop.png) · [320 像素實測](native/41-native-quest-first-land-mobile.png) · [原版登出清理](../../app/server/src/controller/quest_controller.rb#L531)

另用 Chromium 攔下 Ruby 的戰鬥開場回覆 `40`。約 8 秒後頁面顯示未確認，保持原本的 Quest 連線，仍可重讀快照。整段測試只送出一次進入地形，登出時由原版 Quest 登出指令 `2` 清理對局，五條連線均關閉。

### 由無戰鬥地形進入戰鬥

原版資料中，普通地圖 1 至 35 有 19 筆任務的首格同時沒有敵人、寶箱或事件，且有原始路徑直接通往戰鬥地形。進入這類首格，頁面等原版回覆 `128` 確認位置、`19` 確認該筆任務進度，並核對同一條 Quest 連線的 KeepAlive 回覆後，才開放下一格。進入戰鬥地形後，使用原版 `37` 與 `40` 的陣容、損傷及開場資料。[原版無戰鬥地形流程](../../app/server/src/controller/quest_controller.rb#L204) · [原版地形進度](../../app/server/src/model/avatar.rb#L3216)

「山丘矮人」的原始路徑從欄位 `1` 的「森林小道」（地形 `5`）通往欄位 `4` 的「通往集落之路1」（地形 `101`）。隔離測試帳號保留起始任務，透過原版 Ruby 模型開啟隱者之道，以固定種子 `22` 取得「山丘矮人」，再用原版模型為首位角色設定 1 點既有損傷。取得任務消耗 1 點行動力，取得後剩 3 點。開始任務的原始成本為 0，進入地形沿用已開始的任務與牌組。[原始任務](../../app/server/data/csv/tcn/Quests.csv#L5) · [森林小道](../../app/server/data/csv/ja/QuestLands.csv#L6) · [通往集落之路1](../../app/server/data/csv/ja/QuestLands.csv#L74) · [原版任務取得](../../app/server/src/model/avatar.rb#L2798)

以 1120 及 320 CSS 像素、DPR 2 的 Chromium 連到隔離 Ruby。先後暫緩交付首格的進度回覆 `19` 和 KeepAlive 回覆，兩筆都收到後才開放欄位 `4`。原版確認通過森林小道，地形進度為 `2`。SQLite 確認行動力仍為 3，任務及牌組保持原有狀態，角色既有損傷維持 1。[桌面森林小道](native/66-native-empty-terrain-desktop.png)

進入欄位 `4` 時沿用同一條 Quest 連線。原版回覆敵方角色卡 `1001`、我方損傷 `[1, 0, 0]` 及戰場 `2`。整段只在第二格送出一次戰鬥就緒。另一次 320 CSS 像素的完整通關實測中，獲勝後原版回傳地形進度 `18`、移出現有任務並釋放牌組。隱者之道通關數更新為 `1`，SQLite 保存一筆對應的通關紀錄。同一次登入可返回清單。[320 像素戰鬥開場](native/67-native-empty-to-encounter-mobile.png)

另一次以瀏覽器保留原版 `19` 直到逾時，頁面維持下一格及戰鬥就緒鎖定。瀏覽器只送一次進入請求，也未在這段等待中送出確認用 KeepAlive。登出關閉五條連線，之後交付原版回覆仍維持登出。SQLite 保留原版已寫入的地形進度 `2`。

### 固定 Gem 寶箱

普通地圖 1 至 35 的原版資料中，53 筆任務的無戰鬥首格有固定 Gem 寶箱，其中 19 筆直接連至戰鬥地形。進入這類首格時，原版先以 `128` 確認抵達、以 `19` 更新該筆任務的地形進度。隨後的 `10` 用 32 位元有號整數傳送入帳後的 Gem 餘額，`25` 傳送寶箱內容。頁面等齊這些回覆及同一條 Quest 連線的 KeepAlive 回覆，才顯示獎勵並開放下一格。原版用地形進度位元避免同一筆任務的同一格重複發放獎勵。[原版領取流程](../../app/server/src/model/avatar.rb#L3216) · [原版 Gem 餘額格式](../../app/client/src/net/command/QuestCommand.as#L649) · [寶箱回覆格式](../../app/server/src/protocol/command/questcommand.rb#L533)

「紫色泥沼澤2」的首格為「寂靜之丘」（欄位 `1`、地形 `10`），固定寶箱 `50001` 的內容為 30 Gem。原始路徑直接通往欄位 `3` 及 `5` 的兩個戰鬥地形。隔離測試帳號保留起始任務並以原版 Ruby 模型開啟黑森林，使用固定種子 `106` 取得任務 `32`，另設定首位角色有 1 點既有損傷。取得任務消耗 1 點行動力、取得後剩 3 點。開始任務的原始成本也是 1 點。[原始任務](../../app/server/data/csv/tcn/Quests.csv#L33) · [原始地形](../../app/server/data/csv/ja/QuestLands.csv#L11) · [原始寶箱](../../app/server/data/csv/ja/TreasureDatas.csv#L989) · [原版任務取得](../../app/server/src/model/avatar.rb#L2798)

兩組獨立實測以 1120 或 320 CSS 像素、DPR 2 的 Chromium 連到隔離 Ruby。開始任務時收到行動力由 3 降至 2 的原版回覆。原版登入流程先入帳 3000 Gem，進入首格前 SQLite 已有 3100 Gem，畫面仍顯示初始資料的 100。先後延遲 `25` 和 KeepAlive 回覆期間，畫面維持原值並鎖定下一格。原版完整回覆後，頁面顯示寶箱所得 30 Gem 和餘額 3130，與 SQLite 相符，地形進度更新為 `2`。[桌面寶箱與選路](native/68-native-fixed-gem-chest-desktop.png)

收到確認後，頁面列出原版兩個相連的戰鬥地形。選擇欄位 `5` 的「通往集落之路1」，沿用同一條 Quest 連線，行動力維持 2。原版回傳地形 `104` 的戰鬥開場，敵方角色卡為 `1001`，我方保留損傷 `[1, 0, 0]`。這段驗收涵蓋寶箱、選路、下一場開場及第一次補牌。[320 像素戰鬥開場](native/69-native-gem-to-encounter-mobile.png)

另以瀏覽器暫緩交付真實寶箱回覆 `25` 直到逾時。SQLite 已保存一次 30 Gem 和地形進度，頁面保留上次餘額並鎖定下一格。整段只送一次進入請求，等待期間未送出確認用 KeepAlive。登出關閉五條連線，之後交付原版回覆也沒有恢復操作。

### 第一回合補牌與移動

按「開始第一回合」在保留的 Quest 連線送出就緒 `22`。收到回合、補牌及移動階段開始回覆 `43–46` 後，以原順序顯示我方本次補入的牌張 ID 和朝向，以及對手兩類補牌張數。頁面依實際牌張 ID 查詢同源 `/api/action-card-catalog`，顯示該朝向的原版基本類型及數值，讀取失敗時仍可查看 ID 與朝向。目錄逐筆核對原版繁中卡牌表的 3,630 筆資料。[原版補牌送出方式](../../app/server/src/controller/duel_controller.rb#L452) · [原版繁中卡牌表](../../app/server/data/csv/tcn/ActionCards.csv)

原版方向命令 `23` 由回覆 `60` 確認。送出不出牌的移動時，命令 `26` 的兩個參數都留空。頁面按原版 120 秒移動階段等待，保留額外的結果接收時間。回覆 `47` 關閉移動輸入，收到 `48` 後才顯示移動後的距離與先攻方。無法確認時保留已讀資料並阻止重送。Quest 仍在線時沿用同一條連線。[移動階段規則](../../app/server/src/rule/event/multi_duel_event.rb#L105) · [原版移動回覆](../../app/server/src/controller/duel_controller.rb#L489)

Chromium 以隔離 Ruby 驗收「落日大蝙蝠」。桌面截圖記錄補牌與移動階段。320 CSS 像素、DPR 2 的實測先核對我方補入的五張行動卡和一張事件卡及其朝向與牌面，再確認「原地待機」並送出一次不出牌的移動。原版回覆距離由 `2` 變為 `1`，對手先攻。另以鍵盤驗證可直接送出不出牌的移動。Quest 沿用同一條連線，登出關閉五條連線。SQLite 任務、牌組與獎勵資料維持原值。[桌面補牌](native/42-native-quest-first-turn-desktop.png) · [320 像素移動結果](native/43-native-quest-first-move-mobile.png)

一次真實移動回覆在送出後 8.574 秒才抵達，超過原先通用請求的 8 秒。移動提交的等待時間因此依原版階段調整，並在收到 `47` 後等待結果回覆。另以 Chromium 攔下原版移動結果 `48`，確認頁面顯示未確認，選擇和送出控制維持停用。瀏覽器沿用同一條 Quest 連線，未重送移動。登出關閉五條連線，延遲交付的原版結果不會重新顯示，SQLite 資料維持原值。

### 第一回合移動選牌

從手牌選好行動卡的上半面或下半面，按「加入移動區」送出原版 Quest 命令 `24`，參數含牌張 ID、該張在合併手牌中的位置和朝向。「退回手牌」用命令 `25` 送出牌張 ID 及移動區位置。頁面在收到對應的 `61` 或 `62` 確認後才搬動牌張，退回時保留朝向並排到手牌末尾。按「送出移動」時仍送出原版 `26` 的兩個空字串，由 Ruby 依移動區內的牌結算。頁面以 `48` 顯示實際使用的牌張、朝向和雙方移動數值。[原版封包](../../app/client/src/net/command/QuestCommand.as#L379) · [原版牌序](../../app/client/src/model/Entrant.as#L527) · [Ruby 選牌與退牌](../../app/server/src/rule/entrant.rb#L424)

以 1120 及 320 CSS 像素寬、DPR 2 的 Chromium 連到隔離 Ruby。在「落日大蝙蝠」確認「後退」後，依序加入、退回及重新加入行動卡的下半面。三次原版操作的位置依序為手牌 `2`、移動區 `0` 和合併手牌 `5`。延遲交付真實確認期間，畫面維持原有牌序。桌面實測使用牌張 `45`，雙方移動數值為 2／0。320 像素的測例使用牌張 `54`，雙方移動數值為 1／1。兩次原版結果皆為距離 `3`、我方先攻。[桌面已選移動卡](native/44-native-quest-move-card-desktop.png) · [320 像素移動結果](native/45-native-quest-move-card-mobile.png)

另以 320 CSS 像素、DPR 2 用鍵盤選擇與補牌時相反的牌面，依序加入、退回及再加入後直接送出移動，核對原版封包位置、朝向和結果。整個過程沿用同一條 Quest 連線。登出關閉五條連線，SQLite 的任務、牌組、通關和獎勵資料維持原值。

在兩個獨立測例中，Chromium 分別攔下 Ruby 的加入回覆 `61` 和退回回覆 `62`。畫面保留上次確認的手牌與移動區，顯示結果未確認，停用移動操作並且沒有重送。Quest 保持同一條連線直到登出。登出關閉五條連線後，再交付原版回覆也不會重新顯示牌張。SQLite 資料維持原值。

### 移動版面與轉場

「對戰」集中呈現回合、手牌、方向與移動結果。原版 `43–46` 開啟移動後，剛補入的牌會做短暫轉場。加入和退回牌的轉場分別等 `61`、`62`，結果以 `48` 的距離、先攻方、移動點數和牌面呈現。啟用「減少動態效果」時直接顯示同一份確認資料。這裡驗收瀏覽器中的移動操作和轉場，原版標題及九宮格效能另有量測。[原版移動結果](../../app/server/src/controller/duel_controller.rb#L488) · [標題動畫取樣](#標題動畫取樣) · [九宮格批次繪製](#原生九宮格批次繪製)

以 Chromium 156 和 ANGLE SwiftShader 連到隔離 Ruby，在同一頁以 DPR 2 確認 1120 CSS 像素版面並排，390 和 320 像素改為上下排列。桌面實測依序加入、退回並再次加入原版行動卡 `58` 的下半面。測試暫緩交付真實回覆時，牌張與移動區維持上次狀態。每次回覆交付後更新畫面並觸發一次 160 毫秒轉場。原版 `48` 確認距離 3、我方移動點數 3，再由原版 `51` 開啟攻擊。[桌面對戰](native/60-native-movement-board-desktop.png) · [桌面移動結果](native/62-native-movement-result-desktop.png)

在 320 CSS 像素、DPR 2 啟用「減少動態效果」，以原版補入的事件卡 `461` 上半面完成同樣流程。每次確認後直接更新牌區，沒有啟動轉場。原版結算顯示距離 1、我方移動點數 0，接著進入防禦。兩次試玩均沿用原版 Quest 連線，登出關閉五條連線，所查的 SQLite 資料維持原值。[320 像素已選事件卡](native/61-native-movement-board-mobile.png)

Chromium 在暫緩回覆時擷取移動區的三筆合成樣本，該區像素一致。交付回覆後擷取到五筆不同畫面。這組樣本用於確認畫面何時開始變化，目標裝置的動畫流暢度仍待驗收。

### 原生對戰版面

地形名稱與說明置於「對戰」上方，「開始第一回合」在開場後即可操作。持有紀錄 ID、地形 ID、格位、原始陣容及牌組張數放在預設收合的「原版伺服器資料」。攻擊和防禦用標題與底色區分，按原版 `51`、`53` 回覆開放當前操作。[對戰版面](../../web-client/index.html) · [原版攻擊階段](../../app/client/src/net/command/QuestCommand.as#L1161) · [原版防禦階段](../../app/client/src/net/command/QuestCommand.as#L1195)

公開牌張、骰面與傷害依原版各自回覆顯示。原版 `56` 抵達後才顯示實際骰面，轉場只改變已顯示內容的位置與透明度。啟用「減少動態效果」時直接顯示確認的資料，沿用同一套等待與結算時序。[原版骰面欄位](../../app/client/src/net/command/QuestCommand.as#L1255) · [原版傷害回覆](../../app/client/src/net/command/QuestCommand.as#L1447)

Chromium 連到隔離 Ruby 驗收「落日大蝙蝠」。320 CSS 像素畫面先呈現「開始第一回合」，原版欄位留在下方收合區。桌面以鍵盤在原版防禦階段選擇卡 `1` 的下半面，確認後才公開牌張。「上一段攻防」顯示原版第一段攻防回覆中的 13 顆骰子。整段沿用同一條 Quest 連線，完成後登出。[320 像素戰鬥開場](native/70-native-battle-opening-mobile.png) · [桌面我方防禦](native/71-native-battle-defense-desktop.png)

另一組桌面實測中，原版已公開選牌，延遲交付 `56` 期間只顯示牌張。交付後才顯示攻擊方 19 個及防禦方 8 個骰面值，保留原版的 `0`。原版隨後回覆對手受 1 點傷害。戰鬥結果與任務結算分別等到 `41`、`24` 才顯示。SQLite 核對結算後有 112 Gem、25 Exp、等級 2 和 1 次區域通關，頁面可返回任務清單。[320 像素任務結算](native/73-native-battle-settlement-mobile.png)

另以 320 CSS 像素啟用「減少動態效果」。延遲骰面回覆時畫面維持等待，收到後直接顯示原版骰面。獨立的窄版防禦截圖記錄攻擊方 12 個及防禦方 7 個原版骰面值，以及我方受到 3 點傷害。Chromium 在 1120、390、320 CSS 像素寬度驗證操作可見且可達。[320 像素骰面與傷害](native/72-native-battle-dice-mobile.png)

### 無特殊效果的事件卡

原版從同一個手牌順序計算行動卡及事件卡的封包位置。頁面在事件卡欄開放原版補牌送出的三種一般事件牌「劍1卡」、「槍1卡」和「防禦1卡」。這些牌在原始資料標為 `filler=1`，對應的牌張沒有額外事件效果，仍由 Ruby 依階段及牌面計算數值。加入或退回後等原版確認才更新，退回時保留所選牌面並附加至手牌末尾。[原版事件卡表](../../app/server/data/csv/ja/EventCards.csv) · [原版牌張對應方式](../../app/server/src/model/action_card.rb#L352) · [原版合併手牌](../../app/client/src/model/Entrant.as#L178)

在隔離 Ruby 的「落日大蝙蝠」實測，Chromium 分別使用原版補入的事件牌 `462` 和 `61` 依序加入移動區、退回手牌、再加入。原版位置依序為合併手牌 `5`、移動區 `0` 和合併手牌 `5`。原版移動結果 `48` 包含實際牌張及朝向，我方移動數值為 0。過程沿用原版 Quest 連線，登出關閉五條連線，查核的 SQLite 資料維持原值。[320 像素已選移動牌](native/59-native-stock-event-move-mobile.png) · [原版移動數值](../../app/server/src/model/action_card.rb#L124)

### 首次攻防

沿用首格的 Quest 連線，依原版回覆切換第一次攻擊與防禦。我方可用原版命令 `28–31` 選擇或退回行動卡，收到對應的 `65` 或 `66` 才更新手牌與已選區。攻防請求帶當下的來源位置，Ruby 的成功回覆位置固定為 `0`，頁面以本次操作與牌張 ID 核對。完成送出使用 `33` 或 `34`，攻擊及防禦各按原版 120 秒階段等候。[原版指令](../../app/client/src/net/command/QuestCommand.as#L421) · [Ruby 對應操作](../../app/server/src/controller/duel_controller.rb#L48) · [攻防階段規則](../../app/server/src/rule/event/multi_duel_event.rb#L151)

對手牌張從原版的公開回覆 `52`、`54`、`55` 取得，骰面以 `56` 為準。Ruby 在擲骰後處理傷害並清空雙方已用牌。零傷害可以沒有傷害回覆，頁面等到原版接續階段才顯示該輪完成。對局結果取自 `41`，任務結果取自同一筆持有紀錄的 `24`。[Ruby 攻防與傷害](../../app/server/src/rule/multi_duel.rb#L428) · [原版任務結算](../../app/server/src/controller/quest_controller.rb#L644)

以 320 CSS 像素、DPR 2 的 Chromium 連到隔離 Ruby，在「落日大蝙蝠」用牌張 `18` 的下半面攻擊。原版回傳攻守各擲 5 顆及 4 顆骰子，造成 1 點傷害，畫面收到對應的任務勝利。登出後唯讀 SQLite 核對 Gem 112、Exp 15、角色 Lv.2、區域通關數 1 及行動力 6。任務已移出庫存，保存紀錄為狀態 `3`、持有人 `0`、地形進度位元值 `2`，牌組解除鎖定，該筆任務只有一筆勝利紀錄。本階段的頁面顯示原版對局與任務結果，獎勵與通關數由 SQLite 驗收。

在 1120 CSS 像素、DPR 2 的獨立測例，我方在距離 `3` 使用牌張 `40` 的上半面。加入、退回及再加入的發送位置為 `3`、`0`、`4`，成功回覆均為 `0`。原版造成 1 點傷害並回報對局勝利。測試將相符的任務結果延遲交付至少 400 毫秒，頁面直到收到 `24` 才顯示任務勝利。此測例的原版獎勵為 10 Gem、25 Exp 及角色卡 `1`，SQLite 通關加 1 且牌組解除鎖定。[桌面選牌](native/46-native-quest-first-exchange-desktop.png) · [實際收到原版勝利回覆](native/48-native-quest-first-exchange-win.png)

320 CSS 像素、DPR 2 的防禦測例由對手先攻。我方加入牌張 `28` 的下半面、退回及再加入，發送位置依序為合併手牌 `1`、已選區 `0` 和合併手牌 `5`，三次成功回覆的位置均為 `0`。原版回傳對手擲 10 顆、我方擲 5 顆，我方受到 3 點傷害。收到攻守互換的下一個 `51` 後，畫面顯示首次攻防完成。這輪登出後的 SQLite 任務、牌組、獎勵及通關資料與測試前一致。[320 像素防禦結果](native/47-native-quest-first-exchange-mobile.png)

另一個防禦測例攔下實際加入回覆 `65`。畫面保留已確認的手牌及已選區，停用攻防操作，且沒有重送。登出前使用同一條 Quest 連線，原版登出命令 `2` 之後五條連線都已關閉。延遲交付的原版回覆沒有重新顯示內容，SQLite 資料維持原值。

### 接續攻防與下一回合

雙方目前出戰的角色仍存活時，原版在第一段攻防後互換攻守，再送出第二段攻擊開始 `51`。頁面沿用同一條 Quest 連線，保留上一段的確認結果。正常回合末由原版 `60` 重設方向，回合編號以新的 `43` 為準。接著依 `44`、`45` 把新的行動卡和事件卡附加到留下的手牌末尾，收到 `46` 才開啟本回合的移動操作。已在移動或攻防結算使用的牌依原版回覆移除。就緒命令 `22` 只在對局開場送一次。[兩段攻防與換角順序](../../app/server/src/rule/event/multi_duel_event.rb#L44) · [回合尾方向回覆](../../app/server/src/controller/duel_controller.rb#L688) · [補牌與手牌順序](../../app/server/src/rule/multi_duel.rb#L312)

若出戰角色倒下而仍有可替換角色，原版可略過接續的攻防並送出換角階段。頁面在換角期間停用牌張操作，等待原版回覆，再依伺服器回傳的回合或對局結果更新。[原版換角規則](../../app/server/src/rule/event/multi_duel_event.rb#L205)

Chromium 以 1120 及 320 CSS 像素寬、DPR 2 連到隔離 Ruby，從「落日大蝙蝠」第一回合的我方防禦接到我方攻擊。第一段我方受 2 點傷害，第二段我方空手送出且未擲骰，對手擲 3 顆防禦骰，這段未造成傷害。原版接著開啟第二回合，保留原有手牌並在末尾補入一張事件卡，該輪沒有補入行動卡。兩回合僅送一次就緒命令，並取得第二回合「原地待機」的真實方向確認。[桌面攻守切換](native/51-native-quest-second-exchange-desktop.png) · [320 像素第二回合](native/52-native-quest-second-turn-mobile.png)

另外兩次 320 CSS 像素、DPR 2 實測中，第二回合的行動卡與事件卡補牌分別為 2／1 和 1／1。原版回覆與畫面的牌序一致，後續仍用同一條 Quest 連線送出方向。登出關閉五條連線，唯讀 SQLite 確認任務、牌組與獎勵資料維持原值。

另一次實測在收到第二回合編號 `43` 和兩項補牌之後，攔下原版的移動開始 `46`。第二回合的操作維持停用，頁面沒有提前送出移動或重送。登出關閉五條連線，延遲交付的原版回覆沒有重新開啟操作。

### 換角

主動換角用既有移動方向命令 `23` 的方向 `3`，再以 `26` 送出移動。原版 `49` 開放選擇時，頁面用 `35` 送出從零開始的角色欄位。當前出戰角色仍存活時，也可以選擇同一欄位。若出戰角色倒下，原版以 `57` 開放接替選擇並附上要清理的牌桌資料。兩種情況都有原版 120 秒的等待期，逾時可由原版選角。[原版角色欄位命令](../../app/client/src/net/command/QuestCommand.as#L495) · [角色選擇規則](../../app/server/src/rule/entrant.rb#L624) · [換角階段](../../app/server/src/rule/event/multi_duel_event.rb#L130)

原版 `72` 回傳已套用的角色欄位及角色卡 ID，`50` 或 `58` 結束該次選擇。原生頁面用對局開場的角色 ID 查詢同源原始資料表，取得基礎生命值，並配合開場損傷和對局中實收的生命值回覆判斷可選欄位。角色目錄與繁中建置採用的原始表及 SQLite 主資料逐筆相符，共 1,527 筆，其中 34 筆基礎生命值為零。[原版換角回覆](../../app/server/src/controller/duel_controller.rb#L511) · [倒下後的換角回覆](../../app/server/src/controller/duel_controller.rb#L655) · [原始角色卡表](../../app/server/data/csv/ja/CharaCards.csv)

在 1120 與 320 CSS 像素寬、DPR 2 的 Chromium 以隔離 Ruby 驗收「落日大蝙蝠」。方向 `3` 獲得確認後，原版開放欄位 0、1、2，生命值為 8、7、7。選欄位 1 時只送一次 `35`。延遲原版換角回覆時，頁面仍顯示角色卡 `1` 並維持操作停用。原版接著送出我方 `72`、對手角色回覆及 `50`。收到攻擊開始的 `51` 後，頁面顯示出戰欄位 1、角色卡 `21`，同一條 Quest 連線接續第一回合防禦。登出關閉五條連線，SQLite 的任務及獎勵資料維持原值。[桌面可選欄位](native/53-native-quest-character-choices-desktop.png) · [320 像素換角後接續防禦](native/54-native-quest-character-switch-mobile.png)

獨立測例選擇「保留出戰角色」。原版收到欄位 `0` 並確認角色卡 `1`，對局接續原版攻防，SQLite 資料維持原值。正常「原地待機」也經過實測，期間沒有送出換角指令。另分別攔下原版的我方 `72` 和階段結束 `50`。兩輪都保留上次確認的角色，停用換角及攻防並顯示結果未確認，沒有重送。登出關閉五條連線後，延遲交付的原版回覆沒有恢復操作。

倒下後的換角用 320 CSS 像素、DPR 2 在「妖魔的模型庭院1」驗收。隔離測試資料先用原版 Ruby 模型儲存第一個欄位的 7 點既有損傷，使出戰角色從 1 點生命值開場。第二回合受到原版 `73` 傷害而倒下後，頁面收到 `57` 並只列出存活欄位 1 與 2。瀏覽器只送一次欄位 1 的 `35`，原版回傳我方 `72` 及 `58`，再用 `43–46` 開啟下一回合移動。沿用同一條 Quest 連線，登出關閉五條連線。任務啟動後沒有新增結算或獎勵。[原版損傷欄位](../../app/server/src/model/avatar_quest_inventory.rb#L74) · [320 像素倒下後選角](native/55-native-quest-forced-character-mobile.png)

### 接續戰鬥地形

原版在非終點的戰鬥勝利後回傳該場勝負及獎勵，再用 `19` 更新同一筆任務的地形進度，用 `20` 回傳該任務牌組的目前損傷。頁面依原始地形路徑和這兩筆確認開放下一個有戰鬥的相連地形。使用同一條 Quest 連線送出 `16`，由 `128`、`37`、`40` 確認到達、出戰陣容與損傷，以及新戰鬥開場。整筆任務的結果以原版 `24` 為準。[原版回覆順序](../../app/server/src/controller/quest_controller.rb#L611) · [原版地形路徑](../../app/server/src/model/quest.rb#L219) · [進入地形與開場](../../app/server/src/controller/quest_controller.rb#L117)

「大蝙蝠之群」的原始路徑從欄位 `1` 的地形 `201` 接到欄位 `4` 的地形 `210`。隔離測試帳號預設魔女山谷已有三次通關，透過原版 Ruby 的頭目任務取得方法加入原始任務 `3`，並以原版模型將首位角色的既有損傷設為 `1`。任務取得後仍有 4 點行動力。原始任務的開始成本為 1 點，接續地形沿用該次開始結果。[原始任務路徑及成本](../../app/server/data/csv/tcn/Quests.csv#L4) · [頭目任務取得](../../app/server/src/model/avatar.rb#L2904) · [原版開始與續行](../../app/server/src/model/avatar.rb#L3096)

Chromium 以 1120 及 320 CSS 像素寬、DPR 2 連到隔離 Ruby。開始任務時收到行動力由 4 降至 3 的原版回覆。第一場勝利紀錄增加 8 Gem 和 25 Exp，地形進度為 `2`，原版仍保留任務及牌組占用狀態。進入下一格時沿用同一條 Quest 連線，原版確認原有牌組及 `[1, 0, 0]` 的損傷。兩個地形各送一次就緒，進入第二格時沒有再扣行動力。[桌面下一格地形](native/63-native-next-terrain-desktop.png) · [320 像素第二場開場](native/64-native-second-terrain-mobile.png)

第二場勝利再增加 10 Gem 和 15 Exp，原版最終回傳 118 Gem、40 Exp、角色卡 `1004` 和地形進度 `18`。魔女山谷通關後，任務清單進入隱者之道，該區通關數為 `0`。測試延遲原版 `24` 時，結算與返回維持未開放。收到該筆任務的結算後可返回清單，舊 Quest 連線關閉，其他登入連線仍保持。[320 像素頭目任務結算](native/65-native-multi-terrain-settlement-mobile.png) · [原版通關旗標](../../app/server/src/model/avatar.rb#L3745)

另以瀏覽器暫緩交付第一場的原版 `20`，收到勝利及地形進度後仍維持下一格與返回停用。登出關閉五條連線後，延遲的回覆被忽略，SQLite 保留第一場戰鬥的原始結果。另一次測試將地形資料的首次 HTTP 請求回覆設為 503，收到原版進度與損傷後只重讀一次靜態資料，隨後接續戰鬥。

### 任務結算與返回

普通任務收到相符的庫存移除 `22` 和任務結果 `24` 後，頁面以原版 `7`、`8`、`10` 更新 Exp、等級和 Gem 的最新值，並顯示收到的角色卡 `13`。地形進度使用該筆任務的 `19`，區域通關數使用普通地圖的旗標 `26` 與通關數 `28`。行動力沿用實際回覆。牌組在 Ruby 結算時釋放，頁面只恢復同一筆任務原先使用的牌組。[原版獎勵回覆](../../app/client/src/net/command/QuestCommand.as#L625) · [牌組與清單結算](../../app/server/src/model/avatar.rb#L3277) · [普通區域通關](../../app/server/src/model/avatar.rb#L3711)

按「返回任務清單」沿用戰鬥的 Quest 連線送出原版登出 `2`，等伺服器關閉該連線後才恢復任務服務操作。四條登入連線繼續使用。下一次查詢會以同一工作階段重新驗證 Quest 連線。[原版登出](../../app/server/src/protocol/ulserver.rb#L204) · [Quest 登出清理](../../app/server/src/controller/quest_controller.rb#L531)

以 320 CSS 像素、DPR 2 的 Chromium 用鍵盤打完「落日大蝙蝠」。原版結算及 SQLite 均確認 Gem 100→110、Exp 0→25、Lv.1→Lv.2 和區域通關數 0→1。完成的任務移出清單，牌組 1 解除鎖定，保存一筆相符的勝利紀錄。同一次登入返回清單後，接著完成原版區域地圖查詢。封包確認戰鬥的 Quest 連線先關閉，然後才開啟查詢使用的連線。比較前後的 SQLite，返回與查詢均沒有新增獎勵或通關紀錄。

桌面實測也收到角色卡 `1` 的原版持有紀錄，並延遲交付真正的 `24`，直到回覆抵達才可返回。320 CSS 像素的返回畫面顯示「魔女山谷」進度 1/3。區域地圖及任務服務清單分別使用同一次登入的新 Quest 連線，實際回傳 44 筆地圖 ID 和 0 筆任務紀錄。[桌面任務結算](native/49-native-quest-settlement-desktop.png) · [320 像素返回後的任務清單](native/50-native-quest-same-login-return-mobile.png)

另一次實測在收到原版對局結果 `41`、庫存移除 `22` 和獎勵回覆後，持續攔下對應的 `24`。結算面板與返回操作仍未開放。登出關閉五條連線後，再交付原版 `24` 也不會重新顯示畫面。SQLite 保留原版已寫入的一筆勝利與獎勵。

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
