# WebSocketだけで動く簡易API仕様（友達用 / 不正耐性0）

## 目的・割り切り

- 友達同士で遊ぶ前提なので **不正耐性は0**
- ただし同期崩壊を避けるため、**順序（seq）** と **手番（turn）** だけは最低限守る
- HTTP APIは作らない（ルームIDはURLで固定 or クエリで渡す）
- 切断復帰は「入り直してWELCOMEを受け取る」でOK（当面SYNCなし）

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
  - 手番でないプレイヤーの操作は無視（またはREJECT、ただし最小版ではREJECTなし）

---

## サーバー側の状態（例）

json
{
  "roomId": "aaa",
  "players": ["p1", "p2"],
  "turn": { "owner": "p1", "turnNo": 1 },
  "seq": 0,
  "board": {
    "pieces": {
      "koma1": { "pos": "A1" },
      "koma2": { "pos": "B3" }
    }
  }
}

---

# メッセージ仕様（最小：4種類だけ）

## 1) HELLO（クライアント → サーバー）
入室宣言。これを受けたらサーバーはWELCOMEを返す。

json
{
  "type": "HELLO",
  "payload": {
    "playerId": "p1",
    "name": "Lia"
  }
}

---

## 2) WELCOME（サーバー → クライアント）
現在の全状態を返す（初期同期）。切断したら再接続してこれを再取得する。

json
{
  "type": "WELCOME",
  "payload": {
    "roomId": "aaa",
    "you": "p1",
    "players": ["p1", "p2"],
    "turn": { "owner": "p1", "turnNo": 1 },
    "seq": 0,
    "board": {
      "pieces": {
        "koma1": { "pos": "A1" },
        "koma2": { "pos": "B3" }
      }
    }
  }
}

---

## 3) INTENT（クライアント → サーバー）
「やりたい操作」だけ送る。盤面全量は送らない。

### 3-A) MOVE
json
{
  "type": "INTENT",
  "payload": {
    "kind": "MOVE",
    "who": "p1",
    "turnNo": 1,
    "pieceId": "koma1",
    "to": "A2"
  }
}

### 3-B) END_TURN
json
{
  "type": "INTENT",
  "payload": {
    "kind": "END_TURN",
    "who": "p1",
    "turnNo": 1
  }
}

---

## 4) EVENT（サーバー → 全クライアント）
サーバーが確定した操作ログ。必ず seq を付与して全員に配信（送信者にも返す）。

### 4-A) MOVE
json
{
  "type": "EVENT",
  "payload": {
    "seq": 1,
    "kind": "MOVE",
    "who": "p1",
    "turnNo": 1,
    "pieceId": "koma1",
    "to": "A2"
  }
}

### 4-B) END_TURN
json
{
  "type": "EVENT",
  "payload": {
    "seq": 2,
    "kind": "END_TURN",
    "who": "p1",
    "turnNo": 1,
    "nextTurn": { "owner": "p2", "turnNo": 2 }
  }
}

---

# クライアント実装ルール（最小）

- 接続したら HELLO を送る
- WELCOME を受け取ったら、その状態で初期化する
- EVENT を受け取ったら、seq順に適用して盤面を更新する
- 自分の手番でないときはINTENTを送らない（UIで無効化）

---

# サーバー実装ルール（最小）

- HELLO を受けたら WELCOME を返す
- INTENT を受けたら以下を行う
  1) そのプレイヤーが手番か確認（違えば無視）
  2) （任意）簡単な妥当性チェック（座標形式など）
  3) サーバー状態を更新（board/turn）
  4) seq++ した EVENT を全員へ送る

---

## MVPの割り切り（この文書の前提）

- 参加/退出通知、REJECT、再同期（SYNC）は後回し
- 落ちたら入り直して WELCOME で復帰
- まず MOVE と END_TURN の2操作だけで縦切りする
