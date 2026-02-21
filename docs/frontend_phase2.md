# Frontend Phase 2 実装メモ

フェーズ2（盤面UI最小）として、UI向けモデルと入力意図生成を実装した。

- `packages/frontend/src/ui.ts`
  - 7x7 盤面の `BoardViewModel` 生成（`buildBoardViewModel`）
  - 自分ターン判定（`canAct`）
  - 自駒のみ選択可能な選択ロジック（`selectPiece`）
  - Move送信用 `INTENT` 生成（`createMoveIntent`）
  - EndTurn送信用 `INTENT` 生成（`createEndTurnIntent`）

- `packages/frontend/src/render.ts`
  - ViewModel に `board` / `selectedPieceId` / `canEndTurn` を追加

- `scripts/frontend-unit.mjs`
  - 49セル生成、選択可否、Move/EndTurnメッセージ生成、非手番ブロックを検証
