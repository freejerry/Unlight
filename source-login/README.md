# 固定舞台客戶端

舞台固定為 780 × 680。Rust 編譯成 WebAssembly，從原始背景 SWF 讀取內嵌 JPEG，WebGL 2 繪製原始 760 × 680 背景。Logo、蝴蝶和載入動畫直接讀取三份原始 SWF 的向量及時序，並在 WebGL 2 合成。Logo 與標題面板採用 ActionScript 指定的入場曲線，蝴蝶依 24 FPS 舞台節奏振翅和追蹤游標。光暈採用原版矩形的垂直模糊、強度和最終透明度，並以原版留存畫面量測亮帶。

登入面板採用原版 `Login`、`Name:`、`Pass:` 字樣與同行欄位。登入按鈕下方的 `Create New Account` 會切換至原版帳號註冊。左下 News 位於原始的 (15, 480)，大小為 220 × 200。News 讀取 `/public/news.xml`，預設是本目錄的三筆繁中測試公告，內容可以捲動。使用 `--news /path/to/news.xml` 可覆寫。

原始標題 MP3 在背景入場時嘗試以 50% 音量循環播放。Auth 憑證驗證成功後，每 200 ms 減少起始音量的十分之一，共淡出兩秒。新手開場以獨立聲道從頭播放同一首曲，大廳使用 `ulbgm02.mp3`。瀏覽器若阻擋有聲自動播放，標題頁會顯示「啟用音樂」，第一次有效的滑鼠、鍵盤或觸控操作便可啟播。登入與註冊共用原版按鈕音 `ulse01.mp3`，錯誤視窗開啟使用 `ulse02.mp3`。啟用減少動態效果時，舞台直接顯示入場完成狀態。[原版淡出定時器](../app/client/src/sound/BaseSound.as#L268)

## 啟動

先依照 [Ruby 驗收環境](../tools/legacy-server/README.md) 啟動隔離服務，備妥一組測試帳號。以下範例以 Ruby 連接埠偏移 7800 為準。

在倉庫根目錄執行。素材目錄須包含固定版 [Unlight-Images](https://github.com/ni-light/Unlight-Images/tree/0ec2d2ffb0e294e46cd0edfb84c9778e3dd4ed0e) 的 `public` 及 `data`，並安裝 Rust 的 `wasm32-unknown-unknown` 目標。

```bash
source modern/rust-env.sh
unlight_decoder_dir=$(mktemp -d)
rustc --edition=2021 --crate-type=cdylib --target=wasm32-unknown-unknown -O -C strip=symbols \
  source-login/swf-bitmap.rs -o "$unlight_decoder_dir/asset-decoder.wasm"
python3 tools/legacy-web/serve.py --native --port 4389 --server-offset 7800 \
  --assets /path/to/Unlight-Images/public \
  --source-login-wasm "$unlight_decoder_dir/asset-decoder.wasm"
```

開啟 `http://127.0.0.1:4389/source-login/`。已有角色的帳號登入後直接進入大廳。新帳號從開場依序進行命名、外觀與起始卡選擇，再進入新手指引。登入被拒絕時會清空密碼，可立即重試。

五張起始角色卡已封裝原始插畫與卡框。要從相同素材鏡像按需讀取其他角色卡插畫，請在執行 gateway 的 Python 環境安裝 Pillow。插畫在解碼前比對原始 SWF 的 SHA-256。角色名稱、等級、槽色和數值取自原版角色卡資料表。[卡面來源](card-art/index.json) · [插畫的雜湊](card-art/illustration-sources.json)

Auth 憑證驗證成功後，標題先按原版淡出，再播放 `loading.swf` 的玫瑰。玫瑰以每秒 24 幀播放，在第 100 幀跳回第 23 幀。大廳、資料與聊天連線在轉場期間繼續初始化。資料就緒後，大廳或新手開場進入舞台。[標題轉場](../app/client/src/view/TitleView.as#L194) · [玫瑰載入](../app/client/src/Main.as#L242)

在隔離 Ruby 測試服務可以建立新帳號。成功後顯示「登錄完畢」，按 OK 或 Esc 會以這次註冊所用的帳密接續原版 Auth 與玫瑰轉場。Email 欄位依原版介面驗證，原版 Auth 註冊指令僅傳送名稱及驗證資料。[註冊流程驗收](../docs/playtest/flash-parity.md)

可在預設測試公告啟用時，用 Chromium 跑標題頁驗收。測例向隔離 Ruby 送出一筆不存在的測試帳號登入，檢查錯誤視窗、焦點與原始音效。

```bash
python3 tools/legacy-web/check_source_login.py --port 4389
```

## 登入後的流程

建立角色沿用實際的 Lobby 名稱檢查及建立指令。收到角色資料後，客戶端以原版 Data 指令在同一次登入中切換至新角色，繼續指引與大廳。原始開場和建角背景均直接讀取嵌入的 JPEG，外觀與起始卡選項使用 24 份原始縮圖與 5 份原始肖像，入廳背景使用原始 SWF 色盤與像素。教學和大廳分別使用原版 `bgm011.mp3` 和 `ulbgm02.mp3`。

新手指引依原版四段順序提供繁中說明，原版完整教學動畫仍待移植。大廳底欄顯示 Ruby 提供的角色、等級、Gem、經驗、行動力與剩餘免費對戰次數。首次進入大廳時，若有公告且玩家尚未開始操作，會自動顯示最新消息。[原版流程](../docs/playtest/README.md#桌面-ruffle)

大廳「任務」開啟原版地圖，可搜尋及查看詳情、滑入地形與切換牌組。「落日大蝙蝠」已實跑勝利、敗北、18 回合和局及返回。「大蝙蝠之群」已實跑兩戰、末格蝙蝠卡寶箱和隱者之道解鎖。「山丘矮人」可從森林空地進道路戰鬥，勝敗都會經過戰果與任務結果再返回。

「紫色泥沼澤2」兩條路線都在同一次 Quest 中保留牌組與傷勢。右線 `1→5→8→10` 依序顯示 30、30、50、30 Gem。左線 `1→3→6→10` 由泥潭進黑太子城堡，四次寶箱依序為 30 Gem、30 Gem、Ruby 確認的實體先鋒 Lv1 卡、30 Gem。戰果、寶箱與通關各自確認。城堡沿用原版六處燈火及場曲，寶箱沿用原始卡面、翻牌和音效。「原地」回復在防禦前顯示。距離、牌面、骰值、傷害和報酬沿用 Ruby 回覆，擲骰使用原始模型與 WebGL。[任務逐項驗收](../docs/playtest/flash-parity/quest-pve.md)

「魯比歐那的殘渣1」走過第 1 格後，第 5 格戰果會依 Ruby 的獎勵階段顯示候選、Next、High／Low、Get 與 Exit。畫面使用原始卡框、骰子模型與按鍵、成功、失敗音效。敗猜後可打開原版道具窗，選取幸運四葉草重擲，或使用持有的白色石楠與跳越星補正。領取、使用與返回依同一條 Quest 的實體及階段回覆開放。[高低獎勵骰與道具規格](../docs/playtest/flash-parity/quest-pve.md#高低獎勵骰)

若第 5 格戰鬥敗北，原版 Ruby 先歸檔任務，獎勵骰仍可在同一條 Quest 結算。猜錯後 Exit 保留戰鬥實得，直接 Get 可領候選報酬。戰果和任務失敗視窗各有一個本機 OK，最後在任務地圖按 Back 返回大廳。[終局獎勵與離場驗收](../docs/playtest/flash-parity/quest-pve.md#終局獎勵與敗猜後-exit)

以隔離 Ruby 執行完整驗收，提供該次執行副本的 SQLite 路徑。腳本會建立測試帳號，以唯讀查詢核對角色與起始牌，並測試重開網頁後重新登入大廳。

```bash
python3 tools/legacy-web/check_source_lobby.py --port 4389 \
  --database /path/to/runtime/app/server/data/game_dev2.db \
  --screens /tmp/unlight-source-lobby
```

## 標題頁逐項比對

[原版正常畫面](../docs/playtest/browser/29-browser-panel-current.png) · [原版錯誤視窗](../docs/playtest/browser/11-browser-tcn-alert.png)

| 項目 | 來源與驗收 |
| --- | --- |
| 舞台 | 固定為 780 × 680，視窗較高時垂直置中，較矮時保留可捲動高度。兩個回放入口的舞台外底色依原版 HTML 設定為 `#080808`。 |
| 背景、Logo、蝴蝶與過場 | 使用原始 SWF 的 JPEG、向量與時間軸。入場與追蹤讀取原版 [TitleView](../app/client/src/view/TitleView.as) 和 [Ageha](../app/client/src/view/image/title/Ageha.as) 的設定。 |
| 登入框與標題 | [LoginPanel](../app/client/src/view/image/title/LoginPanel.as) 定位 (500, 20)，英文字樣與同行欄位依來源。面板標題使用與原版 Flex 標題欄相近的裝置字型，Name／Pass 使用歷史字型原檔。Login 與 OK 共用原版樣式的灰色按鈕，登入按鈕以面板置中。 |
| 面板九宮格 | 沿用 `panel_gene.png` 的 X42／78、Y60／64 切線和透明邊角。整數裝置像素比使用原圖 CSS，分數比例使用共用 Canvas2D 切片幾何。已比對 Login、Register、News 和 Alert 在 DPR 1、1.25、2 的像素。 |
| News | [NewsPanel](../app/client/src/view/image/title/NewsPanel.as) 定位 (15, 480)，220 × 200。驗證同源三則 XML 公告，以及內容可捲閱。 |
| 註冊與返回 | 表單底部的 Create New Account 依未修補的原版回放校正字形與位置，點擊後切換至 Register。原始 Auth 指令建立帳號，完成後回登入表單，重新輸入密碼即可登入。 |
| 登入失敗 | [TitleCtrl](../app/client/src/controller/TitleCtrl.as) 使用 Error 警示。780 × 680 舞台以 Flex 的 50% 淺色遮罩和 3px 模糊覆蓋。空白帳號或密碼由同一視窗處理，確認後焦點回到缺漏欄位。 |
| BGM 與音效 | [TitleBGM](../app/client/src/sound/bgm/TitleBGM.as) 在背景入場時自曲首循環播放。載入時點擊或按鍵可先靜音準備播放，原音檔曲首約 0.29 秒的低音量保留。登入與註冊提交使用 [ClickSE](../app/client/src/sound/se/ClickSE.as)，[Alerter](../app/client/lib/Alerter.as) 開啟錯誤視窗時使用 [Click2SE](../app/client/src/sound/se/Click2SE.as)。 |

Logo 向量直接按原版舞台中的尺寸與位置光柵化。WebGL 在開啟頁面時依裝置像素比配置繪製緩衝區，最高 2×，畫面維持 780 × 680 CSS 像素。已知差異包括 Logo 濾鏡的取樣捨入、裝置字型的渲染差異，以及署名列目前位於舞台外。

程式來源依本倉庫的 [MIT 授權](../LICENSE)。原版美術 © CPA。素材原檔來自上述素材鏡像，依 [CC BY-ND 4.0](https://creativecommons.org/licenses/by-nd/4.0/) 使用。登入文字載入歷史 `nbr.ttf` 原檔，檔內標示 Bradley Gratis、Justin Callaghan 與公有領域授權。[歷史字型來源](https://github.com/UnlightCloud/shell/tree/4e7b49ea6e0dd3bf78275cc3977fe8be8ae754cc/res/data)

## 登入後的大廳素材

從 `/source-login/` 登入後，大廳在同一個 780 × 680 舞台繪製。虛擬人物讀取 Ruby Data 或 Lobby 傳回的實際已裝備部件，依原版圖層順序、骨架定位及色彩倍率合成。原始的 290 × 450 快取、入場位移與淡入都使用原版設定。[AvatarClip](../app/client/src/view/scene/common/AvatarClip.as#L184) · [原始大廳素材清單](lobby-art/sources.json)

`avatar-catalog.json` 記錄原始部件、定位與缺檔，`avatar-wardrobe` 保存瀏覽器使用的 PNG 圖集。若某件裝備的來源缺失，大廳仍可顯示其他可用部件。`package_avatar_assets.py` 可從固定素材版本封裝原始部件及骨架。重新輸出圖層時，可用 Flex 3.6 編譯 `AvatarAssetExport.as`，並將該 SWF 及 Ruffle 0.8 的解壓目錄傳給 `export_lobby_avatar.py`。[原檔封裝工具](../tools/legacy-web/package_avatar_assets.py) · [離線圖層輸出工具](../tools/legacy-web/export_lobby_avatar.py)
