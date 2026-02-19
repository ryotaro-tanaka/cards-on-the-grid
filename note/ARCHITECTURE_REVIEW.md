# 現在地点と次実装の検討（README / note整合版）

## 1. README・`note/` との整合チェック

### 整合している点

- 実装が最小縦切り（`Move` / `EndTurn` 中心）である点は、READMEの「全仕様」と比較して未実装範囲が広い前提と整合。
- authoritative server で手番・順序を管理する方針は、`note/IMPLEMENTATION_REVIEW.md` の推奨方針と整合。

### 以前との差分（今回対応）

- 以前は `seq` 欠損時の復旧が未実装だった。
- 今回、`RESYNC_REQUEST` / `SYNC` を追加し、欠損後にスナップショット復旧できるようにした。
- これに合わせて「再接続はWELCOMEのみ」という古い運用前提から、`SYNC` を使った追従運用へ更新した。

---

## 2. 現在地点サマリ

### 実装済みの縦切り

- `core`
  - command 検証（`validateIntent`）
  - event 生成（`applyCommand`）
  - event 適用（`applyEvent`）
- `backend`
  - ルーム状態（`roomId` / `seq` / `game`）管理
  - `TURN_MISMATCH` / validation reject
  - `RESYNC_REQUEST` に対する `SYNC` 応答
- `frontend`
  - `WELCOME` で初期化
  - `EVENT` は連番のみ適用
  - `SYNC` で state/seq を置換

### 現在の最小プロトコル

- Client -> Server
  - `INTENT { expectedTurn, command }`
  - `RESYNC_REQUEST { fromSeq }`
- Server -> Client
  - `WELCOME { roomId, you, seq, state }`
  - `EVENT { seq, event }`
  - `REJECT { reason, expectedTurn }`
  - `SYNC { seq, state }`

---

## 3. 動作確認済みフロー（e2e smoke）

1. `WELCOME` 適用
2. `EndTurn` 受理 -> `EVENT(seq=1)` 適用
3. stale turn -> `REJECT(TURN_MISMATCH)`
4. 手番外 actor -> `REJECT(NOT_ACTIVE_PLAYER)`
5. `EVENT` 欠損を作る -> `RESYNC_REQUEST` -> `SYNC` 適用で復旧

---

## 4. 次に実装すべき項目（更新後）

### P1: 仕様未確定点の固定

1. 補充召喚で置けない場合
2. 手札上限超過時の処理
3. 地雷の公開/非公開と同時発動順
4. 「前」「前前」「2マス前進」の向き定義

### P2: フェイズ進行の明示化

- `GameState` に phase 導入
- phase 制約に基づく command validation
- `INVALID_PHASE` の reject 追加

### P3: ルール拡張の最小セット

- 移動時の自動攻撃
- 死亡判定
- 1種類のダメージカード（`Arrowrain`）
- 「1 command -> 複数 event」前提への拡張

---

## 5. 維持したい設計原則

- ルール真実源は `core`。
- `backend` は順序・認可・配信に集中。
- `frontend` は `EVENT/SYNC` を最終確定として扱う。
- 機能追加時は `scripts/e2e-smoke.mjs` で縦切り回帰を確認する。
