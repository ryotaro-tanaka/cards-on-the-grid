# 進捗レポート

## ロードマップ（現ゴール）

0. PWAで実装する。
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

## 全体進捗サマリ（2026-02-21 15:00更新 / UTC）

- **達成済み（基盤）**: WebSocket入室、`INTENT` 受付、`EVENT/REJECT/SYNC` 配信、`seq` 順適用、通しe2e smoke整備
- **達成済み（core主要機能）**: Creature種別/ステータス、Move検証強化、自動戦闘、死亡時補充キュー、補充召喚、勝敗確定、終局後reject
- **進捗更新（frontend）**: フェーズ0〜4の状態管理/通信/UI ViewModel/再同期/再接続/終了表示ロジックは実装済み（モジュール・テストベース）
- **未達成（frontend最終段）**: React + Cloudflare Pages の実画面実装・ルーティング・入力イベント配線・本番デプロイ導線
- **注意点（仕様差分）**:
  - 補充位置は「自陣地内の決定的先頭空きマス」（任意配置ではなく暫定）

---

## ロードマップ項目ごとの進捗

| # | ゴール | 進捗 | 現状メモ |
|---|---|---|---|
| 1 | Ameba/Goblin/Soldier のみ対応 | 達成 | `CreatureKind` / `CreatureStats` / 初期3体構成を実装済み |
| 2 | カード未実装 | 達成 | Card 型・カード処理は未実装（スコープ外） |
| 3 | 2人入室 | 達成 | `HELLO` で seat(`p1/p2`) を確定し、それ以外は reject |
| 4 | ゲーム開始 | 達成 | `waiting -> started` を明示管理し、started 前 INTENT は reject |
| 5 | 先後ランダム | 達成 | 開始時に activePlayer をランダム決定（同一ゲーム中は固定） |
| 6 | ターンプレイヤーが操作可能 | 達成（カード外スコープ） | Move検証 + 自動戦闘 + 移動権制限を実装 |
| 7 | ターンエンド | 達成 | `EndTurn` でターン進行イベントを生成 |
| 8 | ターン交代 | 達成 | 手番交代 + 補充召喚フェイズ処理を実行 |
| 9 | 勝利条件で終了 | 達成 | 仕様通り「相手初期陣地への侵入」で `GameFinished` |

---

## 観点別進捗（core / backend / frontend）

### core

**完成しているもの（カード処理を除く）**
- `Move` / `EndTurn` の Intent 型
- クリーチャー種別とステータス（Ameba/Goblin/Soldier）
- Move妥当性検証（手番、所有、範囲、距離、重複、フェイズ、終局、移動権）
- 自動戦闘（移動先敵への一方攻撃）
- 死亡処理と補充待ち管理（successor cost）
- ターン進行時の補充召喚
- 勝敗確定と終局状態（`GameFinished` / `status=Finished`）
- `applyCommand` 出力イベントの `applyEvent` リプレイ一致テスト

**未完成/暫定のもの**
- カード処理（スコープ外）
- 補充位置のプレイヤー選択（現状は決定的配置）
- （該当なし）

### backend

**完成しているもの**
- Durable Object ベースの room 管理
- WebSocket メッセージ処理（`WELCOME`, `INTENT`, `EVENT`, `REJECT`, `RESYNC_REQUEST`, `SYNC`, `ADMIN`）
- `expectedTurn` とルール検証結果による reject
- `seq` 採番と event 配信
- 欠損時の差分再送（履歴あり）+ `SYNC` fallback（履歴不足）

**未完成のもの**
- 勝敗確定/終了通知のUI向け最終整理（frontend 連携）

### frontend

**完成しているもの**
- `WELCOME` / `EVENT` / `SYNC` / `REJECT` の受信反映 reducer
- `seq` 欠損時の `RESYNC_REQUEST` 導線を含む通信クライアント
- 7x7盤面の ViewModel、駒選択、`Move` / `EndTurn` INTENT 生成
- ルーム状態・ターン状態・REJECT理由・接続状態・終了状態（勝敗）の表示用 ViewModel
- 再接続 API（同一 roomId/playerId）
- frontend unit / e2e smoke での基礎検証

**未完成のもの**
- React コンポーネント実装（実DOM描画、クリックハンドラ、ボタンUI）
- Cloudflare Pages 向けのビルド/配信設定と本番デプロイ検証
- 実ブラウザ上での対戦操作フローのE2E（2クライアント接続・操作）
- PWAとしての配布要件（manifest / service worker / install導線）

---

## Coreは完了？

**結論**: **カード処理を除く現在スコープでは「ほぼ完了（実装完了）」**。  
ただし、補充配置は暫定仕様のため、最終仕様確定後の微調整余地がある。

---

## 直近の優先実装

1. frontendロジックを React 実画面へ接続（盤面クリック/ターン終了/通知表示）
2. Cloudflare Pages へデプロイ可能な構成（build設定・環境変数・配信確認）
3. 2クライアントでの実ブラウザE2Eを追加（入室〜終了まで）
4. core の補充配置仕様を最終仕様に合わせて調整
