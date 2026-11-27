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

## 待驗收

- 建立同一次發布的原版↔固定舞台配對，固定帳號類型、XML、DPR、視窗、音訊設定和合成擷取時點。對登入、建角、教學與大廳核對實際像素、焦點、圖層、文字及畫格。已知偏差包含 Logo 取樣捨入、裝置字型及台外署名。 [固定舞台已知差異](../../../source-login/README.md)
- 以可控制的真實 Ruby 結果重測多版本瀏覽器、實體觸控、GPU、DPR2 動畫及 WebGL 失效。現有 Chromium 軟體渲染效能、CDP 模擬觸控及在缺少音訊裝置的 Ruffle Desktop 紀錄各有環境限制。另補目標裝置可聽的整體混音及實際公告重載。 [原版瀏覽器環境](../../../tools/legacy-web/README.md) · [Chromium 音訊測試](../../../tools/legacy-web/check_source_login.py#L116)
- 補足原版教學動畫／互動、原版任務場景和其後的固定舞台操作，以及其餘 13 個現有懸停位置的真入口流程。角色圖集證據涵蓋兩種實際裝備，`avatar-catalog.json` 有 824 個原始部件定義，三張圖集有 1,353 個可見片段、11 個透明片段，需繼續檢查其他實際裝備與來源缺件。 [大廳來源資產](../../../source-login/README.md) · [角色圖集](../../../source-login/avatar-wardrobe/index.json)
