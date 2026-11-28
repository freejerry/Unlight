# 戰鬥九項驗收

以固定繁中 Flash、原始 ActionScript、Ruby 及 780×680 舞台核對。封包到達、畫面顯示和開放操作分別取樣。實機流程使用實際 Ruby 發牌與判定。

| 項目 | 已查到的原因或原版行為 | 驗收方式 |
| --- | --- | --- |
| 1. 達成技能條件後發動 | 原版用 `SC107`、`SC108` 更新己方技能條件提示，`SC110` 確認技能與發動方。新版原先未接這些回覆。古魯瓦爾多「猛擊」在近距離要求兩張各為劍 1 的牌。Ruby 負責確認技能和骰數。[Flash 技能回覆](../../../app/client/src/net/server/QuestServer.as#L1723) · [Ruby 事件](../../../app/server/src/controller/duel_controller.rb#L1364) | 以真出牌驗到符合、撤牌後取消，以及真正發動。保存技能 ID、條件亮起前後、技能演出、音效與骰數。另驗原版的技能替換及條件變更回覆。 |
| 2. 左上角牌庫 | 原版 `DeckArea` 含 3D `DeckObject`，新版原先只畫牌數。原版每次普通發牌按己方及敵方張數扣除，事件牌不扣。現有 Ruffle 實拍的預期區域只看到背景，原始模型、貼圖及投影均可查證。[原版牌庫](../../../app/client/src/view/scene/game/DeckArea.as#L32) · [模型使用點](../../../app/client/src/view/image/game/DeckObject.as#L20) | 以實際 Draw 確認牌庫出現、牌數逐張改變、事件牌不扣、零張隱藏。原始模型投影和 Ruffle 擷取差異分開記錄。 |
| 3. 敵方蓋牌出牌動畫 | 原版把同一張匿名牌背從敵方手牌送到桌上，撤牌會送回。普通補位以 `200/1.7` ms sine-out。新版原先重建牌背在落點，中間位移缺失。[敵方手牌實作](../../../app/client/src/view/scene/game/FoeHand.as#L169) | 保存同一張牌背的出發、中途及落點，另驗撤牌、其他牌補位、快速連續出牌及暫緩揭牌。揭面前不顯示實體 ID 或相應卡面。 |
| 4. 移動時立繪消失 | 原版角色卡、場上立繪與短暫姿勢是不同圖層。場上依 `stand_image` 取圖，同一角色不同等級可共用。原版四個距離索引的己方 x 為 `288/184/80/184`，敵方 x 為 `472/576/680/576`，移動用 300 ms ease-in-quad。新版原先依有限卡片 ID 找圖，第四個位置亦有缺漏。[原版立繪移動](../../../app/client/src/view/scene/game/StandChara.as#L515) | 逐幀核對原立繪與陰影在距離改變、距離不變和跨回合時持續可見。另驗換角、圖檔晚到、原版隱藏與霧化。 |
| 5. 滑入技能沒顯示 | 原版把技能母表的繁中技能條件、效果及說明放在黑底視窗。寬 150，己方顯示於名稱上方，敵方顯示於名稱下方。淡入 100 ms、淡出 50 ms。新版原先只畫技能名。[原版技能說明](../../../app/client/src/view/scene/game/FeatInfo.as#L923) | 驗證己方與敵方位置、技能名、條件、效果、滑離及鍵盤焦點。切換角色時更新資料。以上操作均不發出遊戲命令。 |
| 6. 發牌移動不明顯 | 普通牌從 `(40,105)` 出發，敵我交錯，每張間隔 300 ms。移動 `300/1.7` ms，淡入另為 `100/1.7` ms。原版事件牌在手牌位置另用淡入和縮放。新版原先把淡入和移動綁在一起，素材晚到也可能遮掉前段。[原版發牌](../../../app/client/src/view/scene/game/BaseHand.as#L322) | 驗證冷載入及快取時普通牌有可見的中途畫格，計時與發牌音符合來源。驗第二回合少量補牌、事件牌，以及未使用手牌保留。 |
| 7. 點角色卡翻面 | 原版角色卡由正面翻到含技能說明的背面，再點可翻回，以 300 ms expo-out 及 `ulse23`。翻卡是本機操作。新版原先沒綁角色卡的點擊。[原版角色卡](../../../app/client/src/view/scene/common/CharaCardClip.as#L852) | 取正面、翻轉中、背面和翻回畫面，確認沒有 `CS32` 或其他遊戲命令。角色卡正反面和行動牌的旋轉分別測試。 |
| 8. 兩邊 OK 後顯示敵方牌面 | Flash 原版攻防在 `SC52/54` 各自翻面，實拍可見己方防禦 OK 尚可按時對方牌已翻開。依這次明確要求，新版攻防等雙方完成且收到共同的 `SC55` 才揭牌。Ruby 的結果判定照原規則。移動沿用 `SC48`。[原版翻面](../../../app/client/src/view/scene/game/DuelTable.as#L594) · [原版防禦畫面](/workspace/shared/unlight-web-port/flash-parity/quest-combat-original/04-original-combat-role-and-hover.png) | 以真 `SC52` 進入防禦，確認對方仍是牌背。按此次己方 OK，暫緩真正 `SC55` 再放行，確認只在放行後翻面一次。分開驗移動與攻防。 |
| 9. 全段動畫與轉場 | 按原版的來源事件逐段比對，避免用最後一張靜態畫面替代前後順序。[原版戰鬥控制](../../../app/client/src/view/QuestView.as#L800) · [原版戰鬥桌事件](../../../app/client/src/view/scene/game/DuelTable.as#L723) | 以下時間軸列出每段的畫面、音訊及輸入門檻。 |

## 動畫順序

1. `SC37/40` 進戰鬥。核對原圖、VS、角色與 HUD 進場。原序列完結後只送一次 Ready。
2. `SC43–46` 開回合。核對原牌庫、普通牌交錯移動、事件牌淡入、聲音與 Move 的開放時點。
3. 移動階段核對方向、雙方牌片和確認鎖定。`SC48` 後才翻出移動用牌、顯示距離及先手、移動立繪。
4. `SC51–55` 核對攻防切換、合法輸入、敵方牌背進出及兩邊完成後的揭牌。另驗快速收到相鄰回覆不會跳過中間畫面。
5. `SC107/108/110` 核對條件亮暗、實際技能、發動方和序列位置。原版技能切入播放 `ulse13`，暫時以 24 FPS 播放。切入、攻防點數、擲骰、命中和扣血各有自己的觸發時點。
6. `SC56` 起核對骰子依真實結果與原版間隔播放。`SC73/74` 之後用真實扣血同步頭像及血條，並驗零骰、零傷害與真正扣血。
7. 清場後進同回合反攻、補牌、換角或結算。分別驗終局、回地圖與 Back，上一場動作不能留到下一場。

### 已量到的原版差異

| 段落 | 原版順序與量測 |
| --- | --- |
| 初始牌庫 | 標籤從 0 起，第一步延遲 10 ms，之後每 20 ms 增加一張。普通牌動作獨立執行。 [DeckArea](../../../app/client/src/view/scene/game/DeckArea.as#L134) |
| 移動結算 | 敵方牌揭面、移動箭頭及結果、先清我方牌再清敵方牌，之後才切距離及移動立繪。 [QuestServer](../../../app/client/src/net/server/QuestServer.as#L1079) · [Duel](../../../app/client/src/view/scene/game/Duel.as#L353) |
| 攻防清桌 | 結算前先清我方再清敵方。已消耗牌從桌面飛到 `(40,105)`，每張 `200/1.7` ms，依位置錯開 `40/1.7` ms。未消耗且未鎖定的牌回手。Flash 在清桌後執行下一個畫面命令。新版的雙方確認規則要求先播完揭面。 [清桌](../../../app/client/src/view/scene/game/DuelTable.as#L675) · [牌片時間](../../../app/client/src/view/scene/game/BaseHand.as#L549) · [畫面命令佇列](../../../app/client/src/view/QuestView.as#L906) |
| 擲骰與比較 | 兩側均有骰時才播放立繪攻擊與擲骰。每顆骰錯開 50 ms、飛行 500 ms，落定再停 500 ms。圖示用 300 ms 排列，配對及命中每個錯開 100 ms。留下未抵消圖示 500 ms，再做 300 ms 淡出。 [擲骰](../../../app/client/src/view/scene/game/DuelTable.as#L723) · [骰值比較](../../../app/client/src/view/scene/game/DiceResult.as#L49) · [原版實拍](/workspace/shared/unlight-web-port/flash-parity/quest-combat-original/10-original-first-exchange.png) |
| 傷害與換角 | 正傷害讓血條以 100 ms 緩動更新，更新數字後等待 1 秒。受擊特效可繼續播放。另需覆蓋多次傷害、備用角色、血量絕對值與死亡換角。 [血量](../../../app/client/src/view/scene/game/HP.as#L644) · [原版扣血實拍](/workspace/shared/unlight-web-port/flash-parity/quest-combat-original/hp-proof/23-original-hp-changed.png) |
| 終局清手牌 | 敵方手牌先短暫停留，之後依序處理我方剩餘手牌，再進結算。 [終局](../../../app/client/src/view/scene/game/DuelTable.as#L764) · [我方手牌](../../../app/client/src/view/scene/game/PlayerHand.as#L300) |

## 新版實戰證據

- Q1 實戰操作古魯瓦爾多 Lv1。先用兩張移動 1 到近距離，再放兩張劍 1。原版 Ruby 發出 `SC107 → SC108 → SC107`，畫面點數依序顯示 12、6、12。暫緩真正的 `SC110` 時沒有切入或音效。放行後，`SC110(己方,25)` 只出現一次，原版 24 FPS 特寫出現，`ulse13` 播放一次，`SC56` 含 12 個攻擊骰。 [發動截圖](/workspace/shared/unlight-web-port/flash-parity/battle-regressions-live/skill/01-real-starter-skill-activation.png) · [實際封包及逐幀資料](/workspace/shared/unlight-web-port/flash-parity/battle-regressions-live/skill/battle-numbered-wire.json)
- Q4 以真正的 Ruby 發牌觀察五張普通牌的可見移動。確認技能提示的滑鼠與鍵盤操作、角色卡往返翻面，並取得移動期間 92 筆雙方立繪與玩家頭像都可見的畫面。攻防先看到兩張匿名牌背，收到雙方 OK 及 `SC52/54` 仍蓋著。放行真正 `SC55` 後只揭露一次，兩張依原版清桌方向飛回 `(40,105)`，約 200 ms 後首次渲染 WebGL 擲骰。完成勝利、兩次 OK、回大廳並確認只關閉 Quest 連線。 [揭牌前後](/workspace/shared/unlight-web-port/flash-parity/battle-regressions-live/before-after-both-ok.png) · [清桌後擲骰](/workspace/shared/unlight-web-port/flash-parity/battle-regressions-live/presentation/09-dice-roll-after-foe-card-discard.png) · [實際封包及逐幀資料](/workspace/shared/unlight-web-port/flash-parity/battle-regressions-live/presentation/battle-numbered-wire.json)

## 待覆蓋的分支

- 目前內建切入素材含「猛擊」與「精密射擊」各兩個技能 ID。`SC83` 點數覆寫、`SC109` 技能替換、`SC120` 裝備修改條件已定位到原版發送端。後續可依原版「攻防抗衡」、格雷高爾替換技能、艾伯李斯特配戴「凱旋之棘」分開重跑。 [點數覆寫](../../../app/server/src/model/chara_card.rb#L5709) · [技能替換](../../../app/server/src/model/chara_card.rb#L21773) · [條件變更](../../../app/server/src/model/chara_card.rb#L25933)
- 立繪依 `stand_image` 解決同角色升級的共用圖。Q1、Q3、Q4、Q32 已追查路線的敵方站姿已備齊，另補上 Q568 中線第 4 格的「邪氣布」。其餘共享戰場的敵人、換角、隱形及霧化仍需按原版素材與操作逐場驗證。 [立繪來源清單](../../../source-login/battle-card-art/index.json)
- 移動清桌、未消耗卡返回手牌的完整演出、終局逐張清手牌，以及傷害等待和絕對血量交錯仍需實作或驗證。須另跑同回合兩組攻防、次回合補牌、零骰、零傷害、強制換角及真人對戰。 [移動結算](../../../app/client/src/model/Duel.as#L353) · [原版第二組與補牌](/workspace/shared/unlight-web-port/flash-parity/quest-exchange-two-original/README.md)
