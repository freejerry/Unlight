# 共用舞台、素材、時間軸與音訊

本段對照固定舞台入口 `/source-login/` 的 `cc2ef53`，以及可重建的繁中 Flash 客戶端。另有診斷與原生任務驗收頁，共用協定或呈現元件的證據可引用。這些頁面的功能、畫面和通關狀態需各自驗收。 [固定舞台實作](../../../source-login/README.md) · [原版與相容版驗收](../README.md)

## 舞台尺寸、圖層與進退場

- Flex 建置設定的邏輯舞台為 **780 × 680、24 FPS**。遊戲繪圖區為 **760 × 680**。`MainView` 在左側 760 px 畫黑色底，原版記錄可看見右側 20 px 的 Halo 灰階。原本外頁底色為 `#080808`，與舞台右緣及圖層底色分開。原生頁保留固定 CSS 尺寸，較小視窗可靠捲動存取。WebGL 背景的實體繪圖緩衝區在初始化按 DPR 配置，最高 2×。後續視窗、DPR 通知與實際畫布像素各需單獨驗收。 [舞台設定](../../../app/client/src/Unlight-config_sandbox.xml#L189) · [MainView 舞台底色](../../../app/client/src/view/MainView.as#L41) · [原版外頁](../../../app/server/script/normal_index.html#L4) · [原生 WebGL 舞台](../../../source-login/stage.js#L482)
- `BaseImage` 與 `BaseLoadImage` 在載入初始化後把根 MovieClip 停在原本狀態，實際播放、特定幀停止、顯示與卸載由上層授權。進退場應有自己的生命週期。從同一個有網路內容的畫面重新登入、從大廳離開和回來、瀏覽器 pagehide 及取消嘗試都要淘汰舊回呼或紋理。原版 `BaseShowThread` 按深度插入，等深的新圖層置於現有同深圖層下。後續相容圖層可共用這些小規則。 [嵌入素材載入](../../../app/client/src/view/image/BaseImage.as#L54) · [外部素材載入](../../../app/client/src/view/image/BaseLoadImage.as#L52) · [顯示順序](../../../app/client/src/view/BaseShowThread.as#L35)
- 大廳圖層優先序是背景 0、左側立繪 1、玩家虛擬人物 2、入口 3。虛擬人物以已裝備零件、原始骨架位置、色倍率及深度合成。源碼對裝備種類先做降冪排序。部件後綴 `_pNN` 決定放置位置與深度，等深仍保留每件。大廳快取為 290 × 450、內部偏移 (130, 410)，放於舞台 (489, 230)。原版等待配件後繪製靜態快取，並在約一秒後補繪。瀏覽器用 Ruby 提供的已裝備部件 ID 與原圖圖集，能清楚標記缺件並保留其他可見部件。原版入場以 (2.1/1.7) 秒將角色由 x+200、透明度 0 帶回正常位置。 [大廳深度](../../../app/client/src/view/LobbyView.as#L43) · [裝備排序](../../../app/client/src/model/AvatarPartInventory.as#L91) · [骨架放置](../../../app/client/src/view/scene/common/AvatarPartClip.as#L374) · [原版快取](../../../app/client/src/view/scene/common/AvatarClip.as#L217) · [畫布位置](../../../app/client/src/view/scene/common/AvatarView.as#L84) · [原生部件合成](../../../source-login/lobby-avatar.js#L51)
- `Transition.as` 另有通用燒蝕轉場。它以 760 × 680 `BitmapData.draw` 先拍下舊容器，再以本地 Perlin 紅通道遮罩和每步逼近 0xFFFFFF 的閾值移除舊圖。已確認 `QuestView.loading()` 在嘗試顯示實際戰鬥時呼叫它。它值得等到對應畫面與已驗證的 Ruby 狀態交接完成後再獨立驗收。遮罩隨機種子影響像素順序，可先固定測例種子再比對覆蓋率和閾值節奏。 [遮罩與步進](../../../app/client/src/view/scene/common/Transition.as#L61) · [任務戰鬥呼叫點](../../../app/client/src/view/QuestView.as#L758)

## 原始時間軸與瀏覽器時鐘

| 項目 | 原版依據與驗收邊界 |
| --- | --- |
| 標題 | 背景、登入、消息和署名入場採 (0.8/1.7) 秒 sine-out，Logo 採 (3.5/1.7) 秒，Glow1 延後 (0.8/1.7) 秒並以 (2/1.7) 秒到 0.7。Logo 為 (390, 370)、0.7 倍、子根 alpha 0.9。蝴蝶起點 (513, −200)，依舞台 24 FPS 推進和游標亂數追蹤，Title 先等並行 tween 完成才註冊追蹤。原版 `SPEED = 1.7` 乘除的是這些明確流程。某些 Quest、Game、Raid 場面另外設定 `stage.frameRate = 24 * SPEED`，因此其他場面的時鐘需逐一證明。 [原始入場](../../../app/client/src/view/TitleView.as#L139) · [Logo](../../../app/client/src/view/image/title/Logo.as#L19) · [蝶位移](../../../app/client/src/view/image/title/Ageha.as#L45) · [Quest 時鐘](../../../app/client/src/view/QuestView.as#L239) |
| 登入玫瑰 | TitleView 等 Auth 成功才離開，原版淡出約 470.6 ms，預設玫瑰在 (0,0) 以 1 秒 sine-out 加入。可用的 Lobby/Regist 容器後加入並顯示在上方，4 秒等待加 300 ms 淡出是玫瑰清理。載入 SWF 宣告根一幀，子 MovieClip 110 幀。第 100 幀執行 `gotoAndPlay(23)`，可見序列先 1–99，再循環 23–99。現行原生程式既保留頁面啟動時的玫瑰，也在驗證真 Auth 憑證後開始轉場。快回覆時選擇保留一秒可見玫瑰，減少動態效果與圖形故障時直接交接。這是可驗收的瀏覽器呈現決定。 [TitleView 離場](../../../app/client/src/view/TitleView.as#L197) · [Main 載入時序](../../../app/client/src/Main.as#L232) · [Lobby 初始化](../../../app/client/src/view/LobbyView.as#L190) · [目前登入轉場](../../../source-login/stage.js#L192) · [Chromium 真實登入紀錄](/workspace/shared/unlight-web-port/login-rose-transition) |
| 入口按鈕 | 原版 `SimpleButton` 的 Up / Over 屬於各原始素材。14 組錨點的靜止和滑入圖都取自已核對的原始 SWF。五組動態的正確可見序列以 24 FPS 播放，分別為任務 48、對戰 120、牌組 35、襲擊 8、道具先 15 再循環 45 幀。決定循環應檢查複合幀和原始 `currentFrame`，因為巢狀 MovieClip 可以有各自的週期。瀏覽器的鍵盤焦點與觸控支援需依目前可用的互動另外驗收。現有滑入裝飾對焦與減少動態效果仍保留靜態 Over。 [原版命名](../../../app/client/src/view/image/lobby/EntranceSet.as#L55) · [圖集與時序清單](../../../source-login/lobby-art/hover/index.json) · [修正前後畫面](/workspace/shared/unlight-web-port/lobby-hover-timing) |

開發與驗收需分別記錄 SWF 舞台宣告、原始子播放頭、瀏覽器回呼及已合成像素的改變。原版時間軸可連續保留同一張畫格。將平台掉幀與原版畫格時長分開記錄。先前離線匯出曾因同一個 Over 狀態留在原按鈕，又被加進擷取容器，導致每個 24 FPS 週期前進兩幀。襲擊因此由八幀誤縮成四幀，牌組雖維持 35 幀但畫格次序改變。單一顯示物件所有權及獨立播放頭觀測更能預防同型問題。 [Ruffle 取樣方法](../../../tools/legacy-web/README.md#L60) · [修正後像素證據](/workspace/shared/unlight-web-port/lobby-hover-timing)

## 素材解碼、取樣與透明合成

- 版本原檔中的 PNG、JPEG、MP3 或字型可以由瀏覽器解碼時就使用原始位元組。標題背景的 Rust Wasm 讀取指定 SWF 內完整 JPEG、瀏覽器負責 JPEG 解碼。Logo、蝶與玫瑰使用有長度、深度、放置數、幀數界限的向量讀取器，支援指定的實色、二次曲線、矩陣和 alpha。原始佈局超出該子集時，應依素材實際標籤選擇解碼工具或離線衍生快取。 [Wasm 讀取器](../../../source-login/swf-bitmap.rs) · [範圍限定的向量時序](../../../source-login/swf-vector.js#L345) · [素材版本驗證與路由](../../../tools/legacy-web/serve.py#L493)
- 大廳部件包含 JPEG3、Lossless2 和需正確顯示清單的個別素材。使用固定版 Flex 工具和 Ruffle 離線解碼，保存原檔、來源路徑、SHA、浮點骨架座標、可見裁框及透明空部件。現行清單實為 824 筆部件定義、1,383 個相異 SWF 路徑，其中 1,364 個存在、19 個缺檔。實際離線得到 1,353 個可見 PNG 資料塊及 11 個原始空部件，零匯出錯誤。圖集間留透明安全邊界，等比例取樣可保留裁框及色倍率。 [部件來源清單](../../../source-login/avatar-catalog.json) · [原檔封裝](../../../tools/legacy-web/package_avatar_assets.py) · [離線匯出](../../../tools/legacy-web/export_lobby_avatar.py) · [圖集封裝](../../../tools/legacy-web/pack_avatar_wardrobe.py)
- 合成證據應分為原始 RGBA、前乘 alpha、同背板的畫面結果、裁框及 DPI 取樣。透明像素的隱藏 RGB 可以跨解碼器不同，透明度與可見邊緣才是重要比較。標題背景 1×、2× 已用原始 JPEG 確認 1:1 邏輯取樣，Logo 直接於實際 0.7 比例光柵化。Glow 為 (0, 340)、760 × 50 原矩形，色 #EEEEEE，blurX 0、blurY 110、強度 4、品質 1。用原圖作背板測 alpha 可驗證 y313–416 的主要亮帶。避免在已量測原圖清晰度的地方重複縮放或套全域銳化。 [Glow 原始設定](../../../app/client/src/view/image/title/Logo.as#L53) · [透明與取樣實作](../../../source-login/stage.js#L482) · [像素量測](/workspace/shared/unlight-web-port/source-login-sharpness/04-pixel-measurements.json)

## 九宮格、文字層、語系與音訊

- 通用 Flex 面板採原始 120 × 96 `panel_gene.png`，切線 x42/78、y60/64，來源淡色分界約在 y31，切線與標題分界是兩個不同尺寸。原始 `help.png` 使用 12/37 的獨立切線。標題、內文、欄位和密碼仍以具焦點、選取、公告捲動的文字層呈現。Ruffle 0.8 曾把 scale9Grid 當整張拉伸，繁中相容補丁用原圖分片對照。獨立原生 WebGL2/Canvas2D 診斷已有 DPR 1、1.25、2 的嚴格像素、縮小與 context loss 證據。 [原始 Flex 面板樣式](../../../app/client/data/css/UL.css.cn#L35) · [相容九宮格修補](../../../tools/legacy-build/runtime-client.patch#L102) · [原生切片幾何](../../../web-client/panel.js#L1) · [診斷畫布驗收](../../../tools/legacy-web/check_native_browser.py#L198)
- 語系列需同時核對編譯分支、事件欄位與素材版本。`prepare-assets.py` 為繁中定位 `*_ch.swf` 的嵌入路徑。資料夾與版本相同的日、英、簡中檔也可能具有不同文字和錨點。Login Name/Pass 使用 `bradley`，原生頁已有對應已固定的歷史 Bradley Gratis。系統輸入與繁中裝置字型仍有字面尺寸及字距差異。`mincho` / `minchoB` 的 SWF 有字碼表檢查工具，可再對動態名稱、描述、重音字母、標點及長文換行做目標瀏覽器驗收。原版預登入 News 與大廳 NoticePanel 各自建畫面，大廳用 `info_login.swf`。現行原生接收同源 XML，保留字元與安全文義。 [繁中素材備妥規則](../../../tools/legacy-build/prepare-assets.py) · [字型與輸出](../../../tools/legacy-build/README.md#L29) · [字碼覆蓋工具](../../../tools/legacy-build/check_quest_text.py) · [News 模型](../../../app/client/lib/News.as#L24) · [原版 Notice 文字欄](../../../app/client/src/view/scene/lobby/NoticePanel.as#L1353)
- 聲音需依場景和觸發點各自比對。原版 `SoundCtrl` 按 BGM、SE、CV 三條音量回路，各類預設 50，設定持久化。標題 `ulbgm01`、大廳 `ulbgm02`、教學 `bgm011`，一般 Quest 場景 `MatchBGM` 對應 `ulbgm03`。舊 `loopSound(0)` 自開頭循環，`fade(0,2)` 依計時器分十步在兩秒淡至零。音效應由原版事件分別觸發，例如送出登入 `ulse01`、錯誤視窗 `ulse02`。目前固定舞台路由的一個 BGM 元素隨已掛載場景切曲，沒有舊版的全場景聲道淡出和設定面板。另需保留自主播放政策下第一個有效手勢、早期零增益準備、已確認播放後的音量、失敗及頁面離開時停止。 [音量選項](../../../app/client/src/model/Option.as#L24) · [聲道管理](../../../app/client/src/sound/SoundCtrl.as#L26) · [原版播放與淡出](../../../app/client/src/sound/BaseSound.as#L180) · [Quest 曲目](../../../app/client/src/sound/bgm/MatchBGM.as#L13) · [原生音訊](../../../source-login/bgm.js#L1)

## 先做的渲染里程碑

先修正固定舞台 Login／Register 與 News 的底圖合成。移除額外漸層後，以已驗收的九宮格幾何作像素基準，量測現有 CSS `border-image` 在各尺寸與 DPR 的表現。若 CSS 無法維持原始切片及透明邊界，直接重用 `panelLayout` 或 `drawPanel` 生成不攔截指標的 Canvas2D 裝飾層。只在面板盒尺寸或 DPR 改變時重繪。DOM 保留輸入、密碼、消息文義、捲動、焦點與現行進退場。這輪限於 Login／Register 與 News 的面板底圖。

已找到可量測的差異。現行 `.stage-panel::before` 在原圖透明及半透明像素下方另有整片線性漸層，導致原始黑色背板被藍色填入。用原始 120 × 96 素材、固定舞台 x500 y20 的登入框左上及既有 Chromium PNG 讀值如下。對照使用補正 scale9Grid 的相容參考圖，並用未補正原版留存與原始背景 JPEG 交叉核對角落。原始未補正畫面不能作為面板高度拉伸的目標。 [現行面板底圖](../../../source-login/style.css#L103) · [補正分界證據](../README.md#L57) · [相容參考畫面](../browser/29-browser-panel-current.png) · [固定舞台原生 PNG](/workspace/shared/unlight-web-port/source-login-sharpness/01-title-dpr1.png)

| 局部像素 | 原始素材 RGBA | Flash 參考合成 RGB | 原生留存合成 RGB |
| --- | --- | --- | --- |
| (0, 0) | 255,255,255,0 | 0,0,0 | 33,46,68 |
| (0, 1) | 0,0,0,44 | 0,0,0 | 27,38,56 |
| (2, 0) | 0,0,0,195 | 0,0,0 | 8,11,16 |
| (4, 31) | 107,124,152,255 | 107,124,152 | 107,124,152 |

這一輪驗收從現有真實登入頁開始，測試 220 × 215 Login、220 × 300 Register 與 220 × 200 News 的四角、分界、中央伸縮及正確的 DOM 排序。DPR 1、1.25、2 擷取實體像素，遮罩排除文字抗鋸齒，原始透明角需露出當時真實背板。復用現行相容診斷的小尺寸及圖片載入故障路徑。以含「臺灣」與 `Café Élan` 且可捲至末行的公告檔，驗證切換註冊、返回登入、錯誤視窗關閉後焦點和後續真實登入轉場。現有只驗證面板資產 SHA 或布局位置的頁面驗收不足以捕捉透明角。 [登入頁測試](../../../tools/legacy-web/check_source_login.py#L192) · [固定舞台整體驗收](../../../tools/legacy-web/check_source_lobby.py#L420)

## 重跑依賴與收件證據

1. 固定程式來源 `015d92e4493f81a8e7975f60f7473e156322187b`、素材 `0ec2d2ffb0e294e46cd0edfb84c9778e3dd4ed0e`、補丁配方 `0ac93015da404cda8202c0daaab3d0a39bd25fe4`、歷史字型 `4e7b49ea6e0dd3bf78275cc3977fe8be8ae754cc`。使用 Adobe Flex 3.6.0 build16995、已驗證的 PlayerGlobal 10 與字型。記下輸出 SWF 真實 SHA，保持未修改原始與相容修補的檔案身分可查。 [建置腳本與校驗值](../../../tools/legacy-build/build.sh#L12)
2. 測試原版使用 Ruffle 0.8 的 `wgpu-webgl`、受控 Chromium/DPR/視窗和同一份繁中公告。使用這一次的隔離 Ruby/SQLite 測試帳號，釘住資料結果、畫面與 Asset HTTP 收件。用 `check_boot.py --expected-swf` 核對服務端實際回傳的完整播放器檔，避免對齊到回傳舊檔的本機入口。 [舊版啟動及檢查](../../../tools/legacy-web/README.md#L43)
3. 報告保留原始影片宣告與當前幀編號、單步前後 RGBA、DPR 與 CSS 邏輯尺寸、同背板標準畫面、聲音路由和時間點。比對純畫布、已合成畫面和實際操作各提交一份證據。離線導出有圖層暫存時，保留來源和產物之間的明確對照。用 `check_source_login.py`、`check_source_lobby.py` 和 `check_native_browser.py` 的現有入口鎖定各自的測試範圍。 [固定舞台啟動指令](../../../source-login/README.md#L9) · [原版舞台收件範例](/workspace/shared/unlight-web-port/fixed-stage-audit/01-original-swf-title-provenance.json)
