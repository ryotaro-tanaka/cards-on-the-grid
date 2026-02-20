# 進捗レポート

## ロードマップ（現ゴール）

1. クリーチャーは `game_rules.md` 記載のスキルなしクリーチャー（Ameba / Goblin / Soldier）のみ対応
2. カードは実装しない
3. 2人のプレイヤーが部屋に入室できる
4. ゲームを開始できる
5. 先行後攻はランダムに決まる
6. ターンプレイヤーはクリーチャーを操作できる（ゲームルール通り）
7. ターンエンドできる
8. 相手がターンエンドしたら自分のターンが始まる
9. 勝利条件を満たすとゲーム終了する（ゲームルール通り）

---

## 全体進捗サマリ（2026-02-20時点）

- **達成済み（基盤）**: WebSocket入室、`INTENT` 受付、`EVENT/REJECT/SYNC` 配信、ターン進行（EndTurn）
- **部分達成**: クリーチャー操作（現状は単純 Move のみ）
- **未達成**: 2人制の厳密運用、ランダム先行後攻、勝利条件、Ameba/Goblin/Soldier のルール反映

---

## ロードマップ項目ごとの進捗

| # | ゴール | 進捗 | 現状メモ |
|---|---|---|---|
| 1 | Ameba/Goblin/Soldier のみ対応 | 未着手 | 現在の `Piece` は `id/owner/position` のみで、HP/AT/successor cost や種別定義なし |
| 2 | カード未実装 | 達成 | Card 型・カード処理は未実装 |
| 3 | 2人入室 | 部分達成 | 入室自体は可能だが、最大2人の接続制限は未実装 |
| 4 | ゲーム開始 | 部分達成 | 接続時に初期状態を返し即開始に近い挙動。明示的な開始手順は未実装 |
| 5 | 先後ランダム | 未達成 | 初期状態は常に `activePlayer = p1` |
| 6 | ターンプレイヤーが操作可能 | 部分達成 | Move/EndTurn の基本検証あり。ゲームルール全体（戦闘/補充等）は未実装 |
| 7 | ターンエンド | 達成 | `EndTurn` で `TurnEnded` を生成 |
| 8 | ターン交代 | 達成 | `TurnEnded` で active player と turn 番号を更新 |
| 9 | 勝利条件で終了 | 未達成 | 勝敗判定・ゲーム終了状態の実装なし |

---

## 観点別進捗（core / backend / frontend）

### core

**完成しているもの**
- `Move` / `EndTurn` の Intent 型
- `validateIntent` による基本検証（手番、駒所有、盤面範囲）
- `applyCommand` による `PieceMoved` / `TurnEnded` の event 生成と state 反映

**未完成のもの**
- クリーチャー固有ステータス（HP/AT/successor cost）
- Ameba/Goblin/Soldier の具体ルール
- 戦闘処理・死亡処理・補充召喚
- カード処理
- 勝利条件判定

### backend

**完成しているもの**
- Durable Object ベースの room 管理
- WebSocket メッセージ処理（`WELCOME`, `INTENT`, `EVENT`, `REJECT`, `RESYNC_REQUEST`, `SYNC`, `ADMIN`）
- `expectedTurn` とルール検証結果による reject
- `seq` 採番と event 配信
- 欠損時の `SYNC` 再同期

**未完成のもの**
- 2人上限の厳密な入室制御
- 先後ランダム決定ロジック
- ゲーム開始プロトコル（ready/start など）
- 勝敗確定/終了通知

### frontend

**完成しているもの**
- `WELCOME` / `EVENT` / `SYNC` の受信反映 reducer
- `seq` 欠損時にイベントを適用しない安全側挙動

**未完成のもの**
- 7x7盤面UI・手札UI・開始UI などの体験層の完成
- 2人入室や開始状態の表示/制御
- 勝敗表示
- ゲームルールに沿った操作UI（現状仕様全体への追従）

---

## 直近の優先実装

1. `core` に Creature 定義（Ameba/Goblin/Soldier）と勝利条件を追加
2. `backend` に 2人制御 + 先後ランダム + 開始フローを追加
3. `frontend` に盤面/ターン/終了状態の最低限UIを実装
