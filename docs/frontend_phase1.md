# Frontend Phase 1 実装メモ

フェーズ1として通信レイヤーを実装した。

- `packages/frontend/src/connection.ts`
  - `connect(...)` を追加
  - `onopen` 時に `HELLO` を自動送信
  - `sendIntent(command, expectedTurn)` を提供
  - `EVENT` 欠番時に `RESYNC_REQUEST(fromSeq=currentSeq)` を自動送信
  - 受信JSONを型ガードで検証し、未知メッセージは `onInvalidMessage` に通知
  - `onResyncStatusChange` で再同期中フラグを通知

- `packages/frontend/src/types.ts`
  - `OutgoingMessage`（`HELLO` / `INTENT` / `RESYNC_REQUEST`）を追加
  - `ClientState` に `isResyncing` を追加

- `packages/frontend/src/reducer.ts`
  - `RESYNC_STATUS_CHANGED` action を追加し、UIが再同期状態を扱えるようにした
