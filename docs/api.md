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

## メッセージ仕様

### 1) HELLO（クライアント → サーバー）
入室宣言。これを受けたらサーバーは `WELCOME` を返す。

### 2) WELCOME（サーバー → クライアント）
現在の全状態を返す（初期同期）。

### 3) INTENT（クライアント → サーバー）
「やりたい操作」を送る。現在は最小で `Move` / `EndTurn`。

### 4) EVENT（サーバー → 全クライアント）
サーバーが確定したイベント。必ず `seq` 付き。

### 5) REJECT（サーバー → クライアント）
整合性エラーを返す（`TURN_MISMATCH` など）。

### 6) RESYNC_REQUEST（クライアント → サーバー）
`fromSeq` を添えて再同期要求する。

### 7) SYNC（サーバー → クライアント）
完全スナップショット（`seq` と `state`）を返す。

### 8) ADMIN（クライアント → サーバー）
管理メッセージ。`action: "DESTROY_ROOM"` を送ると、ルーム状態を初期化し、接続中の全ソケットを切断する。

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
