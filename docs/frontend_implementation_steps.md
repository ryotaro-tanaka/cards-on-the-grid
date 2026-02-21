# Frontend実装ステップ（実行可能な粒度）

この文書は、`docs/spec.md` / `docs/api.md` / `docs/progress_report.md` を前提に、
未完成の frontend 実装を「1〜2日単位で実行できる」粒度に分解した作業計画。

## ゴール（この計画の完了条件）

- 7x7 盤面で駒の状態が可視化される
- `HELLO -> WELCOME -> INTENT -> EVENT/SYNC/REJECT` の一連の体験が UI で完結する
- 非手番時に操作不能、`REJECT` 理由がユーザーに表示される
- 勝敗・終了状態が画面で確認できる

---

## フェーズ0: 現状把握と土台整備

### Step 0-1. frontendエントリの確認
- `packages/frontend/src/index.ts` の責務を確認し、
  「接続管理」「状態管理」「描画」を最低3モジュールへ分離する方針を決める。
- 先に分離方針（ファイル名レベル）だけ決め、実装は次ステップで行う。

**完了条件**
- どこに何を書くかを README か docs にメモできる状態。

### Step 0-2. reducerの入出力境界を固定
- 既存 `packages/frontend/src/reducer.ts` の状態型を整理し、
  以下を state に含める:
  - 接続状態（connecting/open/closed）
  - 自分の seat（`you`）
  - `seq`
  - 直近エラー（`REJECT` reason）
- Action 型を API メッセージ種別に合わせる（`WELCOME`, `EVENT`, `SYNC`, `REJECT`）。

**完了条件**
- reducer単体で「メッセージ受信時の状態遷移」が追える。

---

## フェーズ1: 通信レイヤーの完成

### Step 1-1. WebSocketクライアントを独立モジュール化
- `connect(roomId, playerId)` と `sendIntent(command, expectedTurn)` の最小APIを作る。
- `onopen` で `HELLO` を送る。

**完了条件**
- UI層は「接続関数を呼ぶだけ」で通信が開始する。

### Step 1-2. 受信メッセージのバリデーションと振り分け
- 受信JSONを型ガードで判定して reducer に流す。
- 不明メッセージは警告ログのみ（クラッシュさせない）。

**完了条件**
- `WELCOME/EVENT/SYNC/REJECT` の受信で UI 状態が更新される。

### Step 1-3. 欠番検知時の再同期導線
- `EVENT.seq !== currentSeq + 1` のとき `RESYNC_REQUEST(fromSeq=currentSeq)` を送信。
- 再同期中フラグを立て、UIに「再同期中」を出す。

**完了条件**
- 欠番時に黙って止まらず復旧処理へ入る。

---

## フェーズ2: 盤面UI（最小）

### Step 2-1. 7x7グリッド表示
- 盤面コンポーネントを作り、座標つき 7x7 セルを描画。
- 駒があるセルには owner と kind が判別できる表示を出す。

**完了条件**
- `WELCOME/SYNC` の state を見て初期配置が視認できる。

### Step 2-2. 選択・移動入力（Move intent）
- 自分の駒のみ選択可能にする。
- 選択中に移動先セルをクリックで `Move` intent を送信。

**完了条件**
- 自分の手番かつ自駒なら Move を送信できる。

### Step 2-3. ターンエンド入力（EndTurn intent）
- 「ターン終了」ボタンを配置。
- 自分の手番でのみ有効化。

**完了条件**
- `EndTurn` intent を送れ、`EVENT` で表示が更新される。

---

## フェーズ3: ゲーム状態UI

### Step 3-1. ルーム状態と手番の表示
- `roomStatus(waiting/started/finished)` を表示。
- `activePlayer` と `turn` を常時表示。

**完了条件**
- 観戦者・待機中・対戦中の違いが一目でわかる。

### Step 3-2. 操作可能条件の統一
- UI上の全操作を `canAct = roomStatus==='started' && you===activePlayer` で統一制御。
- 非手番時はボタン無効化＋補助メッセージ表示。

**完了条件**
- 非手番では操作できない。

### Step 3-3. REJECT理由表示
- `REJECT.payload.reason` を通知領域に表示。
- `TURN_MISMATCH` など主要理由は人間向け文言に変換する。

**完了条件**
- なぜ失敗したかがUIでわかる。

---

## フェーズ4: 終了状態と品質

### Step 4-1. 勝敗表示
- `GameFinished` 後（または `roomStatus=finished`）に勝者表示と操作停止。

**完了条件**
- 試合終了をユーザーが認識できる。

### Step 4-2. 接続断/再接続表示
- close/errorで状態表示を切り替え。
- 再接続ボタン（同じ roomId/playerId で再接続）を提供。

**完了条件**
- 接続問題時に復帰操作ができる。

### Step 4-3. e2e smokeをUI観点で追加
- 既存 smoke に以下を追加:
  - 盤面初期表示
  - Move/EndTurn が交互に成立
  - REJECT 表示

**完了条件**
- 最低1本のUIフローが自動で検証される。

---

## 実行順（推奨）

1. フェーズ0（半日）
2. フェーズ1（半日〜1日）
3. フェーズ2（1日）
4. フェーズ3（半日〜1日）
5. フェーズ4（半日）

合計: 約3〜4日（1人実装想定）

---

## 最初の1スプリントで着手すべき最小セット

- Step 0-2
- Step 1-1
- Step 1-2
- Step 2-1
- Step 2-2
- Step 2-3
- Step 3-1

これで「対戦可能な最低限UI」が成立し、残りは品質・体験改善に集中できる。
