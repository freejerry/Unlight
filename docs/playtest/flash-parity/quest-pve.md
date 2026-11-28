# 原版 PvE 行為盤點與整合順序

盤點自 `cc2ef53` 起比對 ActionScript、Ruby 及原始資料表，並隨固定舞台的交付補入實跑結果。封包編號由 Ruby 2.7 載入原始 `Unlight::Command::RECEIVE_COMMANDS`／`SEND_COMMANDS` 並取陣列索引。以下 CS 表示客戶端送給原版 Quest、SC 表示原版 Quest 回覆。Data SC6、Lobby SC4 是不同服務的角色資料封包。

## 分支基準與可直接沿用的部分

| 項目 | 整合分支 | 後續範圍及診斷證據 |
| --- | --- | --- |
| `/source-login/` | 大廳「任務」接固定舞台與 Quest 連線。已接地圖、搜尋、持有清單、詳情、地形預覽、牌組切換及起始牌卡面。落日大蝙蝠已從開始驗至第一格與原版舞台 11 背景。 | 好友贈送等其他狀態、道具、完整開場與戰鬥回合待移植或驗收。歷史暫停分支 `8595426`、`b04db83` 可參考共用傳輸。 |
| `/web-client/` 診斷實作（原生根入口） | 共享 `web-client/session.js`／`quest-data.js` 已可讀原版 Quest、搜尋、開始、地形、真實 Ruby AI 對戰、結算和返回清單。診斷入口的一般唯讀、搜尋和開始用短 Quest 連線，進入第一格後留住原版 socket。`startQuestSearch()` 目前固定使用 `questFlag+1` 的 1–35 普通地圖以及計時選項 1。 | 多段實際 Chromium、Ruby 和 SQLite 驗收留在 `docs/playtest/README.md`。此處的結果證明傳輸與遊戲行為可複用。固定舞台版面須另驗收。 |
| 原版 Ruffle | 原版對照可使用既有隔離 Ruby 與 Flash 載入流程。 | 地圖、首關戰鬥、兩個結果確認及通關進度已有瀏覽器截圖和隔離資料核對。 |
| Rust 倒數示範與 68 事件回放 | 各自獨立驗證工具，可維持現有用途。 | 具有倒數或播放 UI。首關的 Ruby 持有紀錄、AP、地形和對局仍由 Quest 服務管理。 |

相關入口與現有能力位於 [固定舞台 README](../../../source-login/README.md#L37)、[目前大廳的唯讀視窗](../../../source-login/lobby.js#L326)、[共用 Quest 傳輸](../../../web-client/session.js#L616)、[目前同源目錄](../../../tools/legacy-web/serve.py#L144) 與 [原生診斷說明](../../../web-client/README.md#L33)。應由整合分支做增量，暫停的版面與 CSS 無需合併。

## 入口、世界地圖與持有清單

1. 原版在大廳按「任務」先呼叫 Lobby 的角色更新和商品檢查，再設 `QUEST_NORMAL`／`STATE_QUEST`。若大廳切到 Raid 入口，按同一位置進獨立 Raid 流程。QuestView 停止大廳樂曲、起 QuestCtrl 並等待 `Host.CONNECT_AUTHED`，再掛載舞台。先前四條 Auth/Lobby/Data/GlobalChat 保留。Quest 使用 0 negotiation、1 login（原版會話金鑰），SC1 後原 server `do_login` 綁定 avatar、初始化目前地形/牌組、SC32 ActionCard 長度、逐筆 SC6 庫存。退出傳原版 CS2。Ruby 清除 listener/連線。原版後端允許同角色的重複 Quest 連線把舊連線擠掉，兩條正常並行沒有意義。瀏覽器測試可以用原版 CS3/SC3 封住同步 login resend，且不把 Pong 解讀成具備身分的寫入 ACK。[LobbyView](../../../app/client/src/view/LobbyView.as#L542) · [QuestView](../../../app/client/src/view/QuestView.as#L229) · [QuestServer](../../../app/client/src/net/server/QuestServer.as#L127) · [Ruby Quest do_login/logout](../../../app/server/src/controller/quest_controller.rb#L515) · [ULServer](../../../app/server/src/protocol/ulserver.rb#L184)
2. 探索解鎖讀真正角色的 `quest_flag`，世界地圖最新普通地圖以 `flag+1` 轉成 1-based ID，原版已開放較早地圖。世界地圖旗標到原版第 36 張，最新旗標 35 時是「聖女的寶座」。原版一般通關量計只在選中最新區域且旗標 <35 時顯示。地圖門檻是 `QuestMaps.csv.difficulty`，正常新角色地圖 1 魔女山谷是 0／3、地圖搜尋耗 1 AP。地圖 2 隱者之道門檻 3、AP1，35 通往玉座的回廊門檻 80、AP7，36 聖女的寶座門檻 1、AP10（最新區域量計仍隱藏）。固定舞台的共享目錄以 `map=` 提供第 1–36 張普通地圖及 MemoryLand 資料。Quest CS6(region i32)／SC14(region, CSV) 只是該 region 的服務端全域資料，普通開場最新地圖以角色旗標和 `QUEST_FLAG_MAP` 決定。位置上的 CS6 查詢原本註解。不要用曾實測的 44 筆 region0 來判斷全世界的玩家解鎖。[WorldMapImage](../../../app/client/src/view/image/quest/WorldMapImage.as#L272) · [QuestWorldMap](../../../app/client/src/view/scene/quest/QuestWorldMap.as#L237) · [QuestClearGauge](../../../app/client/src/view/scene/quest/QuestClearGauge.as#L184) · [區域查詢 Ruby](../../../app/server/src/controller/quest_controller.rb#L33) · [地圖原始資料](../../../app/server/data/csv/ja/QuestMaps.csv)
3. 已登入角色 Data SC6 提供庫存上限、持有 ID、定義 ID、狀態、每筆剩餘時間、旗標及通關量。新建角色同登入的 Lobby SC4 有同型資料。Quest 登入的 SC6 會重送所有非搜尋中紀錄，`timer=0`。pending 只由角色快照保留。相同持有 ID 是唯一錨點。同一任務定義可以持有多筆。星號或未知文字只用目錄補上，不因 metadata 不完整而丟資料。原始狀態為 0 新、1 未解決、2 進行中、3 解決、4 搜尋中、5 失敗、6 受贈。庫存中的地圖通關進度位元只在當次攻略的 SC19，角色快照清除數不是該位元圖。[Data schema](../../../app/server/src/protocol/command/datacommand.rb#L213) · [Lobby schema](../../../app/server/src/protocol/command/lobbycommand.rb#L460) · [Ruby resend](../../../app/server/src/model/avatar.rb#L2653) · [原始狀態常數](../../../app/server/src/constants/common_constants.rb#L942)
4. 對應畫面錨點為 QuestBG 的 `quest_base.swf`，正常區域地圖 `map01.swf` 至 `map06.swf`，`select_map.swf`、`questlist.swf`、`QuestCaption`、`QuestDeck`、角色 HUD。QuestView 依 24 FPS × SPEED，世界地圖、背景、標題、HUD、庫存、牌組各有原版合成層級，另有搜尋、戰鬥結果、寶箱、選地圖容器。選區域窗原版由 y−500 以 0.3 秒 ease-out sine 入場。場景進入 `MatchBGM` 對應 `ulbgm03.mp3`。Back 後恢復已現存的大廳 `ulbgm02.mp3`。固定舞台已接上 Quest 音樂與原版兩秒淡出。[QuestView 佈局](../../../app/client/src/view/QuestView.as#L244) · [QuestView 顯示層](../../../app/client/src/view/QuestView.as#L318) · [選地圖滑入](../../../app/client/src/view/scene/quest/QuestSelectMapWindow.as#L70) · [地圖素材](../../../app/client/src/view/image/quest/WorldMapImage.as#L28) · [任務主題曲](../../../app/client/src/sound/bgm/MatchBGM.as#L13)

## 搜尋、發現、選擇和開始

| 階段 | 原版請求、回覆與判定 | 目前可用或尚待驗收 |
| --- | --- | --- |
| 搜尋面板 | 原版世界地圖據區域和旗標點選，再以 `quest_search.swf` 的 0–10 計時滑桿、地圖名稱、縮圖、AP和確認顯示。CS5(i32 地圖, i32 計時索引)。Ruby 校驗地圖、AP、配額、`flag+1`，由 Ruby 按既有通關數、地圖難度和計時索引選出任務 ID 與稀有度。原始時間索引 0、3、10、30 分鐘，1、2、4、8、16 小時，1、3 日。 | 固定舞台在同次登入的 Quest 連線確認選定地圖和時間。保留診斷入口既有的最新版普通區域及索引1。 |
| 計時業務 | 索引>0 先保存狀態4及真正截止時間，回 SC6(持有 ID,0,索引,實際係數,原線上狀態0,贈送者) 再回 SC4(當前 AP,剩餘恢復秒數)。在庫存滿時可能先重播舊 SC6(timer0) 再 SC29(30)，不能把重播當新搜尋。索引0即時保存真正任務，順序是 SC4 後 SC6(真任務 ID,timer0)。SC17 之前定義寫在 Ruby，客戶端不猜。 | 固定舞台在保留的 Quest 連線上核對本次操作的兩個回覆，並以原版 Pong 封住序列。遇到回覆遺失會鎖定本次登入的再次搜尋，提醒重新登入確認清單。計時和 AP 仍由 Ruby 決定。 |
| 發現 | 原 Flash 瀏覽器倒數過零時停止計時再送 CS17(i32 持有 ID)，原版嚴格伺服器時間 `now > find_at`。原版回 SC17(i32 持有 ID, i8 新狀態, i32 真任務 ID)。太早通常無回覆。分支上的相容修正限定所有權並原子更新 pending → NEW。Data 角色資料在重新登入時也可見到期的真狀態。 | 固定舞台到期自動發 CS17。新搜尋依回覆係數和秒數排程，重登入的整秒剩餘時間涵蓋不到一秒的截去部分。確認的 SC17 或登入重播更新同一持有 ID。診斷入口保留已有的確認按鈕。 |
| 看任務與牌組 | 點列先以原版資料打開詳情。只有 NEW 送 Quest CS12(i32 持有 ID, i8 牌組)，Ruby 將該筆更新為未完成並回 SC17。受贈、未完成及進行中直接顯示詳情。返回地圖是本地切換。牌組箭頭另用 Lobby CS12。Flash 在送開始前必須有置於第 0 格的角色卡。 | 已接入固定舞台。實測 q1 與正常、空牌組切換。保留原版回播的贈送者名稱，受贈狀態仍待原版與新版的實跑。核對同持有 ID、同任務 ID 與狀態1後才從 NEW 更新。 |
| 開始 | CS13(i32 持有 ID,i8 牌組索引)。Ruby 依所有權、任務 AP、狀態、牌組存在及解鎖驗證，SC4 → 匹配 SC17(status2) → 同一處理函式保存牌組鎖 `CDS_QUEST`。Quest Pong 只封閉既有序列。任務開始的 AP 跟地圖搜尋 AP 是兩筆不同成本。 | 固定舞台已實跑 q1/Deck1/AP0 與空牌組警告、首次移動及進入敵人舞台。診斷另驗 q3/Deck2/AP1、回覆遺失時只扣一次、重新登入後原版清理。 |

[搜尋確認面板](../../../app/client/src/view/image/quest/GetSendPanel.as#L231) · [原版倒數](../../../app/client/src/view/scene/quest/QuestItem.as#L350) · [Ruby get_quest](../../../app/server/src/model/avatar.rb#L2798) · [原版搜尋時間](../../../app/server/src/constants/common_constants.rb#L952) · [持有列到期](../../../app/server/src/model/avatar_quest_inventory.rb#L110) · [確認及開始](../../../app/client/src/controller/QuestCtrl.as#L471) · [Ruby quest_start](../../../app/server/src/model/avatar.rb#L3096) · [測試紀錄](../README.md#L179)

## 地形、隊伍與 Ruby AI 對戰

- Quest 定義的 橫向 5 欄、每欄 3 格，原始欄位迭代 `slot=column*3+row`，Flash `Quest.startRow` 選首欄最後一個非零位置。這批 3,216 筆來源都只有一個。下一欄的 4／2／1 mask 允許上／中／下。末端是該格 land ID 非零且 next mask 為零。Ruby `@current_no`、`@current_inv_id` 和 `@current_deck_index` 綁同一 Quest 連線。CS16(i32 inventory,i8 deck,i8 slot) → SC128(i8 slot) 僅證明移動受理。要追加同 deck/status2 的精確回覆，已清格是 `oldProgress | (1<<slot)`，按已授權邊避免重放。QuestMapClip/QuestDataClip 源碼有圖層、連線、地形名稱及原始 TCN caption，對照 `app/server/data/csv/tcn/Quests.csv` 和 `ja/QuestLands.csv` 的本地化欄位。已在資料表查得 3,216 筆任務、138 筆地區目錄。未翻譯／缺資料需保留原始缺口。[Ruby 地形](../../../app/server/src/model/quest.rb#L185) · [原版 Quest model](../../../app/client/src/model/Quest.as#L231) · [地形 UI](../../../app/client/src/view/scene/quest/QuestMapClip.as#L61) · [Ruby CS16](../../../app/server/src/controller/quest_controller.rb#L117)
- 原版 Ruby 用地形 monster 及 CPU master 決定對手。只有 monster 非零且 AI 牌組可用才有對戰。建立 `MultiDuel(... :quest_ai ...)`，原 rank（無則 `CPU_AI_OLD`），真 stage、雙方卡 ID 及傷勢。玩家持有卡可只有一張，SC40 的 multi flag 不等於有三張。實際對戰需 SC128 → SC37（`-1,CPU`、雙方有序卡、對白、stage、兩組傷勢）→ SC40（牌池、距離和模式），可能夾雜原版對白通知。階段以留住的 socket 觀察，不能從地形 metadata 預先宣布進戰鬥。原版 `QuestView.loading` 走燃燒過場、停地圖音樂，依 stage 揀 `DuelBGM`（Boss index 12），再播放遠近景、開場、角色、牌和 HP。之後原版 Ready。q1 stage11 的 source `DuelBGM` 映到 `bgm000.mp3`，核對具體 stage rule 後才用。[CPU 主資料](../../../app/server/src/rule/ai.rb#L24) · [Ruby 組裝對局及開場](../../../app/server/src/controller/quest_controller.rb#L148) · [Flash 戰鬥入場](../../../app/client/src/view/QuestView.as#L758) · [DuelBGM 對照](../../../app/client/src/sound/bgm/DuelBGM.as#L12)
- 無敵人分支 Ruby 直接 `land_clear`、發 SC19，必要時有實際寶箱或結束。不見 SC37/40 或超時不是證明。已有空地、固定 Gem 寶箱、雙戰鬥路徑的隔離實測。空地須明確源資料 `enemy=treasure=event=0`。q32 首格的固定寶箱可用 SC128 → 19 → SC10 絕對 Gem → SC25(i8 type5,i32 slotType1,i32 30) + 同來源 fence，不能把 30 再加到絕對值。該條路待真實下一格 SC37 取得傷勢。正敵人 metadata 遇空 AI deck 需當原版替代分支處理。一般寶箱、角色卡、裝備、分配型獎勵及高低獎勵不應沿用固定 Gem 假設。[無戰鬥路徑](../../../app/server/src/controller/quest_controller.rb#L204) · [清格／寶箱](../../../app/server/src/model/avatar.rb#L3216) · [空地／Gem／雙戰鬥證據](../README.md#L215)

| 階段 | 原版協定與驗證界線 |
| --- | --- |
| Ready／補牌 | CS22 一次。SC43 turn、44 行動卡、45 事件卡、46 開放移動。SC44/45 本方實際 ID 與朝向，對方張數。維護來源順序的混合手牌，不暴露對手未揭露的牌。 |
| 移動 | CS23 指向，SC60 本方實際回覆。CS24/25 加退牌由 SC61/62 核對己方 ID／送出的原本手或桌索引。CS26 完成後以 SC47/48 顯示距離、先攻、雙方已揭露牌、點數和鎖。對手遮蔽的 index/id 或空結果不能證明己方操作。無方向原版待定2最終按0運行，沒有必先選擇的前置條件。 |
| 換角 | 來源開放的自願分支使用 CS23=3、SC49/50，強制死亡換角走 SC57/58。CS35 帶有源授權的有生命欄位，SC72 必須匹配真活動角色，完成也要對應結束和次階段。原版自願保留同一角色可行。強制欄位根據已確定存活與原版陣列。 |
| 攻防 | SC51/53 決定本方可操作角色。CS28/29 攻、30/31 守。SC65/66 回自己 ID，但是原版攻守 handler 沒傳 index 給 Entrant，成功回覆原本是 0。用自己的當前順序取卡，對手遮罩和失敗 sentinel 分開。原版 CS32 旋轉以及任務技能/特殊事件有另外封包。診斷只對已驗證普通卡與原版無效果的事件牌供操作。CS33/34 確認、SC52/54/55 取真牌面，SC56 是實際攻方／守方骰，SC73/79 等才是傷害與 HP。某些技能額外骰 SC56/手牌變更 SC63/64/84–90 發生在普通序列，未支援要停寫而非猜新手牌。 |
| 換回合 | 存活時同一輪 1、2 兩次攻防，先攻互換後重看 SC51。當有可換角或死亡會跳過不合格相位。兩次完成後可見自己的 SC60 待定2，下一次真正 SC43 遞增、再 44/45/46 把新牌加入剩餘手牌。SC59 在原版常態路徑不必出現。原版 phase 由事件規則、CPU 和截止控制，常用等待上限120秒、戰鬥和局上限18回合。曾實測平常對手處理超過 8 秒。 |

[Ruby Quest 封包表](../../../app/server/src/protocol/command/questcommand.rb) · [原版對戰 CS](../../../app/server/src/controller/duel_controller.rb#L15) · [回合事件序列](../../../app/server/src/rule/event/multi_duel_event.rb#L45) · [Ruby 距離、骰及傷害](../../../app/server/src/rule/multi_duel.rb#L357) · [時間常數](../../../app/server/src/constants/constants.rb#L36) · [現有封包與監聽](../../../web-client/session.js#L1043) · [現有攻防驗收](../README.md#L239)

## 勝負、獎勵、返回與錯誤

- 戰鬥結束 SC41 先報原版勝0、敗1、和2、經驗／Gem 計值及是否有額外獎勵。SC41 不是任務完成。Ruby 接著實際記帳、發 SC7 Exp、SC8 Lv、SC10 Gem 等。畫面應以已收到的絕對值或同份前後快照之差為準。Lv 變更可在沒有 SC4/SC5 的情況重新填滿和改變 AP 上限。無確定回覆不捏造目前 AP 或最大值。真正掉卡 SC13 含持有 ID、卡 ID。勝利且後面有合法地形時，SC19 + SC20(相同牌組、任務狀態2、實際傷勢) 可以繼續，沒有 SC22/24 且不用重連。稽核傷勢用 Ruby 的 SC20/下一戰 SC37。UI 內血量不可拿來推算存檔。
- 原版到最後可達位置後解鎖牌組、清理損傷、移除庫存、保存勝負日誌並處理原版獎勵與區域通關旗標。SC22 + 匹配持有 ID 的 SC24 才是終局。戰鬥輸／和對任務都記敗 1。當前區域普通勝利加通關數，足額且打贏 boss 才前進旗標並把下一區通關數歸零，舊區獎勵不可當前區進度。原版 SC26/28 是普通地圖，SC30/31 是事件類型與各自原始計數。原版故事有 `story_no` 的獲勝分支在 SC24 後可發 SC134，寶箱顯示期間暫停完成面板。原版圖像來源 `quest_result.swf`，戰鬥結果 OK、任務結算 OK、寶箱／故事返回是不同層。戰鬥結果返回 Quest 地圖本身不等於登出。
- 匹配成交的 Hi-Lo 額外獎勵由 SC41 bonus=true 觸發，是同一個 Ruby reward 狀態。候選 SC122、起始骰 SC123、猜高低 SC124、結果骰 SC125、最終獎勵 SC126，可伴隨 SC38 實際持有卡。原版 CS36/37/38/39 分別高、低、取消、重試。現有 web-client 有守衛，會把 bonus=true 標為仍待處理，不會用普通返回跳過。若後續要做，須從真 `Reward`／event handlers 開始驗證。本地不可抽骰或重送。
- 已證明的失敗按官方封包處置。搜尋有 AP1／已達上限30／地圖未知31／旗標不足32。開始另有牌組不存在16／任務不存在40（原版可能先 SC22）／狀態不符41／牌組鎖42。移動有錯誤路徑43、無角色牌15。某些 handler 無回覆（正在打鬥、找不到 avatar／row 的分支），保持未確認，透過可靠更新或使用者決策恢復。發送寫入後漏回不能以再次同樣 CS5/13/16 或卡片控制求證。UI 可在有確定前置錯誤時復原重試，必要時保留已證實欄位並停止進一步寫入。
- 原版主動放棄 CS14 會清理並回敗，歸檔 result4。CS15 是獨立刪除。關掉 Quest 後一般 Lobby/Auth 仍活著。若正在冒險，Data 再登入會執行 `quest_all_out`，清除進行／已解決／失敗列，解鎖牌組並記成 result5。同登入回 Lobby 的正常 CS2、放棄與重新登入各有對應測例。較早的中繼曾在 25 次 EOF 中出現 3 次 `1000` 但 `wasClean=false`。第一張固定舞台地圖現已驗關閉順序與原 Quest peer 正常退出。

[Ruby 戰鬥結算](../../../app/server/src/controller/quest_controller.rb#L554) · [Ruby quest_delete](../../../app/server/src/model/avatar.rb#L3034) · [quest_all_clear](../../../app/server/src/model/avatar.rb#L3295) · [Data 登入的清理](../../../app/server/src/controller/data_controller.rb#L223) · [Quest 原版視窗](../../../app/client/src/view/QuestView.as#L582) · [Reward handlers](../../../app/server/src/controller/duel_controller.rb#L88) · [獎勵回覆](../../../app/server/src/controller/duel_controller.rb#L1588) · [原生終局守衛](../../../web-client/session.js#L1395) · [目前中繼](../../../tools/legacy-web/serve.py#L404)

## 來源中另有入口的任務

| 原版路徑 | 可達性及交付條件 |
| --- | --- |
| 教學任務 | Quest 地圖選單的 `btn_map0` 在原版直接顯示，`QUEST_TUTORIAL` 類與登入後四段導覽不同。偏移2008、event_id 2，首張 2009「微笑的平原」。2009–2013 的資料存在於原始發布 CSV。角色封包有 `tutorial_quest_flag/clear_num`，普通旗標與 Auth tutorial telemetry 不可互換。原版依到達的專用旗標展示，不在第一階段可玩目錄硬寫常態已開。 |
| 常規活動、人氣投票 | `btn_event1` 受 `CONFIG::QUEST_EVENT_ON`，`btn_vote` 受 `QUEST_CHARA_VOTE_ON` 控制。原始與 sandbox 的活動旗標均 false，sandbox 人氣投票也 false，有入口不代表當前服開放。常規 event 偏移3026、event_id9（首張3027），人氣偏移5000、event_id4，Ruby 初始旗標使用5006 允許整組。角色封包各有分開的 flag/count。UI 顯示先比對 locale 配置、實際資料和服務鑑權，再分別驗收。 |
| EX、舊節慶、頭目邀請、好友任務 | 原版道具使用是 CS7，`AvatarItem` 明確有 EX 地圖、指定活動地圖、頭目地圖授予及特殊道具效果。這些不一定由普通地圖選單搜索，也不能套一般 `flag+1`、AP 或材料規則。CS18 是真的收件者 Avatar ID 和真庫存 ID。受贈狀態6可能有原版好友獎勵、持有和事件限制。選任務與活動道具要作玩家明確操作。 |
| 無限塔及 Raid | Ruby 有地圖991的層數、CPU HP/AP/DP 與寶箱獎勵覆寫，SC27 層數、結算日誌保存樓層。公開的本次 JA 地圖 CSV 沒有991，且普通旗標不會到991。若要做須有相符的原版可取得來源和原版主資料。Raid 屬獨立 lobby 分支、控制器／協定／援助和獎勵，不併入普通 Quest 的 PvE 交付。 |
| 其他原版相關操作 | Quest CS4 是 avatar 更新檢查、SC4/AP 與可能的其它變更。CS7/8 道具使用／購買、CS9/10 任務日誌讀取、CS11 宣告寫入及 CS14/15 放棄／刪除有各自的行為。任務日誌 CS11 宣告與 Ruby handler 名多出 `_info`，寫入可用性須另驗。未實測之前不要以既有唯讀視窗聲稱完成。 |

來源：[原版地圖選單](../../../app/client/src/view/image/quest/SelectMapWindowImage.as#L137) · [預設活動關閉](../../../app/client/src/Unlight-config.orig#L153) · [Sandbox 選項](../../../app/client/src/Unlight-config_sandbox.xml#L157) · [旗標類別](../../../app/server/src/model/avatar.rb#L2763) · [事件初始化](../../../app/server/src/model/avatar.rb#L5052) · [事件常數](../../../app/server/src/constants/common_constants.rb#L1679) · [道具授予](../../../app/server/src/model/avatar_item.rb#L736) · [好友任務](../../../app/server/src/model/avatar.rb#L4791)

## 優先整合與驗收

### 第一張普通地圖的原版對照

- 未加相容補丁的繁中 `Unlight.swf` 連隔離 Ruby `ee38622`。空庫存角色從大廳實際進入魔女山谷，畫面是 `0/3`、`0/4`、Deck 1 及 AP `5/5`。保留原大廳連線，按 Back 後原 Quest 連線關閉。另一位角色有一筆已發現和一筆搜尋中真實庫存，原版顯示 `2/4`、AP `3/5`、NEW 圖示和搜尋倒數。該原版擷取的任務名稱及角色外觀存在缺失。[原版空清單](/workspace/shared/unlight-web-port/flash-parity/quest-map/01-map1-empty-original.png) · [原版兩筆庫存](/workspace/shared/unlight-web-port/flash-parity/quest-map/05-map1-found-and-pending-original.png) · [原版返回](/workspace/shared/unlight-web-port/flash-parity/quest-map/04-map1-back-lobby-original.png)
- Quest 認證後，真正的原版封包先出 `SC32`，只向有已發現項目的角色重播該筆 `SC6`。搜尋中項目由原登入 Data 快照維持，普通入場流程未見 `SC14`。魔女山谷飾帶的滑入處為 `(266.5,314.5)` 起約 141×38，底圖上的城堡裝飾位於上方；點飾帶開「開始搜索」視窗，左下 MAP 開選圖。Back 前關閉視窗，試玩期間未提交搜尋或扣減 AP。[原版封包及 SQLite 查核](/workspace/shared/unlight-web-port/flash-parity/quest-map/wire.json) · [飾帶滑入](/workspace/shared/unlight-web-port/flash-parity/quest-map/06-map1-landmark-label-hover-original.png) · [選圖](/workspace/shared/unlight-web-port/flash-parity/quest-map/03-map-picker-original.png) · [搜尋預覽](/workspace/shared/unlight-web-port/flash-parity/quest-map/07-map1-search-preview-original.png)

### 固定舞台的交付與後續驗收

固定舞台第一個驗收案例由大廳 `btn_b` 進真正的普通任務地圖。新角色應看到魔女山谷 `0/3`、空庫存 `0/4`、實際 Deck 1、角色與 AP。既有角色另驗已發現和搜尋中列共存，依持有 ID 把 Quest 登入重播與角色快照對位。Back 使用 `(712,0)` 的原圖，播放 `ulse01.mp3`，退場後送一次 `Quest CS2` 並等該連線關閉。回大廳驗既有四條連線和任務入口焦點。[原版進入](../../../app/client/src/view/QuestView.as#L288) · [原版退出](../../../app/client/src/view/QuestView.as#L466) · [Ruby 登入重播](../../../app/server/src/controller/quest_controller.rb#L515)

第一區 `map01_ch.swf` 原底圖是 `(0,32)` 的 760×444 JPEG，主地標及 Up／Over 位於 `(239,214)`。`quest_base.swf` 提供上下框與導航，`questlist_ch.swf` 在 `(464,36)` 依容量選固定幀，任務列從 `(464,44)` 起每排 16 px。兩個畫面的 AP 共享原封包狀態。任務角色為 `(525,230)`，大廳的右側三個入口在任務模式隱藏。[地圖來源](../../../app/client/src/view/image/quest/WorldMapImage.as#L381) · [清單初始化](../../../app/client/src/view/scene/quest/QuestList.as#L184) · [共用角色模式](../../../app/client/src/view/scene/common/AvatarView.as#L221)

### MAP 選區、搜尋預覽與音樂

| 項目 | 原版規格與新版行為 |
| --- | --- |
| MAP | 部件起點 `(0,416)`，選單底圖 `(32,64)` 起 384×384，約 300 ms 正弦減速滑入及滑出。開啟時暫停後方操作，關閉恢復焦點。普通世界依角色旗標開放六個區域、36 個地標。MemoryLand 沿用實跑畫面上的五條地名飾帶，互動依 Data 或建角交接傳回的獨立旗標啟用。選區及地圖箭頭沿用同一條 Quest 連線。[選單原始行為](../../../app/client/src/view/scene/quest/QuestSelectMapWindow.as#L47) · [原始地理畫面](../../../source-login/quest-art/worlds.json) |
| 搜尋預覽 | 點地名飾帶立即開 `(270,280)` 起 368×152 的原版視窗。縮圖 `(522,338)` 起 88×44，費用取對應地圖的原始 AP。魔女山谷從 `0分` 開始即為 1 AP。時間選項依序為 0、3、10、30 分，1、2、4、8、16 小時，1、3 天。同次任務開關保留所選時間，X 播放 `ulse01`。按 OK 確認搜尋，送出後等 Ruby 回覆再更新 AP 和清單。[原始滑桿及預覽](../../../app/client/src/view/image/quest/GetSendPanel.as#L248) · [費用字形放大](/workspace/shared/unlight-web-port/flash-parity/quest-preview/original-ap-glyph-comparison.png) |
| 音樂 | 結束大廳及任務時在兩秒內分十步衰減。新場景的原版音軌可在舊音軌淡出期間由起點播放。進出設定仍使用同一大廳音軌。[大廳原始淡出](../../../app/client/src/controller/LobbyCtrl.as#L323) · [任務原始淡出](../../../app/client/src/controller/QuestCtrl.as#L695) · [新版播放](../../../source-login/bgm.js) |

隔離 Ruby 實跑有普通旗標 `0`、`3` 及教學旗標 `2008`。旗標 `3` 的角色初次進入普通第二頁，只能點已解鎖的黑森林。MAP 回第一頁時可點三個原版地標，並以地圖箭頭往返。切區、開關預覽及試選時間全程維持相同 Quest 連線、AP、裝備和庫存。未修補的原版另曾在從 MemoryLand 選回 HexRealm 後保留前一張底圖，已留存該次差異。[新版第二頁實跑](/workspace/shared/unlight-web-port/flash-parity/quest-preview/root-01-native-region2.png) · [原版畫面與步驟](/workspace/shared/unlight-web-port/flash-parity/quest-map/picker-preview/README.md)

### 送出搜尋與到期

- 未修補繁中 SWF 從空清單實跑魔女山谷。即時取得落日大蝙蝠後顯示 `(270,280)` 起 250×130 的共用面板，內文為任務名稱及「取得」，確認鍵約在 `(395,371)`。接著在同一 Quest 連線提交 3 分鐘搜尋。實際 Ruby 係數為 100，玩家等待自然到期，該筆在伺服器記錄的期限過後約 1.29 秒更新為 NEW。兩次搜尋各扣 1 AP，返回大廳後 SQLite 仍為 AP 3/5、庫存 2/4。[原版即時取得](/workspace/shared/unlight-web-port/flash-parity/quest-search/03-instant-acquired.png) · [原版到期](/workspace/shared/unlight-web-port/flash-parity/quest-search/09-timed-natural-new.png) · [原版步驟、來源與封包](/workspace/shared/unlight-web-port/flash-parity/quest-search/README.md)
- 預覽確認及回到地圖沿用 `ulse01.mp3` 與原任務 BGM。即時結果待 Ruby 傳回真正任務 ID，取得繁中名稱後顯示「確認」。原始碼有這個標題，現有未修補 Ruffle 擷取缺字。取得視窗保留來源畫面的底板縮放，使用整張 `panel_gene.png` 投影到 250×130，分隔在面板內 y42，底角花紋同比例拉伸。定時列以原始狀態4指定的沙漏和「搜索中」呈現，直到 Ruby 確認後以同一持有 ID 更新為 NEW。未修補 Flash 的新建列初始化有時會先覆寫成 NEW 圖示。[即時面板來源](../../../app/client/src/view/image/quest/GetResultPanel.as#L111) · [列狀態及初始圖示](../../../app/client/src/view/image/quest/QuestItemImage.as#L67) · [新版取得視窗](/workspace/shared/unlight-web-port/flash-parity/quest-search-live/root-01-native-instant-acquired.png)
- 新搜尋用原版計時索引與實際係數排程。重新登入後以 Data 傳來的整秒重新計算，留出不到一秒的截去部分才查詢到期，同筆只送一次 `CS17`。早期原版相容測例曾提前 327 ms 查詢，卡在 `00:00`。這是新版的到期處理差異。Ruby 的截止時間、成功條件及資源成本照舊。[原版早送記錄](../README.md#L77) · [共享 Quest 連線](../../../web-client/session.js)
- 新版的重新登入測例實跑 180 秒，期間實際用 Back 返回、重進及重新登入。記錄到 `CS17` 於原始截止時間後 889 ms 送出。暫緩 Ruby 的真回覆期間，倒數列仍是同一持有 ID 與未知任務。放行後才更新為落日大蝙蝠、NEW。無額外取得視窗，AP 維持 4/5。[等待列](/workspace/shared/unlight-web-port/flash-parity/quest-search-live/qa-03-native-timed-pending.png) · [返回重進後](/workspace/shared/unlight-web-port/flash-parity/quest-search-live/qa-04-native-pending-after-back-reentry.png) · [到期更新](/workspace/shared/unlight-web-port/flash-parity/quest-search-live/qa-05-native-timed-discovered.png)
- 另依原版順序在新版同一 Quest 連線連續跑即時與定時搜尋。定時的唯一 `CS17` 在送出搜尋約 180.038 秒後、Ruby 實際截止約 38 ms 後出現。兩版皆從 AP 5/5、空清單到 AP 3/5、兩筆任務，再乾淨返回大廳。並排用兩版各自的測試角色，等待截圖的擷取時點相差數秒。[即時取得並排](/workspace/shared/unlight-web-port/flash-parity/quest-search-live/instant-acquisition-comparison.png) · [到期並排](/workspace/shared/unlight-web-port/flash-parity/quest-search-live/timed-found-comparison.png) · [連續操作量測](/workspace/shared/unlight-web-port/flash-parity/quest-search-live/root-continuous-timing.json)

### 任務詳情的來源規格

| 項目 | 落日大蝙蝠及一般任務的原始行為 |
| --- | --- |
| 入口和返回 | 點擊可檢視的任務列，立即顯示本地詳情並播放 `ulse01.mp3`，保持 `ulbgm03.mp3` 播放位置。局部返回使用 `btn_mapback_ch.swf` 在 `(8,40)` 的 88×24 Up／Over 圖，清除選定任務與地形後回世界地圖。右上全場 Back 才送 Quest `CS2` 回大廳。[任務列](../../../app/client/src/view/scene/quest/QuestItem.as#L375) · [局部返回](../../../app/client/src/view/scene/quest/QuestMapClip.as#L185) |
| 佈局和轉場 | 即時切換。底層世界地圖與區域量計乘 RGB 0.3 並暫停命中，詳情插在深度 27，隱藏左下 MAP，保留角色、清單和牌組。任務標題從 `(200,33)` 起 250 px 寬右對齊，繁中 Mincho Bold 16 px，附地區和任務點數兩行。敘述從 `(11,446)` 起，受贈者另在 `(11,420)`。[場景合成](../../../app/client/src/view/QuestView.as#L521) · [標題與敘述](../../../app/client/src/view/image/quest/QuestCaption.as#L119) · [繁中樣式](../../../app/client/data/css/UL.css.cn#L1336) |
| 地形與命中 | 路線上有三列、最多五欄，舞台列座標為 x 88／184／280；起點 y 36，地形欄 y 100／180／260／340／420。落日大蝙蝠只有 x 184、y 100 的 slot1，原始地形 201／stage11，使用 `land_am_wasteland.swf` 和 `land_event.swf` 敵人圖。右側 96×144 資料板固定在 `(464,320)`。滑過地形填入名稱、原圖和說明，移開時清空這三項。開始前不可走格。[格子和路線](../../../app/client/src/view/scene/quest/QuestMapClip.as#L114) · [地形圖與滑過](../../../app/client/src/view/scene/quest/QuestLandClip.as#L169) · [地形資料板](../../../app/client/src/view/scene/quest/QuestDataClip.as#L73) |
| 資料操作 | NEW 點列另送一次 Quest `CS12`。按鈕以來源 `btn_quest.swf` 放在 x 16，起始、丟棄、受贈控制的 y 分別為 72、112、152，各依原版狀態顯示。各寫入獨立驗收，避免把開詳情當成開始、放棄、丟棄或贈送。[按鈕事件與座標](../../../app/client/src/view/image/quest/QuestCommandImage.as#L110) · [Ruby 確認](../../../app/server/src/model/avatar.rb#L3020) |
| 牌組 | 進場以角色保存的 `current_deck` 選定牌組。左右箭頭依持有索引循環，包含空牌組與鎖定牌組，跳過 Binder。箭頭位於 `(8,632)` 與 `(40,632)`，卡位以 `(53+89×位置,495)` 起半尺寸顯示，名稱從 `(65,635)` 起，格式為「索引. 名稱」。牌組選擇透過既有 Lobby 的 `CS12(i32 索引)` 與 `SC9(i32 目前索引)` 儲存和確認。選擇有卡的牌組與能開始任務是兩項獨立條件。[牌組位置與切換](../../../app/client/src/view/scene/quest/QuestDeck.as#L174) · [循環索引](../../../app/client/src/model/DeckEditor.as#L138) · [Ruby 持久化](../../../app/server/src/controller/lobby_controller.rb#L126) |

- 原版未修補繁中 SWF 實跑落日大蝙蝠。首次點 NEW 後約 104 ms 觀察到同一持有 ID 的狀態1回覆，SQLite 確認 AP 4/5、牌組及庫存筆數。滑入 `(225,125)` 填入高原圖，這份原版的名稱只顯示數字 1，敘述缺字。移出後保留資料板原本的標籤及分隔線。左上返回與再次開啟沿用同條 Quest，右上 Back 才關閉。原版另驗 Deck 1 → 2 → 3 → 1、任務音樂與再次點列的音效。[選取詳情](/workspace/shared/unlight-web-port/flash-parity/quest-details-original/03-first-detail-settled.png) · [滑入地形](/workspace/shared/unlight-web-port/flash-parity/quest-details-original/04-terrain-hover.png) · [空牌組](/workspace/shared/unlight-web-port/flash-parity/quest-details-original/08-detail-deck-two.png) · [原版封包與步驟](/workspace/shared/unlight-web-port/flash-parity/quest-details-original/wire.json)
- 22 個原版 SWF 的 64 張詳情圖包含按鈕狀態、資料板、地形、底座、路線與事件符號。清單保留來源路徑、雜湊、元件和畫格。兩次擷取逐位元一致。寶箱的巢狀閃光目前固定用來源第一幀，動畫循環待驗。[來源清單](../../../source-login/quest-art/sources.json) · [可重跑擷取](../../../tools/legacy-web/extract_quest_detail_art.py)
- 新版實測原版指標座標 `(225,125)` 滑入、`(26,49)` 返回，回到世界地圖時恢復原任務列焦點。兩次開啟詳情各播一次 `ulse01`，任務 BGM 播放物件與進度延續。右上 Back 關閉 Quest，其他四條連線保留。測試另在真實 Ruby 確認後暫緩與遺失回覆，驗清單對帳及不重複送出。牌組箭頭實跑索引 1→2→3→1→3→1。並排使用相同初始角色配件與首張卡 ID。原版除錯畫面和牌組卡圖仍有可見差異。[地圖返回並排](/workspace/shared/unlight-web-port/flash-parity/quest-details-live/map-back-comparison.png) · [獨立驗收](/workspace/shared/unlight-web-port/flash-parity/quest-details-live/root-detail-acceptance.json) · [新版封包](/workspace/shared/unlight-web-port/flash-parity/quest-details-live/qa-native-detail-wire.json)

### 後續驗收

1. 以首回合實際先手和距離接上攻防。核對 `SC51` 的可操作方、可用牌、兩方鎖定、骰子與扣血，保留同一條 Quest。對照原版的攻擊、防禦及等待版面、動畫和聲音。[原版回合順序](../../../app/server/src/rule/event/multi_duel_event.rb#L45) · [原版階段切換](../../../app/client/src/view/scene/game/DuelTable.as#L545)
2. 接續換角與其他回合。單卡、多卡與必要換角各有案例。逐項補戰鬥日誌、有效牌標記、其餘卡面來源與疊層、任務中放棄及其他地形入場。[原版卡面圖層](../../../app/client/src/view/scene/common/CharaCardClip.as)
3. 接續局結果及任務結算，按持有 ID 驗證 `SC24`。其餘原版搜尋索引、區域和特殊分支按各自的可達狀態驗收。
4. 首先跑原版與固定舞台同一區域 q1 落日大蝙蝠，覆蓋登入→進區→搜尋→同一 Quest→戰鬥→結算→任務地圖→Lobby。再跑 q3 大蝙蝠之群（slots1→4）雙戰、q4 山丘矮人（slot1空地→4真戰）、q32 紫色泥沼澤2（首格固定 30 Gem，下一格真戰）。另選一張單卡與真正兩卡可換角牌組、升級，以及確實受理的敗或和。量測 AP、持有 ID/狀態、clear log、牌組鎖、Gem/Exp/掉卡和 socket 數。截圖核對互動時序和場景聲音。
5. 測試延遲登入 Pong 後按 Back、遺失 CS5 的真 SC6/SC4、扣完 AP 缺 SC17、進格缺 SC40、缺 SC46、缺己方卡片 ACK、終局漏 SC24、伺服器或瀏覽器送 CLOSE 兩種方向。依隔離 Ruby 的 SQLite 查核持久化結果，測試紀錄只保存非敏感資料。早期原版、共享傳輸和暫停分支各自有測例，固定舞台狀態依本分支實跑結果更新。

### 開始與首格的原版觀察

| 操作 | 落日大蝙蝠的繁中 Flash 實跑 |
| --- | --- |
| 空牌組 | 切到原版 Deck 2 後按 `(36,86)` 的開始。原始碼警告「卡組是空的」，以 `ulse01` 點擊及 `ulse02` 提示。原始面板位於 `(303,290)` 起 174×100，這份 Flash 擷取的標題和訊息因裝置字型缺字。測得 Quest 上沒有 `CS13`，庫存、狀態及 AP 都維持原值。[警告畫面](/workspace/shared/unlight-web-port/flash-parity/quest-start-original/03-empty-deck-warning.png) · [開始前的牌組檢查](../../../app/client/src/controller/QuestCtrl.as#L478) |
| 開始 | 恢復 Deck 1 後原版直接送 `CS13(持有1,牌組1)`。先得到 AP 4/5，再收到相同持有 ID 與任務 ID 的狀態2。Ruby 保存 Deck 1 鎖定。角色棋子出現於 `(224,76)`，開始、丟棄及贈送換成放棄。地圖內與全場 Back、牌組箭頭隱藏。[原版進行中](/workspace/shared/unlight-web-port/flash-parity/quest-start-original/05-confirmed-orig-in-progress.png) · [進行中的畫面狀態](../../../app/client/src/view/scene/quest/QuestMapClip.as#L194) |
| 首格 | 滑入 `(225,125)` 顯示可走的高原狀態。點下送 `CS16(持有1,牌組1,格1)`。原版順序為 `SC128(1)`、`SC37`、`SC40`，並收到原版 `SC36`。對戰由實際收到的舞台 11、己方卡 21、對手卡 1004 與傷勢驅動。開始與首次踏入的 AP 都維持 4/5，庫存仍在同一筆，牌組仍鎖定。真正的格子進度在結算後才更新。[原版滑入](/workspace/shared/unlight-web-port/flash-parity/quest-start-original/06-first-land-hover.png) · [封包記錄](/workspace/shared/unlight-web-port/flash-parity/quest-start-original/wire.json) |
| 戰鬥入場 | `SC128` 移動棋子，`SC37` 安排入場，`SC40` 確認配牌資料。原版用離場舞台截圖與 Perlin 雜訊逐幀擦除，露出戰鬥舞台，任務 BGM 兩秒淡出並由原版 `bgm000.mp3` 接續。[轉場原始碼](../../../app/client/src/view/scene/common/Transition.as) · [Quest 入場](../../../app/client/src/view/QuestView.as#L758) · [原版戰鬥初始背景](/workspace/shared/unlight-web-port/flash-parity/quest-start-original/07-original-first-battle.png) |

- 原版 Pawn 位移由 `0.9/SPEED` 計為約 529 ms。入場在 `SC37` 後等 1,100 ms，燃燒依 40.8 FPS 更新 34 次閾值。Ruffle 軟體合成會延長實際擷取間隔，40.8 FPS 是此動畫的原始計時參數。[原版時序和雙向封包](/workspace/shared/unlight-web-port/flash-parity/quest-start-original/README.md) · [原版自動抽牌](/workspace/shared/unlight-web-port/flash-parity/quest-start-original/ready/03-auto-ready-draw-original.png)
- 五張起始卡用原始 SWF 的透明插畫、框架、原版槽色星號、角色資料表、歷史 Mincho 與 Bradley 字型合成。另有 1,084 份來源插畫可由同一鏡像經 SHA-256 核驗解碼。鏡像缺少 40 個插畫引用，另有 102 筆母表卡片缺少其指定疊層幀，會保留可查閱的卡名及 ID。文字在瀏覽器的光柵化仍與 Flash 有細微差異。[卡面素材清單](../../../source-login/card-art/index.json) · [原始插畫清單](../../../source-login/card-art/illustration-sources.json)
- 新版燃燒依來源時鐘與閾值，沿用五層 Perlin 雜訊參數逐步揭露原始戰鬥底圖。遮罩以半解析度採樣，亂數圖樣與 Flash 的取樣有差異。[來源動畫與地形素材](../../../source-login/quest-art/sources.json) · [新版轉場](../../../source-login/quest-battle-entry.js)

### 首戰開場、抽牌與移動階段

| 階段 | 原版規格與觀察 |
| --- | --- |
| 開場 | `QuestView.bring()` 依序等待開場動畫、主副名稱與角色卡，收起開場圖層，再顯示牌桌、立繪、生命與階段列，最後呼叫 `startOk`。落日大蝙蝠的 `SC37` 兩個開場對話欄為空。中距離立繪原版站在 x184、576，地面定位 y416。玩家卡 21 為古魯瓦爾多，生命 7/7。對手卡 1004 為蝙蝠，生命 1/1。左側開場虛擬人物及右下角對戰虛擬人物使用同一份已裝備部件。[開場原始碼](../../../app/client/src/view/QuestView.as#L862) · [虛擬人物座標](../../../app/client/src/view/scene/game/DuelAvatars.as#L72) |
| HUD | 原版聊天底板為 `(168,560)` 起 336×88，All／Chat／Game 沿用來源標籤。五個手牌槽由 `(175,470)` 起每 60 px 一個，實際手牌在其上。技能列起於 `(168,439)`，古魯瓦爾多依原版技能母表顯示「猛擊」和攻擊圖示，蝙蝠沒有技能。開場虛擬人物以自身原點翻面，戰鬥右下角以 `(590,473)` 為原點。聊天底板、技能列與 Bonus 在此段呈現初始畫面，互動和後續狀態另驗。[聊天與標籤](../../../app/client/src/view/scene/game/ChatArea.as#L88) · [技能列](../../../app/client/src/view/scene/game/FeatInfo.as#L590) · [素材與座標](../../../source-login/quest-art/sources.json) |
| Ready 與抽牌 | 該場原版只送一次無參數的 Quest `CS22`，同一連線收到 `SC43` 回合 1、`SC44` 行動卡、`SC45` 事件卡及 `SC46` 移動開始。記錄中的己方抽到五張行動卡與一張事件卡。牌 ID 與正反方向依回覆及遮罩，依原版順序排入手牌。對手回覆只含兩類張數。新一輪採用當次 Ruby 的實際發牌結果。[原版初始抽牌](/workspace/shared/unlight-web-port/flash-parity/quest-opening-original/03-first-draw-original.png) · [抽牌解碼](../../../app/client/src/net/server/QuestServer.as#L1035) · [Ruby 發牌](../../../app/server/src/controller/duel_controller.rb#L452) |
| 第一個移動畫面 | 原版先完成 Draw，再顯示紫色 MOVE PHASE、原圖方向、確認鈕及綠色雙向計時帶。Flash 畫面綁定 `DuelTable` 的 60 秒。Ruby 的移動等待另為 120 秒，實際階段以伺服器回覆為準。該次原版未點任何牌，CPU 已自行送入兩個匿名牌背，`SC61` 遮住了牌 ID。牌背隨實際匿名通知更新。[原版移動畫面](/workspace/shared/unlight-web-port/flash-parity/quest-opening-original/05-first-move-idle.png) · [Flash 計時](../../../app/client/src/view/scene/game/DuelTable.as#L34) · [Ruby 等待](../../../app/server/src/constants/constants.rb#L41) |
| 聲音 | 隔離原版混音比對出兩次階段聲 `ulse12.mp3` 及原版發牌聲 `ulse06.mp3`，舞台 BGM 持續使用 `bgm000.mp3`。每張牌對應原始發牌延遲。原版語音設定另受素材開關與稀有度條件控制。[階段音來源](../../../app/client/src/view/scene/game/PhaseArea.as#L201) · [發牌聲來源](../../../app/client/src/view/scene/game/BaseHand.as#L830) |

- 新版從正式任務入口實跑。原版與新版皆使用舞台 11、起始牌 21、敵方卡 1004、距離 2。開場完成後只送一次 Ready。各自依 Ruby 發出的牌顯示本方牌面與對手張數，計時與階段音透過瀏覽器量測。生命、AP 4/5、同一任務和牌組鎖均經核對。[原版完整紀錄](/workspace/shared/unlight-web-port/flash-parity/quest-opening-original/README.md) · [新版最終驗收封包](/workspace/shared/unlight-web-port/flash-parity/quest-opening-live/qa-final-first-move-wire.json)
- 測試保留原版 `SC43–45` 並暫緩 `SC46`。新版先顯示 Draw 和回合一。收到原版回覆後才補牌及顯示 Move。另一場在回覆逾時後才放行相同的 Ruby 訊息，保持結果未確認，手牌和計時維持空白。同一連線只送一次 Ready。[暫緩 Draw](/workspace/shared/unlight-web-port/flash-parity/quest-opening-live/qa-03-draw-awaiting-sc46.png) · [結果未確認](/workspace/shared/unlight-web-port/flash-parity/quest-opening-live/qa-05-ready-reply-uncertain.png) · [重跑](qa.md#重跑首戰開場抽牌與首次移動畫面)

目前涵蓋有來源立繪的落日大蝙蝠首戰。右下人物底座、雙方切入肖像和計時警示已接入。回合數字顏色、卡面經驗條、聊天操作、其他對手與非空開場對白仍待驗。Flash 和瀏覽器的文字光柵化也有細微差異。並排保留兩次實跑各自的亂數牌序與取樣時點。[舞台與 HUD 來源](../../../source-login/quest-art/sources.json) · [立繪與牌面來源](../../../source-login/battle-card-art/index.json)

### 首回合移動操作與結果

| 操作與狀態 | Flash 與 Ruby 規格 |
| --- | --- |
| 選方向 | Stage 11 使用 3 對 3 版面。後退、原地、換角、前進的圖塊原點依序為 x272、328、384、440，y258。前進送 `CS23(-1)`，原地 `0`，後退 `1`，換角 `3`。本方 `SC60` 確認後，對應可點按鈕隱藏，露出同位置的紫色底圖方向。對手 `SC60` 不能改本方選擇。Ruby 在待定 `2` 仍可接受出牌，計入距離的方向值為 `0`。相同舞台有單卡及多卡牌組，換角有獨立階段。[按鈕原點](../../../app/client/src/view/image/game/MoveButton.as#L68) · [圖塊可見性](../../../app/client/src/view/scene/game/DropTable.as#L618) · [Ruby 方向](../../../app/server/src/rule/entrant.rb#L1196) |
| 出牌與收牌 | 點手牌送到桌面，點桌上牌收回，原版按下後暫停卡片操作 250 ms。`CS24` 帶物理牌 ID、當前混排手牌索引及朝向。`CS25` 帶 ID 與當前桌面索引。收到本方 `SC61`／`SC62` 核對 ID 和索引後才重新排牌，成功移動才播放 `ulse06.mp3`。收回的牌依原邏輯追加到混排手牌尾端。索引 `-1` 且 ID `0` 表示未移動。[Flash 玩家手牌](../../../app/client/src/view/scene/game/PlayerHand.as#L130) · [Ruby 卡片交換](../../../app/server/src/rule/entrant.rb#L424) |
| 旋轉 | 滑入卡片出現原始轉鈕。旋轉用獨立 `CS32`，包含手牌或桌面的區域、索引、物理牌 ID 與相反朝向。正反由本方 `SC63` 確認，原版用 `0.2/SPEED` 秒旋轉 180° 並播 `ulse08.mp3`，不連帶出牌。生效標記另由 `SC82` 的名單與遮罩驅動。[旋轉模型](../../../app/client/src/model/Entrant.as#L272) · [動畫及音效](../../../app/client/src/view/scene/game/ActionCardClip.as#L702) · [生效標記](../../../app/client/src/net/server/QuestServer.as#L1520) |
| 確認與逾時 | OK 與畫面 60 秒到期都走同一 `initDone`，`CS26` 的兩個 UTF 字段留空。`SC67` 只確認指定一方已完成操作。`SC47` 結束牌桌輸入，`SC48` 提供結果。Ruby 自己仍有 120 秒的階段期限。原版四個方向按鈕和 OK 的 SWF 無內嵌音效，點擊處理也無個別音效呼叫。[OK 與逾時共同事件](../../../app/client/src/view/scene/game/DuelTable.as#L165) · [計時](../../../app/client/src/view/scene/game/PhaseTimer.as#L121) · [Ruby 階段](../../../app/server/src/rule/event/multi_duel_event.rb#L103) |
| 移動結果 | Ruby 從雙方實際牌計算先手和距離，平手使用 Ruby 亂數。`SC48` 帶距離、先手、雙方牌 ID／朝向、已依方向處理的點數和每方一個鎖定旗標。原版先翻開對方桌面牌，未鎖定播 `ulse29.mp3`，鎖定用 `ulse28.mp3`，再以實際點數播放兩邊箭頭及消去配對。之後掃除已用牌，進入原版下一階段。[結果封包](../../../app/server/src/controller/duel_controller.rb#L489) · [原版翻牌](../../../app/client/src/view/scene/game/FoeHand.as#L438) · [方向箭頭](../../../app/client/src/view/scene/game/MoveArrow.as#L107) |

- 原版指標實跑選後退後，以物理牌 58 驗 `CS32`／`SC63`、`CS24`／`SC61`、`CS25`／`SC62`。兩次 `SC82` 各先於本方位置確認，點數先到 3，再回到 0。原版 Ruffle 觀測到確認後仍在播放先前移牌動畫，新版也分別檢查已確認牌序和動畫後落點。[原版操作與封包](/workspace/shared/unlight-web-port/flash-parity/quest-movement-original/README.md) · [方向滑入並排](/workspace/shared/unlight-web-port/flash-parity/quest-movement-live/direction-hover-comparison.png) · [放牌並排](/workspace/shared/unlight-web-port/flash-parity/quest-movement-live/card-on-table-comparison.png)
- 原版以另一個新角色前後核對本方牌 7、對手牌 36，兩張朝向字串皆為 `false`。實測 `CS26` 一次後先到 `SC47`，再到 `SC48`。原版結果為中距離 2、對手先攻、雙方移動點數 1 與 −1。連續截圖依序保留對手牌背、翻開、箭頭抵銷、收牌及原版防禦階段。[原版中繼封包](/workspace/shared/unlight-web-port/flash-parity/quest-movement-original/final/relay-wire.json) · [原版抵銷箭頭](/workspace/shared/unlight-web-port/flash-parity/quest-movement-original/final/07-move-result-original.png) · [原版下一階段](/workspace/shared/unlight-web-port/flash-parity/quest-movement-original/final/10-move-result-original.png)
- 新版獨立指標流程先選前進再選後退。真實牌 9 旋轉後從手牌索引 1 放入桌面 0，收回後從混合手牌索引 5 再放入。按 OK 發一次 `CS26`。`SC48` 確認距離 3、對手先攻、雙方點數 1 與 3。雙方牌面驗證為 56×86，維持原來的桌面區域。同一登入的五條連線、AP 4/5、任務與鎖定牌組均經核對。[新版指標封包](/workspace/shared/unlight-web-port/flash-parity/quest-movement-live/root/root-manual-wire.json) · [新版結算畫面](/workspace/shared/unlight-web-port/flash-parity/quest-movement-live/root/root-manual-03-result.png)
- 另一場保持畫面原地等待，從觀察到 Move 到發送 `CS26` 約 59.6 秒。一整輪無方向與牌片操作、開始和確認各一次，實際 Ruby 結算距離 1、對手先手。另在真出牌回覆延遲至未確認後才交付的案例，牌留手中，驗證再次點擊也維持同一次出牌命令。[自然逾時封包](/workspace/shared/unlight-web-port/flash-parity/quest-movement-live/root/root-timer-wire.json) · [計時警示](/workspace/shared/unlight-web-port/flash-parity/quest-movement-live/root/root-timer-02-original-countdown-warning.png) · [遲到回覆畫面](/workspace/shared/unlight-web-port/flash-parity/quest-movement-live/qa-05-movement-reply-uncertain.png) · [原樣重跑](qa.md#重跑首回合移動)

此段支援單卡落日大蝙蝠的主要移動操作。換角、攻防操作、戰鬥日誌的先手與距離文字、逐牌有效標記與其他事件牌效果待接續。原版移動確認後會短暫保留停止的計時條，新版此時收起，待接上下一階段的 HUD 交接時核對。兩版並排保留各場真正抽到的牌與取樣時點。[結算並排](/workspace/shared/unlight-web-port/flash-parity/quest-movement-live/movement-result-comparison.png) · [移動素材清單](../../../source-login/quest-art/sources.json) · [卡片原始素材](../../../source-login/battle-card-art/index.json)

第一張地圖已在 Chromium 以實際 Quest 認證、Back 及隔離 Ruby 連線驗證。中繼另驗 Chromium 端與伺服器端各 25 次正常關閉，均為 `1000` 且 `wasClean=true`。三次測試 TCP 重設得到 `1011`，畫面在收不到確認時會保留重登入提示。[地圖與兩筆庫存並排](/workspace/shared/unlight-web-port/flash-parity/quest-map/quest-map-inventory-comparison.png) · [重跑方法](qa.md#重跑任務地圖的庫存及返回)

[原版 Ruffle 首場 PvE 與持久化](../README.md#L21) · [原版倒數](../README.md#L77) · [共用 AP／開始](../README.md#L179) · [第一回合手牌等早期原生測例](../README.md#L239) · [換角及雙戰鬥](../README.md#L313) · [同次登入結算](../README.md#L337) · [新建單卡，真 180 秒](../README.md#L349) · [雙卡續遊](../README.md#L357) · [固定舞台地圖驗收](../../../tools/legacy-web/check_source_lobby.py#L321)
