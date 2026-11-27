# Unlight 原版多人對戰與襲擊盤點

基準為整合工作樹 `cc2ef53`。以下區分原版 Flash／Ruby 已有邏輯、素材鏡像實際存在的檔案，以及整合版能證明的範圍。這次只讀程式和檔案，沒有連線多人服務、試玩或截圖，也沒有修改產品。

## 目前整合版

| 項目 | 整合版基準可證明的行為 |
| --- | --- |
| 大廳入口 | 對戰 `btn_f`、襲擊 `btn_k` 有圖和螢幕閱讀器名稱，DOM 沒有互動按鈕或連線路由。任務入口另有自己的互動。 |
| 好友／頻道／房間 | 網頁尚無原版 Match、Chat、Watch 場景，也沒有從 Data 取得頻道表後接上各服務的流程。 |
| 戰鬥 | 原版 Ruby 的 Game 已在本機開發啟動器清單，既有原生畫面與試玩證據覆蓋任務戰鬥。多人、旁觀與襲擊的協定及狀態順序需要各自驗證。 |
| AP／免費對戰次數 | 大廳能顯示已登入角色的 AP、免費對戰次數。多人進場扣除、結算及更新後的重新讀取尚未驗證。 |
| 原碼和原素材 | Match、Watch、Chat、Raid 系列的 Flash 和 Ruby 原碼都在庫內。素材鏡像有繁中房間、頻道、觀戰、襲擊地圖和結果元件。 |

[Lobby DOM](../../../source-login/lobby.js#L44) · [Ruby 開發啟動器](../../../tools/legacy-server/run.py#L26) · [WebSocket 閘道](../../../tools/legacy-web/serve.py#L18) · [任務戰鬥截圖](../desktop/08-quest-battle.jpg)

## 多人對戰

### 入口、頻道、房間

1. 原版大廳「對戰」按下後播放大廳點擊音，更新角色，切入 Game 場景。GameView 先切成 Duel 模式並要求 Data 頻道表。Ruby 的 Data 回傳 19 個依索引對應的欄位，含頻道 ID、顯示名、人數、房間容量、規則、說明、牌組成本範圍、斷線懲罰、旁觀權限，以及 Match、Game、Chat、Watch 各端點。頻道在 Flash 陣列的選取索引與資料庫 ID 各有用途。以資料與部署映射選連線，保留頻道規則。 [LobbyView](../../../app/client/src/view/LobbyView.as#L484) · [GameView](../../../app/client/src/view/GameView.as#L155) · [Data 頻道清單](../../../app/server/src/controller/data_controller.rb#L130) · [頻道模型](../../../app/server/src/model/channel.rb#L141) · [Flash 頻道模型](../../../app/client/src/model/Channel.as#L28)
2. Match 畫面先清掉上次房間狀態，再疊入背景、聊天、房間詳細、角色與牌組、房間清單和頻道選單。標題與背景有依 `Unlight.SPEED` 調整的 ease-out sine 過場。頻道選定並連線才顯示房間。普通頻道用「建立房間」，階梯頻道用快速配對。等待、取消、轉入 Duel、頻道返回各有模態和控制鎖，房間刪除或已離開時會恢復可操作狀態。 [MatchView 初始化](../../../app/client/src/view/MatchView.as#L251) · [過場和圖層](../../../app/client/src/view/MatchView.as#L387) · [三種等待視圖](../../../app/client/src/view/MatchView.as#L499) · [退頻道](../../../app/client/src/view/MatchView.as#L981)
3. 伺服器分開處理普通／好友房、快速配對和 CPU 房條件。快速配對檢查登入、重複登記、現用牌組、AP、規則、成本及等候分組。普通建立／加入檢查房間是否存在、客滿、是否已開場、牌組與剩餘 AP，普通房和好友房可用不同 AP 常數。同 IP 有原版拒絕分支，測試應使用符合部署規則的隔離客戶端並記錄結果。使用已失效房號、取消途中或收到別人先開場的推送時，回到房間清單，待 Ruby 確認後才重新加入。 [快速配對](../../../app/server/src/controller/match_controller.rb#L81) · [建立房與限制](../../../app/server/src/controller/match_controller.rb#L436) · [入房到退出](../../../app/server/src/controller/match_controller.rb#L759) · [Flash 入房／旁觀分流](../../../app/client/src/view/MatchView.as#L623)
4. 聊天有全體、頻道、房間、Duel 和觀眾等路徑，保留伺服器各命令實際收件人及切換行為。尤其 `cs_message_room` 由原版 Ruby 遍歷相應 `online_list`，不能從命令名稱推斷是私訊。GlobalChat 在此另有襲擊求援事件用途。 [ChatCtrl](../../../app/client/src/controller/ChatCtrl.as#L187) · [Ruby Chat 各範圍](../../../app/server/src/controller/chat_controller.rb#L18) · [房間及頻道 Socket 清理](../../../app/client/src/view/MatchView.as#L650)

### 開場、戰鬥、結算、返場

1. Match 完成後，原版 Game 透過 `cs_match_start` 查 MatchLog 和同局對手，兩邊共用一個伺服器 `MultiDuel`。開場推送包括 1v1／3v3、場地、對手、各自牌組顯示與隱藏資訊、牌庫數、距離及切人條件。對手已離線有專門錯誤。Quest 已驗證的規則或畫面可以是開發參照，Game、Watch、Raid 各有命令表與接收時機。 [Flash 命令表](../../../app/client/src/net/command) · [Ruby 命令表](../../../app/server/src/protocol/command) · [Ruby Game 開場](../../../app/server/src/controller/game_controller.rb#L16) · [MultiDuel](../../../app/server/src/rule/multi_duel.rb) · [DuelCtrl 推送佇列](../../../app/client/src/controller/DuelCtrl.as#L263)
2. GameView 原版圖層含雙層背景、兩側 Avatar、開場角色與文字、手牌／桌面、HP、技能及狀態、位置和階段計時。開場動畫後解鎖操作，戰鬥隨服務推送進入補牌、移動／距離、攻防、擲骰、傷害、換人或倒下、下一回合。卡牌操作要保留索引、朝向、移除、時限和連續封包時正確播放順序。 [Game 畫面](../../../app/client/src/view/GameView.as#L224) · [遊戲開場時序](../../../app/client/src/view/GameView.as#L337) · [Ruby Duel 輸入](../../../app/server/src/controller/duel_controller.rb#L15) · [Ruby Duel 推送](../../../app/server/src/controller/duel_controller.rb#L446)
3. 賽果只從伺服器結算。Game 有 EXP、GEM、牌組經驗、免費次數或耗 AP、階梯 BP、成就及高低猜牌候選等分支。猜高／低、取消及重擲的命令需跟回合與伺服器候選對照。結算動畫結束後停戰鬥曲、收 HUD／兩隊角色／牌桌，約 1.5 秒收場延遲後更新角色並回到配對畫面。從配對畫面返回普通大廳會清理 Match、Game、Chat、Watch 連線。 [Ruby Game 結算](../../../app/server/src/controller/game_controller.rb#L148) · [猜牌運算](../../../app/server/src/controller/duel_controller.rb#L1599) · [GameView 結算與返場](../../../app/client/src/view/GameView.as#L538)
4. 正常 Duel 原碼未找到獨立的玩家「投降」按鈕或封包。可核對的是未開場、離線與中途退出。原版 Game 的 `do_logout` 依頻道政策選立即中止、短期限制入房。或在已開場、非 AI 且達回合門檻時由 AI 接續並按來源扣斷線者 AP。有可能在 AI 政策下因回合不足直接中止，階梯另記零回合斷線。觀眾退出及襲擊放棄個人持有項目是其他流程。 [Game 斷線政策](../../../app/server/src/controller/game_controller.rb#L320) · [Flash 戰鬥中止](../../../app/client/src/controller/DuelCtrl.as#L249) · [原版 GameView 觀眾退出](../../../app/client/src/view/GameView.as#L464)

### 旁觀

只有可旁觀頻道且房間符合條件時顯示旁觀。滿房列表會依 watch 狀態決定旁觀或拒絕。WatchWaitingView 先確認並連線，Watch Server 從 MatchLog 和暫存 WatchDuel 套用 1v1／3v3 開場，初始過場後再取進度與延遲事件。觀眾端要保留晚加入同步、對戰中止和賽果，禁用玩家的牌、猜牌和角色控制，沒有玩家 AP／獎勵。退出確認後送原版 `cs_watch_finish`，清理獨立的旁觀與聊天訂閱。要包含房間刪除、未開始、無權旁觀、空狀態和晚入場。 [WatchWaitingView](../../../app/client/src/view/WatchWaitingView.as#L104) · [WatchCtrl](../../../app/client/src/controller/WatchCtrl.as#L168) · [Watch Ruby 開場](../../../app/server/src/controller/watch_controller.rb#L23) · [進度／退出](../../../app/server/src/controller/watch_controller.rb#L185) · [旁觀事件](../../../app/server/src/controller/watch_controller.rb#L1295)

## 襲擊 Raid／Profound

### 入口、地圖、求援和控制

1. 普通入口在大廳「襲擊」。大廳初始及部分返場也會接 `Profound.urlProfoundHash`，在編譯旗標 `RAID_EVENT_ON` 下直接導向指定襲擊。全體聊天的 `RaidHelpEvent` 可從大廳、任務、配對和襲擊畫面導入。襲擊道具旗標會限制入口頁籤，這與整個 Raid 場景及伺服器連線是不同狀態。選退回或登出會回到來源場景的對應分支。 [大廳 URL 與旗標](../../../app/client/src/view/LobbyView.as#L258) · [大廳按鈕](../../../app/client/src/view/LobbyView.as#L575) · [襲擊進出](../../../app/client/src/view/LobbyView.as#L1021)
2. RaidView 啟用四條已登入服務，分別是 Raid／戰鬥、RaidData／持有與設定、RaidChat／聊天與共享 Boss HP、RaidRank／排名。先掛上外框並播配對曲，等四條連線及 Profound 資料完整後才初始化地圖、Vortex 圖示、持有清單、選取詳細、角色／牌組、聊天、設定、開始／放棄／招待碼彈窗。地圖座標來自 `ProfoundPositionsManager`，選中項目後才啟用詳細和其聊天。保留換選、取消、收合、計時與共用更新順序。 [RaidView 認證](../../../app/client/src/view/RaidView.as#L373) · [畫面元件和計時](../../../app/client/src/view/RaidView.as#L436) · [選取與更新](../../../app/client/src/view/RaidView.as#L718)
3. 本原碼覆蓋赴援碼／網址輸入、顯示／複製、公開／好友／擁有者限制、發布和移除消息、權限與報酬設定、參加通知、刷新與清除已消失的項目。點「放棄」需 Yes／No 再由持有者送 `cs_give_up_profound`。已過期、已完成、消失或不可參與時關閉過時操作，按伺服器消息更新清單、詳細或報酬。定期更新 HP、評論、排名和獎勵。留言按游標去重，排名顯示榜單、本人與最終報酬。 [RaidView 對話框與開始檢查](../../../app/client/src/view/RaidView.as#L820) · [過期／更新及錯誤](../../../app/client/src/view/RaidView.as#L968) · [RaidData Ruby](../../../app/server/src/controller/raid_data_controller.rb#L14) · [赴援與設定](../../../app/server/src/controller/raid_data_controller.rb#L128) · [RaidChat Ruby](../../../app/server/src/controller/raid_chat_controller.rb#L10) · [RaidRank Ruby](../../../app/server/src/controller/raid_rank_controller.rb#L9)

### 戰鬥、共享狀態和報酬

1. 開場確認畫面使用原版回合／AP 選擇。Ruby `cs_boss_duel_start(inv_id, turn, use_ap)` 核對持有者、襲擊是否消失或已完成、Boss／牌組和可用 AP，然後採用傳入的回合值，從 Profound／Inventory／Log 建立已有 Boss HP／傷害、距離、角色和牌組的 `MultiDuel`，Boss 使用 `:profound_ai`。同一 Raid 的參與者各自開戰，共享持久化的 Boss 狀態、累積貢獻、討伐與獎勵結果。 [原版 AP 與回合選擇](../../../app/client/src/view/RaidView.as#L875) · [Raid Ruby 開場](../../../app/server/src/controller/raid_controller.rb#L31) · [Avatar 場次驗證](../../../app/server/src/model/avatar.rb#L2124) · [Avatar 開場扣除](../../../app/server/src/model/avatar.rb#L2199)
2. 原版 RaidView 從地圖載入共用打法的牌桌和角色，依原版 Profound 資料場地播戰鬥曲，以 Raid 專用回合、隊伍及 Boss HP、畫面更新和結算動畫收場。勝敗、時間耗盡或中途離線要回到對應的放回清單／重選／消息分支，由 Ruby 保存傷害、EXP、GEM、成就、討伐與排名。報酬的持有者、參與和貢獻門檻、討伐結果及領取一次性由 Ruby 判斷，刷新與重登應讀回已領狀態。 [RaidView 戰鬥](../../../app/client/src/view/RaidView.as#L1124) · [Raid Ruby 結算](../../../app/server/src/controller/raid_controller.rb#L542) · [Avatar 襲擊報酬](../../../app/server/src/model/avatar.rb#L2745) · [持有項目報酬條件](../../../app/server/src/model/profound_inventory.rb#L367)
3. 基本資料和資料表有 Profound、ProfoundInventory、ProfoundLog、ProfoundData、ProfoundTreasureData，繁中資料可從同版 master CSV 載入。Ruby 的探知道具能按玩家地域、原版資料與持有上限產生襲擊。GlobalChat 另有自動活動建立排程，由 `PRF_AUTO_CREATE_EVENT_FLAG`、星期、活動擁有者和資料控制。sandbox 的 Ruby 常數預設關閉該排程，與 Flash 編譯包含 Raid 入口各自獨立。本次未跑道具、排程或公開活動。自動建立函式有兩次連續的同名呼叫，第一次未傳地域值，依現有簽名會讓後續值進到相鄰參數。開啟排程前需驗證實際生成數與參數。 [探知道具](../../../app/server/src/model/avatar_item.rb#L909) · [GlobalChat 排程](../../../app/server/src/global_chat.rb#L73) · [活動產生條件](../../../app/server/src/controller/global_chat_controller.rb#L210) · [sandbox 活動常數](../../../app/server/src/constants/locale_constants.rb_sb#L98) · [Profound 模型](../../../app/server/src/model/profound.rb) · [繁中襲擊資料](../../../app/server/data/csv/tcn/ProfoundDatas.csv) · [繁中報酬資料](../../../app/server/data/csv/tcn/ProfoundTreasureDatas.csv)

## 版面、原素材和影音

原版主容器 780×680，場景素材區 760×680。新版讀取原始元件時應記錄來源子圖層、註冊點、時間軸、內嵌或獨立語系變體及呼叫端座標。房間的欄位、按鈕圖層、滑鼠狀態和動態清單需從 AS 及原 SWF 對照。繁中素材一般是 `_ch` 檔，Embed 名稱則可能是去掉語系後的編譯目標。不能以單張扁平截圖驗收房間、聊天、旁觀或 Raid 狀態。

| 範圍 | 已查來源與素材 |
| --- | --- |
| 配對與觀看 | 在本機素材鏡像確認 `data/image/match/b_lobby_base_ch.swf`、`lobby_channel_ch.swf`、`roomin_ch.swf`、`roomout_ch.swf`、`watch_btl_ch.swf`、共用 `lobby_list_base.swf`、`b_lobby_list_detail.swf`、`btn_channel.swf`，以及房間詳細舞台檔。背景與標題 fade、頻道選擇、等待中、房間加入與返回包含不同動畫狀態。 |
| 對戰共用 | 本機鏡像確認 `data/image/game/chat_base.swf`、`phase.swf`、`time_base.swf`、`data/image/dice_atk.swf`。角色卡、場地、HP、攻防骰、技能 cut-in、猜牌選項、結果等應各用原版元件及階段規則。 |
| 襲擊 | 本機鏡像確認 `data/image/raid/raid_base_ch.swf`、`raid_map_ch.swf`、`raid_info_ch.swf`、`raid_turn_ch.swf`、`raid_win_ch.swf`、選單 `raid_list.swf`、詳細 `raid_list_panel.swf` 和三類 `vortex_*.swf`。具名圖層用於通知、計時、排名、Boss HP 和勝敗。 |
| BGM／音效 | 本機鏡像確認 `public/sound/bgm/ulbgm03.mp3` 與 `bgm010.mp3`。原版配對和襲擊地圖用 MatchBGM，DuelBGM 按場地選曲，Raid 同樣由伺服器場地選曲，只有對應場地才播 Boss 曲，結束切回模式各自曲目。點擊、卡牌、骰子、戰鬥角色語音應依原 AS 事件及開關播放。 |

[Match 圖層包裝](../../../app/client/src/view/image/match) · [Raid 圖層包裝](../../../app/client/src/view/image/raid) · [Game 元件](../../../app/client/src/view/image/game) · [MatchBGM](../../../app/client/src/sound/bgm/MatchBGM.as#L13) · [DuelBGM](../../../app/client/src/sound/bgm/DuelBGM.as#L12) · [Raid 開場音訊呼叫](../../../app/client/src/view/RaidView.as#L1167)

## 服務支援的缺口與未驗證項目

- 開發 Ruby 啟動器及 WebSocket 閘道都只列 Auth、Lobby、Data、Game、Quest、GlobalChat。Match、Chat、Watch、Raid、RaidData、RaidChat、RaidRank 未包含在兩者。原版 Ruby 實作存在，目前沒有這七個服務從瀏覽器可達或完成認證的證據。 [Ruby 服務清單](../../../tools/legacy-server/run.py#L26) · [WebSocket 服務清單](../../../tools/legacy-web/serve.py#L18)
- 頻道的 Match、Game、Chat、Watch 主機與埠由 Ruby Channel 資料透過 Data 發送，MatchServer 用監聽位址比對已設的 Channel 資料。個別頻道旁觀模式預設與全域 Watch 模式是兩層設定。要讀目前隔離資料庫與服務啟動後的實際頻道回傳，這次沒有查證種子頻道資料是否存在。 [MatchServer](../../../app/server/src/protocol/matchserver.rb#L16) · [Channel schema 與清單](../../../app/server/src/model/channel.rb) · [Watch 常數](../../../app/server/src/constants/constants.rb#L93)
- 原版 XML 明列 Raid、RaidData、RaidChat、RaidRank 端點，依序 `12050/12100/12090/12070`。這些埠目前不在 WebSocket 閘道的轉發清單。sandbox AS 有 `RAID_EVENT_ON` 及其他編譯旗標，實際內容受所選 build 及活動資料限制。 [XML](../../../app/client/public/config.xml.orig#L42) · [sandbox AS 設定](../../../app/client/src/Unlight-config_sandbox.xml#L118) · [WebSocket 服務清單](../../../tools/legacy-web/serve.py#L18)
- 沒有已驗證的兩位真人同步配對、觀眾晚入、Raid 多帳號共享 Boss HP 或對應的原版擷取畫面。Raid 開場封包的回合值被直接傳進 MultiDuel，上述查驗路徑未見硬性回合白名單。既有任務戰鬥錄影、重放及 Rust 規則試驗不足以確認多人斷線、隱藏資訊、實際扣除或結算。未找到獨立玩家投降命令，需以原碼可證實的退出、對手離開與 AI 接續分支驗收。

## 可驗收的完成條件

1. **服務與來源對照。** 讓隔離 Ruby 啟動所有需求服務，同環境原版 Flash 可讀到有效頻道與 Raid 端點。記錄原版兩位玩家、一位旁觀者及兩名 Raid 參與者實際流程，連同截圖、角色狀態前後值、編譯選項、端點來源和事件配置。確認目前關閉／無活動狀態在新版可辨認。
2. **配對、房間、聊天。** 雙客戶端完成建房邀請、列表馬上更新、加入、取消／退回、快速配對普通和錯誤分支。驗證成本、牌數、AP、階梯資格、已開始、過期和同 IP 政策，對照各聊天室實際發往哪些帳號。返回一次後可正常重新進同頻道，無舊房、舊事件和重複 Socket。
3. **多人戰鬥與結算。** 1v1、3v3 各完成至少一局。兩邊 Phase、回合、距離、HP、牌數、卡牌可見性、攻防骰、傷害、切人和時間限制與 Ruby 一致，原版影音按時並可取消，排序不因延遲交錯失真。檢查好友／階梯相關消耗與 BP、結算資訊、猜高低操作、前後資料、結算只發生一次、正常返回、對手離開以及原版 AI 接續條件。
4. **旁觀。** 啟用和禁用的頻道均測，驗證開場、晚入延遲同步、觀眾聊天、勝敗及中止。觀眾只可離開及操作旁觀控制，不能發玩家指令、獲得玩家報酬或影響對戰雙方。按退出後可再進房並驗證不會疊加訂閱。
5. **襲擊。** 由隔離資料以同一 Profound 測擁有者與參與者，涵蓋搜尋／赴援、各權限、AP／回合、實戰與共享 HP、時間到／未開場／連線中斷／過期、排名和報酬。完成一次後重進及重登都應讀到同一結果，重複領取不再改變資產。放棄取消不改資料，確認後才由伺服器改持有狀態。
6. **繁中與素材。** 每階段擷取原版與新版的初始、互動、錯誤及結算畫面，核對 780×680 裁切、繁中語系、個別房間和版面座標、彈窗標題與九宮格、卡牌和 Boss 素材、動畫節點和音樂切換。以實際雙客戶端完成結果和伺服器 readback 驗收，素材目錄完整只能證明來源可用。
## 等待與全域求援子畫面

| 畫面 | 原版構成與操作 | 驗收 |
| --- | --- | --- |
| 指定房間等待 | `MatchWaitingView` 開啟共用 `WaitingPanel` 與 `Waiting...` 標題，允許取消時以目前房間 ID 執行 `exitRoom`。對局開始、強制退出及非已認證狀態各自清理前景。 [等待與關閉](../../../app/client/src/view/MatchWaitingView.as#L98) | 核對面板文字、前景阻擋、兩人入房、取消後房間狀態及延遲開局事件。 |
| 排名配對等待 | `RadderWaitingView` 沿用等待面板，取消改呼叫 `quickmatchCancelOrder`。結束通知清理排名等待狀態。 [等待與取消](../../../app/client/src/view/RadderWaitingView.as#L98) | 核對加入／取消隊列、重試、配對成功與離線，保留房間與隊列的不同操作。 |
| 全域襲擊求援 | `MainView` 啟動 `RaidHelpView`，監聽求援事件並逐筆用 `RaidHelpPanel` 顯示。場景切換及禁止更新時依原版暫停。點擊分流至對應襲擊。 [全域入口](../../../app/client/src/view/MainView.as#L85) · [佇列及顯示](../../../app/client/src/view/RaidHelpView.as#L93) | 同時收到兩筆時驗證顯示順序與退場，在對局期間暫停，點擊後轉到指定襲擊。 |
