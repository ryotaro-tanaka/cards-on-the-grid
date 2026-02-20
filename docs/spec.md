# 実装

無料枠で実装することを目標とし、デプロイはCloudflareを使う。
Cloudflare Durable Objects（1ルーム=1オブジェクト）を中継にした準P2P構成
友達同士のゲームで不正対策はWebSocket通信のヘッダーの認証のみ。

- backend は 「順序と手番」 に集中
- state 遷移は core に寄せる
- frontend は イベント適用 に集中（ローカル予測は後で）

## frontend

ユーザー体験（表示・入力・ローカル予測）

- デプロイ先: Cloudflare Pages
- 使用技術: React + typescript

```
UI 描画

7×7盤面、コマ、手札、ターン表示など

入力の生成

ユーザー操作 → INTENT を作って送る

自分の手番でないときは UI で無効化（ただし最終判断は backend）

イベント適用

サーバーから EVENT を受ける

seq 順に適用（抜けや逆順があれば待つ/破棄/再同期）

将来は reduceEvent で state 更新するとシンプル
```

## backend

マルチプレイの進行管理（順序・配信・永続）

- deploy: Cloudflare Workers + Cloudflare Durable Objects
- Typescript


対戦セッション管理：Cloudflare Workers + Durable Objects
同期：WebSocket（DOが部屋状態を保持し、各クライアントへ配信）

authoritative に順序と手番を管理

- `backend` が authoritative に順序と手番を管理
  - `expectedTurn` と validation を検査
  - `seq` 採番付きで `EVENT` を配信
  - 不整合を `REJECT` で返却

```
部屋（room）の状態管理

seq（イベントの通し番号）

turn（手番の所有者と turnNo）

board / state（必要なら保持、またはイベントログから復元）

順序付けして EVENT を配信

INTENT を受ける

手番チェック（違えば無視 or REJECT）

core.applyIntent で次状態と events を作る

seq++ して EVENT にして全員にブロードキャスト

接続管理

HELLO/WELCOME

切断復帰時の WELCOME
```

Durable Objects:

## core

ルールと状態遷移を定義する層

- `core` がルールの単一責務を持つ
  - command検証
  - event生成
  - event適用

```
役割：ゲームの真実（ルールと状態遷移）を定義する層

入力：GameState と Intent

出力：{ state, events }（次状態＋確定イベント）

純粋関数が基本（I/O なし、日時/乱数/ネットワーク/DB なし）

ゲームルールの整合性をここで担保する
例：

手番でないプレイヤーの Move を拒否/無視

Move できる範囲・衝突・攻撃処理

EndTurn の activePlayer 切替、TurnEnded の nextTurn
```

## 進め方の原則

- ルールの真実源は常に `core`
- `backend` は「順序・認可・配信」に責務を限定
- `frontend` は `EVENT/SYNC` を最終確定として扱う
- 仕様差分は README と `note/` に明示しながら進める
- 各テーマ完了時に e2e smoke へ最低1ケース追加する

## 展開方針

まずはPWAのみでよい。

1. PWA
2. Electron/Tauriでデスクトップ化
3. CapacitorでiOS/Android化

<!-- ## 5. 実装ロードマップ

### Phase 1: 縦切りMVP

- 2人対戦ルーム作成/参加
- 盤面表示、1ターン進行
- 主要カード数枚のみ（Move/Assault/Arrowrain/Mine）
- リプレイログ（イベント列）

### Phase 2: ルール完成

- 全Creature/カード
- 抽選重みWと補充ロジック
- 切断復帰、再接続

### Phase 3: 品質

- 観戦/履歴
- レート/マッチング
- 監査ログ・不正検知


## 8. 具体的な技術選択（最小）

- フロント：React（TypeScript） + 状態管理（Zustand等）
- 共有ロジック：TypeScriptでルールエンジンを共通化
- サーバー：Cloudflare Workers（TypeScript） + Durable Objects
- 通信：WebSocket（イベント駆動）
- テスト：
  - ルールのプロパティテスト
  - 再現性あるseed付き乱数テスト

## 最終提案

- あなたの前提（Web経験中心）に最も合うのは、
  **「React + Cloudflare Workers（TS） + authoritative server + PWA先行」**。
- P2Pは「将来の最適化候補」に留め、まずはDO中継でゲーム成立を優先するのが安全。 -->
