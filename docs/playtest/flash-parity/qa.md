# 驗收基線與證據 · `cc2ef535b6d3416f3c5796d9ccbbf2e802e90151`

正式 native gateway 的 `/source-login/` 是固定舞台遊戲，啟動時需要解碼 Wasm。`/` 是原生診斷與試玩入口，`/replay/` 播放已提交的 Ruby 事件。原版 Ruffle gateway 在另一 HTTP 埠提供 `/`。登入、註冊、建角、新手指引、大廳、設定與第一張普通任務地圖在 `/source-login/` 同一 URL 切換。大廳有 14 個可懸停的原版美術位置，其中 5 個播放動畫。任務進入獨立舞台與 Quest 連線，Back 回同一登入的大廳。公告自動開啟，關閉後回到大廳標題。[固定舞台切換](../../../source-login/login.js) · [設定驗收](options-reference.md) · [任務驗收](quest-pve.md)

| 範圍 | 有效證據與判讀 | 原件 |
| --- | --- | --- |
| 原版標題基線 | 未加相容補丁的 `Unlight.swf` SHA `2a375905…ddc44`，SWF10 AS3、780×680、24 FPS。Chromium 156／Ruffle Web `0.8.0+2026-11-19`／ANGLE SwiftShader，900×760 視窗、DPR1，保留 780×680 合成舞台與同一次執行的 JSON。約 4.02 秒只捕捉 18 張縮圖、17 次變化，量到的是當次軟體渲染取樣。`29-browser-panel-current` 的面板則是已修正的相容執行檔 `602db88d`。 | [原版畫面與出處](/workspace/shared/unlight-web-port/fixed-stage-audit/01-original-swf-title-provenance.json) · [合併版對照](../README.md#L37) · [面板畫面來源](../README.md#L65) |
| 原版玩家操作 | Ruffle Desktop 有登入、開場、建角、起始牌、教學、大廳、魔女山谷、首戰至通關序列。瀏覽器相容版另有公告、任務提示、攻防與首戰通關，實際 Ruby／SQLite 確認庫存移除、通關進度和獎勵。舊版各次骰點、獎勵及畫面狀態依該次試玩。 | [桌面序列](../README.md#L5) · [瀏覽器相容版首戰](../README.md#L21) |
| 固定標題與音訊 | `check_source_login.py` 在 Chromium／SwiftShader 驗證 780×680、置中、預設 XML 三則、登入編排與按鈕、空欄本地錯誤、真 Ruby 未註冊拒絕、模態遮罩與焦點。SHA 核對標題音樂及按鈕／警示 MP3，Web Audio 探針驗證播放。嚴格 autoplay Chromium 逐一走空白舞台、欄位、鍵盤、觸控、專用按鈕、初始載入時觸控六條路徑，另有允許無手勢的設定。CDP 讀值明確 `userGesture: false`，載入預熱驗證靜音增益。獨立 MP3 HTTP 測例核對實際音檔推進與解碼。其範圍是素材和播放。 | [正式腳本](../../../tools/legacy-web/check_source_login.py#L98) · [MP3 實測數據](/workspace/shared/unlight-web-port/source-assets-browser/04-original-mp3-playback.json) |
| 固定登入轉場、建角與大廳 | `cc2ef53` 兩個新測試帳號的正式 Chromium 腳本通過。第一位可以看到原玫瑰畫格，第二位維持減少動態效果。實際註冊及登入、創角、各段引導、四條原版連線、預設公告、任務空清單、裝備依 SQLite 配對、兩種 Canvas 拼裝像素，以及重新整理後直接入廳均已驗證。真 Lobby 回覆暫緩時，兩張 780×680 原玫瑰畫格確實不同，釋放後進入新手畫面。真 Auth `SC9` 暫緩與釋放後仍在標題。快速重新登入的瀏覽器畫格記錄沒有回閃到標題。延遲用 Playwright 暫緩實際回覆，完整正式腳本另在直接原版 socket 通過。 | [正式腳本](../../../tools/legacy-web/check_source_lobby.py) · [實際等待畫面](/workspace/shared/unlight-web-port/login-rose-transition/qa-01-held-lobby-rose-first.png) · [下一畫格](/workspace/shared/unlight-web-port/login-rose-transition/qa-02-held-lobby-rose-next.png) · [快速登入後](/workspace/shared/unlight-web-port/login-rose-transition/qa-05-rapid-relogin-lobby.png) |
| 大廳原版素材與時序 | 兩個實際 Ruby 裝備組合經 Canvas 290×450 拼裝，首次／再次登入對同一角色的像素一致。實測 AP 5/5、3 顆可免費對戰金星、頂框及右側 20px 灰階取樣、14 個指標切換和還原、任務鍵盤焦點。五段時序驗證實際 CSS 動畫和畫格邊界，襲擊 8 格、任務 48 格、對戰 120 格、牌組 35 格、道具 15 格入場加 45 格循環，皆為 24 FPS。對戰超過 16K 高的圖集第 0／105 格另經 Chromium 可見合成像素核對。 | [實際大廳](/workspace/shared/unlight-web-port/lobby-hover-timing/qa-live-lobby-idle-780.png) · [任務懸停](/workspace/shared/unlight-web-port/lobby-hover-timing/qa-live-quest-hover-780.png) · [對戰第 105 格](/workspace/shared/unlight-web-port/lobby-hover-timing/qa-duel-frame-105.png) · [AP 與金星](/workspace/shared/unlight-web-port/lobby-hover-hud/03-ap-and-three-gold-stars.png) |
| 其他原生路徑 | `/` 以 `check_native_browser.py` 驗六項 KeepAlive、面板像素與圖形備援，以 `check_native_session.py` 驗真 SRP、啟動及部分資料操作。歷史 320 CSS px 資料包含自然 180 秒搜尋、原版戰鬥與結算等，適用於該批 `/` 診斷試玩證據。`/replay/` 以 `check_native_replay.py` 驗 68 筆既有事件、播放與鍵盤。Rust 搜尋歷史另有 `/api/searches` 服務與 `check_native_deadlines.py`，遊戲搜尋以 Ruby 為準。 | [原生功能／指令](../../../web-client/README.md#L83) · [歷史 180 秒及首戰證據](../README.md#L349) · [固定資料](../../../tools/legacy-server/fixtures/trace-2026.json) |

## 可重跑的隔離環境

以下由 `/workspace/Unlight-lobby-integrated` 執行，每個常駐程序各用一個終端機，重用同一組變數與證據目錄。先選未使用的埠。兩個 Ruby 執行副本共用唯讀主檔來源，使用各自 SQLite 與回環 Memcached、原始 `12001–12005`／`12020` 協定埠再加 offset。原版手動操作線的密碼由終端提示輸入，固定舞台腳本在隔離副本自行註冊。使用 Python 3.11+、aiohttp、Playwright、Chromium、Ruby 2.7.8 與固定 Gem。Rust 需要 `wasm32-unknown-unknown`。 [Ruby 啟動參數](../../../tools/legacy-server/README.md) · [固定舞台資源需求](../../../source-login/README.md)

```bash
export PATH=/workspace/.unlight-dev/ruby/bin:/workspace/.unlight-dev/sysroot/usr/bin:$PATH
legacy_tree=/workspace/.unlight-dev/legacy-build
source_revision=ee3862214624326ac830c4b363645efcb9156ec7
master_db="$legacy_tree/data-work/runtime-probe/data/game_dev2.db"
ruffle_web=/workspace/.unlight-dev/unlight-original-preview/ruffle
proof_dir=$(mktemp -d /tmp/unlight-parity-proof-XXXXXXXX)

# 兩個獨立 Ruby 執行副本，各自保持在前景。
python3 -Bu tools/legacy-server/run.py serve --revision "$source_revision" \
  --port-offset 7900 --work-dir "$proof_dir/native-ruby" --master "$master_db"
python3 -Bu tools/legacy-server/run.py serve --revision "$source_revision" \
  --port-offset 7950 --work-dir "$proof_dir/original-ruby" --master "$master_db" \
  --playtest-user parityqa

# 獨立 native 和原版 HTTP 入口，各自保持在前景。
source modern/rust-env.sh
rustc --edition=2021 --crate-type=cdylib --target=wasm32-unknown-unknown -O -C strip=symbols \
  source-login/swf-bitmap.rs -o "$proof_dir/asset-decoder.wasm"
python3 -Bu tools/legacy-web/serve.py --native --port 4390 --server-offset 7900 \
  --assets "$legacy_tree/assets/public" --source-login-wasm "$proof_dir/asset-decoder.wasm"
original_swf="$legacy_tree/client-work/dist/Unlight.swf"
python3 -Bu tools/legacy-web/serve.py --port 4391 --server-offset 7950 \
  --client "$original_swf" --assets "$legacy_tree/assets/public" --ruffle "$ruffle_web"

# 原版啟動／資產／六個 Ruby 端點 / 可見畫格，及 native 實際固定舞台。
python3 -Bu tools/legacy-web/check_boot.py 4391 --expected-swf "$original_swf"
python3 -Bu tools/legacy-web/check_relay.py 4391
python3 -Bu tools/legacy-web/check_browser.py --port 4391 --original-swf --software \
  --screenshot "$proof_dir/original-title.png" --frame-report "$proof_dir/original-cadence.json"
python3 -Bu tools/legacy-web/check_source_login.py --port 4390 --screenshot "$proof_dir/native-title.png"
python3 -Bu tools/legacy-web/check_source_lobby.py --port 4390 \
  --database "$proof_dir/native-ruby/app/server/data/game_dev2.db" --screens "$proof_dir/native-lifecycle"
```

相容 SWF 對照須另標明同一台機器目前的 `Unlight-local-runtime.swf` 為 `263647832e0132f07a17f1d547913dab8c45a26ffff2b9ceace6fd428c8103b9`，與 `602db88d` 歷史畫面來源不同。原版 SWF 的完整 SHA 為 `2a375905f3effc06476cd99f578f48d3040a2e9eecbbc6cfd33ce5d5f34ddc44`。素材版本 `0ec2d2ffb0e294e46cd0edfb84c9778e3dd4ed0e`。原版首戰可在新副本的 `--playtest-user` 加 `--playtest-first-quest`，兩端配對可用相同 `--news` 檔案。固定標題預設三則斷言需保留預設 XML。 [SWF 建置版本](../../../tools/legacy-build/README.md) · [原版量測、首戰及相容版設定](../../../tools/legacy-web/README.md)

### 重跑大廳 AP 懸停與到期

在新的隔離 Ruby 副本以 `--playtest-user apqa --playtest-first-quest` 準備角色，確認起始 AP 為 `4/5`。將該測試帳號的密碼置於只有擁有者可讀的檔案，再啟動上例的新版 gateway。測例使用原版回復間隔，以 Ruby 模型調整測試角色的起算時間，再接收實際的分鐘和秒數回覆。原版服裝資料會把間隔限制在 1,800 秒以內，小時格式依 ActionScript 保留。測例只接受 `run.py` 建立的隔離資料目錄。[隔離測例](../../../tools/legacy-web/check_source_lobby.py)

```bash
python3 -Bu tools/legacy-web/check_source_lobby.py --port 4390 \
  --database "$proof_dir/native-ruby/app/server/data/game_dev2.db" \
  --refresh-user apqa --refresh-password-file "$proof_dir/apqa-password" \
  --screens "$proof_dir/native-ap-recovery"
```

核對懸停、滑出及鍵盤操作都不觸發 AP 查詢，在同一條 Lobby 經設定返回重新取得短倒數，然後讓倒數自然到期。暫緩真 `SC17`，驗證 Ruby 已保存 5/5、固定舞台仍為 4/5，放行後才更新滿值文字、心形和數字。保留四條原有登入連線以及當場角色的裝備。[大廳 AP 規格](lobby-views.md#大廳-ap-懸停與到期)

### 重跑任務地圖的庫存及返回

一般 `check_source_lobby.py` 包含新角色進入魔女山谷、MAP 選區、搜尋預覽、兩方向十步 BGM 淡出與 Back。要驗已發現、搜尋中兩筆真庫存，以及暫緩真的 Quest 認證後取消，建立另一個隔離副本並以 `--playtest-user questqa --playtest-first-quest` 準備角色。以下程式先驗證登出及原始單筆庫存，使用相同 Ruby 模型增加搜尋中項目。[原版任務模型](../../../app/server/src/model/avatar.rb#L2798)

```bash
repo="$PWD"
server_dir="$proof_dir/native-ruby/app/server"
(
  cd "$server_dir"
  UNLIGHT_LEGACY_STAGE="$server_dir" ruby - "$repo/tools/legacy-server/isolated_server" questqa <<'RUBY'
$SERVER_NAME = 'quest-scene-qa'
require ARGV.fetch(0)
include Unlight
player = Player.first(name: ARGV.fetch(1))
abort 'Expected a signed-out fixture' unless player && (player.state & 3) == 0
avatar = Avatar.first(player_id: player.id)
rows = avatar&.avatar_quest_inventories&.map { |row| [row.quest_id, row.status] }
abort 'Expected the first-quest fixture' unless avatar&.energy == 4 && rows == [[1, QS_NEW]]
abort 'Could not create pending search' unless avatar.get_quest(1, 10) == 0
RUBY
)
python3 -Bu tools/legacy-web/check_source_lobby.py --port 4390 \
  --database "$server_dir/data/game_dev2.db" \
  --quest-user questqa --quest-password-file "$proof_dir/questqa-password" \
  --screens "$proof_dir/native-quest-map"
```

### 重跑即時任務搜尋

執行上方的一般 `check_source_lobby.py`。測例建立空庫存的新角色，進魔女山谷選 `0分`，驗證取得視窗、任務名稱、AP 從 5/5 到 4/5 和 SQLite 的唯一新任務。關閉取得視窗後確認鍵盤焦點回地標，Back 回大廳時只關閉該 Quest 連線。紀錄的 Quest 封包包含一次 `CS5`，相應回覆順序為 `SC4`、`SC6`，最後 `CS2` 正常關閉。[可重跑測例](../../../tools/legacy-web/check_source_lobby.py)

### 重跑定時任務搜尋

1. 使用原版與新版各自隔離的測試角色，空庫存進魔女山谷，先選 `0分` 並確認取得。選 `3分` 再按 OK。以原版效率 100% 為條件，記錄 Ruby 的 `find_at`、持有 ID、當前 AP 和清單容量。等候列應為資料庫狀態 4，對外任務 ID 為 0。
2. 保留遊戲舞台及相同 Quest 連線，等待實際 180 秒。觀察到期檢查 `CS17` 的送出時間，以及 Ruby 回覆的同一持有 ID、NEW 狀態和真正任務 ID。畫面只更新這一列，AP 維持 3/5、庫存維持 2/4。Back 返回大廳後，其他四條連線仍應存活。
3. 以尚未到期的新搜尋再跑一次。倒數中先 Back 回大廳，再進任務。確認同一筆等待列，然後重新登入並再進入。記錄重登入後到期查詢的時間，須在原始 `find_at` 之後，並且只送一次 `CS17`。測試自然到期時保留原本 Ruby 時鐘。需要測遺失回覆時，可在測試瀏覽器暫緩原始回覆，查核 SQLite 並驗證再登入的對帳結果。[原始倒數發送](../../../app/client/src/view/scene/quest/QuestItem.as#L350) · [Ruby 到期判斷](../../../app/server/src/model/avatar_quest_inventory.rb#L110) · [完整原版操作及封包](/workspace/shared/unlight-web-port/flash-parity/quest-search/README.md)

### 重跑任務詳情與牌組切換

使用上面的完整 `check_source_lobby.py` 命令，以 `--screens` 保存固定 780×680 圖。兩位原版 Ruby 新角色各實際搜尋落日大蝙蝠，核對 NEW 點下時已展開詳情、狀態只依相符回覆變動。暫緩後放行的案例驗證地形滑入／移出、左上返回與重開、實際牌組循環和 BGM 播放延續。模擬遺失的案例在原始真回覆到達時略過轉交，驗證同次開啟不重送，回大廳再進任務由原版清單回播復原。最後比對 Quest 與 Lobby 的實際封包、SQLite、AP 和右上 Back 後的四條連線。[瀏覽器測例](../../../tools/legacy-web/check_source_lobby.py) · [原版操作與畫面](/workspace/shared/unlight-web-port/flash-parity/quest-details-original/README.md)

### 重跑開始任務與首格入場

在隔離 Ruby 副本備好已有角色、AP 5/5、魔女山谷進度 0/3、空任務清單的測試帳號。對照用角色由原版 `Avatar.regist` 選配件 `[2,12,26,38]`、起始牌 `[21]` 和教學標記 14。Deck 1 有該卡，Deck 2 及 3 由原版建立為空牌組。讓 gateway 載入包含舞台 11 和卡面檔案的素材，再執行同一個測試腳本。

```bash
python3 -Bu tools/legacy-web/check_source_lobby.py --port 4390 \
  --database "$proof_dir/native-ruby/app/server/data/game_dev2.db" \
  --quest-start-user queststart --quest-start-password-file "$proof_dir/queststart-password" \
  --screens "$proof_dir/native-quest-start"
```

用不同的全新隔離測試角色加 `--quest-start-fault start` 或 `--quest-start-fault land` 重跑，以暫緩實際 Ruby 回覆驗證結果不明的狀態。首格案例放行 `SC128` 和 `SC37`，保留棋子的權威座標，缺少 `SC40` 時不會切到對戰畫面。[原版完整步驟和封包](/workspace/shared/unlight-web-port/flash-parity/quest-start-original/README.md) · [新版腳本](../../../tools/legacy-web/check_source_lobby.py)

### 重跑首戰開場、抽牌與首次移動畫面

上一節的一般測試會從首格繼續進入戰鬥。完成開場後只發一次無參數 Quest `CS22`。測試暫緩 Ruby 的真 `SC46`，確認 Draw 已顯示回合，手牌與計時尚未開始。放行後，用實際 `SC44–45` 的 ID、方向與張數核對渲染，並以遮蔽的 `SC61–62` 核對 CPU 手中和桌上的牌背。另驗生命、60 秒畫面計時、階段音、發牌聲和戰鬥 BGM。

以另一位全新隔離角色加 `--quest-start-fault ready`。保留 `SC43–45`，暫緩 `SC46` 至結果無法確認。之後放行同一份 Ruby 真回覆，檢查仍維持該狀態、未重送 Ready，手牌及計時保持空白。正常與遺失兩例都核對 AP、牌組鎖和同一條 Quest。[原版實跑及封包](/workspace/shared/unlight-web-port/flash-parity/quest-opening-original/README.md) · [自動驗收](../../../tools/legacy-web/check_source_lobby.py)

### 重跑首回合移動

同一組 `--quest-start-user` 指令接續驗首回合。點方向、用鍵盤旋轉手牌、出牌、用鍵盤旋轉桌上牌、收回、依新索引再次出牌並按 OK。依序暫緩並放行 Ruby 真 `SC60`、`SC63`、`SC61`、`SC62`。只在各自成功回覆後更新畫面。確認鍵盤焦點及牌片位移期間舞台的內部捲動維持為零。按 OK 後先放行 `SC47`，待 `SC48` 才顯示實際距離、先手、出牌方向和點數，並核對雙方牌面 56×86 及在桌面的座標。

以另一位全新角色加 `--quest-start-fault move`。在 Ruby 接受出牌後先擋住本方 `SC61`，確認桌面維持先前狀態。直到結果無法確認後才放行遲到的原始封包，核對畫面、重送次數、同一條 Quest 和 SQLite 的任務狀態。驗原版逾時則自首回合開始完整等待畫面 60 秒，核對沒有任何指標動作也只發送一次 `CS26`。[實機腳本](../../../tools/legacy-web/check_source_lobby.py)

### 重跑首回合第一組攻防

同一組 `--quest-start-user` 指令會從移動結果繼續。由當次 Ruby 的 `SC51` 和 `SC53` 選擇出牌權。依序放牌、收牌、再次放牌及按 OK，核對物理牌 ID、桌面與手牌索引。保留實際 `SC55` 並暫緩後續 `SC56`，檢查牌已揭露、生命值仍維持原數值。放行後核對實際兩組骰面、原始 WebGL 擲骰、命中聲、傷害和生命值。確認下一個階段的權威回覆已到達，首組操作只送一次。[實機腳本](../../../tools/legacy-web/check_source_lobby.py)

用另一位全新角色加 `--quest-start-fault combat`，在 Ruby 接受出牌後擋住本方 `SC65`。驗證遲到的回覆仍維持結果未確認、桌面和手牌未被提前改動，重按沒有重送，也不會發出成功移牌音。兩場使用同登入的 Quest 連線，並核對 AP、持有任務和牌組鎖。[原版實跑步驟](/workspace/shared/unlight-web-port/flash-parity/quest-combat-original/README.md) · [新版封包](/workspace/shared/unlight-web-port/flash-parity/quest-combat-live/qa-native-first-exchange-wire.json)

### 重跑戰鬥九項回歸

使用各自隔離的原版 Ruby、SQLite 和測試角色。`presentation` 使用原版已完成教學的古魯瓦爾多 Lv1、空地後的任務 4 和第二格的矮人 `[1001]`。測例固定搜尋種子 22 與該場 `MultiDuel` 初始種子 0，入場已有 1 點傷害。執行時確認牌庫、發牌、角色卡、滑入技能、移動、敵方蓋牌及雙方確認，最後以 Ruby 實際骰值完成任務並返回大廳。

```bash
python3 -Bu tools/legacy-web/check_source_battle.py --case presentation \
  --port 4396 --database "$proof_dir/q4-ruby/app/server/data/game_dev2.db" \
  --user questemptywin --password-file "$proof_dir/questemptywin-password" \
  --screens "$proof_dir/q4-battle-regressions"
```

`skill` 使用另一位同角色的測試帳號、魔女山谷的任務 1、舞台 11、對手 `[1004]`，沒有初始傷害。將該場 `MultiDuel` 的隨機種子設為 16，保留原版計時、發牌及技能規則。`--plan` 使用 UTF-8 JSON，包含 `questId: 1`、`cardId: 21`、`skillId: 25`、`skillName: "猛擊"`、`direction: -1`、`range: 1`、`openingActions: [36,5,46,37,17]`、`movementCards: [[36,false],[37,false]]`、`attacks: [[46,true],[17,true]]`、`qualifiesAfter: 2`、`recheckAvailability: true`、`removedPoints: 6`、`attackDice: 12`、`wins: false`。

```bash
python3 -Bu tools/legacy-web/check_source_battle.py --case skill \
  --port 4396 --database "$proof_dir/q1-ruby/app/server/data/game_dev2.db" \
  --user questskill --password-file "$proof_dir/questskill-password" \
  --plan "$proof_dir/q1-stock-smash.json" --screens "$proof_dir/q1-battle-regressions"
```

兩個案例都保留 780×680 PNG、實際封包及瀏覽器逐幀資料於各自的 `--screens` 目錄。Playwright 只暫緩與轉交 Ruby 的原始回覆。隔離環境的隨機種子用於重跑相同牌序。 [逐項來源與動畫順序](battle-regressions.md) · [瀏覽器腳本](../../../tools/legacy-web/check_source_battle.py)

### 重跑馬庫斯的攻防抗衡

使用已完成教學的隔離測試角色。以原版 `Avatar.regist` 建立起始牌組，再用 `get_chara_card(82)` 取得馬庫斯 Lv2，透過 `update_chara_card_deck` 將起始牌收進收藏冊、馬庫斯移到 Deck 1。保留原版事件牌。以任務 1、舞台 11、對手 `[1004]`、無傷勢和隔離角色的 `MultiDuel` 初始種子 9 重跑。

選擇停留，將 #45 翻成移動 2 放上桌，確認原版回覆維持中距離及我方先攻。空桌通過首組攻擊。第二組防禦翻 #2 和 #32 的防 1 放上桌，送一次 OK。蝙蝠以原版剩餘槍牌進行攻擊。驗收暫緩原始 `SC83`，確認鎖定操作而保留牌桌與 `SC82` 亮牌標記。放行 `SC83` 和 `SC110`，另暫緩 `SC55`，確認點數、技能與共同揭牌的邊界。放行後核對真實特寫及攻守各自的骰數。

```bash
python3 -Bu tools/legacy-web/check_source_battle.py --case counter-guard \
  --port 4397 --database "$proof_dir/counter-guard-ruby/app/server/data/game_dev2.db" \
  --user questmarkus --password-file "$proof_dir/questmarkus-password" \
  --screens "$proof_dir/counter-guard-native"
```

規則與發動仍由原版 Ruby 執行。原版 Flash 可用同一組隔離配置，依相同方向、牌面、桌面及 OK 順序操作，保留使用的 SWF 雜湊、實際回覆和 780×680 畫面。相同牌序若改為向前到近距離，蝙蝠當回合第二組會空桌攻擊。攻防抗衡仍發動，雙方骰數為 0。 [原版點數處理](../../../app/client/src/net/server/QuestServer.as#L1540) · [原版技能規則](../../../app/server/src/model/chara_card.rb#L5709) · [原版近距離畫面與紀錄](/workspace/shared/unlight-web-port/flash-parity/quest-counter-guard-live/original/near/wire.json)

### 重跑艾伯李斯特的裝備改條件

在隔離的原版 Ruby 測試角色上完成教學，使用原版角色取得與牌組操作，把艾伯李斯特 Lv3（角色卡 #3）放在 Deck 1 首位。取得武器「凱旋之棘」#10000 與經驗素材 #5024，先以原版 `Avatar.combine` 合成，再將同一武器裝備到角色的武器欄。隔離資料準備腳本載入原版裝備限制檢查所需的 `Sequel.extension :blank`。確認武器仍為 #10000、有正經驗、攻防加值都是零，且原版被動技能為 41。使用 Q1、舞台 11、對手 `[1004]` 和初始種子 9。

隔離測例會分別暫緩原始 `SC120`、`SC43` 和 `SC46`。先翻卡核對「茨林」的基礎條件，再放行 `SC120` 確認卡背技能名轉青色、出牌門檻更新為防禦 1 以上及特殊 1 以上。兩張原版圖示與近距離標記各依來源顯示。首回合開始後核對原版保留的滑入內容與實際手牌。以 #45 的移動 2 向前，等真實回覆確認近距離和己方先攻，空桌通過首組攻擊。接著以 #2 防 1 與 #27 特 1 防禦，核對原版技能亮起、發動確認、特寫音效和骰數。

```bash
python3 -Bu tools/legacy-web/check_source_battle.py --case eased-condition \
  --port 4397 --database "$proof_dir/eased-condition-ruby/app/server/data/game_dev2.db" \
  --user questeased --password-file "$proof_dir/questeased-password" \
  --screens "$proof_dir/eased-condition-native"
```

原版 Flash 使用相同角色、裝備、牌序與移動操作，保存首回合回覆、卡背和進入防禦的實際紀錄。完整防禦出牌與技能特寫取自新版實跑。 [原版合成模型](../../../app/server/src/model/avatar.rb#L482) · [原版卡背處理](../../../app/client/src/view/scene/game/DuelCharaCards.as#L382) · [原版茨林規則](../../../app/server/src/model/chara_card.rb#L4504)

### 重跑格雷高爾的技能交換

在隔離角色完成教學，以原版角色取得和牌組操作將格雷高爾 #635 放在 Deck 1 首位，保留原版事件牌。用 `quest_map_clear(5)` 開啟無名之丘，用搜尋種子 29 執行原版 `get_quest(6, 0)`。確認取得 Q82、AP 3。以 Deck 1 進首格，確認場地 3、毒蛙 #1008 及無預設傷勢。只在這個隔離角色的 `MultiDuel` 初始化前設戰鬥種子 32。

三回合都選停留。第一回合先空桌防禦，再用 #9、#4、#42 的正向牌面攻擊。確認兩個真實技能發動及非致死傷害。第二回合防禦用 #2 的反向牌面和正向事件牌 #457，第三回合防禦用正向事件牌 #458，這兩回合的己方攻擊皆空桌確認。第一回合結束時依序驗我方槽 3 得到「噴毒」、敵方槽 0 得到「創贈麻煩」，第二回合保留交換，第三回合結束時依序驗敵方與我方復原。每次另對照技能列、滑入內容及玩家角色卡背。

```bash
python3 -Bu tools/legacy-web/check_source_battle.py --case feat-replacement \
  --port 4397 --database "$proof_dir/feat-replacement-ruby/app/server/data/game_dev2.db" \
  --user questgregor --password-file "$proof_dir/questgregor-password" \
  --screens "$proof_dir/feat-replacement-native"
```

瀏覽器驗收會逐筆轉交原始 `SC109`。先讓第一筆進入畫面佇列，暫緩第二筆和後續 `SC60`，核對原技能名在動畫和扣血期間仍可見。等指定一方更新後才放行餘下回覆，最後核對兩方技能、卡背和第四回合。`SC110` 特寫取樣需包含各自按原版素材順序顯示的多張畫格，並確認兩次 `ulse13` 各對應一筆真實發動。固定繁中 SWF 已重跑至交換後的第二回合 Draw，第三回合還原請對照同一組原版 Ruby 模型紀錄。 [原版技能列](../../../app/client/src/view/scene/game/FeatInfo.as#L715) · [原版技能規則](../../../app/server/src/model/chara_card.rb#L21773)

### 重跑 Q82 雙卡主動換角

使用另一個隔離角色，將格雷高爾 #635、古魯瓦爾多 #21 依序放在同一副 Deck 1。用 `quest_map_clear(5)` 開啟無名之丘，搜尋種子 29 執行原版 `get_quest(6, 0)`，確認持有 Q82、AP 3。以相同牌組進首格 1，場地 3、毒蛙 #1008、全員無預設傷勢。只在隔離角色的原版 `MultiDuel` 初始化前設種子 32。首輪行動牌為 `[13,19,4,2,39]`，事件牌為 #262。

```bash
python3 -Bu tools/legacy-web/check_source_battle.py --case voluntary-change \
  --port 4397 --database "$proof_dir/voluntary-change-ruby/app/server/data/game_dev2.db" \
  --user questswitch --password-file "$proof_dir/questswitch-password" \
  --screens "$proof_dir/voluntary-change-native"
```

在 Move 選更換角色、空桌確認。比較 `SC49` 後的新面板、原始候補卡座標及左 `OK`。只送一次 `CS35(1)`。依序暫緩並轉交真實 `SC72`、`SC50`、`SC51`。直到 `SC50` 才開始新主戰角色的換位演出，攻防操作等下一階段。以實際敵方先手的 `SC53` 開啟我方防禦時，核對卡 21、7/7、「猛擊」及原角色立繪。 [原版畫面與時點](quest-pve.md#雙卡主動換角) · [原版指令](../../../app/client/src/net/command/QuestCommand.as#L1431)

另以全新角色和同一牌組、搜尋種子 29、戰鬥種子 33 重跑 `--case borrower-change`。首回合停留在中距離，攻擊使用 #40、#15、#35 三張正向牌，防禦用正向事件牌 #460。收到實際技能交換後，第二回合主動換到槽 1，第三回合主動換回槽 0，兩回合的攻防皆空桌確認。回到格雷高爾時核對技能列與滑入仍為「噴毒」，第三回合結束才依真實 `SC109` 還原。 [原版 Ruby 可重跑牌序](/workspace/shared/unlight-web-port/flash-parity/quest-voluntary-character-change/stock-ruby-skill-swap-through-voluntary-switches.json)

### 重跑 Q1 死亡後換角

隔離角色的 Deck 1 依序放古魯瓦爾多 #21、馬庫斯 #82。先以搜尋種子 0 執行原版 `get_quest(1, 0)`，確認取得 Q1、AP 4。以原版 `AvatarQuestInventory#set_damage_set([6,0,0])` 儲存進場前傷勢。首格 1 為場地 11、洞窟蝙蝠 #1004。只在這個角色的原版 `MultiDuel` 初始化前設戰鬥種子 32。第一回合 SC44 為 `[12,18,4,2,39]`，事件牌 #262。古魯瓦爾多以 1/7 生命開始，馬庫斯 8/8。

選後退、空桌確認移動。依真實 `SC48` 核對遠距離、敵方先攻，再空桌確認防禦。Ruby 的實際 `SC56` 含 13 顆攻擊骰及 5 顆防禦骰，`SC73` 扣 1 至 0。暫緩原始 `SC57`、`SC72`、`SC58`、`SC43` 和 `SC46`，依序確認選角、角色確認、畫面切換、回合與 Move 開放。底部 OK 只送一次 `CS35(1)`，第二回合仍使用同一條 Quest 連線。 [原版 Ruby 牌序及封包](/workspace/shared/unlight-web-port/flash-parity/quest-forced-character-change/stock-ruby-knockout-and-replacement.json)

```bash
python3 -Bu tools/legacy-web/check_source_battle.py --case forced-change \
  --port 4397 --database "$proof_dir/forced-change-ruby/app/server/data/game_dev2.db" \
  --user questforced --password-file "$proof_dir/questforced-password" \
  --screens "$proof_dir/forced-change-native"
```

另以 `--case forced-change-before-dice` 測 Q82 的技能自身扣血。Deck 1 放格雷高爾 #635 和古魯瓦爾多 #21，沿用無名之丘搜尋種子 29，將傷勢 `[10,0,0]` 用原版模型存入任務。場地 3、毒蛙 #1008，對局初始化前種子 33。首回合後退，空桌確認移動後以 #40、#15、#35 正向攻擊。Ruby 依序發出兩個技能確認、我方自身傷害、`SC55` 及含三張牌 ID 的 `SC57`。核對兩段特寫掛載、血量到 0、各牌只離桌一次，接著選古魯瓦爾多並進入第二回合。 [原版 Ruby 自身扣血案例](/workspace/shared/unlight-web-port/flash-parity/quest-forced-character-change/stock-ruby-before-dice-self-knockout.json)

### 重跑同回合攻守互換與次回合

以另一位全新隔離角色使用上一節的 `--quest-start-user` 指令，加上 `--quest-next-turn`。用 Ruby 實際先手決定哪一組可放防禦牌，攻擊組以空桌確認。暫緩第二筆 `SC51` 後放行。核對同回合攻守反轉、首組完整結算、兩組獨立的牌與骰值，以及唯一的 `CS33` 和 `CS34`。攻擊骰為空的組別略過 3D 擲骰和骰聲。核對第二組雙方點數使用真正的 `SC82`，包含牌清單為空而舊遮罩仍有位元的情況。

讓真正的次回合 `SC43–45` 通過，暫緩 `SC46`，確認 Draw、倖存手牌及暫不可操作的 Move。放行後核對新增牌的 ID、朝向、順序、第二回合字圖和原始 60 秒時間條。實際按方向，等待本方 `SC60` 後再確認方向改變。同一 Quest、原來四條服務連線、唯一 `CS22`、AP 與牌組鎖均應保留。使用不同測試角色，完整保留 Ruby 真結果。[原版封包和取樣](/workspace/shared/unlight-web-port/flash-parity/quest-exchange-two-original/wire.json) · [固定舞台腳本](../../../tools/legacy-web/check_source_lobby.py)

### 重跑單格任務終局

以有起始牌組、空任務清單的隔離角色，沿用 `--quest-start-user` 的啟動方式，加上 `--quest-terminal return`。讀取 Ruby 當場發牌，以實際距離挑選劍／槍牌，使用原本旋轉、出牌與確認。從原封包核對結果及七個報酬欄位、勝利音效、同一持有 ID 的刪除和 `SC24`，並用原版 SQLite 核對歸檔、解鎖、報酬及一筆通關紀錄。兩次按 OK 後檢查原本任務地圖及五條連線，按 Back 再檢查只關閉 Quest。

另用全新角色加上 `--quest-terminal late`。保留第一次 `SC41` 和 Ruby 的實際處理，延遲同一份 `SC24` 至逾時。確認戰鬥勝敗與報酬仍可讀取，地圖返回維持待確認，晚回覆及重按均維持已知狀態。實機保留原始封包、畫面及資料庫結果。[固定舞台腳本](../../../tools/legacy-web/check_source_lobby.py)

原版使用繁中 SWF `2a375905`，在 780×680、DPR 1 啟動隔離 Ruby `ee38622`。依原版實際手牌打到普通任務終局，分別點擊 `(657,616)`、`(233,308)` 和 `(735,15)`。三處各保存指標、畫面和時間，結算前及兩次 OK 後以唯讀 SQLite 核對同一筆任務。原版 Web Audio 混音以 `check_quest_mix.py` 的取樣比對原始 MP3，新版另記錄實際播放事件及音軌交接。[原版操作紀錄](/workspace/shared/unlight-web-port/flash-parity/quest-terminal-original/return-proof/wire.json) · [原版音訊取樣](/workspace/shared/unlight-web-port/flash-parity/quest-terminal-original/return-proof/audio-samples.json) · [新版完整動畫試玩](/workspace/shared/unlight-web-port/flash-parity/quest-terminal-live/root-full-motion/root-terminal-wire.json)

### 重跑下一格與敗北

用兩位全新隔離角色及上一節的參數。下一格案例預置魔女山谷三次通關，透過原版 `get_quest(1,0)` 取得任務 3。使用 `--quest-next-land`，起始 4/5 AP，玩家以真實手牌取得首戰勝利。先暫緩 `SC20`，再暫緩同一條 Quest 的 Pong。確認結果可見，但第一個 OK 仍停用。放行後保存同一任務詳情、棋子、已清位置 1 與可進位置 4。下一格先放行 `SC128` 與 `SC37`，確認傷勢和位置，待實際 `SC40` 才顯示第二場開場。核對兩場各一次 Ready、原任務曲交接、同一條連線及無額外 AP 扣款。[固定舞台腳本](../../../tools/legacy-web/check_source_lobby.py)

升級案例用原版模型保存 Lv1／9 Exp，保留一張基礎 7 HP 的角色卡與既有傷勢 1。用完整動畫跑到首勝後第一次 OK，讀回來源 Lobby `SC17`、`SC18` 及畫面 AP，核對 SQLite，再進 slot 4。實跑的 25 Exp 把角色升至 Lv3，AP 6/6，另核對原場景與音軌交接。[原版 AP 回覆及存檔](/workspace/shared/unlight-web-port/flash-parity/quest-next-land-live/root-full-motion/root-intermediate-wire.json) · [第二戰封包](/workspace/shared/unlight-web-port/flash-parity/quest-next-land-live/root-full-motion/root-multiland-wire.json)

敗北案例使用 `--quest-terminal defeat`。保存任務 1 的既有傷勢 `[6,0,0]`，在原始角色卡 21 的 7 HP 中保留 1 HP。用原版空移動桌、後退與不出牌的攻防，讓 Ruby 依當場骰點決定結果。遭擊倒後核對 `SC41=1`、同一持有項移除、`SC24=1`、敗北圖及地圖的任務失敗面板，並查 SQLite 的歸檔與牌組狀態。[原版隔離資料準備及和局模型](/workspace/shared/unlight-web-port/flash-parity/quest-outcome-model/README.md)

繁中 Flash 對照使用同一張 1 HP 起始角色卡，保留實戰骰點。等結果與報酬完整出現再點 `(657,616)`，在任務失敗面板點 `(233,292)`，關閉後以 `(735,15)` Back 結束。截取兩個面板、原任務地圖及大廳，對照確認前後 SQLite 快照和原版混音。[原版瀏覽器證據](/workspace/shared/unlight-web-port/flash-parity/quest-next-terrain-original/q1-loss-verified/wire.json) · [混音比對](/workspace/shared/unlight-web-port/flash-parity/quest-next-terrain-original/q1-loss-verified/audio-samples.json)

新版 18 回合和局以各 1 HP 開局，用隔離 Quest 服務的種子 5。操作依當次原版手牌與攻守權。逐回合比較真實 `SC44`、`SC48`、`SC55`、`SC56`。到第 18 回合核對 `SC41=2`，暫緩同一持有列的 `SC24=1`。放行後才可確認 Draw、任務失敗與返回。在真實 SQLite 存檔確認歸檔狀態、一次和局日誌與牌組解鎖。[可重跑的隔離工具及證據](/workspace/shared/unlight-web-port/flash-parity/quest-draw-live/seed5-verified/README.md)

### 重跑末格寶箱與區域解鎖

沿用上節的持有任務 3、魔女山谷通關數 3、單張起始卡及同一組 Ruby 服務，改用 `--quest-complete-q3`。照當場原始手牌打完兩場。第二場勝利後放行 `SC19` 的累積遮罩 18 及 `SC13` 的實體卡，暫緩同一條 Quest 的真 `SC25`。Ruby 此時已保存獎勵，畫面仍需維持結果、未開放 OK 與未切換區域。接續交付同場回覆，核對正確卡號、兩次傷勢回覆、通關數和旗標、刪除及任務結果。

依序確認戰鬥結果、寶箱和任務完成。保存卡背、翻牌或翻後卡面及兩處任務地圖面板。核對 `ulse23.mp3` 只播放一次、兩次地圖面板確認沒有額外點擊音。三次 OK 後，查隱者之道 0/3、任務歸檔及蝙蝠卡實體 ID。再按 Back 檢查唯一 `CS2`、正常關閉及四條登入連線。[固定舞台腳本](../../../tools/legacy-web/check_source_lobby.py) · [分項規格](quest-pve.md#末格蝙蝠卡寶箱與區域解鎖)

### 重跑大廳直接成就通知

使用獨立 Lv1 角色、5/5 AP、旗標 0、魔女山谷通關數 3、Deck 1 卡 21 及初始傷勢 1。由原版 `get_boss_quest(1)` 取得 q3。兩戰各在原版 `MultiDuel` 初始化前為本角色設定種子 0。出牌仍經客戶端操作，Ruby 執行原有規則、發牌、擲骰及計時。首先驗資料服務發的三件抽獎券，確認本機 OK 和實體庫存，再重新登入同一角色，沿實際原版試跑的路徑完成 q3。[原版頭目取得](../../../app/server/src/model/avatar.rb#L2798) · [大廳成就規格](lobby-views.md#大廳成就的直接獎勵)

```bash
python3 -Bu tools/legacy-web/check_source_lobby.py --port 4390 \
  --database /path/to/isolated/game_dev2.db \
  --quest-start-user q3-record --quest-start-password-file /path/to/disposable-password \
  --quest-complete-q3 --lobby-achievements --screens /tmp/unlight-q3-record
```

先確認旗標 0 的大廳送一次 `CS35(true)`，成就 2、31 仍待完成。通關後以 `SC26` 確認旗標 1，完成 Quest 本機確認，再以 Back 關閉 Quest。核對原 Lobby 上的 `SC25`、`SC27`、`SC31`、`SC51`、`SC52` 及實體 SQLite 資料。暫緩 `CS35` 後同一 Lobby `CS3` 的真 Pong，驗證已入庫且尚未開啟提示。放行後每張通知保存翻開畫格、實際 `ulse23` 和一次 OK，並驗證底層按鈕無法操作。第二次開啟任務再以 Back 回大廳，重新檢查成就，金額和持有物維持，成就 2 的可選獎品仍然待領。[自動驗收](../../../tools/legacy-web/check_source_lobby.py)

### 重跑可選角色卡

用目前提交的 Ruby `--revision HEAD` 建立獨立服務，指定新的 `--playtest-user`，再啟動相同 offset 的新版 gateway。使用活動中的獨立 Ruby 快取。準備帳號時只在含 `.legacy-server-staging` 的執行副本操作，使用 `Avatar.regist` 建立原始人偶及牌組，完成教學旗標 14。執行 `avatar.init`、`avatar.get_avatar_info_set` 及 `avatar.set_exp(30)` 後，以 `avatar.achievement_check([2])` 產生 Lv3 待領 `26:2`。確認 Binder 中沒有成就 #2 的候選角色卡，且獨立帳號現有旗標為 0。第一次登入的「新挑戰」另用完成教學、尚未完成任何成就的 Lv1 帳號觀察。保留首張 #1 抽獎券通知以核對順序。[隔離伺服器](../../../tools/legacy-server/README.md) · [通知規格](lobby-views.md#新挑戰與可選角色卡)

```bash
python3 -Bu tools/legacy-web/check_source_lobby.py --port 4390 \
  --database /path/to/isolated/game_dev2.db \
  --quest-start-user record-choice --quest-start-password-file /path/to/disposable-password \
  --lobby-selectable --screens /tmp/unlight-record-choice
```

測例核對 21 個原始索引、空選擇、鍵盤與滑鼠、選擇和翻牌音效、領取前重新登入、領取時連點及底層場景互斥。暫緩實際 `SC72` 直到 `SC31` 抵達，確認畫面仍在等候。放行後核對情報、回到大廳、SQLite 唯一 Binder 卡片及再次登入無重複。原版對照用獨立的 `ee38622` Ruby 和固定繁中 Ruffle，留存原命令與實際 SQLite 結果。[自動驗收](../../../tools/legacy-web/check_source_lobby.py) · [原版試跑](/workspace/shared/unlight-web-port/flash-parity/quest-record-choice-original/README.md)

### 重跑右側紀錄清單

用獨立 Ruby 準備已完成教學且走過成就初始化的 Lv1 角色。以原版 `Avatar.regist`、`avatar.init` 及 `avatar.get_avatar_info_set` 準備角色。確認 #1 完成，#2 與 #31 進行中，然後以相同 offset 啟動原版或新版 gateway。

```bash
python3 -Bu tools/legacy-web/check_source_lobby.py --port 4390 \
  --database /path/to/isolated/game_dev2.db \
  --quest-start-user record-view --quest-start-password-file /path/to/disposable-password \
  --lobby-record --screens /tmp/unlight-record-view
```

腳本獨立解壓原始 Data `SC7`，比對 SQLite，再從大廳與設定驗證分頁、分類、進度、關閉焦點、面板動畫及既有 BGM。瀏覽清單前後比對四條登入連線的送出計數與資料庫。用另一位原版 q3 測試角色加 `--quest-complete-q3 --lobby-achievements --lobby-record`，核對從同一 Lobby 收到的 `SC56`，以及 #2 與 #31 從進行中切到完成。[驗收腳本](../../../tools/legacy-web/check_source_lobby.py) · [紀錄來源](lobby-views.md#右側紀錄清單)

### 重跑右側道具速查

以相同 offset 啟動隔離 Ruby 及新版 gateway。用三位已完成教學、已初始化成就的 Lv1 角色。每位用 `Avatar.regist`、`avatar.init` 及 `avatar.get_avatar_info_set` 建立角色和原始抽獎券。`populated` 再用 `get_item` 加入原始道具 `[1, 1, 2, 3, 25, 26, 27, 28]`。`empty` 保留原有抽獎券。`potion` 再加入 `[3, 3]`，以 `energy_use(1)` 把 AP 降至 4/5，並在自然回復之前測試。原始 SQLite 留在隔離環境。[隔離服務](../../../tools/legacy-server/README.md)

```bash
python3 -Bu tools/legacy-web/check_source_lobby.py --port 4390 \
  --database /path/to/isolated/game_dev2.db \
  --quest-start-user item-potion --quest-start-password-file /path/to/disposable-password \
  --lobby-item potion --screens /tmp/unlight-lobby-item
```

腳本獨立解碼 Data `SC6` 與 SQLite 比對。`populated` 驗證六組加一組、雙向循環、關閉重開及設定頁；`empty` 核對速查類別沒有可列道具。`potion` 暫緩真實 `SC28`，確認 AP 已依 `SC17` 更新而數量仍為 2。放行後維持選取、數量變為 1，兩個時間點皆無提示窗。核對只送一次 `CS18`，只改一筆實體庫存及其使用時間。[驗收腳本](../../../tools/legacy-web/check_source_lobby.py) · [原版與新版實跑](/workspace/shared/unlight-web-port/flash-parity/lobby-item-quick-live/README.md)

### 重跑右側好友清單

在獨立 Ruby 建立已結束教學的角色「尋友測自己」。以 `Avatar#inc_friend_max(5)` 將容量提高至 15。用 `Player#create_friend_link` 與對方 `confirm_friend_link` 建立 11 位好友，第一位透過原版登入模型建立上線狀態。再準備送出與收到的待確認各一筆，及不同對象的本人封鎖與遭對方封鎖各一筆。同服未有關係的角色名以「尋友測」開頭兩筆，異服一筆作對照。「零結果」前綴在同服無角色。`empty` 使用完全沒有關係的另一個角色。測名單前先用原版 `achievement_check` 發出已完成成就的獎勵，再用 `clear_notice` 確認這批已處理的成就通知。[好友模型](../../../app/server/src/model/player.rb#L455) · [隔離伺服器](../../../tools/legacy-server/README.md)

```bash
python3 -Bu tools/legacy-web/check_source_lobby.py --port 4390 \
  --database /path/to/isolated/game_dev2.db \
  --quest-start-user friend-pane --quest-start-password-file /path/to/disposable-password \
  --lobby-friend populated --screens /tmp/unlight-lobby-friend
```

以 SQLite 核對關係和搜尋成員，以實際 `SC12`、`SC9` 和 `SC26` 核對順序、角色裝備及畫面。`populated` 比對 10+1 分頁、四個分類、紅色提示、兩字搜尋錯誤、同服結果和空搜尋。大廳與設定各驗關閉時送出原版成就檢查，且名單瀏覽沿用登入連線及 BGM。重開設定不重送有效快取內的分頁查詢。封包證據只摘錄數字欄位，並在操作前後核對關係表。[驗收腳本](../../../tools/legacy-web/check_source_lobby.py) · [好友規格](lobby-views.md#右側好友清單)

### 重跑雙角色好友關係操作

在隔離 Ruby 準備同服、已完成教學的兩個角色「聯絡驗收甲」與「聯絡驗收乙」。起始無任何關係，好友容量都是 10。第三個角色「聯絡驗收丙」用原版 `Avatar#inc_friend_max(-10)` 準備好友容量 0，提供真實伺服器拒絕。各角色先用原版模型結清啟動成就通知。好友成功後才滿足的成就仍由實際客戶端操作關閉並確認。[隔離服務](../../../tools/legacy-server/README.md) · [原版關係錯誤碼](../../../app/server/src/constants/common_constants.rb#L1419)

```bash
python3 -Bu tools/legacy-web/check_source_lobby.py --port 4390 \
  --database /path/to/isolated/game_dev2.db \
  --quest-start-user friendwritea --quest-start-password-file /path/to/private-a \
  --lobby-friend-write --friend-peer-user friendwriteb --friend-peer-password-file /path/to/private-b \
  --screens /tmp/unlight-lobby-friend-write
```

逐一登入甲、乙、甲、乙、甲。驗證 NO 後無關係命令，暫緩真 `SC36` 時 SQLite 已有待認證資料但畫面保持原狀，放行才更新搜尋與等待分頁。乙確認認證後使用同一筆關係列，甲刪除後搜尋並封鎖。乙重新登入讀到狀態 4 且清單留空。甲解除封鎖後用第三個角色觸發容量錯誤 `SC34=64`。全程比對實際封包、原角色 ID、SQLite、已驗證的真角色卡及固定舞台。[驗收腳本](../../../tools/legacy-web/check_source_lobby.py) · [寫入規格](lobby-views.md#好友確認與關係寫入)

### 重跑好友定時刷新與邀請碼

沿用右側好友清單的隔離資料。主角色玩家 ID 為 2，共有 11 位已認證好友。第二頁唯一好友 `friendpane11` 開始時離線。兩個測例分開初始化隔離資料，主角色和第二個帳號皆已完成教學及啟動通知的處理。原版保留同一個好友窗，先在第二頁驗證離線，點 `(444,541)` 開啟邀請碼、`(390,340)` 複製、`(502,234)` 關閉子窗。再從另一條連線登入第二個帳號，等原版的真實計時。比對 `CS8(1,10,10)`、`SC12` 的狀態 2 → 6 和 Online 圖樣。剪貼簿驗收在有讀寫權限的同源 Chromium 進行。[好友隔離資料](#重跑右側好友清單) · [原版計時器](../../../app/client/src/view/FriendListView.as#L303)

```bash
python3 -Bu tools/legacy-web/check_source_lobby.py --port 4396 \
  --database /path/to/isolated/game_dev2.db \
  --quest-start-user friendpaneown --quest-start-password-file /path/to/private-a \
  --lobby-friend-invite --screens /tmp/unlight-friend-invite

python3 -Bu tools/legacy-web/check_source_lobby.py --port 4396 \
  --database /path/to/isolated/game_dev2.db \
  --quest-start-user friendpaneown --quest-start-password-file /path/to/private-a \
  --lobby-friend-refresh --friend-peer-user friendpane11 --friend-peer-password-file /path/to/private-b \
  --screens /tmp/unlight-friend-refresh
```

新版加速主角色的瀏覽器計時，第二個帳號和 Ruby 使用真實時間。暫緩與放行由服務送出的 `SC12`，確認同一畫面在收到回覆前後的好友狀態。其餘檢查涵蓋搜尋、待刷新時關窗、設定的同登入頁次、邀請碼的窗體座標和轉場、剪貼簿及同一組連線。[驗收腳本](../../../tools/legacy-web/check_source_lobby.py) · [好友規格](lobby-views.md#好友定時刷新與邀請碼)

### 重跑大廳整頁道具

使用完成教學的隔離角色，先在原版結清啟動通知。測例持有魔女秘藥 #3、抽獎券 #9、虛擬人物道具 #27 及六件實體外觀，容量為 30，且付款表無待發放的已付款項目。兩版從大廳中央 `btn_e` 進入道具頁，切換身體、服飾、飾品，並返回同一大廳。另點魔女秘藥顯示詳情，再切到對戰清掉選取，核對空清單。[原版四分頁](/workspace/shared/unlight-web-port/flash-parity/lobby-main-item-source/original-four-tabs.png) · [原版詳情](/workspace/shared/unlight-web-port/flash-parity/lobby-main-item-live/original-detail/05-original-magic-potion-selected.png)

```bash
python3 -Bu tools/legacy-web/check_source_lobby.py --port 4396 \
  --database /path/to/isolated/game_dev2.db \
  --quest-start-user friendpaneown --quest-start-password-file /path/to/private-password \
  --lobby-main-item --screens /tmp/unlight-lobby-main-item
```

測例對照 Data `SC6` 內的實體道具、外觀、裝備位元、到期秒數及容量。核對 Lobby 的 `CS17`、`CS25(0)`、實際回覆與同一組連線。道具頁每個子分類按原版定義轉換，驗收沒有發出使用、裝備或丟棄的命令，並確認 SQLite 庫存及付款列。驗收器監看 `ulse02`、`ulse01` 的播放，並確認 `ulbgm02` 保留同一個持續播放的聲道。[驗收腳本](../../../tools/legacy-web/check_source_lobby.py) · [整頁道具規格](lobby-views.md#道具與外觀)

### 重跑整頁道具使用魔女秘藥

使用完成教學的隔離角色 `itemdrawpot`。透過原版 `get_item(3)` 發放兩瓶未使用的魔女秘藥，再用 `energy_use(1)` 把 AP 降為 4/5。付款表只使用無待發放項目的角色。原版與新版各自使用新備份，從大廳中央進整頁道具，先選魔女秘藥，進確認框按 No，再開一次按 Yes。[原版確認畫面](/workspace/shared/unlight-web-port/flash-parity/lobby-main-item-potion-live/original/05-no-original-confirmation.png) · [原版封包與存檔](/workspace/shared/unlight-web-port/flash-parity/lobby-main-item-potion-live/original/trace.json)

```bash
python3 -Bu tools/legacy-web/check_source_lobby.py --port 4396 \
  --database /path/to/isolated/game_dev2.db \
  --quest-start-user itemdrawpot --quest-start-password-file /path/to/private-password \
  --lobby-main-item-use --screens /tmp/unlight-main-item-potion
```

取消後核對 AP 4/5、兩瓶實體資料、同一選取及無使用命令。確認僅送一次含實體庫存 ID 的 `CS18`。暫緩真正的 `SC28`，讓 `SC17(5,0)` 先到，核對 Ruby 已存檔、AP 顯示 5/5、原選取仍是兩瓶及成功窗尚未出現。放行後只顯示一次「訊息／使用了魔女秘藥」，同頁數量變成一，按 OK 回原選取。再核對原 BGM、實體存檔與返回大廳。[瀏覽器驗收](../../../tools/legacy-web/check_source_lobby.py)

### 重跑空地與固定 Gem 後續戰

使用獨立的隔離測試角色，各以 Deck 1 持有卡 21、起始 AP 5/5，並完成教學狀態。經原版 `quest_map_clear(map - 1)` 設定可達區域，再由模型執行 `get_quest(map, 0)`。「山丘矮人」用 map 2、搜尋種子 22。「紫色泥沼澤2」用 map 4、搜尋種子 106。核對得到的任務分別為 4 和 32、AP 4/5，兩位角色保存初始傷勢 `[1,0,0]`。戰鬥使用原有 Ruby 時間及亂數。[原版搜尋](../../../app/server/src/model/avatar.rb#L2798)

沿用本頁 `--quest-start-user` 的啟動方式。空地用 `--quest-peaceful empty`。Gem 用 `--quest-peaceful gem` 進格 5，或以另一位新角色加 `--quest-peaceful-gem-slot 3`。空地暫緩真實 `SC19`，Gem 暫緩真實 `SC25`，接著各暫緩同一 Quest 的 Pong。核對棋子、可進格與餘額何時更新。Gem 翻牌後才啟用本機 OK，且翻牌音只播一次。兩條路徑再暫緩 `SC40`，核對同一任務、Deck 1、實際傷勢和唯一一次 Ready。道路戰場檢查兩張可循環的原始遠景及 `bgm002.mp3`。泥潭戰場檢查靜止原始底圖及 `bgm003.mp3`。[固定舞台腳本](../../../tools/legacy-web/check_source_lobby.py) · [任務原版規格](quest-pve.md#非戰鬥地形與續戰)

### 重跑道路終局與右線四次寶箱

「山丘矮人」勝利與敗北使用不同測試角色，在 `--quest-peaceful empty` 後加 `--quest-peaceful-complete win` 或 `defeat`。起始傷勢各為 `[1,0,0]` 和 `[4,0,0]`。「紫色泥沼澤2」用 `--quest-peaceful gem --quest-peaceful-complete win`，從傷勢 `[1,0,0]` 開始。可在限定角色的隔離 Ruby 對局初始化前使用種子 0，保留原版計時與真實判定。根據 `SC44`、`SC45` 檢查手牌，再依原版距離和先手執行移動、攻守。格 10 同時核對正值 `SC77` 在第一組防禦前回復生命。[原版種子、出牌與資料庫測例](/workspace/shared/unlight-web-port/flash-parity/quest-branch-model/README.md)

右線依次核對格 1、5、8、10 的 30、30、50、30 Gem，使用實際 `SC25` 和各格確認，保留牌組和傷勢。末戰的寶物餘額與可能的成就後總餘額各自核對。暫緩真實 `SC25`、Pong、`SC40` 或末戰 `SC24` 時，分別核對腳本標記的畫面及輸入狀態。最後依序確認戰果、寶箱、通關，在原世界地圖按 Back，確認唯一 `CS2` 只關閉 Quest。[固定舞台腳本](../../../tools/legacy-web/check_source_lobby.py) · [原版路徑與待驗項](quest-pve.md#道路終局與泥潭後續格)

### 重跑泥潭左線及先鋒卡寶箱

用另一個隔離角色、Deck 1 的卡 21、原版搜尋種子 106 與傷勢 `[1,0,0]` 建立持有任務。只在這個角色的原版 `MultiDuel` 初始化前設種子 1，保留實際 Ruby 計時。沿用 `--quest-start-user` 與對應的密碼檔，以 `--quest-peaceful gem --quest-peaceful-gem-slot 3 --quest-peaceful-complete win` 執行。腳本核對格 3、6、10 的原版發牌、距離與攻守選擇，分別打 1、2、1 回合。[原版戰鬥及存檔](/workspace/shared/unlight-web-port/flash-parity/quest-q32-left-source/seed1-quest32-left.json) · [先鋒選卡查核](/workspace/shared/unlight-web-port/flash-parity/quest-q32-left-source/VANGUARD.md)

舞台 0 檢查城堡和欄杆、6 處燭光原始位置及同步畫格、`bgm000.mp3`。格 6 核對同一持有任務的 `SC19=74`，實體卡 `SC13` 與實際卡號 `SC25 [6,1,21]`，以及後續 `SC20` 和 Pong。確認前讀 SQLite 的 Binder 與原牌組。格 10 先驗六點傷勢與原地回復，再檢查末格寶箱、通關及 Back。保留舞台、寶箱、封包、音效與存檔。[固定舞台腳本](../../../tools/legacy-web/check_source_lobby.py) · [左線逐項規格](quest-pve.md#泥潭左線與先鋒卡)

### 重跑高低獎勵骰

各用獨立角色持有 q568「魯比歐那的殘渣1」。原版搜尋種子 190，地區旗標 21，搜尋和開始各扣 4 AP。保留同一個 Deck 1 的卡 25 或 30，並在兩戰初始化前限定該角色設種子 1。出牌計畫分別為 1＋1 或 2＋2 回合，其餘使用原本的 Ruby 計時、牌與骰。[原版角色與操作準備](/workspace/shared/unlight-web-port/flash-parity/quest-reward-dice-source/README.md)

固定舞台測試沿用 `--quest-start-user` 及對應密碼檔。另傳 `--quest-high-low high` 驗 Next 後猜高，或 `--quest-high-low get` 驗直接領取。保留 `SC123`、`SC124` 及 `SC38/126` 的實際等待畫面，檢查按鈕何時啟用、對局合計與帳戶絕對值，以及續行格 7 是否保留原任務和原牌組。道具以真 `SC11` 和 SQLite 查核，角色卡用 `SC38` 的實體 ID 對照 Binder。[固定舞台腳本](../../../tools/legacy-web/check_source_lobby.py) · [高低獎勵骰規格](quest-pve.md#高低獎勵骰)

```bash
python3 tools/legacy-web/check_source_lobby.py --port 4389 \
  --database /path/to/isolated/app/server/data/game_dev2.db \
  --quest-start-user q568-fixture --quest-start-password-file /path/to/disposable-password \
  --quest-high-low high --screens /tmp/unlight-q568-high
```

每次重跑使用另一位仍持有 NEW q568、進度 0、4/8 AP 的隔離角色。兩戰後核對實際目前 AP 和上限，滑入原路線第 7 格並驗地形名稱與說明。留存最後一張場景截圖及 `quest-high-low-wire.json`。[已驗證測例與固定尺寸截圖](/workspace/shared/unlight-web-port/flash-parity/quest-high-low-live/README.md)

使用 `--quest-high-low item` 可重跑敗猜與道具分支。角色持有兩份幸運四葉草、一份白色石楠1 和一份白色石楠3，Deck 1 使用 Lv5 古魯瓦爾多。限定該隔離角色的第 5 格首次擲骰種子為 3。先猜高再用四葉草，接著猜低、使用不足的石楠1，再用石楠3 領取。腳本依序核對真實 `SC127`、暫緩效果回覆時的「信息」提示、同一連線的沉默拒絕、單次入庫及返回。比對過場時只在截圖前暫停 High／Low 的淡入動畫，截圖後恢復播放。[原版測例準備及規格](/workspace/shared/unlight-web-port/flash-parity/quest-reward-dice-source/CONSUMABLES.md) · [兩版完整驗收](/workspace/shared/unlight-web-port/flash-parity/quest-high-low-item-live/README.md)

使用 `--quest-high-low terminal-exit` 或 `--quest-high-low terminal-get` 重跑 q568 終局。沿用隊伍、搜尋及首格種子 1，第 5 格對局種子 3，兩回合前進且空手完成防守和攻擊。每個模式用新的隔離角色。先驗 `SC24` 暫緩時無法發獎勵操作，再驗 `SC38` 或 `SC126` 暫緩時的結算畫面。核對兩次 OK 為本機操作，返回地圖時容量 `0/4` 已載入原版明朝體，Back 經一次 `CS2` 關閉 Quest，原有四條服務連線保留。音效依觸發順序留下每個播放請求，同時核對各聲音成功開始播放。[原版終局操作與存檔](/workspace/shared/unlight-web-port/flash-parity/quest-reward-dice-source/TERMINAL.md) · [兩版實跑證據](/workspace/shared/unlight-web-port/flash-parity/quest-highlow-terminal-live/README.md)

## 待驗收

- 建立同一次發布的原版↔固定舞台配對，固定帳號類型、XML、DPR、視窗、音訊設定和合成擷取時點。對登入、建角、教學與大廳核對實際像素、焦點、圖層、文字及畫格。已知偏差包含 Logo 取樣捨入、裝置字型及台外署名。 [固定舞台已知差異](../../../source-login/README.md)
- 以可控制的真實 Ruby 結果重測多版本瀏覽器、實體觸控、GPU、DPR2 動畫及 WebGL 失效。現有 Chromium 軟體渲染效能、CDP 模擬觸控及在缺少音訊裝置的 Ruffle Desktop 紀錄各有環境限制。另補目標裝置可聽的整體混音及實際公告重載。 [原版瀏覽器環境](../../../tools/legacy-web/README.md) · [Chromium 音訊測試](../../../tools/legacy-web/check_source_login.py#L116)
- 補足原版教學動畫／互動、原版任務場景和其後的固定舞台操作，以及其餘 13 個現有懸停位置的真入口流程。角色圖集證據涵蓋兩種實際裝備，`avatar-catalog.json` 有 824 個原始部件定義，三張圖集有 1,353 個可見片段、11 個透明片段，需繼續檢查其他實際裝備與來源缺件。 [大廳來源資產](../../../source-login/README.md) · [角色圖集](../../../source-login/avatar-wardrobe/index.json)
