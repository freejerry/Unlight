# 原版大廳子畫面遷移盤點

查核基準為 `Unlight-lobby-integrated` 的 `cc2ef53`、原始 ActionScript／Ruby、雲端繁中 Flex 建置及固定素材鏡像。此處座標指原始 760×680 美術區的舞台或父元件局部座標，Web 容器固定 780×680。以下是唯讀查核，未消耗票券、道具或序號。 [原始舞台](../../../app/client/src/Main.as#L27) · [繁中建置](../../../tools/legacy-build/build.sh#L101)

## 共用進出與建置分支

- LobbyView 等待 ConstData 及 Lobby、Data、GlobalChat，再依玩家狀態進初次創角或大廳。常態圖層為 `BG → LobbyStandChara → AvatarView → Entrance`。進場後才查公告、角色更新、排名、成就及多人求助。 [LobbyView.as](../../../app/client/src/view/LobbyView.as#L131) · [LobbyView.as](../../../app/client/src/view/LobbyView.as#L287)
- EntranceSet 以 named SimpleButton 綁入原始繁中素材。全畫面路徑經 `eventSet → handler → Player.STATE_* → waiting`，慣例播放大廳點擊音 `ulse02.mp3` 並查角色更新。隱藏時先卸舊 listeners 與場景圖層，再由子 view 使用同一登入。正常 Back 結束子 view，依 `checkRaid` 回大廳。`STATE_LOGOUT` 走上層登出。側邊面板與序號留在同一場景。 [EntranceSet.as](../../../app/client/src/view/image/lobby/EntranceSet.as#L52) · [LobbyView.as](../../../app/client/src/view/LobbyView.as#L414) · [LobbyView.as](../../../app/client/src/view/LobbyView.as#L649) · [Click2SE.as](../../../app/client/src/sound/se/Click2SE.as#L9)
- Entrance 進出約 470.6 ms sine-out（`0.8/SPEED`）。Back 是 `AvatarView.exitButton → gene.swf 的 back`，大廳隱藏 Back，AvatarDetailBase 另外隱藏 logout、exit、log。一般大廳 BGM 為 `ulbgm02.mp3`，常用 Back／操作音為 `ulse01.mp3`。 [Entrance.as](../../../app/client/src/view/scene/lobby/Entrance.as#L731) · [AvatarView.as](../../../app/client/src/view/scene/common/AvatarView.as#L427) · [AvatarDetailBase.as](../../../app/client/src/view/image/common/AvatarDetailBase.as#L46) · [LobbyBGM.as](../../../app/client/src/sound/bgm/LobbyBGM.as#L12)
- 目前 TCN 建置實際開啟 `LOCALE_TCN`、`CHARA_COST_DRAW_ON`、`VOICE_ON`、`LOT_ON`、`FRIEND_MAIL_ON`、`WEAPON_COMBINE_ON`、`RAID_EVENT_ON`，並使用 `NOT_PAYMENT`。源碼的無語系 Embed 檔名經建置對應到素材鏡像的繁中 `_ch` 檔名。 [編譯設定起點](../../../app/client/src/Unlight-config_sandbox.xml#L35) · [繁中建置設定套用](../../../tools/legacy-build/build.sh#L109)

| 入口 | 原版實際去向 | 退回 | 音樂 |
| --- | --- | --- | --- |
| `btn_h` 設定 | `STATE_OPTION → OptionView` | Back 回同一大廳 | 大廳 BGM 延續 |
| `btn_g` 牌組 | `STATE_EDIT → DeckEditView` | 保存及等待同步後回大廳 | 大廳 BGM 延續 |
| `btn_c` 圖書館 | `STATE_LIBRARY → LibraryView` | 關故事先回圖書館，Back 回大廳 | 通常延續大廳，故事 `bgm013.mp3` |
| `btn_e` 道具 | `STATE_ITEM → ItemView` | 子 view `_END`，恢復大廳 alerts | 大廳 BGM 延續 |
| `btn_i` 商店 | `STATE_SHOP → ShopView(stage,0)` | 子 view `_END`，恢復大廳 alerts | 大廳 BGM 延續 |
| `btn_j` 暗房 | `STATE_LOT → LotView` | 收尾後回大廳 | 先停大廳，暗房 `bgm012.mp3` |
| `btn_serial` 序號 | `SerialInputPanel` | 關閉恢復 TopView | 延續 |
| 右側 `btn_achi` 紀錄 | `AchievementListView` | 收合回同一大廳 | 延續 |
| 右側 `btn_f_list` 好友 | `FriendListView` | 停更新 timer，收合 | 延續 |
| 右側 `btn_map_item` 道具 | `ItemListView` | 速查面板橫向滑出 | 延續 |
| `btn_info` | `EventInfoPanel` | 事件資訊面板收合 | 延續 |

[全場景入口與返回](../../../app/client/src/view/LobbyView.as#L484) · [設定與牌組](../../../app/client/src/view/LobbyView.as#L784) · [道具與商店](../../../app/client/src/view/LobbyView.as#L915) · [暗房與圖書館](../../../app/client/src/view/LobbyView.as#L1060) · [序號與事件資訊入口](../../../app/client/src/view/scene/lobby/Entrance.as#L763)

## 設定

- `Option` 標題基點 `(15,5)`，繁中「選項設定」偏移 `(+85,+7)`。背景用 `option/config.swf`，鏡像繁中 `option/config_ch.swf`，73,595 bytes、SHA-256 `2e9e56e2e17697194309e6fe37f73fcff5d6e5c460a18d8841e79f59ca65f077`。容器有背景、HelpPanel、SoundPanel 和共用 `PL_AVATAR_MATCH`。Back 按下播放 Click、轉 `STATE_LOBBY`。原標題淡入 470.6ms，退出標題及容器 1 秒 sine-out，再清理 avatar 和 listeners。 [OptionView.as](../../../app/client/src/view/OptionView.as#L65) · [OptionView.as](../../../app/client/src/view/OptionView.as#L149) · [Options BG.as](../../../app/client/src/view/image/option/BG.as#L18)
- Help Option 為 `(230,100) 300×100`，繁中「顯示工具提示」「顯示箭形符號嚮導」。Sound Option 為 `(230,210) 300×225`，VOICE_ON 時高度 +50。BGM／SE／VOICE slider 寬 200、0–100、刻度 10，拖動與 change 均直接更新。`SharedObject("volume")` 三音預設 50、help/arrow=true。工具提示 setter 同步全域 ToolTipManager。設定是本機偏好，入口另做有限流的 Lobby AvatarUpdateCheck，Ruby 呼叫 `avatar.update_check`。 [HelpPanel.as](../../../app/client/src/view/image/option/HelpPanel.as#L97) · [SoundPanel.as](../../../app/client/src/view/image/option/SoundPanel.as#L53) · [Option.as](../../../app/client/src/model/Option.as#L32) · [LobbyCtrl.as](../../../app/client/src/controller/LobbyCtrl.as#L619) · [Lobby Ruby controller](../../../app/server/src/controller/lobby_controller.rb#L167)

## 牌組

- 成本版使用 `edit_deck_base_cost_ch.swf`、`deckcase.swf` 與卡片素材。主容器有背景、卡詳情、Binder、Deck、排序／篩選，合成容器、角色／標題及複製確認在較高 stage 深度。Binder 裁切 `(5,42) 652×382`，卡格步距 `88×122`，Deck 容器 `(215,443)`，標題 `(15,5)`。進場約 470.6ms。 [DeckEditView.as](../../../app/client/src/view/DeckEditView.as#L271) · [BinderArea.as](../../../app/client/src/view/scene/edit/BinderArea.as#L87) · [DeckArea.as](../../../app/client/src/view/scene/edit/DeckArea.as#L121) · [Deck BG.as](../../../app/client/src/view/image/edit/BG.as#L16)
- 角色／武器／事件／怪物／其他入口，怪物和其他共享部分角色資料區。Deck 左右切換與 Binder 各自分頁。選卡、拖放、刪除、合成／系譜／複製有不同 handler。「設定目前牌組」在此版本留於註解。Back 是 `DeckEditor.finalize → save`，若 `cardInvUpdating` 仍真會跑原 loading 並等待同步收尾。同人、成本、類別、位置和 deck 使用中限制仰賴服務確認。現有獨立原生 `session.addDeckCard` 僅涵蓋單張角色追加與重新登入讀回，之後可先接唯讀 Binder／牌組資料，再接額外寫操作。 [DeckEditView.as](../../../app/client/src/view/DeckEditView.as#L505) · [DeckEditView.as](../../../app/client/src/view/DeckEditView.as#L988) · [DeckEditor.as](../../../app/client/src/model/DeckEditor.as#L758) · [現有 addDeckCard](../../../web-client/session.js#L2108)

## 圖書館及故事

- `library_cost_ch.swf` 是選定繁中成本版，`getcard.swf`、`story_title.swf`、`btn_deco.swf` 等支援卡片與故事記號。標題 `(15,5)`、翻譯偏移 `(+80,+7)`，角色列表 `(20,132)`、故事列表 `(272,130)`，共用 `PL_AVATAR_EDIT`。初始 tab2 角色卡，含 Unlight／復活次分類、角色故事與怪物卡。原始任務故事 tab 直接禁止滑鼠操作。入場與各退場段以約 470.6ms tween。 [LibraryView.as](../../../app/client/src/view/LibraryView.as#L112) · [LibraryView.as](../../../app/client/src/view/LibraryView.as#L327) · [Library BG.as](../../../app/client/src/view/image/library/BG.as#L34) · [CharaCardListScene.as](../../../app/client/src/view/scene/library/CharaCardListScene.as#L1408) · [CharaStoryListScene.as](../../../app/client/src/view/scene/library/CharaStoryListScene.as#L34)
- 選卡和翻頁取真正卡集。故事按鈕依 `bookExist` 顯示，進 `StoryClip`、`story/story.swf` 和故事 BGM，關閉回同一 Library。取得／已讀／最愛來源不同，最愛有另外寫入。唯讀第一步可選卡及展示來源狀態，故事載入、授權條件與最愛寫入各自驗收。 [DataArea.as](../../../app/client/src/view/scene/edit/DataArea.as#L994) · [CharaCardClip.as](../../../app/client/src/view/scene/common/CharaCardClip.as#L1271) · [StoryClip.as](../../../app/client/src/view/scene/common/StoryClip.as#L69) · [StoryFrameImage.as](../../../app/client/src/view/image/common/StoryFrameImage.as#L30)

## 道具與外觀

- `btn_e` 是整頁 `ItemView`。繁中 `item_inventory_ch.swf` 置於 `(0,0)`，`item_panel`／`item_base` 支援分類、列表、卡格及操作。道具／身體／衣服／飾品，預設第一頁。道具列表 `(24,104)`、部件數 `(449,630)`，共用 `PL_AVATAR_QUEST`。入退場 tween 約 470.6ms，入場程式在 join 之後才掛主容器，不能直接據該值推斷每層可見順序。 [ItemView.as](../../../app/client/src/view/ItemView.as#L74) · [ItemView.as](../../../app/client/src/view/ItemView.as#L220) · [ItemInventoryImage.as](../../../app/client/src/view/image/item/ItemInventoryImage.as#L23) · [ItemListPanel.as](../../../app/client/src/view/scene/item/ItemListPanel.as#L55)
- 右側 `btn_map_item` 另開 `WindowItemListPanel` 速查，`x798→498`、`y107`、0.2s Quad.easeOut 滑入，0.15s sine-out 退出，背景暫停 click。使用道具有確認，裝備／卸下／丟棄及使用期限由 Lobby 原命令和原回覆更新角色及庫存。唯讀清單、裝備和消耗各是獨立驗收範圍。 [ItemListButton.as](../../../app/client/src/view/image/common/ItemListButton.as#L78) · [ItemListView.as](../../../app/client/src/view/ItemListView.as#L66) · [ItemListPanel.as](../../../app/client/src/view/scene/item/ItemListPanel.as#L147) · [BodyListPanel.as](../../../app/client/src/view/scene/item/BodyListPanel.as#L477) · [LobbyCtrl.as](../../../app/client/src/controller/LobbyCtrl.as#L404)

## 商店與暗房

- `ShopView(0)` 等 `Shop.ID(type)` 商品表，掛 `shop_ch.swf`、`PL_AVATAR_MATCH` 和初始分類。道具／卡／身體／衣服／飾品／Premium，原版 Premium 在持有卡 10011 時才顯示。Gem `(96,574)`、幣 `(89,602)`、入場 tween 約 117.6ms。購買需確認價格及數量，各類走原 Lobby 命令，以庫存／扣款真回覆才顯示成交。付費 `RealMoneyShopView` 是獨立流程。 [ShopView.as](../../../app/client/src/view/ShopView.as#L171) · [ShopView.as](../../../app/client/src/view/ShopView.as#L301) · [ShopItemListPanel.as](../../../app/client/src/view/scene/shop/ShopItemListPanel.as#L426) · [Lobby Ruby controller](../../../app/server/src/controller/lobby_controller.rb#L183)
- 暗房 `gacha_base_ch.swf`，機率／預覽另用 `gacha_prob` 系列。銅、銀、金依 `RareCardLot`、實際票券與資格。標題進出約 470.6ms。收到原版結果後才展示獎品及另兩張卡的類別、ID、數量。卡中心 `x338`、`y125/250/380`、揭示延遲 0／0.2／0.4s。Ruby 才消耗票券與抽獎，前端按真正結果渲染。現金購票分支須依 PAYMENT／NOT_PAYMENT 與實際館別驗收。 [LotView.as](../../../app/client/src/view/LotView.as#L171) · [LotView.as](../../../app/client/src/view/LotView.as#L343) · [LotView.as](../../../app/client/src/view/LotView.as#L548) · [Lobby Ruby controller](../../../app/server/src/controller/lobby_controller.rb#L291)

## 序號、好友、紀錄

- `Serial CodeInput` 面板 `(280,235) 245×245`，繁中載入普通序號、序號加密碼、Infection。普通 20 字、Infection 15 字英數與連字號，密碼版兩欄各至多 12 位數。非空提交交給對應 Lobby 命令、清空、關閉。伺服器才決定接受、拒絕、獎品及限制。關閉恢復 TopView。 [SerialInputPanel.as](../../../app/client/src/view/scene/lobby/SerialInputPanel.as#L183) · [SerialInputPanel.as](../../../app/client/src/view/scene/lobby/SerialInputPanel.as#L455) · [LobbyCtrl.as](../../../app/client/src/controller/LobbyCtrl.as#L719) · [Lobby Ruby controller](../../../app/server/src/controller/lobby_controller.rb#L389)
- 好友 `friend/btn_f_list.swf → friend/friendlist.swf`，`x125,y−120→150`、0.3s Quad.easeOut，關閉 0.15s sine-out。好友、申請待處理、封鎖、搜尋四 tab，搜尋停刷新且須驗名稱最短限制，等回覆暫停輸入。Data 搜尋、Lobby 更新／申請／確認／刪除，5 分鐘檢查、限流後延 3s 更新，關閉停 timer。寄任務是另一個僅開好友 tab 的模式。不能以本機假結果代替權限、回覆或失敗提示。 [FriendListButton.as](../../../app/client/src/view/image/common/FriendListButton.as#L67) · [FriendListView.as](../../../app/client/src/view/FriendListView.as#L250) · [FriendListView.as](../../../app/client/src/view/FriendListView.as#L398) · [FriendListContainer.as](../../../app/client/src/view/scene/common/FriendListContainer.as#L148) · [Lobby Ruby controller](../../../app/server/src/controller/lobby_controller.rb#L235)
- 右側「紀錄」實為 `AchievementListView`，`achievement/achievement.swf`，`x52,y−120→100`、0.3s Quad.easeOut，關閉 0.15s sine-out。顯示真正成就狀態及條件，開啟會刷新本機列表。另有 `LogListView`（`x152,y150`，須 `activate`）及 AvatarDetailBase 的 `log` 符號被隱藏。與右側成就、原生獨立戰鬥紀錄皆為不同入口。 [AchievementListButton.as](../../../app/client/src/view/image/common/AchievementListButton.as#L51) · [AchievementListView.as](../../../app/client/src/view/AchievementListView.as#L45) · [AchievementListContainer.as](../../../app/client/src/view/scene/common/AchievementListContainer.as#L255) · [LogListView.as](../../../app/client/src/view/LogListView.as#L63)
- 原版每次大廳進場序列完成後，另以同一 Lobby 連線送 `CS35(true)` 檢查已達成的成就與獎勵通知。大蝙蝠之群的繁中試跑在 Back 後觸發等級和魔女山谷成就，新增 7 張卡 10006 及 3000 Gem。寶箱至通關的三次確認已有個別 SQLite 快照。新版大廳成就檢查、獎勵通知、卡冊與角色資料交接待移植及驗收。[原版進場順序](../../../app/client/src/view/LobbyView.as#L319) · [Ruby 成就檢查](../../../app/server/src/controller/lobby_controller.rb#L351) · [原版成就實跑](/workspace/shared/unlight-web-port/flash-parity/quest-boss-treasure-original/README.md)

## 公告、事件資訊與聊天

- `/public/news.xml` 含一般更新與定時公告。真實 `LobbyNotice/NoticePanel` 在進場後逐項檢查，其餘服務通知又包含好友、獎品及可選獎品。面板上層 `y−120→0`、0.3s Quad.easeOut，關閉 0.15s sine-out，更新文欄 `(260,200) 350×288`。原版清除、獎品選擇及成就更新各有服務協議。原生安全 XML 公告可控制顯示及本頁已讀，但不能替使用者發原服務 clear 或領獎。 [News.as](../../../app/client/lib/News.as#L23) · [LobbyView.as](../../../app/client/src/view/LobbyView.as#L319) · [NoticePanel.as](../../../app/client/src/view/scene/lobby/NoticePanel.as#L893) · [NoticePanel.as](../../../app/client/src/view/scene/lobby/NoticePanel.as#L1407)
- `Announce` 是頂部 760×50 的非互動文字卷軸，依 10 分鐘檢查及公告時間窗。`btn_info` 是事件資訊面板，從 `(380,340)`、scale0 於 0.15s Quad.easeOut 放大到 `(0,0)`。`_talkButton.getShowThread` 在原版 LobbyView 註解。GlobalChat 建線服務多人求助更新／接受和路由，未證明大廳有一般聊天 UI。原生目前保留已驗證 GlobalChat 及 XML 公告，聊天區是透明位置。 [Announce.as](../../../app/client/src/view/utils/Announce.as#L35) · [EventInfoPanel.as](../../../app/client/src/view/scene/lobby/EventInfoPanel.as#L35) · [LobbyView.as](../../../app/client/src/view/LobbyView.as#L315) · [GlobalChatCtrl.as](../../../app/client/src/controller/GlobalChatCtrl.as#L148)

## 原生現況與首個安全交付

- `source-login` 已接 Auth／Lobby／Data／GlobalChat、原版玫瑰轉場、創角／指引、大廳角色與 AP／免費對戰。設定與任務接入固定舞台實際遊戲流程。任務沿原世界地圖到兩戰、寶箱及首區解鎖。其餘大廳入口依原始圖與 hover 保留，逐項接通及驗收。[登入路由](../../../source-login/login.js#L119) · [大廳入口](../../../source-login/lobby.js#L38) · [任務驗收](quest-pve.md)
- 第一項建議接通 `btn_h → 選項設定 → Back`。保留同一登入、原始進退場與 Back 後焦點。以 `SoundPanel` 的 0–100、預設50 先提供現有 BGM／SE 真實音量，對應同源本機設定與拒絕寫入時的預設。實測 click／alert／大廳 BGM 音量、0 靜音、鍵盤與刷新及 Back。同一首大廳音樂在進出設定保持既有播放位置。VOICE、工具提示及箭頭的各消費端驗通再顯示控制。若同輪要求完整入口協議，先獨立驗原版 Lobby AvatarUpdateCheck 回覆。不以設定切場假造同步。 [OptionView.as](../../../app/client/src/view/OptionView.as#L149) · [SoundPanel.as](../../../app/client/src/view/image/option/SoundPanel.as#L53) · [Option.as](../../../app/client/src/model/Option.as#L32) · [目前原生音源](../../../source-login/bgm.js#L1)
## 牌組內的兩個獨立流程

| 畫面 | 原版構成與操作 | 驗收 |
| --- | --- | --- |
| 成長需求樹 | `DeckEditView.requirements` 移除原卡冊，把退場按鈕交給 `RequirementsView`。載入目前卡、可成長目標、鎖定材料與數量。背景 0.5／1.7 秒進場，卡面 0.2／1.7 秒進場及退場。選取和離開播普通點擊聲，兌換成功播鏈條聲。 [入口](../../../app/client/src/view/DeckEditView.as#L391) · [畫面時序](../../../app/client/src/view/RequirementsView.as#L290) · [數量及兌換](../../../app/client/src/view/RequirementsView.as#L544) | 逐項核對材料不足、數量上下限、選卡、確定或取消、伺服器確認及返回原卡冊選擇。 |
| 武器合成 | `DeckEditView.combines` 以選定庫存 ID 進 `CombinesView`，切換退場按鈕並暫停卡冊分頁。背景 0.5／1.7 秒，左清單、材料與結果區 0.8／1.7 秒淡入，退場 0.2／1.7 秒。確認後顯示實際合成結果，成功使用鏈條聲，返回使用原點擊聲。 [入口](../../../app/client/src/view/DeckEditView.as#L445) · [構成與事件](../../../app/client/src/view/CombinesView.as#L195) · [伺服器結果](../../../app/client/src/view/CombinesView.as#L377) | 核對各材料位命中、有效組合、拒絕、重複提交、獎勵與庫存、取消及卡冊返回。 |
