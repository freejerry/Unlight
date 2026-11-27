# Unlight 原始繁中客戶端建置

`build.sh` 在指定的新目錄中整理 CPA 的 ActionScript、MXML 和 CSV，產生繁中常數與字型宣告，再用 Adobe Flex 3.6 編譯。工作目錄同時包含原版主資料 SQLite 資料庫和用於試玩的 CPU 牌組副本。Git 版本庫只收錄腳本、補丁和可驗證的來源；下載的素材、字型、編譯產物與產生的資料都放在工作目錄。

## 建置環境

雲端重建使用 Ruby 2.7.8、Bundler 2.1.4、OpenJDK 21 與 GNU/Linux。需要 Git、curl、GNU tar、GNU patch、coreutils、Python 3.10 以上、Memcached，以及編譯 Ruby 原生擴充的 C 工具鏈和 SQLite、GMP、MySQL/MariaDB 開發程式庫。以一般使用者啟動即可。

```bash
gem install bundler -v 2.1.4
BUNDLE_GEMFILE="$PWD/tools/legacy-build/Gemfile" bundle _2.1.4_ install

legacy_work=/tmp/unlight-legacy-build
bash tools/legacy-build/build.sh "$legacy_work"
```

請從版本庫根目錄執行。`legacy_work` 必須是尚未建立的目錄，匯入器會在該目錄建立新的 SQLite 檔。Git 歷史需要包含 CPA 提交 `015d92e4493f81a8e7975f60f7473e156322187b`。已有相同版本的依賴時，可用以下設定重用下載內容。

| 環境變數 | 路徑內容 |
| --- | --- |
| `UNLIGHT_LEGACY_ASSETS` | 已 checkout 到指定提交的 Unlight-Images，根目錄下有 `data/image`、`public/image` 與 `public/sound` |
| `UNLIGHT_LEGACY_RECIPE` | 已 checkout 到指定提交的 Open Unlight 歷史建置配方 |
| `UNLIGHT_LEGACY_FONTS` | 包含歷史 `wt004.ttf`、`cwming.ttf`、`nbr.ttf` 的資料夾 |
| `UNLIGHT_LEGACY_FLEX` | Flex 3.6 SDK，包含 `bin/mxmlc` 與 `frameworks/libs/player/10/playerglobal.swc` |

Git 提交版本、三套字型及 `as3crypto.swc` 均會驗證。自行提供 Flex 時，會驗證編譯器版本及 PlayerGlobal 的 SHA-256。

## 產物和驗證

| 相對於 `legacy_work` | 內容 |
| --- | --- |
| `dist/Unlight.swf` | 依照 Open Unlight 歷史繁中配方編譯的主程式 |
| `dist/Unlight-local-runtime.swf` | 供 Ruffle 使用的相容版。套用既有面板圖的九宮格縮放和任務名稱字型，支援標題頁的公告設定 |
| `assets/public/` | 靜態伺服用的既有圖像與音效素材 |
| `app/client/src/model/utils/ConstData.as` | 由 SQLite 產生的繁中遊戲常數 |
| `app/client/src/FontLoader.as` | 原版字型嵌入宣告 |
| `app/server/data/game_dev2.db` | 30 張主資料表的 SQLite 資料庫 |
| `runtime-probe/data/game_dev2.db` | 含 1,614 副 CPU 牌組的試玩用主資料副本 |
| `import.log`、`font.log`、`cpu.log`、`compile*.log` | 匯入、警告、CPU 初始化和 Flex 編譯紀錄 |

匯入以繁中整表優先，其餘整表取自 `ja`，再將 `_tcn` 欄位寫入對應欄位。一次 SQLite 交易載入資料並逐表核對筆數。程式會拒絕匯入已有紀錄的主資料表。兩份資料庫皆執行 `PRAGMA quick_check`。建置時 Memcached 只監聽回環位址，資料生成結束後會關閉。

原版字型嵌入與繁中素材別名沿用歷史配方。原始常數腳本改用已載入的 SQLite 連線，修正空表輸出。教學需要的 CPU 使用原本角色建立和建牌流程，以一張原版允許的起始卡初始化。歷史 Docker 設定沿用 Sandbox 的伺服器語系常數，部分系統文字仍為日文。有缺字的字型範圍會記錄在 `font.log`。

接續試玩時，使用 CPU-ready 資料庫啟動隔離 Ruby 服務，再將相容版 SWF 和 `assets/public/` 交給網頁入口。[Ruby 測試服務](../legacy-server/README.md) · [Ruffle 網頁入口](../legacy-web/README.md)

## 來源版本

- **原始程式與原版美術**。CPA 程式 `015d92e4`，以及可取用的 Unlight-Images 歷史鏡像 `0ec2d2ff`。[CPA 原始碼](https://github.com/unlightcpa/Unlight/tree/015d92e4493f81a8e7975f60f7473e156322187b) · [原始素材鏡像](https://github.com/ni-light/Unlight-Images/tree/0ec2d2ffb0e294e46cd0edfb84c9778e3dd4ed0e)
- **歷史配方與加密函式庫**。Open Unlight `0ac93015` 提供 TCN 編譯參數、三處客戶端補丁、原有字型產生器的 TTF 路徑及 as3crypto SWC。[歷史配方](https://github.com/open-unlight/legacy-unlight-docker/tree/0ac93015da404cda8202c0daaab3d0a39bd25fe4)
- **編譯器與 PlayerGlobal**。精確使用 Adobe Flex 3.6.0 build 16995 和 Flash Player 10.0 API。從歷史 npm tarball 直接擷取檔案，保留發佈包內的授權。[Flex 版本封存](https://registry.npmjs.org/flex-sdk/-/flex-sdk-3.6.0-0.tgz) · [PlayerGlobal 封存](https://registry.npmjs.org/playerglobal/-/playerglobal-0.1.9.tgz)
- **字型**。精確使用歷史 UnlightCloud 客戶端 `4e7b49ea` 的三份 TTF，避免 `cwming` 發行版的標點間距差異。舊版 `nbr.ttf` 在標準 Bradley Gratis 之外多了 `# % * + / @`。個別字型的發佈、授權和可嵌入條件由各自來源記錄。[歷史字型](https://github.com/UnlightCloud/shell/tree/4e7b49ea6e0dd3bf78275cc3977fe8be8ae754cc/res/data) · [王漢宗字型封存](https://github.com/dictcp-snapshot/wangfonts/blob/268666d80f8029bb8c61b9668352c7a375873301/TrueType/wt004.ttf) · [cwTeXMing 授權記錄](https://sources.debian.org/src/fonts-cwtex/1.0-4/debian/copyright/) · [Bradley Gratis 原作者](https://mickeyavenue.com/fonts/bradley/)
