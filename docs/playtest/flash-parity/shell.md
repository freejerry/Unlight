# 原版流程驗收清單：標題、建角、教學與大廳

基準為固定舞台客戶端 `/source-login/` 的 `cc2ef53`，原版觀察取自倉庫的繁中 Ruffle 試玩及 ActionScript。驗收時分開記錄「原版試玩看見」、「原碼或 SWF 已核對」與「固定舞台已實測」。診斷入口 `/` 的原生任務、牌組及戰鬥證據僅適用於該入口。測試公告與測試角色都要註明來源。

## 共用舞台及版本

- Flash 成品舞台為 780 × 680、24 FPS，AS 的主要美術區寬 760、高 680。Flex Halo 根樣式的黑色背景，經 `ApplicationBackground` 的亮度調整形成右側 x=760–779 的深灰至黑漸層。標題、大廳及任務的原版擷取均可觀察到該留白。原版編譯檔是 `Unlight.mxml`，舊 `Unlight.as` 的白色註記不適用。來源 `app/client/src/Unlight-config_sandbox.xml:188–193`、`app/client/src/Main.as:26–32`、`app/client/src/Unlight.mxml:2–8`。
- 網頁 Ruffle 的「開始遊戲」來自宿主 `tools/legacy-web/index.html:13–17`、`player.js:12–32`，用於取得瀏覽器操作並載入原版。固定舞台受瀏覽器音訊規則限制時顯示「啟用音樂」。兩者都屬於網頁相容層。驗收記錄瀏覽器、DPR、原始素材版本、Flash／相容 SWF SHA 與軟體或硬體渲染器。24 FPS 是來源設定，效能另用影格與掉幀量測。
- 辨識實際繁中編譯參數，`LOCALE_TCN` 的沙盒範本預設為 false，繁中建置會覆寫。原始 TCN 圖、`UL.css.cn` 對應樣式與裝置／內嵌字形需各自驗證。另記錄 `DEBUG/RELEASE`、`LOT_ON/OFF`、`RAID_EVENT_ON/OFF`、`VOICE_ON/OFF`。排行榜活動、安全付費與活動入口也受版本及資料旗標影響，原始 DEBUG 截圖左上伺服器文字不列為玩家功能。來源 `app/client/src/Unlight-config_sandbox.xml:12–74,137–168`、`app/client/src/Main.as:145–180`、`tools/legacy-build/README.md`。

## 標題、表單及認證

| 畫面或分支 | 原版證據及行為 | 驗收 |
| --- | --- | --- |
| 標題初次顯示 | `MainView.as:72–90` 等 Config 後啟動 Title，原版在開場背景淡入時啟播 `ulbgm01.mp3`。來源圖為 `data/image/title/event_title.swf`、`title/logo.swf`、`data/image/ageha.swf`。面板、背景、署名淡入 0.8 / 1.7 秒，Logo 3.5 / 1.7 秒，兩道光暈在 0.8 / 1.7 秒後開始 2.0 / 1.7 秒的正弦淡入。蝴蝶在等待群組結束後才開始逐幀追蹤，源碼每軸依游標與隨機偏移走 −5 或 +3。來源 `TitleView.as:140–173`、`Ageha.as:55–69`、`TitleCtrl.as:462–470`。 | 正常動態、減少動態、禁止自動播放及一次可信輸入解鎖。核對來源素材、可見時序、循環音樂及退場。固定版頁面初載目前另使用原始玫瑰素材作網頁預載指示，原始 MainView 直接進標題，這項差異單獨記錄。 |
| 登入表單與標題 News | `LoginPanel.as:131–170,191–248,252–285` 位置 (500,20)、寬 220，Login 高 215，原來的英文標籤及同列欄位。 `NewsPanel.as:48–87` 位置 (15,480)、220 × 200，原版有 `updateNews()` 但既有標題流程未接上內容更新。相容補丁與固定版各自載入公告。登入提交及註冊提交為 `SE.playClick()` → `ulse01.mp3`，表單模式切換沒有明列此音效。 | 空白／最大長度輸入、Enter 與按鈕、焦點、Tab、關閉對話框後可再登入。News 繁中、重音、長文捲動到末行，獨立標明用哪個原版或相容基準。 |
| 維護及伺服器狀態 | `TitleCtrl.as:443–446` 把 `Config.serverState` 傳給 `LoginPanel.stateChange()`。state 0 顯示維護，state 1 顯示 Login，state 2 顯示 Register 表單。Auth 連線計時器在連線成功時停止，TCN 無回應提示由 `AuthServer.as:187–233,235–265,294–298` 處理。 | 用隔離測例分離「維護」、「連線逾時」、「憑證驗證失敗」及「帳密被拒絕」。維護／失敗時不可進入後續場景。 |
| 帳號註冊與返回 | `LoginPanel.as:179–200,232–247,315–348` 切換 Register 高 300，順序 Name、Email、Pass、確認，`Login Form` 可返回。原始驗空欄與確認密碼。部分缺欄／確認提示的 TCN 分支仍保留日文原碼。真正 stock 路徑是 `AuthServer.regist()` → Auth CS5（名稱、原有驗證用資料、server type 0），Email 留在表單驗證，與有 Email 的舊 CS0 定義有別。SC0=0 成功，錯誤位元 1、2、4。原版成功 Alerter 的 OK 會直接呼叫 `login()`。來源 `TitleCtrl.as:371–439`、`AuthServer.as:217–221,311–338`、`AuthCommand.as:17–41,81–91`、`app/server/src/protocol/authserver.rb:139–142`。 | 驗證取消、不同確認、已存在帳號、成功唯一次 Ruby 建立，以及成功後實際原版 OK → Auth 的路徑。固定版起始基線 `cc2ef53` 在成功後返回 Login 並要求重新輸入密碼。 |
| Auth 進行中／成功／失敗 | 正常登入先停用表單，`Player.AUTH_START` 進原版 Auth CS1、SC1、CS2、SC2 憑證流程。只有成功驗真憑證才由 `Player.loginSuccess` 設 STATE_LOGIN=1、記錄 ID／工作階段並通知成功。錯誤驗證或 Auth SC3 走 STATE_TITLE=0、原版 `Error`、重新開放欄位。表單原碼只在成功時清空，固定版提交即清空密碼。原版 Alerter 播 `ulse02.mp3`。來源 `TitleCtrl.as:295–333`、`Player.as:235–239,261–267,352–359`、`AuthServer.as:348–403`、`app/client/lib/Alerter.as:20–48`。 | 無帳號、錯密碼、正常舊角／無角色、快速重送、離開頁面及連線中斷。失敗時零玫瑰、零後續場景。測試紀錄僅保存命令類型、時間與結果，避免帳密及握手敏感欄位。 |
| 憑證後轉場與玫瑰 | `TitleView.as:177–234` 只有 `STATE_LOGIN` 觸發一次標題退場。登入板、News、背景、光暈、署名 0.8 / 1.7 秒正弦淡出，Logo 用同長度正弦 ease-in。蝴蝶獨立位移往 y=−200，名義 5 / 1.7 秒，在下一畫面接管時一起移除。玫瑰為原始 `data/image/title/loading.swf`，24 FPS，`swfdump -abc` 證明 frame100 呼叫 `gotoAndPlay(23)`。`Main.as:242–256` 淡入 1 秒，資料就緒時安排 4 秒延後及 300 毫秒退場。大廳或新手場景加在同一父容器的玫瑰上方，會立即開始並覆蓋它。 | 分別記錄驗真憑證、標題淡出、玫瑰開始、首次 Data 角色／選項證據、目的地挂載與玫瑰清理。延後 Data 時可觀察玫瑰，但資料就緒無人工延長 4 秒。檢查兩個分支、單次播放、取消及晚回覆安全。 |

## 首次登入、角色建立與教學

| 畫面或分支 | 原版證據及行為 | 驗收 |
| --- | --- | --- |
| Auth 後初始化及分流 | `LobbyView.as:131–188` 先啟 Data 和 GlobalChat，等待 ConstData 建好再啟 Lobby，須三個 verified 後才依原始資料分流。Ruby Data 正常 login 先送 version 包，再以 SC6 送現有角色，或 SC8 送未建立角色的部件及起始牌。回訪既有角色跳過新手開場。來源 `app/server/src/controller/data_controller.rb:209–243`、`DataServer.as:450–474,578–586`。 | 原四連線保留、純新帳號沒有角色、既有角色無建角流程、SC8／SC6 延遲時不得猜測分支。固定版連線確認順序屬各階段實作差異，保留四連線好壞與真資料門檻。 |
| 開場／命名 | `RegistView.as:217–241,274–338` 開場 `PreStory` → 命名，播放標題同一原始 MP3。 `PreStory.as:23,66–83` 使用 TCN 內嵌 `data/image/regist/prestory_ch.swf`，Skip 只中止本地影片。 `NameInput.as:45–50,119–130,181–189` 主動聚焦名稱，3–12 個 AS 字串長度單位，排除半／全形空格、雙引號、逗號及 `***`。原始 Lobby CS11 名稱檢查回 SC6 0 可用、1 已存在、2 保留，Ruby `Avatar.name_check` 拒絕 `_rename$`。原有可選招待碼要先驗證被邀請者，普通未邀請註冊用 0。 | 開場正常／略過、無寫入。命名 3、12、短過 3、累積字形／非法值、已用及保留、邀請碼另作隔離測例。名稱成功仍保持資料庫無角色。 |
| 外觀／起始牌／往返 | `RegistView.as:342–359,379–420,498–545` 外觀依部件驗證後進起始牌，Back 保留選擇。 `AvatarStyleEditor.as:50–62,234–262` 須 Body、Eyes、Mouth、Hair 各一，只預選 Body ID1。 `CardSelector.as:59–73,148–152,344–398` 起始牌無預選。原版 SC8 提供 24 件、五卡 1/21/31/101/111，源素材來自 `make_bg`、`make_frame`、`make_1name`、`make_2avatar[_item]`、`make_3card`／`make_3chara` 與有名稱的對應 TCN 原始素材。 | 全四類必選、只出現伺服器確實提供的內容、預覽不寫入。實際來源縮圖／肖像以及可變裝備內容分別檢查。固定版已可用 24 原始縮圖與五張肖像圖層，完整建角預覽、原始開場時間軸與動態卡片展示待驗。 |
| 建角送出及 Data 切換 | Lobby CS10 送名字、四部件、一原始起始牌及邀請 ID。Ruby `lobby_controller.rb:86–101` 真正寫角色、裝備及牌組，再 SC5 bool、SC4 壓縮角色，首登獎勵依原始活動。 `avatar.rb:165–241` 建 Deck 1–3、起始牌置 Deck 1 位0、預設衣物42、43，事件牌初始空。 Lobby SC4 使註冊中轉 STATE_TUTORIAL。 `LobbyView.as:848–878` 原版在教學前只發 Data CS4 重綁，Ruby `data_controller.rb:15–22` 沒有專用回覆。固定版以 Data Pong 確認順序。 | 確認失敗、重名重試、截住真 SC4 及 Data Pong、登出後晚回覆。同工作階段成功只新增一次，唯讀 SQLite 比對物理牌、已裝備部件與 SC4，銜接教學。 |
| 角色完成後的原版教學 | 首次 `TutorialView(stage,true)` 自動進場，原始 `/public/image/tutorial/tut_start.swf` → `tut_startquest.swf` → `tut_startbtl.swf` → `tut_startfinish.swf`。第一段 `playLabel()` 不發 Auth CS9。後三段實際開始播放時寫整數 1→2→3。最後 Game、或教學離開按鈕只切回 STATE_LOBBY。教學 BGM `bgm011.mp3`，入退場正弦 1.0 / 1.7 秒。 `TutorialView.as:136–146,194–197,245–260,292–314,393–433,457–463,470–507`、`TutorialMovie.as:29–77,165–203`、`AuthCommand.as:122–128`、`player.rb:645–648`。 | 驗證首段、逐步揭露及最後遊戲按鈕、教學中途離開、生效時序及回到同一角色大廳。固定版四段繁中說明可操作，原始教學影片、章節動畫與 Auth CS9 狀態仍待實測，說明畫面不應替原始影片寫完成。 |
| 回訪及大廳教學 | 已有角色直接入廳，哪怕 `players.tutorial=0`。大廳另外有 `btn_d` 進 `TutorialView(stage,false)`，可看概論、戰鬥、換角、事件、入口、任務、牌組、決鬥、道具、商店、合成等源章節。Auth CS9 寫最後播放類型，不是位元遮罩或關卡解鎖，數值14是合成主題。原版的教學地圖是獨立任務類型，與普通魔女山谷及初次教學影片分離。來源 `LobbyView.as:510–517,883–911`、`TutorialMovie.as:61–77`、`QuestSelectMapWindow.as:94–119`。 | 確認回訪沒有重播建角，教學目錄按鈕和 Back 都可返回。普通任務入手需循原版搜尋，角色建立與教學不附送 Q1。 |

## 大廳場景、公告與全域控制

- `LobbyView.as:43–46,287–325` 從下往上依序載入背景、左側最愛人物、右側玩家外觀、入口。 `BG.as:35–59` 和 `Entrance.as:730–745` 入退場 0.8 / 1.7 秒正弦。室內 `entrance_bg.swf` 的房間圖在 (0,160)，760 × 496。 `common/gene.swf` 首幀是 `lobby`，包含 760 × 32 上欄及 y656 的底欄。 `AvatarDetailBase.as:47–59` 隱藏 logout／exit/log，Lobby 額外隱藏 Back（`AvatarView.as:249–254`）。目前固定舞台右上已移除額外的登出及重開消息按鈕。
- 原版左側由 `favoriteCharaId → Charactor.lobbyImage` 決定，依持有結果圖才使用 `_res0` 分支。 `LobbyStandChara.as:78–116` 選載真實 `standchara*.swf` 的 `up`，並在 0.8 / 1.7 秒由 x−580 移至−80。右側依已裝備資料、`avatar_rig.swf` 的15個對位點、`AvatarParts.csv` 的元件名及色彩倍率合成，`AvatarClip.as:184–229,315–355` 以 290 × 450 透明圖緩存，原版入場 2.1 / 1.7 秒，換裝淡出／入各 0.3 / 1.7 秒。現代大廳已用 Ruby 的裝備 ID 合成並驗過兩組起始裝備。所有衣物缺檔、同深度重疊以及左側隨最愛角色與活動更新仍需另外覆蓋。來源 `AvatarPartInventory.as:276–287`、`AvatarPartClip.as:374–383,427–444`。
- 底欄使用 `Name`（Lv 與名字）、Gem、Exp 目前值／原版等級門檻、AP 目前／上限、免費對戰星數，資料來源及有效上限分別核對。AP 構件是 `avatar/social_ap.swf`，免費對戰是 `common/star_battle.swf`。右側 Record／Friend／Item 圖示為獨立 SWF，點擊各自開啟實績、好友、物品功能。現代固定版 HUD 來源與懸停已驗。右側實際點擊、卡片、社交、登出／離線復原及落地焦點要分別列證據。來源 `AvatarView.as:276–301,321–376,412–420`、`Avatar.as:560–571`、`AchievementListButton.as:43–54`、`FriendListButton.as:57–70`、`ItemListButton.as:61–81`。
- `app/client/lib/News.as:23,129–156` 讀同源 `/public/news.xml`，`XMLData.as:52–71` 建立時已取用，`Announce.as:39,90–101,214–216` 另有 10 分鐘刷新。改變的 `<news>` 排入 `LobbyNotice.TYPE_UPDATE_NEWS`，由 Lobby 的 notice queue 展示。 `NoticePanel.as:893–927,973–993,1012–1027,1168–1176,1404–1429,1461–1495` 繪出更新情報、阻擋後方點擊，OK 後依序處理下一則或離場。其他真實通知可牽涉選獎與清除原版記錄。目前固定版只安全顯示 XML 公告和本地關閉，按帳號／頁面的一次性通知政策與原版內容變更檢查不同。 `Entrance.as:768–772` 的 `btn_info` 是獨立活動 Info，直接讀 TCN SWF 的原始按鈕在 x<0，這次大廳不會出現可重開消息的額外入口。

| 大廳源按鈕 | 原版事件、目的地與返回 | 目標驗收／固定舞台狀態 |
| --- | --- | --- |
| `btn_b` 任務 | `EntranceSet.as:59` → `LobbyView.as:542–570,987–1016`，普通 QUEST_NORMAL、STATE_QUEST，起獨立 QuestView 並以 Back 回同一登入。`_isRaidView` 特殊分支走 Raid。普通入口播放 `ulse02`，地圖曲取 `ulbgm03.mp3`。 | 固定舞台已接入第一張普通地圖、真實持有清單及第五條連線。返回時發 `Quest CS2`，等待原連線關閉再回大廳。[任務驗收](quest-pve.md) |
| `btn_f` 對戰／`btn_g` 牌組 | `gameButtonClickHandler` → STATE_GAME → `GameView`（停大廳曲），`editButtonClickHandler` → STATE_EDIT → `DeckEditView`（此處停曲被註解）。一般返回重掛 LobbyView。來源 `LobbyView.as:483–499,752–812`。 | 固定舞台有原始入口素材與懸停，尚未接場景。工作版已驗 Deck 1／Binder 的部分真寫入，這不能代表固定舞台的完整原版牌組與對戰。 |
| `btn_h` 設定／`btn_d` 教學 | `LobbyView.as:501–517,817–845,883–911` 通常播放 Lobby click，再開 OptionView 或 TutorialView，兩者 Back 回原 Lobby。OptionView 讀取 BGM／SE／CV 滑桿及提示開關，預設50，使用本機 `SharedObject`。來源 `OptionView.as:86–103,148–198,207–254`、`Option.as:27–38,66–119,150–173`、`image/option/BG.as:20`。 | 固定舞台已實跑設定操作、音量即時更新、重新開頁保留與同登入 Back。教學入口已顯示原始圖樣與懸停，主題、音畫狀態與 CS9 仍待接入。[設定驗收](options-reference.md) |
| `btn_i` 商店／`btn_e` 道具／`btn_j` 暗房／`btn_c` 圖書館／`btn_k` Raid | `EntranceSet.as:59–86` 對映與旗標，`LobbyView.as:423–432,519–539,574–582,649–685` 切各自狀態，個別分支返回時把 STATE 設回 Lobby，登出則走離場。 | 已掛原始素材與可讀名稱的入口保持真實可用性。各路徑的檢視、權限、回到同會話、付款／活動副作用另外安排各自的實際隔離驗收。 |
| 序號、排名、右側圖示 | `EntranceSet.as:83–86` 正式 TCN 綁 `btn_serial`，`Entrance.as:385–409,764–772` 打開原版序號表單，Rank 是嵌在 Entrance 落幕的讀取區。右側各圖示打開各自原版功能。 | 序號及社交不要拿真資料試寫。先核對入口、可視範圍、原版動畫、真資料格式和關閉，後續單獨驗成功寫入與拒絕。 |

大廳 BGM 是 `LobbyCtrl.as:303–326` 與 `LobbyBGM.as:12–16` 的 `ulbgm02.mp3`。普通任務入口用 `LobbyView.as:567` 的 `SE.playLobbyClick()`，回大廳的 Back 用 `QuestView.as:387` 的 `SE.playClick()`。

## 證據與下一個小驗收

- 原版視覺基準 `docs/playtest/desktop/01-title.jpg` 至 `07-quest-map.jpg`。逐場景 780 × 680 的 Ruffle 基準 `docs/playtest/browser/02-browser-lobby.png`、`03-browser-quest.png`、`12-browser-latest-news.png`、`29-browser-panel-current.png`。原版與相容補丁差異用同份素材與已核對 SWF 來源分開呈現。歷史發布繁中公告缺來源，實測用已標記的繁中 XML。
- 固定舞台 `check_source_login.py` 和 `check_source_lobby.py` 涵蓋嚴格自動播放、真實拒絕和 Auth 玫瑰、建立角色、同登入資料切換、真裝備及兩種外觀、原版入口懸停、公告與重新登入。任務測例走實際地圖入口與 Back，並核對 Quest 和四條原登入連線。[可重跑環境](qa.md)
- 下一個可獨立交付的原流程是大廳任務入口 → 既有登入中的獨立任務地圖 → BACK。只使用已驗的原版服務與原版地圖資料。玩家按任務才開 Quest 通道，通過認證後以原始旗標顯示魔女山谷 0/3、容量與真實牌組。Back 只用原版 Quest CS2 關閉第五連線，確認四條既有連線和 DB 都保持。再測 Quest 單獨拒絕／斷線、晚回覆和原版曲切換，搜尋及出戰可留給下一個可獨立驗收的功能。相關原碼 `QuestView.as:229–239,288–295,318–348,385–391,502–518`、`QuestClearGauge.as:154–161,189–208`、`QuestServer.as:126–140`。另一條較小且獨立的本機功能是原版 OptionView 的進入、音效設定與返回。
### 共用與開發類別

`BaseView` 是執行緒基底。`TestView` 是測試程式，`MainView` 的現有入口啟動 `TitleView` 與全域求援檢視。這兩個類別在來源清冊列為共用／開發項，玩家可達性依 `MainView` 現行呼叫圖盤點。 [BaseView](../../../app/client/src/view/BaseView.as) · [TestView](../../../app/client/src/view/TestView.as) · [MainView](../../../app/client/src/view/MainView.as#L72)
