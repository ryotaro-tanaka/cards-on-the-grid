# 現在地点と次実装の検討（2026-02時点）

## 1. 現在地点サマリ

### 実装済みの縦切り

- モノレポ構成（`core` / `backend` / `frontend`）で project references を分離。
- `core` に最小ルールエンジンを集約。
  - command 検証（`validateIntent`）
  - event 生成（`applyCommand` 内 `buildEvent`）
  - event 適用（`applyEvent`）
- `backend` で authoritative 処理を実装。
  - ルーム状態（`roomId` / `seq` / `game`）
  - `expectedTurn` チェック（`TURN_MISMATCH`）
  - core 側 validation 理由の透過返却
- `frontend` reducer で read model 同期を実装。
  - `WELCOME` で初期化
  - `EVENT` は `seq` 連番のみ受理（欠損時は適用しない）

### いま成立しているプロトコル

- Client -> Server
  - `INTENT { expectedTurn, command }`
- Server -> Client
  - `WELCOME { roomId, you, seq, state }`
  - `EVENT { seq, event }`
  - `REJECT { reason, expectedTurn }`

### 動作確認済みフロー（スモーク）

- `WELCOME` 適用
- `EndTurn` 受理 -> `EVENT(seq=1)` 配信
- 古い turn の送信 -> `REJECT(TURN_MISMATCH)`
- 手番外 actor -> `REJECT(NOT_ACTIVE_PLAYER)`

---

## 2. 現状アーキテクチャ評価

結論：**MVPとして妥当**。

- 良い点
  - ルール判定の単一責務が `core` に寄っており、二重実装リスクが低い。
  - server authority を維持しつつ、frontend は event 適用のみで追従できる。
  - `seq` 採番が導入済みで、将来の再送・再接続設計に接続しやすい。
- 制約（まだ未実装）
  - 欠損 `seq` の回復手段（`SYNC` / snapshot）がない。
  - ゲームルールは最小（`Move` / `EndTurn`）のみ。
  - 永続化・再起動耐性・複数接続の部屋管理は未整備。

---

## 3. 次に実装すべき項目（優先順）

以下を「成立性を壊さない順」で進めるのが安全。

### P0: 再接続同期（最優先）

**目的**：`seq` 欠損でクライアントが停止しないようにする。

- 追加メッセージ案
  - Client -> Server: `RESYNC_REQUEST { fromSeq }`
  - Server -> Client: `SYNC { seq, state }`（完全スナップショット）
- 最小方針
  - まずは差分再送ではなく **snapshot 一発同期** を実装。
  - frontend reducer は `SYNC` を受けたら state/seq を置換。
- 受け入れ条件
  - 意図的に `EVENT` を1件落としても `SYNC` 後に復旧可能。

### P1: 仕様未確定点の固定（実装前に決める）

**目的**：後戻りを減らし、`core` API を安定化。

最低限、次を仕様化してからカード効果を増やす。

1. 補充召喚で置けない場合の処理
2. 手札上限超過時の処理
3. 地雷の公開/非公開と同時発動時処理
4. 「前」「前前」「2マス前進」の向き定義

### P2: フェイズ進行の明示化

**目的**：現状の `EndTurn` 単体モデルから、仕様書のターン構造へ寄せる。

- `GameState` に phase を導入（例：`'Reinforce' | 'Draw' | 'Main' | 'End'`）
- command バリデーションで phase 制約を掛ける
- server reject 理由に `INVALID_PHASE` を追加

### P3: ルール拡張の最小セット

**目的**：ゲーム性が出る最小ラインまで拡張。

- 先行実装候補
  - 戦闘解決（移動時自動攻撃）
  - 死亡判定
  - 1種類のダメージカード（例：`Arrowrain`）
- 設計ポイント
  - 「1 command -> 複数 event」前提へ拡張（damage/death/draw など）

---

## 4. 実装順の提案（2スプリント想定）

### Sprint A（安定化）

1. `SYNC` / `RESYNC_REQUEST` 追加
2. frontend reducer の `SYNC` 対応
3. e2e smoke に「欠損 seq -> sync 復旧」ケース追加

### Sprint B（ルール拡張）

1. phase 導入 + `INVALID_PHASE`
2. 戦闘/死亡 event 追加
3. 1カード実装（`Arrowrain`）

---

## 5. 実装時のガイドライン（維持したい原則）

- ルール真実源は常に `core`。
- backend は「順序・認可・配信」の責務に限定。
- frontend は「投機表示しても、最終確定は `EVENT/SYNC` で上書き」の姿勢を維持。
- 新機能追加時は `scripts/e2e-smoke.mjs` に最低1ケース追加し、縦切りで壊れていないことを確認する。

