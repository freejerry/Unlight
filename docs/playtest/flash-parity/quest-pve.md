# 原版 PvE 行為盤點與整合順序

工作基準為 `/workspace/Unlight-lobby-integrated` 的 `codex/unlight-lobby-integrated@cc2ef53`。本次僅比對 Git、ActionScript、Ruby、資料表及留存驗收。未登入、改寫資料、啟動服務或修改倉庫。封包編號由 Ruby 2.7 載入原始 `Unlight::Command::RECEIVE_COMMANDS`／`SEND_COMMANDS` 並取陣列索引。以下 CS 表示瀏覽器送給原版 Quest、SC 表示原版 Quest 回覆。Data SC6、Lobby SC4 是不同服務的角色資料封包。

## 分支基準與可直接沿用的部分

| 項目 | 整合分支 `cc2ef53` | 暫停分支及診斷證據 |
| --- | --- | --- |
| `/source-login/` | 已有原版來源登入、建角、同次登入 Data 交接、教學摘要及已驗收大廳。任務按鈕仍開啟大廳內庫存對話框，讀初次角色快照及同源文字。無獨立任務舞台、Quest 連線、搜尋或戰鬥控制。 | `8595426` 曾做獨立唯讀舞台、保留一條 Quest 連線、回大廳原版 CS2、一批地圖查詢與地圖音樂。`b04db83` 只加中繼關閉修正。兩個提交都不在整合分支。 |
| `/web-client/` 診斷實作（原生根入口） | 共享 `web-client/session.js`／`quest-data.js` 已可讀原版 Quest、搜尋、開始、地形、真實 Ruby AI 對戰、結算和返回清單。一般唯讀與搜尋/開始用短 Quest 連線。第一格後留住原版 socket。`startQuestSearch()` 目前固定使用 `questFlag+1` 的 1–35 普通地圖以及計時選項 1。 | 多段實際 Chromium、Ruby 和 SQLite 驗收留在 `docs/playtest/README.md`。此處的結果證明傳輸與遊戲行為可複用。固定舞台版面須另驗收。 |
| 原版 Ruffle | 原版對照可使用既有隔離 Ruby 與 Flash 載入流程。 | 地圖、首關戰鬥、兩個結果確認及通關進度已有瀏覽器截圖和隔離資料核對。 |
| Rust 倒數示範與 68 事件回放 | 各自獨立驗證工具，可維持現有用途。 | 具有倒數或播放 UI。首關的 Ruby 持有紀錄、AP、地形和對局仍由 Quest 服務管理。 |

相關入口與現有能力位於 [固定舞台 README](../../../source-login/README.md#L37)、[目前大廳的唯讀視窗](../../../source-login/lobby.js#L326)、[共用 Quest 傳輸](../../../web-client/session.js#L616)、[目前同源目錄](../../../tools/legacy-web/serve.py#L144) 與 [原生診斷說明](../../../web-client/README.md#L33)。應由整合分支做增量，暫停的版面與 CSS 無需合併。

## 入口、世界地圖與持有清單

1. 原版在大廳按「任務」先呼叫 Lobby 的角色更新和商品檢查，再設 `QUEST_NORMAL`／`STATE_QUEST`。若大廳切到 Raid 入口，按同一位置進獨立 Raid 流程。QuestView 停止大廳樂曲、起 QuestCtrl 並等待 `Host.CONNECT_AUTHED`，再掛載舞台。先前四條 Auth/Lobby/Data/GlobalChat 保留。Quest 使用 0 negotiation、1 login（原版會話金鑰），SC1 後原 server `do_login` 綁定 avatar、初始化目前地形/牌組、SC32 ActionCard 長度、逐筆 SC6 庫存。退出傳原版 CS2。Ruby 清除 listener/連線。原版後端允許同角色的重複 Quest 連線把舊連線擠掉，兩條正常並行沒有意義。瀏覽器測試可以用原版 CS3/SC3 封住同步 login resend，且不把 Pong 解讀成具備身分的寫入 ACK。[LobbyView](../../../app/client/src/view/LobbyView.as#L542) · [QuestView](../../../app/client/src/view/QuestView.as#L229) · [QuestServer](../../../app/client/src/net/server/QuestServer.as#L127) · [Ruby Quest do_login/logout](../../../app/server/src/controller/quest_controller.rb#L515) · [ULServer](../../../app/server/src/protocol/ulserver.rb#L184)
2. 探索解鎖讀真正角色的 `quest_flag`，世界地圖最新普通地圖以 `flag+1` 轉成 1-based ID，原版已開放較早地圖。世界地圖旗標到原版第 36 張，最新旗標 35 時是「聖女的寶座」。原版一般通關量計只在選中最新區域且旗標 <35 時顯示。地圖門檻是 `QuestMaps.csv.difficulty`，正常新角色地圖 1 魔女山谷是 0／3、地圖搜尋耗 1 AP。地圖 2 隱者之道門檻 3、AP1，35 通往玉座的回廊門檻 80、AP7，36 聖女的寶座門檻 1、AP10（最新區域量計仍隱藏）。目前共享目錄只以 `map=` 返回 1–35，必要時可純加原版最終地圖給固定舞台。Quest CS6(region i32)／SC14(region, CSV) 只是該 region 的服務端全域資料，普通開場最新地圖以角色旗標和 `QUEST_FLAG_MAP` 決定。位置上的 CS6 查詢原本註解。不要用曾實測的 44 筆 region0 來判斷全世界的玩家解鎖。[WorldMapImage](../../../app/client/src/view/image/quest/WorldMapImage.as#L272) · [QuestWorldMap](../../../app/client/src/view/scene/quest/QuestWorldMap.as#L237) · [QuestClearGauge](../../../app/client/src/view/scene/quest/QuestClearGauge.as#L184) · [區域查詢 Ruby](../../../app/server/src/controller/quest_controller.rb#L33) · [地圖原始資料](../../../app/server/data/csv/ja/QuestMaps.csv)
3. 已登入角色 Data SC6 提供庫存上限、持有 ID、定義 ID、狀態、每筆剩餘時間、旗標及通關量。新建角色同登入的 Lobby SC4 有同型資料。Quest 登入的 SC6 會重送所有非搜尋中紀錄，`timer=0`。pending 只由角色快照保留。相同持有 ID 是唯一錨點。同一任務定義可以持有多筆。星號或未知文字只用目錄補上，不因 metadata 不完整而丟資料。原始狀態為 0 新、1 未解決、2 進行中、3 解決、4 搜尋中、5 失敗、6 受贈。庫存中的地圖通關進度位元只在當次攻略的 SC19，角色快照清除數不是該位元圖。[Data schema](../../../app/server/src/protocol/command/datacommand.rb#L213) · [Lobby schema](../../../app/server/src/protocol/command/lobbycommand.rb#L460) · [Ruby resend](../../../app/server/src/model/avatar.rb#L2653) · [原始狀態常數](../../../app/server/src/constants/common_constants.rb#L942)
4. 對應畫面錨點為 QuestBG 的 `quest_base.swf`，正常區域地圖 `map01.swf` 至 `map06.swf`，`select_map.swf`、`questlist.swf`、`QuestCaption`、`QuestDeck`、角色 HUD。QuestView 依 24 FPS × SPEED，世界地圖、背景、標題、HUD、庫存、牌組各有原版合成層級，另有搜尋、戰鬥結果、寶箱、選地圖容器。選區域窗原版由 y−500 以 0.3 秒 ease-out sine 入場。場景進入 `MatchBGM` 對應 `ulbgm03.mp3`。Back 後恢復已現存的大廳 `ulbgm02.mp3`。固定舞台現有音軌只配置登入、新手及大廳，Quest 音樂還需獨立加入。[QuestView 佈局](../../../app/client/src/view/QuestView.as#L244) · [QuestView 顯示層](../../../app/client/src/view/QuestView.as#L318) · [選地圖滑入](../../../app/client/src/view/scene/quest/QuestSelectMapWindow.as#L70) · [地圖素材](../../../app/client/src/view/image/quest/WorldMapImage.as#L28) · [任務主題曲](../../../app/client/src/sound/bgm/MatchBGM.as#L13)

## 搜尋、發現、選擇和開始

| 階段 | 原版請求、回覆與判定 | 目前可用或尚待驗收 |
| --- | --- | --- |
| 搜尋面板 | 原版世界地圖據區域和旗標點選，再以 `quest_search.swf` 的 0–10 計時滑桿、地圖名稱、縮圖、AP和確認顯示。CS5(i32 地圖, i32 計時索引)。Ruby 校驗地圖、AP、配額、`flag+1`，由 Ruby 按既有通關數、地圖難度和計時索引選出任務 ID 與稀有度。原始時間索引 0、3、10、30 分鐘，1、2、4、8、16 小時，1、3 日。 | 診斷頁的 API 固定最新版普通區域和索引1。使用真 Ruby 測過 180 秒、9 秒隔離係數、AP 和不重送。早期已開放區域、索引0及所有其他索引要另做 UI 及傳輸測例，尤其即時分支順序與計時分支不同。 |
| 計時業務 | 索引>0 先保存狀態4及真正截止時間，回 SC6(持有 ID,0,索引,實際係數,原線上狀態0,贈送者) 再回 SC4(當前 AP,剩餘恢復秒數)。在庫存滿時可能先重播舊 SC6(timer0) 再 SC29(30)，不能把重播當新搜尋。索引0即時保存真正任務，順序是 SC4 後 SC6(真任務 ID,timer0)。SC17 之前定義寫在 Ruby，客戶端不猜。 | 診斷 `submitQuestSearch` 比對定時回覆和同一操作的 AP，Pong 封界，送出不確定鎖定重送。現有獨立 Rust deadline 範例不取代 Ruby 計時。 |
| 發現 | 原 Flash 瀏覽器倒數過零時停止計時再送 CS17(i32 持有 ID)，原版嚴格伺服器時間 `now > find_at`。原版回 SC17(i32 持有 ID, i8 新狀態, i32 真任務 ID)。太早通常無回覆。分支上的相容修正限定所有權並原子更新 pending → NEW。Data 角色資料在重新登入時也可見到期的真狀態。 | 診斷 API `checkQuestDiscovery` 已處理尚未到期、真正 SC17 及延遲／漏回後從已發現 Quest 登入重播核對。倒數消失本身不代表成功。原版自動檢查。目前診斷頁顯示確認按鈕。 |
| 看任務與牌組 | 原版可從 NEW 用 CS12(i32 持有 ID, i8 牌組) 確認為 UNSOLVE，詳情顯示繁中任務與地形、AP、地形路線，選擇非 Binder 牌組。Flash 在送開始前必須有置於第 0 格的角色卡。原版 Ruby 可從狀態 0/1/6 開始。 | 診斷已支援 0/1，且從 Data 驗證牌組。受贈6和唯獨由 CS12 造成的同一選取前進尚未納入固定舞台。 |
| 開始 | CS13(i32 持有 ID,i8 牌組索引)。Ruby 依所有權、任務 AP、狀態、牌組存在及解鎖驗證，SC4 → 匹配 SC17(status2) → 同一處理函式保存牌組鎖 `CDS_QUEST`。Quest Pong 只封閉既有序列。任務開始的 AP 跟地圖搜尋 AP 是兩筆不同成本。 | 診斷已驗 q1/Deck1/AP0 與 q3/Deck2/AP1、回覆遺失時只扣一次、重新登入後原版清理。仍需固定舞台從視覺控制到同一 Quest socket 的實測。 |

來源：[搜尋確認面板](../../../app/client/src/view/image/quest/GetSendPanel.as#L231) · [原版倒數](../../../app/client/src/view/scene/quest/QuestItem.as#L350) · [Ruby get_quest](../../../app/server/src/model/avatar.rb#L2798) · [原版搜尋時間](../../../app/server/src/constants/common_constants.rb#L952) · [持有列到期](../../../app/server/src/model/avatar_quest_inventory.rb#L110) · [確認及開始](../../../app/client/src/controller/QuestCtrl.as#L471) · [Ruby quest_start](../../../app/server/src/model/avatar.rb#L3096) · [測試紀錄](../README.md#L179)

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

來源：[Ruby Quest 封包表](../../../app/server/src/protocol/command/questcommand.rb) · [原版對戰 CS](../../../app/server/src/controller/duel_controller.rb#L15) · [回合事件序列](../../../app/server/src/rule/event/multi_duel_event.rb#L45) · [Ruby 距離、骰及傷害](../../../app/server/src/rule/multi_duel.rb#L357) · [時間常數](../../../app/server/src/constants/constants.rb#L36) · [現有封包與監聽](../../../web-client/session.js#L1043) · [現有攻防驗收](../README.md#L239)

## 勝負、獎勵、返回與錯誤

- 戰鬥結束 SC41 先報原版勝0、敗1、和2、經驗／Gem 計值及是否有額外獎勵。SC41 不是任務完成。Ruby 接著實際記帳、發 SC7 Exp、SC8 Lv、SC10 Gem 等。畫面應以已收到的絕對值或同份前後快照之差為準。Lv 變更可在沒有 SC4/SC5 的情況重新填滿和改變 AP 上限。無確定回覆不捏造目前 AP 或最大值。真正掉卡 SC13 含持有 ID、卡 ID。勝利且後面有合法地形時，SC19 + SC20(相同牌組、任務狀態2、實際傷勢) 可以繼續，沒有 SC22/24 且不用重連。稽核傷勢用 Ruby 的 SC20/下一戰 SC37。UI 內血量不可拿來推算存檔。
- 原版到最後可達位置後解鎖牌組、清理損傷、移除庫存、保存勝負日誌並處理原版獎勵與區域通關旗標。SC22 + 匹配持有 ID 的 SC24 才是終局。戰鬥輸／和對任務都記敗 1。當前區域普通勝利加通關數，足額且打贏 boss 才前進旗標並把下一區通關數歸零，舊區獎勵不可當前區進度。原版 SC26/28 是普通地圖，SC30/31 是事件類型與各自原始計數。原版故事有 `story_no` 的獲勝分支在 SC24 後可發 SC134，寶箱顯示期間暫停完成面板。原版圖像來源 `quest_result.swf`，戰鬥結果 OK、任務結算 OK、寶箱／故事返回是不同層。戰鬥結果返回 Quest 地圖本身不等於登出。
- 匹配成交的 Hi-Lo 額外獎勵由 SC41 bonus=true 觸發，是同一個 Ruby reward 狀態。候選 SC122、起始骰 SC123、猜高低 SC124、結果骰 SC125、最終獎勵 SC126，可伴隨 SC38 實際持有卡。原版 CS36/37/38/39 分別高、低、取消、重試。現有 web-client 有守衛，會把 bonus=true 標為仍待處理，不會用普通返回跳過。若後續要做，須從真 `Reward`／event handlers 開始驗證。本地不可抽骰或重送。
- 已證明的失敗按官方封包處置。搜尋有 AP1／已達上限30／地圖未知31／旗標不足32。開始另有牌組不存在16／任務不存在40（原版可能先 SC22）／狀態不符41／牌組鎖42。移動有錯誤路徑43、無角色牌15。某些 handler 無回覆（正在打鬥、找不到 avatar／row 的分支），保持未確認，透過可靠更新或使用者決策恢復。發送寫入後漏回不能以再次同樣 CS5/13/16 或卡片控制求證。UI 可在有確定前置錯誤時復原重試，必要時保留已證實欄位並停止進一步寫入。
- 原版主動放棄 CS14 會清理並回敗，歸檔 result4。CS15 是獨立刪除，不是返回。關掉 Quest 後一般 Lobby/Auth 仍活著。若正在冒險，Data 再登入會執行 `quest_all_out`，清除進行／已解決／失敗列，解鎖牌組並記成 result5。所以同登入回 Lobby 的正常 CS2、放棄與重新登入要分開。中繼短路會造成 Chromium code1000 但 `wasClean=false`，過往 25 次 EOF 有 3 次，暫停分支修後 Chromium 雙向各 25 次均乾淨。整合分支目前仍舊中繼。唯獨重做其生命週期修正並成對重測，保持原版 Quest peer 關閉證明和同源路由限制。

來源：[Ruby 戰鬥結算](../../../app/server/src/controller/quest_controller.rb#L554) · [Ruby quest_delete](../../../app/server/src/model/avatar.rb#L3034) · [quest_all_clear](../../../app/server/src/model/avatar.rb#L3295) · [Data 登入的清理](../../../app/server/src/controller/data_controller.rb#L223) · [Quest 原版視窗](../../../app/client/src/view/QuestView.as#L582) · [Reward handlers](../../../app/server/src/controller/duel_controller.rb#L88) · [獎勵回覆](../../../app/server/src/controller/duel_controller.rb#L1588) · [原生終局守衛](../../../web-client/session.js#L1395) · [目前中繼](../../../tools/legacy-web/serve.py#L404)

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

1. 在 `cc2ef53` 的同一固定舞台增加唯讀普通任務場景。沿用既有 `SessionSocket`、`confirmChannel`、`readQuestInventoryPushes`、資料快照和 catalog。負責單一 Quest 的開啟、登入重播 fence、保留、Back CS2/peer close 和登入受控的取消。明確驗收四條既存連線繼續、Quest 重入沒有重疊、新角色及既有角色狀態不同、pending 被保留、獲授權區域與原版 36 地圖邊界。保持現有大廳、登入和共用 Workbench 入口。若需新增 catalog 回覆，維持既有單筆/缺值相容。用協定行為增量處理中繼 EOF bug。暫停分支的場景有參考價值，但它的 scene lock 會封鎖一般 Quest 方法，合併它也不會產生可玩完整流程。
2. 在已保留的**一條** Quest 上把原版三分鐘魔女山谷搜尋、pending、已發現和真 AP 接入固定舞台，再串同一張手牌可判定的 CS13 + 首格 CS16。把認證與 read/write 區分可重用，短 socket 診斷仍可維持。入口和遞進共用租期，不能為同一個在進行冒險再開第二條。實測時間要包含真 180 秒或分開標明 Ruby 原模型的可控 fixture 係數，故障測例只留真回覆不把未知成功算進。之後接實際對戰 phase、局結果和 Quest 結算，保留 SC24 ↔ inventory 準確關聯。其他搜尋索引、舊區和額外分支按各自證據擴展。
3. 回歸優先順序。首先跑原版與固定舞台同一區域 q1 落日大蝙蝠，覆蓋登入→進區→搜尋→同一 Quest→戰鬥→結算→任務地圖→Lobby。再跑 q3 大蝙蝠之群（slots1→4）雙戰、q4 山丘矮人（slot1空地→4真戰）、q32 紫色泥沼澤2（首格固定 30 Gem，下一格真戰）。另選一張單卡與真正兩卡可換角牌組、升級，以及確實受理的敗或和。量測 AP、持有 ID/狀態、clear log、牌組鎖、Gem/Exp/掉卡和 socket 數。截圖核對互動時序和場景聲音。不要在測試的記錄內寫帳密或會話憑證。
4. 故障不可續進的最小檢查為延遲登入 Pong 後按 Back、遺失 CS5 的真 SC6/SC4、扣完 AP 缺 SC17、進格缺 SC40、缺 SC46、缺己方卡片 ACK、終局漏 SC24、伺服器或瀏覽器送 CLOSE 兩種方向。所有資料核對在隔離原版 Ruby 的 SQLite 只讀查詢。已通過的早期原版、共享傳輸和暫停測例分別標示，待這一分支重跑後才認定固定舞台行為完成。

留存證據：[原版 Ruffle 首場 PvE 與持久化](../README.md#L21) · [原版倒數](../README.md#L77) · [共用 AP／開始](../README.md#L179) · [第一回合手牌等早期原生測例](../README.md#L239) · [換角及雙戰鬥](../README.md#L313) · [同次登入結算](../README.md#L337) · [新建單卡，真 180 秒](../README.md#L349) · [雙卡續遊](../README.md#L357) · [目前固定舞台驗收仍是大廳視窗](../../../tools/legacy-web/check_source_lobby.py#L236)
