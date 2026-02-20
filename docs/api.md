# WebSocket通信のメッセージ仕様

この文書は、クライアントとサーバー間の **WebSocket プロトコル仕様** を定義する。
（HTTP エンドポイント仕様ではないが、通信インターフェース仕様として `api.md` を使用する）

## 目的・割り切り

- 友達同士で遊ぶ前提なので **不正耐性は低め（最小）**
- ただし同期崩壊を避けるため、**順序（seq）** と **手番（turn）** は守る
- HTTP API は作らない（ルームIDはURLで固定 or クエリで渡す）
- 切断復帰は `WELCOME` だけでなく、**`RESYNC_REQUEST` / `SYNC`** でも復旧可能

---

## 接続

WebSocket:
- wss://<your-domain>/ws/rooms/{roomId}?playerId=player1&name=Lia

※ playerId は固定文字列でもOK（例: p1 / p2）
※ name は表示名用（任意）

---

## サーバー（DO）の最小責務

- ルーム状態を保持（盤面/手番/seq）
- 受け取った操作を **順序付けしてEVENTとして全員に配信**
- 最低限の整合性チェック：
  - 手番でないプレイヤーの操作は `REJECT`
  - `expectedTurn` 不一致は `REJECT(TURN_MISMATCH)`
- クライアントが欠損した場合に `SYNC` でスナップショット再同期

---

## メッセージフロー（リクエスト/レスポンス）

### 1) 入室・初期同期

- Request: `HELLO`（クライアント → サーバー）
  - 入室宣言
- Response: `WELCOME`（サーバー → クライアント）
  - 現在の全状態を返す（初期同期）

### 2) ゲーム操作

- Request: `INTENT`（クライアント → サーバー）
  - 「やりたい操作」を送る（最小: `Move` / `EndTurn`）
- Response（成功）: `EVENT`（サーバー → 全クライアント）
  - サーバー確定イベント（必ず `seq` 付き）
- Response（失敗）: `REJECT`（サーバー → 要求元クライアント）
  - 整合性エラー（例: `TURN_MISMATCH`）

### 3) 再同期

- Request: `RESYNC_REQUEST`（クライアント → サーバー）
  - `fromSeq` を添えて再同期要求
- Response: `SYNC`（サーバー → クライアント）
  - 完全スナップショット（`seq` と `state`）

### 4) 管理操作

- Request: `ADMIN`（クライアント → サーバー）
  - `action: "DESTROY_ROOM"` でルーム状態を初期化し、接続中ソケットを全切断

---

## メッセージ定義（参照）

- `HELLO`: 入室宣言
- `WELCOME`: 初期同期状態
- `INTENT`: クライアント操作
- `EVENT`: サーバー確定イベント（`seq` 付き）
- `REJECT`: 操作拒否（整合性エラー）
- `RESYNC_REQUEST`: 再同期要求（`fromSeq`）
- `SYNC`: 再同期用スナップショット
- `ADMIN`: 管理メッセージ

---

## クライアント実装ルール（最小）

- 接続したら `HELLO`
- `WELCOME` で初期化
- `EVENT` は `seq` が連番のときのみ適用
- 欠損検知時は `RESYNC_REQUEST` を送り、`SYNC` で state/seq を置換

---

## 実装状況メモ（現時点）

- 実装ファイル
  - backend: `packages/backend/src/ws.ts`, `packages/backend/src/room.ts`
  - frontend: `packages/frontend/src/reducer.ts`
- E2E確認
  - `npm run e2e:smoke`
  - `WELCOME -> EVENT` と `REJECT`、`EVENT欠損 -> SYNC復旧` を確認
