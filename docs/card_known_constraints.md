# カード機能の既知制約（フェーズ6時点）

最終更新: 2026-02-23

## 1. 補充配置の暫定仕様

- 補充召喚は「自陣地内の先頭空きマス」を決定的に選ぶ実装になっている。
- `game_rules.md` の「陣地内の任意マス」運用とは差分があるため、将来的にプレイヤー選択式へ拡張予定。

## 2. frontend / backend test 実行時のモジュール解決制約

- `packages/*/dist` の実行物が `packages/core/src/index.js` を参照する経路があり、
  環境によっては `npm run test:backend` / `npm run test:frontend` がそのまま失敗する。
- 現状CI/ローカルでの検証時は、必要に応じて一時的な shim (`packages/core/src/index.js` で `../dist/index.js` を再エクスポート) を用いる。

## 3. e2e smoke の脆さ

- `scripts/e2e-smoke.mjs` には legacy な固定件数アサーションが一部残っており、
  カード関連イベント増加時に壊れやすい。
- 本番リリース前に「イベント件数固定」ではなく「必須イベント存在確認」へ寄せる。

## 4. スクリーンショット取得環境依存

- browser container 上で Playwright 実行時に SIGSEGV が発生するケースがある。
- 機能検証は unit/integration/e2e で担保し、UI証跡は環境安定後に再取得する。
