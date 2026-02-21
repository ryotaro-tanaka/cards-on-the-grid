# Frontend Phase 0 実装メモ

フェーズ0では、frontend の責務を以下 3 モジュールに分割した。

- `packages/frontend/src/connection.ts`
  - WebSocket 接続状態の取り扱い（connecting/open/closed）
- `packages/frontend/src/reducer.ts`
  - `WELCOME` / `EVENT` / `SYNC` / `REJECT` を `ClientState` に還元
- `packages/frontend/src/render.ts`
  - `ClientState` から表示向け `ViewModel` を生成

共通型は `packages/frontend/src/types.ts` に集約。
