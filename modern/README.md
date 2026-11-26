# 霧潮航線技術試驗

這個獨立的繁中卡牌原型用來驗證 Rust、WebAssembly、WebSocket 與 WebGL2 的整合。《Unlight》的現代化範圍與驗收以雲端計畫為準。[Unlight 現代化與視覺更新計畫](../MODERNIZATION_PLAN.md)

玩家在每回合用三點能量打出攻擊、護盾、修復與增幅牌，結束回合後由電腦對手行動。擲骰點數、傷害和護盾吸收會出現在戰報。

## 雲端建置與啟動

在 `modern/` 執行下列指令。需要 Node.js 20.19 以上或 22.12 以上版本，以及 Rust。`rust-toolchain.toml` 指定 Rust 版本與 Wasm 建置目標。

```bash
npm run build
npm run dev
```

在 Codex 雲端使用已保留的 preview 工作階段時，由預覽服務啟動 `npm run dev`。Axum 預設使用 `3000`，可透過 `PORT` 修改。對局保存在程序記憶體，重啟會清空對局。

## 驗證

```bash
source ./rust-env.sh
cargo test --locked --workspace
node qa/smoke.mjs http://127.0.0.1:3000 target/wasm32-unknown-unknown/release/naval_engine.wasm
```

Rust 引擎同時供 Axum 和 WebAssembly 使用。WebSocket 傳送最新對局狀態，操作附帶版本號以避免重複提交。整合測試會走完勝利、失敗及重開流程，檢查即時更新並比較原生與 Wasm 的結算、牌序及戰報。

[原型開局](docs/playtest/01-ready.jpg) · [原型對局](docs/playtest/02-combat.jpg) · [原型結算](docs/playtest/03-victory.jpg)
