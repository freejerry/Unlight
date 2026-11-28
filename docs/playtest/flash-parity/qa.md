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

### 重跑設定頁 AP 回復

在新的隔離 Ruby 副本以 `--playtest-user apqa --playtest-first-quest` 準備角色，確認起始 AP 為 `4/5`。將該測試帳號的密碼置於只有擁有者可讀的檔案，再啟動上例的新版 gateway。測例登入後會用原版 Ruby 模型調整該測試角色的恢復時間。角色的 AP 由下一次 `CS17` 觸發的原版 Ruby 規則恢復。測例只接受 `run.py` 建立的隔離資料目錄。[隔離測例](../../../tools/legacy-web/check_source_lobby.py)

```bash
python3 -Bu tools/legacy-web/check_source_lobby.py --port 4390 \
  --database "$proof_dir/native-ruby/app/server/data/game_dev2.db" \
  --refresh-user apqa --refresh-password-file "$proof_dir/apqa-password" \
  --screens "$proof_dir/native-ap-recovery"
```

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

### 重跑末格寶箱與區域解鎖

沿用上節的持有任務 3、魔女山谷通關數 3、單張起始卡及同一組 Ruby 服務，改用 `--quest-complete-q3`。照當場原始手牌打完兩場。第二場勝利後放行 `SC19` 的累積遮罩 18 及 `SC13` 的實體卡，暫緩同一條 Quest 的真 `SC25`。Ruby 此時已保存獎勵，畫面仍需維持結果、未開放 OK 與未切換區域。接續交付同場回覆，核對正確卡號、兩次傷勢回覆、通關數和旗標、刪除及任務結果。

依序確認戰鬥結果、寶箱和任務完成。保存卡背、翻牌或翻後卡面及兩處任務地圖面板。核對 `ulse23.mp3` 只播放一次、兩次地圖面板確認沒有額外點擊音。三次 OK 後，查隱者之道 0/3、任務歸檔及蝙蝠卡實體 ID。再按 Back 檢查唯一 `CS2`、正常關閉及四條登入連線。[固定舞台腳本](../../../tools/legacy-web/check_source_lobby.py) · [分項規格](quest-pve.md#末格蝙蝠卡寶箱與區域解鎖)

### 重跑空地與固定 Gem 後續戰

使用獨立的隔離測試角色，各以 Deck 1 持有卡 21、起始 AP 5/5，並完成教學狀態。經原版 `quest_map_clear(map - 1)` 設定可達區域，再由模型執行 `get_quest(map, 0)`。「山丘矮人」用 map 2、搜尋種子 22。「紫色泥沼澤2」用 map 4、搜尋種子 106。核對得到的任務分別為 4 和 32、AP 4/5，兩位角色保存初始傷勢 `[1,0,0]`。戰鬥使用原有 Ruby 時間及亂數。[原版搜尋](../../../app/server/src/model/avatar.rb#L2798)

沿用本頁 `--quest-start-user` 的啟動方式。空地用 `--quest-peaceful empty`。Gem 用 `--quest-peaceful gem` 進格 5，或以另一位新角色加 `--quest-peaceful-gem-slot 3`。空地暫緩真實 `SC19`，Gem 暫緩真實 `SC25`，接著各暫緩同一 Quest 的 Pong。核對棋子、可進格與餘額何時更新。Gem 翻牌後才啟用本機 OK，且翻牌音只播一次。兩條路徑再暫緩 `SC40`，核對同一任務、Deck 1、實際傷勢和唯一一次 Ready。道路戰場檢查兩張可循環的原始遠景及 `bgm002.mp3`。泥潭戰場檢查靜止原始底圖及 `bgm003.mp3`。[固定舞台腳本](../../../tools/legacy-web/check_source_lobby.py) · [任務原版規格](quest-pve.md#非戰鬥地形與續戰)

## 待驗收

- 建立同一次發布的原版↔固定舞台配對，固定帳號類型、XML、DPR、視窗、音訊設定和合成擷取時點。對登入、建角、教學與大廳核對實際像素、焦點、圖層、文字及畫格。已知偏差包含 Logo 取樣捨入、裝置字型及台外署名。 [固定舞台已知差異](../../../source-login/README.md)
- 以可控制的真實 Ruby 結果重測多版本瀏覽器、實體觸控、GPU、DPR2 動畫及 WebGL 失效。現有 Chromium 軟體渲染效能、CDP 模擬觸控及在缺少音訊裝置的 Ruffle Desktop 紀錄各有環境限制。另補目標裝置可聽的整體混音及實際公告重載。 [原版瀏覽器環境](../../../tools/legacy-web/README.md) · [Chromium 音訊測試](../../../tools/legacy-web/check_source_login.py#L116)
- 補足原版教學動畫／互動、原版任務場景和其後的固定舞台操作，以及其餘 13 個現有懸停位置的真入口流程。角色圖集證據涵蓋兩種實際裝備，`avatar-catalog.json` 有 824 個原始部件定義，三張圖集有 1,353 個可見片段、11 個透明片段，需繼續檢查其他實際裝備與來源缺件。 [大廳來源資產](../../../source-login/README.md) · [角色圖集](../../../source-login/avatar-wardrobe/index.json)
