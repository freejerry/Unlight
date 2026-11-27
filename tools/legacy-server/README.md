# 舊版 Ruby 服務與對局基準

可以用現有 Ruby 服務驗收舊版客戶端，也可以重播固定的 PvE 對局。工具從 Git 版本匯出原始碼，建立獨立的 SQLite 資料庫和 Memcached，並將服務綁定到回環介面。可用 `--work-dir` 保留產生的檔案和日誌供除錯。

## 執行環境

驗證使用 Linux、Ruby 2.7.8、Python 3.10 以上、Memcached，以及 `git`、`tar` 和 `patch`。Gem 版本由同一倉庫的舊版建置工具固定。若雲端已有安裝好的舊版 Ruby，從其環境啟動即可。[Ruby 套件清單](../legacy-build/Gemfile)

```sh
export BUNDLE_GEMFILE="$PWD/tools/legacy-build/Gemfile"
bundle install
bundle exec python3 tools/legacy-server/run.py smoke
bundle exec python3 tools/legacy-server/run.py characterize --check
```

`smoke` 依原始協定驗證認證、大廳、資料、戰鬥、任務與全域聊天六項服務的 KeepAlive，並確認未註冊帳號的正常回應。跑完後會關閉所有程序。

## 啟動客戶端用的伺服器

指定建置工具產生的繁中 SQLite 資料庫，啟動常駐的雲端測試服務。工具透過 SQLite 備份 API 將主資料匯入獨立副本。可以用 `--playtest-user` 建立一個新帳號，密碼由終端機提示輸入。[繁中 Flash 建置](../legacy-build/README.md)

```sh
unlight_build=/tmp/unlight-legacy-build
bundle exec python3 tools/legacy-server/run.py serve \
  --master "$unlight_build/runtime-probe/data/game_dev2.db" \
  --port-offset 1000 --playtest-user playtest
```

以上範例把原始 TCP 埠 `12001` 至 `12005` 和 `12020` 平移到 `13001` 至 `13005` 和 `13020`。啟動 Web 入口時也指定相同的 `--server-offset 1000`。Memcached 預設使用臨時埠，也可以用 `--cache-port` 固定。服務持續執行到收到終止訊號。[瀏覽器入口](../legacy-web/README.md)

另以 `--revision` 指定來源版本，或用 `--checkout` 指定另一個包含 `app/server` 的 checkout。啟動器的相容層會配合 Ruby 2.7 的位元組字串、可變的對局名稱和舊版 Sequel 查詢。這些變更套用在執行副本。[相容補丁](compat.patch) · [回環設定](loopback.rb)

### 首場 PvE 驗收資料

在上例加上 `--playtest-first-quest --work-dir /tmp/unlight-quest-playtest`。指定一個尚未建立的工作目錄，並使用符合原版欄位規格的帳密。準備程序用原版 Ruby 模型建立測試角色、起始牌組和一個尚未開始的「落日大蝙蝠」任務。這個帳號從已完成教學的狀態進入大廳，開始前沒有通關紀錄。SQLite 執行副本位於 `app/server/data/game_dev2.db`。[原版瀏覽器試玩](../legacy-web/README.md)

## 對局基準

`characterize --check` 使用原始 `MultiDuel` 與任務 AI，載入固定場地所需的牌和兩張測試角色卡，透過固定亂數與模擬時鐘重播。種子 2026 的對局在第四回合結算，玩家 5 HP、AI 0 HP。68 個事件依序記錄抽牌、移動、出牌、攻防、骰點、傷害與勝負。[對局資料](fixtures/trace-2026.json)

```sh
bundle exec python3 tools/legacy-server/run.py characterize --seed 2026 --output /tmp/unlight-trace.json
```

有其他實作產生相同格式的對局紀錄後，可以直接和已提交的 Ruby 輸出比對。比對會核對欄位值、型別及事件順序，並回報第一個差異的位置。需要指定另一份基準時使用 `--baseline`。

```sh
python3 tools/legacy-server/compare_trace.py /tmp/unlight-trace.json
```
