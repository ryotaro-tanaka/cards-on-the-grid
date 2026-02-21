# Frontend Phase 4 実装メモ

フェーズ4（終了状態と品質）として、終了表示と再接続導線を追加した。

- `packages/frontend/src/render.ts`
  - `connectionLabel` を追加（connected/connecting/disconnected/resyncing）
  - `matchResultMessage` を追加（勝敗表示）
  - `roomStatus=finished` 時の操作不可メッセージを明示

- `packages/frontend/src/connection.ts`
  - `connect(...)` に `reconnect()` を追加（同一 roomId/playerId で再接続）
  - `webSocketFactory` を追加してテスト可能性を改善
  - `error` 時は `closed` 状態を通知

- `scripts/frontend-unit.mjs`
  - 終了状態での操作停止・勝敗表示を検証
  - FakeSocket を用いた reconnect 動作と HELLO 再送を検証
