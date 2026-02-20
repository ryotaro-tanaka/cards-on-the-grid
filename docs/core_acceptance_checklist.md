# Core 完了チェックリスト（手順10）

`core` を backend 接続前に「完了」と判断するための最小受け入れ条件。

## 判定項目

- [x] ルール由来の状態遷移が `applyCommand` だけで再現できる
  - Move/Combat/EndTurn/Reinforcement/Finish を `Event` 生成 + `applyEvent` 適用で完結
- [x] 主要分岐をテストで網羅
  - 正常系: 1マス移動・自動戦闘・死亡と補充・ターン遷移・勝敗確定
  - 異常系: 手番違反・移動距離違反・重複配置・終局後操作
- [x] `Event` から状態再構築できる
  - `events.reduce(applyEvent, initialState)` が `applyCommand` の `state` と一致する

## 実行コマンド

- `npm run test:core`
- `npm run e2e:smoke`

