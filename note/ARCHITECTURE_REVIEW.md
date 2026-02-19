# 現在地点と `core/` 集約方針レビュー

## 現在地点（更新）

- ルート `tsconfig.json` の project references で `core` / `backend` / `frontend` を分割。
- `packages/core` は actor 付き command パイプラインを実装済み。
  - `validateIntent`: 合法手判定
  - `applyEvent`: イベント適用
  - `applyCommand`: 検証 + イベント生成 + 状態更新
- `packages/backend` は room state / `seq` / turn 検証を実装済み。
  - `handleClientIntent` で `TURN_MISMATCH` と core 由来の validation reject を返す
- `packages/frontend` は `WELCOME` / `EVENT` reducer を実装済み。
  - `seq` が連番でない `EVENT` は適用しない

## API はできているか？

結論：**最小API（MVP向け）は実装済み**。

- 実装場所
  - `packages/backend/src/ws.ts`
  - `packages/backend/src/room.ts`
  - `packages/frontend/src/reducer.ts`
- 仕様メモ
  - `note/api.md`（プロトコルの叩き台）

### いま使える最小メッセージ

- Server -> Client
  - `WELCOME`
  - `EVENT`
  - `REJECT`
- Client -> Server
  - `INTENT`（`expectedTurn` + `command`）

## `core` 集約運用は妥当か

結論：**妥当**。

- backend/frontend でルール二重実装を避けられる
- WebSocket イベントの適用ロジックを共有できる
- authoritative server 構成を保ったまま、frontend は read model として同一ロジックを使える

## 直近で埋めるべきギャップ

1. 仕様未確定項目の固定（召喚不可時、手札超過、地雷詳細など）
2. 再接続同期（`SYNC`）とイベント欠損時の追いつき
3. 乱数 seed 戦略（再現性テスト）
4. ルール拡張（戦闘/死亡/補充/カード効果）

## 最小E2E動線（現状）

`scripts/e2e-smoke.mjs` で次を確認できる。

1. `WELCOME` を frontend reducer に適用
2. `INTENT(EndTurn)` -> `EVENT(seq=1)` を受けて state 更新
3. 古い turn で `INTENT` を送ると `REJECT(TURN_MISMATCH)`
4. 手番外 actor で `INTENT` を送ると `REJECT(NOT_ACTIVE_PLAYER)`

