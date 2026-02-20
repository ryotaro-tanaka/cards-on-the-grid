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
※ 実装上、プレイヤー識別は接続URLの `playerId` クエリを使用する（`HELLO.payload.playerId` は現状ルーティングには未使用）。

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

- 接続直後: `WELCOME`（サーバー → クライアント）
- Request: `HELLO`（クライアント → サーバー）
- Response: `WELCOME`（サーバー → クライアント、再送）

### 2) ゲーム操作

- Request: `INTENT`（クライアント → サーバー）
- Response（成功）: `EVENT`（サーバー → 全クライアント）
- Response（失敗）: `REJECT`（サーバー → 要求元クライアント）

### 3) 再同期

- Request: `RESYNC_REQUEST`（クライアント → サーバー）
- Response: `SYNC`（サーバー → クライアント）

### 4) 管理操作

- Request: `ADMIN`（クライアント → サーバー）

---

## 実メッセージ例（実装準拠）

以下は `packages/backend/src/ws.ts` と `packages/core/src/types.ts` の型定義に合わせたJSON例。

### HELLO（Request）

```json
{
  "type": "HELLO",
  "payload": {
    "playerId": "p1"
  }
}
```

### WELCOME（Response）

```json
{
  "type": "WELCOME",
  "payload": {
    "roomId": "room-1",
    "you": "p1",
    "seq": 0,
    "state": {
      "turn": 1,
      "players": ["p1", "p2"],
      "activePlayer": "p1",
      "pieces": [
        { "id": "p1_1", "owner": "p1", "position": { "x": 0, "y": 0 } },
        { "id": "p2_1", "owner": "p2", "position": { "x": 6, "y": 6 } }
      ]
    }
  }
}
```

### INTENT（Request: Move）

```json
{
  "type": "INTENT",
  "payload": {
    "expectedTurn": 1,
    "command": {
      "actorPlayerId": "p1",
      "intent": {
        "type": "Move",
        "pieceId": "p1_1",
        "to": { "x": 2, "y": 2 }
      }
    }
  }
}
```

### INTENT（Request: EndTurn）

```json
{
  "type": "INTENT",
  "payload": {
    "expectedTurn": 1,
    "command": {
      "actorPlayerId": "p1",
      "intent": {
        "type": "EndTurn"
      }
    }
  }
}
```

### EVENT（Response: PieceMoved）

```json
{
  "type": "EVENT",
  "payload": {
    "seq": 1,
    "event": {
      "type": "PieceMoved",
      "pieceId": "p1_1",
      "from": { "x": 0, "y": 0 },
      "to": { "x": 2, "y": 2 }
    }
  }
}
```

### EVENT（Response: TurnEnded）

```json
{
  "type": "EVENT",
  "payload": {
    "seq": 2,
    "event": {
      "type": "TurnEnded",
      "nextTurn": {
        "owner": "p2",
        "turnNo": 2
      }
    }
  }
}
```

### REJECT（Response）

```json
{
  "type": "REJECT",
  "payload": {
    "reason": "TURN_MISMATCH",
    "expectedTurn": 2
  }
}
```

`reason` は実装上、以下を取りうる：
- `TURN_MISMATCH`
- `NOT_ACTIVE_PLAYER`
- `PIECE_NOT_FOUND`
- `PIECE_NOT_OWNED_BY_ACTOR`
- `OUT_OF_BOUNDS`

### RESYNC_REQUEST（Request）

```json
{
  "type": "RESYNC_REQUEST",
  "payload": {
    "fromSeq": 10
  }
}
```

### SYNC（Response）

```json
{
  "type": "SYNC",
  "payload": {
    "seq": 12,
    "state": {
      "turn": 3,
      "players": ["p1", "p2"],
      "activePlayer": "p1",
      "pieces": []
    }
  }
}
```

### ADMIN（Request）

```json
{
  "type": "ADMIN",
  "payload": {
    "action": "DESTROY_ROOM"
  }
}
```

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
