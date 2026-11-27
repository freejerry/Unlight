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

軟體 GL 測例可加上 `--software` 使用 ANGLE SwiftShader。標題啟動後會量測約一秒的瀏覽器 `requestAnimationFrame`，輸出回呼次數與間隔的中位數、p95 和最大值。SWF 內的動畫進度另依畫面變化、原版時間軸與音效觸發點驗證。[標題動畫](../../app/client/src/view/TitleView.as) · [戰鬥階段](../../app/client/src/view/image/game/PhaseImage.as) · [擲骰音效觸發](../../app/client/src/view/image/game/DiceObject.as)

雲端 Ruffle Desktop 實際打完「落日大蝙蝠」並看到通關結算。獨立 Chromium 實測到第二回合抽牌，並確認原始 `bgm000.mp3` 和 Web Audio 混音輸出。相容版需要重新編譯才能套用任務列表的內嵌繁中字型。瀏覽器內的單場完整結算、各別戰鬥音效及其他畫面的缺字仍待驗收。[重新建置](../legacy-build/README.md) · [實機畫面與驗收紀錄](../../docs/playtest/README.md)
