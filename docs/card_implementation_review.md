# カード実装レビュー（2026-02-23）

## 結論

- カード11種（Move / Assault / Arrowrain / Rock Bombardment / Lightning / Recharge / Doping / Barrier / Breath / Mine / Stealing）は、**core / backend / frontend の主要フローに実装済み**。
- 実装状況は `docs/card_implementation_tasks.md` の完了チェックと整合し、実コード上でも Intent/Validation/Event/UI の各層で確認できる。
- ただし、既知制約として次の2点は残る。
  1. 補充召喚位置が「任意選択」ではなく「先頭空きマスの決定的選択」。
  2. backend/frontend の unit script は環境によって core import 解決に失敗する（本環境でも再現）。

## 実装確認サマリ

### 1) core（ルールの真実源）

- `CardKind` 11種、`UseCard` intent、カード関連イベント型（`CardUsed` / `CardDrawn` / `CardStolen` / `MinePlaced` など）を型定義済み。
- 初期手札3枚、ターン開始ドロー、手札上限5のランダム捨て→ドロー、64bit RNG、Stealingの乱数奪取を実装済み。
- カード別バリデーション（敵味方判定、陣地条件、Recharge対象制約、Stealing空手札不可）を実装済み。
- カード効果（移動/ダメージ/バフ/地雷/奪取）とイベント適用（手札更新・地雷処理・死亡時補充キュー）を実装済み。

### 2) backend（順序/認可/配信）

- `INTENT` で `UseCard` を受理し、validation失敗時はカード系理由を `REJECT` へ返却。
- `expectedTurn` 不一致時は `TURN_MISMATCH`。
- `WELCOME` / `SYNC` では相手手札をマスクして返却する処理を実装済み。
- `seq` 付きイベント配信と再同期（events replay / snapshot）を実装済み。

### 3) frontend（入力/表示）

- 手札 ViewModel、カード選択、クリック対象に応じた `UseCard` payload 生成を実装済み。
- Mine の配置可能マスハイライトを実装済み。
- カード系 `REJECT` 理由の表示文言を実装済み。
- reducer でカード系イベント（draw/use/steal/mine など）を反映済み。

## テスト観点レビュー

- `core-unit` はカード成功系/失敗系の網羅、RNG再現性、Mine踏破、Stealing、Move/Assault差分を含み、実行成功。
- `backend-unit` / `frontend-unit` はテスト項目自体はカードを含むが、実行時に `packages/core/src/index.js` 解決エラーで停止（既知制約と一致）。

## 総合評価（実装度）

- **機能実装度: 高（約90〜95%）**
  - ゲーム内カード挙動の主要要件は満たしている。
- **運用準備度: 中〜高**
  - テスト実行基盤のモジュール解決制約を解消すれば、リリース判定をより安定化できる。

## 推奨アクション（優先順）

1. backend/frontend unit script の import 経路を恒久修正（shim運用の脱却）。
2. 補充召喚を「任意選択」仕様へ拡張するか、現仕様を正式ルールとして確定。
3. e2e smoke の固定件数アサーションを必須イベント存在確認へ置換。
