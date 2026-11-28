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

## 大廳 AP 懸停與到期

- 原版 `social_ap.swf` 提供 AP 心形。提示由 ActionScript 建立，舞台固定右緣 `x=760`、上緣 `y=610`、高 20 px，依滿值、秒、分、時使用寬 120、158、176、196 px。使用原版 `minchoB` 10 px、1 px 字距、黑底與淺灰邊。滑入與滑出都以 200 ms sine-out 淡變，沒有播放音效，也不依全域工具提示開關改變。新版保留心形圖層並提供鍵盤焦點。[原版尺寸及動作](../../../app/client/src/view/image/common/ActionPointGauge.as#L268) · [原版樣式](../../../app/client/data/css/UL.css.cn#L1378) · [新版樣式](../../../source-login/lobby-ap-tooltip.css)
- 倒數以已驗證的時間快照為錨，每秒更新文字。原版 `SC17` 回傳現有 AP 及整秒剩餘時間，`SC18` 提供上限，`SC45` 提供回復間隔。滿值或溢出顯示「現在的AP是最大值。」到零仍未回復時暫顯原版回復間隔。Ruby 截去小數秒，新版以該次回覆起算再等過最後一秒，沿用 2 秒節流送 `CS17`。只在 Ruby 回覆後改變數字和心形。[原版大廳更新入口](../../../app/client/src/controller/LobbyCtrl.as#L619) · [Ruby 回復規則](../../../app/server/src/model/avatar.rb#L1611) · [新版倒數](../../../source-login/lobby-ap-tooltip.js)

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
- 固定繁中道具頁依序是虛擬人物、任務、對戰、突擊、特殊。只按原版主分類放入整頁，類型 5 歸特殊。原版道具格每頁 5×3，子分類與翻頁用 `item_panel_ch` 的命名按鈕。道具沿用已認證的實體庫存，外觀頁從 `SC6`／`SC4` 保留實體部件、裝備位元、期限及容量。整合原版 456 筆道具與 824 筆部件。資產清單記錄超出原影片範圍的 14 筆既有畫格引用，以原檔末幀顯示。[素材與座標盤點](/workspace/shared/unlight-web-port/flash-parity/lobby-main-item-source/source-audit.md) · [登入庫存欄位](../../../app/server/src/protocol/command/datacommand.rb#L187) · [原始資料及圖集](../../../source-login/item-inventory-art/index.json)
- **Flash 實跑。** 從大廳原大型 `btn_e` 進整頁道具，經黑色過場進場。切四個外層分頁再按 `(736,16)` 返回大廳。入口實測送出 Lobby `CS17` 和 `CS25(0)`。全程保留既有 Lobby 與 Data，隔離角色的實體道具、六件外觀及付款列一致。Ruffle 的同一個音訊 context 持續運作。[四個完整畫面](/workspace/shared/unlight-web-port/flash-parity/lobby-main-item-source/original-four-tabs.png) · [原版進出證據](/workspace/shared/unlight-web-port/flash-parity/lobby-main-item-source/README.md)
- **新版實跑。** 接入大廳實際入口與原版黑幕，核對四個外層分頁與各子分類、魔女秘藥詳情、空對戰分頁、容量 `6/30` 及同登入返回。入場實測 `CS17` 後送 `CS25(0)`，瀏覽期間無寫入，BGM 延續。頁首採同一原圖，容量列下方沿用原 SWF 的 `#858585` 向量層。[分項畫面與封包](/workspace/shared/unlight-web-port/flash-parity/lobby-main-item-live/README.md) · [重跑步驟](qa.md#重跑大廳整頁道具)

### 整頁道具使用魔女秘藥

- 原版確認框 `(255,230) 250×150`，完整拉伸 `panel_gene`。開啟時暫停內層道具操作，外層分類與 Back 保持可用。實跑按 No 保留選取、兩瓶及 AP 4/5，沒有使用命令。按 Yes 先收起確認框，再送一次第一瓶實體 ID 的 `CS18`。開窗和 Yes、No 都使用 `ulse01`。[原版 UseSendPanel](../../../app/client/src/view/image/item/UseSendPanel.as#L37) · [確認框並排](/workspace/shared/unlight-web-port/flash-parity/lobby-main-item-potion-live/confirmation-comparison.png)
- 兩版實跑 `SC17(5,0)` 與 `SC28`。新版暫緩真正 `SC28` 後，AP 已到 5/5，仍保留兩瓶及原選取。放行後只扣除已配對實體，數量變成一瓶，開啟「訊息／使用了魔女秘藥」。按 OK 回同一選取。大廳 BGM、連線及剩餘實體 ID 維持。確認鍵文字、細字抗鋸齒與成功遮罩的模糊尚有差異。[回覆暫緩與成功並排](/workspace/shared/unlight-web-port/flash-parity/lobby-main-item-potion-live/README.md) · [重跑步驟](qa.md#重跑整頁道具使用魔女秘藥)
- 範圍為魔女秘藥 #3。重複點擊與晚到回覆用同一登入的實體 ID 鎖定。滿 AP 的 Ruby 路徑會回復道具狀態且無成功封包，仍待整頁實跑。其他道具、裝備、卸下和丟棄各有後續回覆及錯誤驗收。[Ruby 消耗及失敗狀態](../../../app/server/src/model/item_inventory.rb#L55) · [整頁成功提示](../../../app/client/src/net/server/LobbyServer.as#L1218)

### 右側道具速查

- 大廳與設定的 `btn_map_item` 開啟 `WindowItemListPanel`。固定窗體 208×360，沿 `x798→498`、`y107` 用 200 ms Quad-out 滑入，150 ms sine-out 退出。按道具編號排序後每頁最多六組，箭頭循環翻頁。選取播放 `ulse01`。翻頁保留選取詳情，關閉後重開保留頁次並清除詳情。沿用所在場景的 BGM。[原版入口](../../../app/client/src/view/image/common/ItemListButton.as#L78) · [窗體轉場](../../../app/client/src/view/ItemListView.as#L40) · [素材與字體](../../../source-login/lobby-item-art/index.json)
- 讀取已登入角色的 Data `SC6` 實體道具清單。新角色快照來自 Lobby `SC4`，後續依 `SC27` 及 `SC28` 按實體 ID 更新。速查只列這個場景的虛擬人物類道具，已收錄 32 筆繁中定義。開關、選取和翻頁沿用現有連線與資料，瀏覽不發送寫入。[原始使用路由](../../../app/client/src/view/scene/item/WindowItemListPanel.as#L193) · [庫存解碼](../../../web-client/data-bootstrap.js)
- 行動力道具 #1、#2、#3 送 Lobby `CS18`。原版用同一組道具的第一筆實體庫存，收到對應 `SC28` 才扣除，AP 由 `SC17` 獨立更新。大廳把 Lobby 提示關閉，魔女秘藥在原版實跑中維持速查窗與選取，數量由 2 降至 1，無彈窗或使用音效。整頁道具介面的確認窗有自己的入口。藥水 #3 已用原版與新版的隔離角色實跑，#1、#2 與其餘道具效果待各自驗收。[大廳提示開關](../../../app/client/src/view/LobbyView.as#L123) · [繁中使用回覆](../../../app/client/src/net/server/LobbyServer.as#L1218) · [整頁確認](../../../app/client/src/view/scene/item/ItemListPanel.as#L147) · [並排截圖及封包](/workspace/shared/unlight-web-port/flash-parity/lobby-item-quick-live/README.md)

## 商店與暗房

- `ShopView(0)` 等 `Shop.ID(type)` 商品表，掛 `shop_ch.swf`、`PL_AVATAR_MATCH` 和初始分類。道具／卡／身體／衣服／飾品／Premium，原版 Premium 在持有卡 10011 時才顯示。Gem `(96,574)`、幣 `(89,602)`、入場 tween 約 117.6ms。購買需確認價格及數量，各類走原 Lobby 命令，以庫存／扣款真回覆才顯示成交。付費 `RealMoneyShopView` 是獨立流程。 [ShopView.as](../../../app/client/src/view/ShopView.as#L171) · [ShopView.as](../../../app/client/src/view/ShopView.as#L301) · [ShopItemListPanel.as](../../../app/client/src/view/scene/shop/ShopItemListPanel.as#L426) · [Lobby Ruby controller](../../../app/server/src/controller/lobby_controller.rb#L183)
- 暗房 `gacha_base_ch.swf`，機率／預覽另用 `gacha_prob` 系列。銅、銀、金依 `RareCardLot`、實際票券與資格。標題進出約 470.6ms。收到原版結果後才展示獎品及另兩張卡的類別、ID、數量。卡中心 `x338`、`y125/250/380`、揭示延遲 0／0.2／0.4s。Ruby 才消耗票券與抽獎，前端按真正結果渲染。現金購票分支須依 PAYMENT／NOT_PAYMENT 與實際館別驗收。 [LotView.as](../../../app/client/src/view/LotView.as#L171) · [LotView.as](../../../app/client/src/view/LotView.as#L343) · [LotView.as](../../../app/client/src/view/LotView.as#L548) · [Lobby Ruby controller](../../../app/server/src/controller/lobby_controller.rb#L291)

## 序號、好友、紀錄

- `Serial CodeInput` 面板 `(280,235) 245×245`，繁中載入普通序號、序號加密碼、Infection。普通 20 字、Infection 15 字英數與連字號，密碼版兩欄各至多 12 位數。非空提交交給對應 Lobby 命令、清空、關閉。伺服器才決定接受、拒絕、獎品及限制。關閉恢復 TopView。 [SerialInputPanel.as](../../../app/client/src/view/scene/lobby/SerialInputPanel.as#L183) · [SerialInputPanel.as](../../../app/client/src/view/scene/lobby/SerialInputPanel.as#L455) · [LobbyCtrl.as](../../../app/client/src/controller/LobbyCtrl.as#L719) · [Lobby Ruby controller](../../../app/server/src/controller/lobby_controller.rb#L389)
- 好友 `friend/btn_f_list.swf → friend/friendlist.swf`，`x125,y−120→150`、0.3s Quad.easeOut，關閉 0.15s sine-out。好友、申請待處理、封鎖、搜尋四 tab，搜尋停刷新且須驗名稱最短限制，等回覆暫停輸入。Data 搜尋、Lobby 更新／申請／確認／刪除，5 分鐘檢查、限流後延 3s 更新，關閉停 timer。寄任務是另一個僅開好友 tab 的模式。不能以本機假結果代替權限、回覆或失敗提示。 [FriendListButton.as](../../../app/client/src/view/image/common/FriendListButton.as#L67) · [FriendListView.as](../../../app/client/src/view/FriendListView.as#L250) · [FriendListView.as](../../../app/client/src/view/FriendListView.as#L398) · [FriendListContainer.as](../../../app/client/src/view/scene/common/FriendListContainer.as#L148) · [Lobby Ruby controller](../../../app/server/src/controller/lobby_controller.rb#L235)
- 右側「紀錄」實為 `AchievementListView`，`achievement/achievement.swf`，`x52,y−120→100`、0.3s Quad.easeOut，關閉 0.15s sine-out。顯示真正成就狀態及條件，開啟會刷新本機列表。另有 `LogListView`（`x152,y150`，須 `activate`）及 AvatarDetailBase 的 `log` 符號被隱藏。與右側成就、原生獨立戰鬥紀錄皆為不同入口。 [AchievementListButton.as](../../../app/client/src/view/image/common/AchievementListButton.as#L51) · [AchievementListView.as](../../../app/client/src/view/AchievementListView.as#L45) · [AchievementListContainer.as](../../../app/client/src/view/scene/common/AchievementListContainer.as#L255) · [LogListView.as](../../../app/client/src/view/LogListView.as#L63)
- 原版每次大廳進場序列完成後，另以同一 Lobby 連線送 `CS35(true)` 檢查成就。新版已接上就緒時的檢查、直接獎勵通知、實體道具和卡片，以及 Gem 絕對餘額。q568 先前原版試跑在終局返回後也發放「突破初期地區」的道具 3 和 3,000 Gem。[原版進場順序](../../../app/client/src/view/LobbyView.as#L319) · [Ruby 成就檢查](../../../app/server/src/controller/lobby_controller.rb#L351) · [q568 大廳成就紀錄](/workspace/shared/unlight-web-port/flash-parity/quest-highlow-terminal-exit-original/high/lobby-grant-proof.json)

### 右側好友清單

- 大廳與設定的好友按鈕實際點擊區是 `(712,528,48,32)`，原紅色提示圖在 `(712,521)`。只以已讀關係中待本人確認的狀態 1 啟用紅色提示。兩種待確認總數含送出與收到。528×408 窗體以 300 ms Quad-out 從 `(125,-120)` 到 `(125,150)`，關閉用 150 ms sine-out。開啟時阻止底層點擊。每頁五欄兩列，卡片從原始裝備部件繪製角色，旁列真實角色名、等級及上線狀態。[按鈕狀態](../../../app/client/src/view/image/common/FriendListButton.as#L67) · [進退場](../../../app/client/src/view/FriendListView.as#L249) · [窗體與名片素材](../../../source-login/lobby-friend-art/index.json)
- 好友、等待、封鎖由已認證 Data `CS8` 以類型 1、0、2 取每頁十筆，`SC12` 另帶各類總數。顯示已披露的正整數角色 ID 時送 `CS5` 等 `SC9`，介面只使用實際角色資料。好友容量取已認證的 Data `SC6` 或創角 Lobby `SC4`，後續由 Lobby `SC19` 更新。同登入短時間內翻回及重開沿用五分鐘快取。原分頁在總數恰為十的倍數時多一空頁。封鎖資料可能包含被對方封鎖的關係，畫面只列本人封鎖，且不補取對方封鎖列的角色名片。[原版清單快取](../../../app/client/src/model/FriendLink.as#L175) · [原版資料服務](../../../app/server/src/controller/data_controller.rb#L24) · [封鎖計數與排序](../../../app/server/src/model/friend_link.rb#L84)
- 搜尋以三至十二個 UTF-16 碼元為限，使用 Enter 或按鈕。非空短名稱顯示 `Error` 和「最少需要3個字」，不送封包。有效搜尋由 Data `CS15` 與 `SC26` 確認同伺服器的角色名稱前綴，收到結果後維持原版的一秒等候，再更新名單。無結果清單清空。好友、等待及封鎖分頁顯示原版「邀請」與「邀請Code」，搜尋時兩者收起。關閉會觸發 Lobby `CS35(true)` 成就檢查。[搜尋控制器](../../../app/client/src/view/FriendListView.as#L377) · [原版搜尋限制](../../../app/server/src/controller/data_controller.rb#L152) · [關閉行為](../../../app/client/src/view/FriendListView.as#L319)
- **已實跑。** 原版與新版均驗證 10+1 分頁、等待與封鎖的兩個方向、空清單、短名稱、同服搜尋及設定。原 `SC26` 回傳角色 ID 20、19，原版畫面依序呈現 19、20，新版沿用該畫面次序。鼠標點選後的橙字皮膚跨設定保留。關閉時檢查成就，瀏覽前後關係列一致。[原版搜尋物件迭代](../../../app/client/src/view/scene/common/FriendListContainer.as#L514) · [並排截圖及封包](/workspace/shared/unlight-web-port/flash-parity/lobby-friend-live/README.md)

#### 好友定時刷新與邀請碼

- 好友窗開啟時即檢查一次，開著時每 300 秒再檢查。距本次登入上一輪啟動刷新超過 300 秒時，等三秒後讀取當時的分類及頁次。搜尋分頁略過刷新。新版接收已認證 Data 的 `CS8`／`SC12`，收到正確分類與頁次前保留原名單。大廳與設定共用同一登入的刷新時間。原版關閉時停止週期計時。新版也取消已排程的讀取，避免關窗後才送出查詢。[原版計時及開關](../../../app/client/src/view/FriendListView.as#L249) · [原版讀取分頁](../../../app/client/src/model/FriendLink.as#L175) · [新版好友窗](../../../source-login/lobby-friend.js)
- 「邀請Code」在舞台 `(260,220)` 開啟 `260×250` 的 `Invite Code`。原版 `panel_gene` 整張拉伸，關閉圖示沿用固定 Flex 素材。進退場分別是 50 ms Quad-out 與 sine-out，底層好友窗可見。「複製連結」沿用 `ulse01` 和原版剪貼簿文字 `orig`。固定來源未提供可替換的邀請網址，窗內顯示的是從登入玩家 ID 算出的九字代碼。固定原版的社群圖示區為空白，對應圖檔未在素材鏡像找到。一般「邀請」在這個建置沒有綁定動作。註冊兌換及任務寄送另有各自的入口。[原版視窗及按鈕](../../../app/client/src/view/scene/common/NewInvitePanel.as#L145) · [原版代碼](../../../app/client/src/model/Player.as#L270) · [固定 Flex 素材](../../../source-login/lobby-friend-invite-art/index.json) · [重跑步驟](qa.md#重跑好友定時刷新與邀請碼)
- **Flash 實跑。** 第 2 頁維持開啟，該頁好友從另一條正常 Auth 連線登入。原版從點擊開窗到定時送出 `CS8(1,10,10)` 實測 305.277 秒，62 ms 後收 `SC12`，原卡顯示 Online。實際點複製也讀回 `orig`，開關子窗期間原版服務未收到業務操作，關係及庫存存檔一致。[原版實測時間](/workspace/shared/unlight-web-port/flash-parity/lobby-friend-invite-refresh-live/original/timing.json) · [原版操作記錄](/workspace/shared/unlight-web-port/flash-parity/lobby-friend-invite-refresh-live/original/trace.json)
- **新版實跑。** 加速主畫面的瀏覽器時鐘，第二帳號實際登入 Ruby。300 秒檢查後滿三秒才送第 2 頁查詢。暫緩真 `SC12` 時，同一張卡仍顯示離線。放行後以同一真回覆顯示 Online。搜尋略過兩個週期，關窗取消待送查詢，設定延續同頁及同次登入的刷新時間。舊清單、分頁、搜尋、關閉及設定測例重跑通過。[上線並排](/workspace/shared/unlight-web-port/flash-parity/lobby-friend-invite-refresh-live/friend-online-comparison.png) · [新版刷新紀錄](/workspace/shared/unlight-web-port/flash-parity/lobby-friend-invite-refresh-live/native-refresh/lobby-friend-refresh-wire.json)
- **新版實跑。** 在原好友窗內開啟邀請碼、複製 `orig` 及以鍵盤關閉，焦點回到原按鈕。測例角色 Player 2 的顯示碼為 `E78JM8M7U`。複製只播一次 `ulse01`，大廳 BGM 持續，四條登入服務的封包計數在操作前後一致。原版與新版在小字的抗鋸齒和複製鍵邊緣仍有差異。[邀請碼並排和實機證據](/workspace/shared/unlight-web-port/flash-parity/lobby-friend-invite-refresh-live/README.md)

#### 好友確認與關係寫入

- 搜尋角色卡的「申請」、等待分頁收到的「認證」與卡片滑入後的 X 共用原版 `ConfirmPanel`。窗體在 `y280`，高 150，寬為內文寬加 60，水平以遊戲區的 `x380` 為中心。YES 與 NO 中心為 `(345,391)` 與 `(415,391)`。底層覆原版半透明深灰。取消只收起確認窗。原版 X 在開確認前播放 `ulse01`，YES／NO 操作也播放該音效，伺服器拒絕另走 `Alerter` 的「警告」與 `ulse02`。[原版確認窗](../../../app/client/src/view/utils/ConfirmPanel.as#L50) · [好友操作](../../../app/client/src/view/scene/common/FriendListContainer.as#L1234)

| 操作 | 原版列狀態 | Lobby 封包 | 真實 SQLite |
| --- | --- | --- | --- |
| 申請 | 搜尋結果 7 | `CS27 → SC36` | 建立發送者指向收件者的 type 0 |
| 認證 | 收到申請 1 | `CS28 → SC37` | 同一筆關係改為 type 1，方向相同 |
| 刪除、拒絕或撤回 | 0／1／2／6 的 X | `CS29 → SC38` | 關係列消失 |
| 封鎖 | 搜尋結果 7 的 X | `CS41 → SC62` | 建立本人指向對方的 type 2。本人看到狀態 3，對方的狀態 4 不顯示 |
| 解除封鎖 | 本人封鎖 3 的 X | `CS29 → SC38` | 原封鎖列消失 |

- 請求與成功回覆參數均為對方玩家 ID。接到該筆回覆才更新畫面、待確認提示及相應分頁快取。已發送的操作即使畫面離開仍等候同一 Lobby 的回覆。來源 `SC34` 以錯誤碼 60 至 66 區分拒絕原因，沒有玩家 ID。逾時結果不明時保留舊操作的識別與寫入鎖，資料清單仍可獨立讀取。上一個請求的晚回覆不能當成下一筆操作的結果。[原版命令](../../../app/client/src/net/command/LobbyCommand.as#L348) · [Ruby 關係變更](../../../app/server/src/controller/lobby_controller.rb#L235) · [新版驗證與快取](../../../web-client/session.js)
- **已實跑。** 兩版以隔離角色甲、乙驗取消、申請、認證、刪除、封鎖及解除。認證沿用同一筆關係。被封鎖者讀到狀態 4，畫面維持空白。解除後可再次搜尋對方。另用容量 0 的同服角色觸發真的 `SC34=64`，點原版 OK 後維持原搜尋結果。新版暫緩真 `SC36` 驗證沒有提前移除搜尋列。認證後關閉面板的真 `CS35` 發出首位好友成就 #37、魔女秘藥一份，並銜接 #38 新挑戰。原版在認證後以已驗證的 SQLite 隔離存檔接續下半程。[操作、封包及並排畫面](/workspace/shared/unlight-web-port/flash-parity/lobby-friend-write-live/README.md)

### 右側紀錄清單

- 原始面板 `achievement_ch.swf` 在 `(52,100)` 為 648×520。160×18 的分類選單在 `(532,127)`，16 列自 `y=163` 起每隔 16 px 排列，頁碼位於 `(372,428)`。進行中與完成分頁共用六個分類，標題依 `recordname` 畫格切換，選列展開條件、期限、說明及達成代碼。原版實跑入口在大廳和設定，開啟用 300 ms Quad-out，關閉用 150 ms sine-out。場景沿用大廳 BGM，開關、翻頁及選取無專屬音效。[面板滑入滑出](../../../app/client/src/view/AchievementListView.as#L65) · [清單與詳情](../../../app/client/src/view/scene/common/AchievementListContainer.as#L131) · [原版實玩家畫面](/workspace/shared/unlight-web-port/flash-parity/lobby-record-list-live/original/04-original-record-selected.png)
- 原版清單操作就地使用已認證的成就存檔。登入的 Data `SC7` 傳送壓縮資料，後續 Data、Lobby、Quest 增量更新以成就 ID 合併。既有唯讀 `CS39` 可取得 `SC56`，原版清單開啟不發送這個請求。完成或失敗由原始狀態決定，失敗歸在完成頁並淡顯，從清單移除另有事件。新版依原始狀態與 1,205 筆公開的繁中定義顯示紀錄。原版 `cwming.ttf` 可用的字元以 WOFF 子集載入。[原版清單開啟](../../../app/client/src/view/AchievementListView.as#L81) · [素材來源](../../../source-login/lobby-record-art/index.json) · [資料解碼](../../../web-client/achievement-data.js)
- 已實跑同一登入內通關 q3、回到大廳、讀取 `SC56` 及再次開啟清單。#2、#31 從進行中移至完成，#3、#32 仍進行中。清單實跑的完整啟動快照來自已有角色的登入。首次創角同一登入的完整資料仍待驗收。[原版與新版完成詳情](/workspace/shared/unlight-web-port/flash-parity/lobby-record-list-live/q3-finished-region-comparison.png) · [同一登入的封包與存檔](/workspace/shared/unlight-web-port/flash-parity/lobby-record-list-live/native-q3/lobby-achievement-wire.json)

### 大廳成就的直接獎勵

- 成就完成通知使用 `info_login.swf` 的 Information 外框與 Braw 圖層，標題為 Record。舞台面板 `(116,144)`、`528×416`，OK 中心 `(380,541)`。面板以 300 ms 滑入、150 ms 滑出，獎品掛載後等 200 ms，再用 300 ms 翻牌並播放 `ulse23`。每筆直接獎勵以本機 OK 逐筆確認。新版實跑驗到四次播放、底層入口暫停、最後恢復焦點。[原版通知時序](../../../app/client/src/view/scene/lobby/NoticePanel.as#L893) · [獎品翻面](../../../app/client/src/view/scene/common/TreasureCardClip.as#L316) · [來源素材清單](../../../source-login/lobby-achievement-art/index.json)
- q3 兩版在初次就緒的 Lobby 送 `CS35(true)`，旗標 0 時成就 #2、#31 維持待完成。兩版實跑 Data `SC22` 先於 `SC6` 抵達，抽獎券 ×3 已實際入庫。兩版重新登入同一角色後進入 q3，新版確認未重發抽獎券。[首次登入抽獎券並排](/workspace/shared/unlight-web-port/flash-parity/quest-lobby-record-live/q3/initial-record-ticket-comparison.png)
- q3 原版連打兩場獲勝，Quest `SC26` 先確認旗標 1，離場前為 124 Gem／30 EXP／Lv3／AP 6/6。Back 後同一 Lobby 送 `CS35(true)`，獨立發放抽獎券一張、記憶的碎片七張、魔女秘藥一件和 3,000 Gem。實際面板依序是抽獎券、記憶的碎片、Gem、魔女秘藥，與封包先到魔女秘藥再到 Gem 的次序有差異。四張面板的 OK 均有實際滑鼠操作。原版畫面下方仍顯示 124，原版 Lobby `SC25` 和 SQLite 都記錄 3,124，原版 HUD 顯示更新時點仍待釐清。[原版畫面、封包及存檔](/workspace/shared/unlight-web-port/flash-parity/quest-lobby-record-original/q3/README.md)
- 新版用同一 Lobby 的唯讀 `CS3` 及 Pong 確認此批回覆完整。等候期間依原回覆更新錢包和庫存，通知依原版佇列規則等收齊後才開始。暫緩真 Pong 的實跑已核對四筆真通知、3,124 Gem 及尚未開啟的 Record，放行後依原版順序顯示。新版再進任務和 Back 時實際送新一輪檢查，維持同一 Lobby 且沒有重發。[等候原回覆的畫面](/workspace/shared/unlight-web-port/flash-parity/quest-lobby-record-live/q3/native/42-lobby-records-awaiting-actual-pong.png) · [兩版四筆並排與封包](/workspace/shared/unlight-web-port/flash-parity/quest-lobby-record-live/q3/README.md)

### 新挑戰與可選角色卡

- 「新挑戰」接續直接獎勵進入同一通知佇列，採用 `info_login.swf` 的標誌及既有大廳外框。新手及一般版本各用原始標誌。#2 的條件為 Lv3，按 OK 由客戶端確認，沒有領獎封包。參考 Ruffle 實跑可見完整面板，三處 OK 點擊及 Tab 未能關閉面板。新版按 ActionScript 定義提供本機確認。[原始處理](../../../app/client/src/view/scene/lobby/NoticePanel.as) · [原版畫面及封包](/workspace/shared/unlight-web-port/flash-parity/quest-record-choice-original/README.md)
- Level 3 的 `26:2` 有 21 個按原始索引排列的角色卡。閉合選單在舞台 `(300,493)`、`160×18`。選擇時使用 `ulse22`，預覽翻牌使用 `ulse23`。未選擇時 OK 停用，瀏覽選項及預覽不寫入庫存。實際領取須先從當前已驗證 Lobby 收到 `SC54` 待領及配套 `SC71`，再送一次 `CS51(成就,索引)`。[畫面、佇列及音效](../../../source-login/lobby-achievement.js) · [Lobby 封包](../../../app/server/src/protocol/command/lobbycommand.rb)
- 固定 Flash 選第一項後，實際送出 `CS52` 及 `CS37`。目前 Ruby 將前者路由為襲擊通知處理，原版畫面出現領取提示，但 SQLite 只清了待領，沒有新增卡。修正後 Ruby 在同一交易發卡並移除所選通知，提交後才發 `SC72`。新版收到與 `SC31` 卡片入庫事件相符的確認再顯示情報；無效索引保留待領，重複領取不再發卡。[原版指令差異](/workspace/shared/unlight-web-port/flash-parity/quest-lobby-record-original/q3/selectable-source-mismatch.json) · [Ruby 交易](../../../app/server/src/model/avatar.rb)

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
