# Core実装サマリと利用想定

## Coreの実装サマリ（カード処理除く）

`packages/core` は、以下を純粋関数で提供する。

- Intent検証（`validateIntent`）
  - 手番、フェイズ、移動距離、移動権、重複、終局後操作を検証
- Event生成（`applyCommand`）
  - `Move` / `EndTurn` から `Event[]` を生成
  - 自動戦闘、死亡、補充召喚、勝敗確定までをイベント列で表現
- Event適用（`applyEvent`）
  - `Event` を順次適用して次状態を構築
- 初期状態生成（`createInitialState`）
  - Ameba/Goblin/Soldier の初期配置と基礎ステータスを生成

## backendでの利用想定

backend（Durable Object）は `core` を **authoritative state machine** として使用する。

1. `INTENT` 受信
2. backendが `expectedTurn` 等の外側検証
3. `core.applyCommand(currentState, command)` 実行
4. 戻り値の `events` に `seq` を付与し配信
5. `state` をDOの現在状態として保持

要点:
- ルール判定は `core` に集約
- backendは「順序・認可・配信」を担当

## frontendでの利用想定

frontend はサーバー確定イベントを `core` と同等の遷移規則で反映する。

1. `WELCOME` / `SYNC` で state を置換
2. `EVENT` を `seq` 連番でのみ適用
3. 必要に応じて `core.applyEvent` 相当のロジックで画面状態を更新

要点:
- frontendは確定済みイベントを表示に反映
- 不正判定や最終状態確定はbackend + coreが責務

