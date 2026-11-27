# Unlight 瀏覽器相容移植

以 Ruffle Web 執行既有繁中 Flash 客戶端。遊戲規則、動畫調度及音效觸發仍由原始 ActionScript、SWF 時間軸和 Ruby 後端執行。Web 入口使用 Wasm、WebGL 2 和 Web Audio。開始按鈕提供瀏覽器所需的音訊使用者手勢。

## 啟動

需要 Python 3.11 以上、aiohttp、[已建好的繁中客戶端與公開素材](../legacy-build/README.md)，以及解開的 [Ruffle Web 0.8.0](https://www.npmjs.com/package/@ruffle-rs/ruffle/v/0.8.0)。先依照 [Ruby 服務說明](../legacy-server/README.md) 啟動隔離的後端。本例使用後端埠 13001 至 13005 和 13020。

從 repository 根目錄執行，將兩個目錄換成實際位置。

```bash
unlight_build=/path/to/legacy-build-work
unlight_ruffle=/path/to/extracted/ruffle-web
python3 tools/legacy-web/serve.py \
  --client "$unlight_build/dist/Unlight-local-runtime.swf" \
  --assets "$unlight_build/assets/public" \
  --ruffle "$unlight_ruffle" \
  --port 4330 --server-offset 1000
```

在執行該指令的機器上開啟 `http://127.0.0.1:4330/`。原 Flash 設定保留舊協定埠，瀏覽器透過同一個 HTTP 服務的 WebSocket 接到實際 Ruby TCP 埠。其他配置可指定 `--server-offset`。相容 SWF 的 `ExternalInterface` 檢查會略過舊 debug 主控台寫入。選用 `wgpu-webgl` 以支援原版需要的離屏 `BitmapData.draw`。

有既有的繁中公告檔時，可加上 `--news /path/to/news.xml`，讓登入後的「最新消息」讀取該檔。重編後的相容版會在瀏覽器的標題頁消息欄顯示同一份公告。服務會原樣提供 XML，預設沿用版本庫內的歷史日文範例。[原版公告讀取程式](../../app/client/lib/News.as)

可在同一指令加上 `--tcn-device-font "$unlight_build/app/client/data/cwming.ttf"`。Ruffle 會用建置時取得並驗證過的歷史明體繪製裝置文字，標題頁消息也會使用此字型。測試公告已驗證繁中、重音字元及長文捲動。這項設定會影響裝置文字的字面尺寸。[字型來源與版本](../legacy-build/README.md#來源版本) · [公告驗收截圖](../../docs/playtest/README.md#畫面驗收項目)

若這個 Codex 環境提供擁有者專用的 HTTP 預覽，可將前端埠加入預覽，再以 `--preview-origin` 傳入回傳的 HTTPS 網址。HTTP 層會監聽所有介面。Ruby 仍使用回環位址，WebSocket 只接受指定來源及同埠的回環來源。歷史驗收工作區只有 SSH 入口，沒有成功建立 Mac 到雲端的轉送。

### 雲端桌面或本機 Ruffle Desktop

執行同一指令時加上 `--direct-sockets`，使設定 XML 直接指向帶有 offset 的 TCP 埠。以 [Ruffle Desktop 0.8.0](https://github.com/ruffle-rs/ruffle/releases/tag/v0.8.0) 開啟 SWF。下列參數只允許連到測試後端。

```bash
ruffle --tcp-connections deny \
  --socket-allow 127.0.0.1:13001 --socket-allow 127.0.0.1:13002 \
  --socket-allow 127.0.0.1:13003 --socket-allow 127.0.0.1:13004 \
  --socket-allow 127.0.0.1:13005 --socket-allow 127.0.0.1:13020 \
  http://127.0.0.1:4330/Unlight.swf
```

Codex 雲端桌面實測使用 Mesa lavapipe 和 `ruffle --graphics vulkan`。驗收當時的雲端桌面缺少音訊裝置。

## 驗收

`check_boot.py` 檢查 SWF、設定與標題音樂。瀏覽器模式下，`check_relay.py` 檢查六個 Ruby 服務的 KeepAlive。另安裝 Playwright 與 Chromium 後，`check_browser.py` 確認實際使用 WGPU WebGL、標題動畫有進展、原版 BGM 有回應且 Web Audio 收到非零波形。它也驗證沒有 WebGL 2 時的提示和重試，並檢查桌面與窄視窗中的播放器外框是否維持原版比例。

```bash
python3 tools/legacy-web/check_boot.py 4330
python3 tools/legacy-web/check_relay.py 4330
python3 tools/legacy-web/check_browser.py --port 4330 --chromium /path/to/chromium
```

軟體 GL 測例可加上 `--software` 使用 ANGLE SwiftShader。標題啟動後會量測約一秒的瀏覽器 `requestAnimationFrame`，輸出回呼次數與間隔的中位數、p95 和最大值。[標題動畫](../../app/client/src/view/TitleView.as) · [戰鬥階段](../../app/client/src/view/image/game/PhaseImage.as) · [擲骰音效觸發](../../app/client/src/view/image/game/DiceObject.as)

加上 `--frame-report` 可另取樣約四秒的 Chromium 合成畫面。同一份 JSON 記錄 SWF SHA-256、宣告幀率、瀏覽器回呼和合成畫面變化。程式將畫面縮到最多 320 × 280，並略過連續相同的影像。變化間隔優先使用 Chromium 回報的畫面交換時間，必要時改用接收時間。縮圖和擷取可能略過細微或短暫的畫面更新，因此數值適用於該次取樣環境的觀察。[實測紀錄](../../docs/playtest/README.md#標題動畫取樣)

```bash
python3 tools/legacy-web/check_browser.py --port 4330 --software \
  --frame-report /tmp/unlight-title-frames.json --screenshot /tmp/unlight-title.png
```

與未修改的原版 SWF 核對時，使用同一入口的 `--client` 參數指向本倉庫編譯的 `dist/Unlight.swf`，再在驗收指令加上 `--original-swf`。這個選項在獨立的 Chromium 頁面啟用原版的 JavaScript 日誌橋接。測試頁的請求限於本機的測試來源。[原版日誌呼叫](../../app/client/lib/log.as#L95) · [原版 SWF 建置](../legacy-build/README.md)

### 首場 PvE 及音效

以 `--playtest-first-quest` 啟動隔離的原版 Ruby。登入後進入魔女山谷，選擇「落日大蝙蝠」。移動後依距離選擇槍牌或劍牌，按 OK 確認出牌。獲勝後依序關閉勝利與 `QUEST CLEAR`，確認地圖進度及 Gem、Exp。雲端 Ruffle Desktop 和獨立 Chromium 都已跑完這場測例。[隔離測試帳號](../legacy-server/README.md#首場-pve-驗收資料) · [瀏覽器通關紀錄](../../docs/playtest/README.md#首場-pve-結算)

重跑大廳提示時，先將游標停在「任務」按鈕直到提示出現，接著在同一位置點擊。在魔女山谷停在關卡名稱上，可叫出關卡描述。移開游標後，關卡描述應消失。進入戰鬥時，畫面上應已清除大廳持有的提示框。從地圖按 `BACK` 回大廳後，可再次懸停確認「任務」提示。[提示退場驗收](../../docs/playtest/README.md#大廳提示退場)

要比對個別音效，可在 Playwright 的隔離測試頁載入取樣程式，再進入關卡。`drain()` 取出並清空最近約 75 秒的聲音樣本。可在擲骰後和結算時，分別在測試工作區保存一份。

```python
import json
from pathlib import Path

page.add_init_script(path=Path("tools/legacy-web/capture_quest_mix.js"))
# 開啟測試頁並準備進入戰鬥後執行
page.evaluate("() => { questMix.enabled = true }")
# 播放待驗收的片段後執行
Path("/tmp/unlight-quest-mix.json").write_text(json.dumps(page.evaluate("() => questMix.drain()")))
```

使用 FFmpeg、NumPy 和 SciPy 解析原版 MP3，並輸出混音和原始片段的相關係數。核對同一音效的多個區段是否對上同一個播放起點。

```bash
python3 tools/legacy-web/check_quest_mix.py /tmp/unlight-quest-mix.json \
  --sound-directory "$unlight_build/assets/public/sound" --asset dice --asset win
```
