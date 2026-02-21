# Frontend Phase 3 実装メモ

フェーズ3（ゲーム状態UI）として、表示向けメタ情報を追加した。

- `packages/frontend/src/render.ts`
  - `roomStatusLabel` を追加（waiting/started/finished を人間向け表示）
  - `turnLabel` を継続しつつ、`actionAvailabilityMessage` を追加
    - started前、同期中、非手番、自手番を明確に表示
  - `REJECT` 理由の人間向け変換 `describeRejectReason` を追加

- `scripts/frontend-unit.mjs`
  - ルーム状態表示、操作可否メッセージ、REJECT理由表示を検証
