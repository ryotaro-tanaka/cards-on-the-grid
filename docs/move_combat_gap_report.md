# 移動・戦闘仕様と現行実装のギャップ調査

## 調査対象
- 仕様: `docs/game_rules.md` の「移動と攻撃」「戦闘解決」
- 実装: `packages/core/src/validateIntent.ts` / `packages/core/src/applyCommand.ts` / `scripts/core-unit.mjs`

## 結論（要約）
現行実装の戦闘は **「移動先マスに敵がいる場合のみ発生」** であり、仕様にある **「移動後の前方射程判定で自動攻撃」** とは一致していない。

---

## 仕様（期待挙動）
`docs/game_rules.md` では次を定義している。

1. 攻撃判定は移動後位置を基準に自動判定
2. 通常は前方1マス、Lancer は前方2マスを攻撃
3. 攻撃条件は前方射程に敵を捉えることで、移動先占有は条件でない

---

## 実装（現挙動）

### 1) 戦闘トリガー条件が「移動先一致」になっている
`applyCommand.ts` では防御側検索が `intent.to` と一致する敵駒に限定されている。

```ts
const defender = state.pieces.find(
  (piece) =>
    piece.owner !== command.actorPlayerId &&
    piece.position.x === intent.to.x &&
    piece.position.y === intent.to.y,
);
```

このため、移動先に敵がいないと `PieceMoved` のみが発行される。

### 2) 「敵マスへの移動」を許可している
`validateIntent.ts` は味方重複のみ禁止で、敵重複は許可している。

```ts
const occupiedByAlly = state.pieces.some(/* ... */);
if (occupiedByAlly) return { ok: false, reason: 'CELL_OCCUPIED' };
```

結果として「攻撃するには敵のいるマスに進入する」実装になっている。

### 3) Lancer の前方2マス攻撃が未実装
`applyCommand.ts` にクリーチャー種別ごとの射程分岐がなく、全員同一の「移動先一致」判定のみ。

### 4) テストも現仕様（移動先一致）を前提
`scripts/core-unit.mjs` の「移動による自動戦闘」テストは、攻撃側を敵がいる座標へ直接移動させるケースのみを検証している。

---

## 再現結果（依頼ケース）

再現コマンドで以下を確認した。

- ケースA: `p2 Ameba (3,4) -> (3,3)`
  - イベント: `PieceMoved` のみ
  - `p1 Goblin (3,2)` のHP: 2のまま（減らない）
- ケースB: 次ターンに `p2 Ameba (3,3) -> (3,2)`
  - イベント: `CombatResolved`
  - Goblin HP: 2 → 1

すなわち、依頼された「(3,3) で自動攻撃してHP-1」は現行実装では発生しない。

---

## ギャップ一覧

1. **攻撃判定軸の差**
   - 仕様: 移動後の前方射程
   - 実装: 移動先マスの敵有無
2. **重複ルール運用の差**
   - 仕様: `Creature × Creature` 不可（常時）
   - 実装: 敵マス侵入を許可（味方のみ禁止）
3. **Lancer 射程の差**
   - 仕様: 前方2マス同時攻撃
   - 実装: 未実装
4. **テスト観点の差**
   - 仕様準拠ケース（移動後前方攻撃）がテストにない
   - 現実装準拠ケース（敵マス進入戦闘）のみ

