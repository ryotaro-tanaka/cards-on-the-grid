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
※ `HELLO.payload.playerId` は任意。未指定または不正値の場合、空席が `p1` → `p2` の順で自動割り当てされる。
※ 接続URLの `playerId` クエリは任意で、seat確定には使用しない。
※ 同一 `playerId` の再接続は許可され、既存接続は `RECONNECTED` として切断される。
※ seat未確定の接続からの `INTENT` は `REJECT(reason=SEAT_UNASSIGNED)`。

---

## サーバー（DO）の最小責務

- ルーム状態を保持（盤面/手番/seq）
- 受け取った操作を **順序付けしてEVENTとして全員に配信**
- 最低限の整合性チェック：
  - 手番でないプレイヤーの操作は `REJECT`
  - `expectedTurn` 不一致は `REJECT(TURN_MISMATCH)`
- クライアントが欠損した場合に、履歴があれば `EVENT` 差分再送、履歴不足時は `SYNC` でスナップショット再同期

---

## メッセージフロー（リクエスト/レスポンス）

### 0) ルーム状態遷移

- `waiting`: 0〜1人がseat確定している状態
- `started`: 2人のseatが確定し、先手がランダム決定された状態（この時点から `INTENT` を受理）
- `finished`: 終局後状態

### 1) 入室・初期同期

- Request: `HELLO`（クライアント → サーバー）
- Response: `WELCOME`（サーバー → クライアント）
- `HELLO` は同一接続で再送しても冪等（同じseatなら `WELCOME` 再送）
- 2人のseatが揃うと、`WELCOME.payload.roomStatus=started` とランダム決定された `state.activePlayer` が反映される

### 2) ゲーム操作

- Request: `INTENT`（クライアント → サーバー）
- Response（成功）: `EVENT`（サーバー → 全クライアント）
- Response（失敗）: `REJECT`（サーバー → 要求元クライアント）

### 3) 再同期

- Request: `RESYNC_REQUEST`（クライアント → サーバー）
- Response: `fromSeq` 以降の欠番が履歴に残っていれば `EVENT` 差分再送、残っていなければ `SYNC`（スナップショット）

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

自動割り当てを使う場合は `playerId` を省略できる。

```json
{
  "type": "HELLO",
  "payload": {}
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
    },
    "roomStatus": "waiting"
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

`reason` は実装上、`packages/backend/src/ws.ts` の `REJECT_REASONS` と一致し、以下を取りうる：
- `TURN_MISMATCH`
- `NOT_ACTIVE_PLAYER`
- `PIECE_NOT_FOUND`
- `PIECE_NOT_OWNED_BY_ACTOR`
- `OUT_OF_BOUNDS`
- `GAME_ALREADY_FINISHED`
- `PHASE_MISMATCH`
- `INVALID_MOVE_DISTANCE`
- `SAME_POSITION`
- `CELL_OCCUPIED`
- `MOVE_ALREADY_USED_THIS_TURN`
- `ROOM_FULL`
- `SEAT_UNASSIGNED`
- `INVALID_PLAYER_ID`

### RESYNC_REQUEST（Request）

```json
{
  "type": "RESYNC_REQUEST",
  "payload": {
    "fromSeq": 10
  }
}
```

### SYNC（Response: 履歴不足時のスナップショット）

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
    },
    "roomStatus": "started"
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
- 欠損検知時は `RESYNC_REQUEST` を送る
- `fromSeq === 最新seq` なら返信は空（追加同期不要）
- `fromSeq` 以降が履歴に残っていれば欠番 `EVENT` が返るため順次適用
- 履歴不足または不正な `fromSeq`（最新seqより大きい等）の場合のみ `SYNC` で state/seq を置換

---

## 実装状況メモ（現時点）

- 実装ファイル
  - backend: `packages/backend/src/ws.ts`, `packages/backend/src/room.ts`
  - frontend: `packages/frontend/src/reducer.ts`
- E2E確認
  - `npm run e2e:smoke`
  - `WELCOME -> EVENT` と `REJECT`、`EVENT欠損 -> EVENT差分復旧`、履歴不足時 `SYNC` fallback を確認
