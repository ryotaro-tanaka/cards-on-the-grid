# カード機能 QA チェックリスト（フェーズ6）

最終更新: 2026-02-23

## A. 共通

- [ ] 手番プレイヤーのみ `UseCard` を送信できる。
- [ ] 非手番 `UseCard` は `REJECT: NOT_ACTIVE_PLAYER` になる。
- [ ] `SYNC` 後に `turn / seq / hands / mines / pieces` が一致する。
- [ ] `WELCOME` / `SYNC` で相手手札がマスクされる。

## B. カード別成功ケース

- [ ] Move: 1マス移動し、攻撃イベントが出ない。
- [ ] Assault: 1マス移動し、攻撃イベントが出る。
- [ ] Arrowrain: 敵1体に1ダメージ。
- [ ] Rock Bombardment: 自陣地内の敵1体に2ダメージ。
- [ ] Lightning: 敵陣地内の敵1体に3ダメージ。
- [ ] Recharge: 使用済みアクティブスキルが未使用状態へ戻る。
- [ ] Doping: `+0/+1` が反映される。
- [ ] Barrier: `+1/+0` が反映される。
- [ ] Breath: `+1/+1` が反映される。
- [ ] Mine: 自陣地に設置でき、踏破でダメージ + 地雷除去。
- [ ] Stealing: 相手手札から1枚ランダムに奪取できる。

## C. カード別失敗ケース（REJECT）

- [ ] 手札にないカードIDを使用すると `CARD_NOT_FOUND_IN_HAND`。
- [ ] `cardId` と `cardKind` が不一致なら `CARD_KIND_MISMATCH`。
- [ ] 不正対象/範囲外は各カード対応の `TARGET_*` / `INVALID_CARD_*`。
- [ ] Stealing 対象が空手札なら `TARGET_PLAYER_HAND_EMPTY`。
- [ ] Mine を死守陣地/範囲外へ置こうとすると reject。

## D. 再現性

- [ ] 同一 seed + 同一イベント順で初期手札/ドロー/Stealing が再現する。
- [ ] seed 差分で手札系列が変わる。

## E. UI

- [ ] 手札表示でカード選択状態が視認できる。
- [ ] 使用不可カードに理由が表示される。
- [ ] Mine 設置可能マスがハイライトされる。
- [ ] REJECT 理由がユーザー向け文言で表示される。
