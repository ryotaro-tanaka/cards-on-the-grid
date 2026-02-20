# 実装方針（MVP）

無料枠での運用を前提に、Cloudflare を使った 2 人対戦のオンラインゲームを実装する。

- **構成**: Cloudflare Durable Objects（1ルーム = 1 DO）を中継にした準 P2P 構成
- **不正対策（MVP）**: WebSocket 接続時の認証ヘッダー検証 + サーバー側の手番/ルール検証
- **対象プラットフォーム**: まずは PWA のみ

---

## 責務分離

### core（ルールの真実源）
ゲームルールと状態遷移を定義する唯一の層。

- 入力: `GameState`, `Intent`
- 出力: `{ state, events }`
- 役割:
  - Intent の妥当性検証
  - Event 生成
  - Event 適用
- 制約:
  - 純粋関数ベース（I/O・DB・ネットワーク・日時・乱数に依存しない）

### backend（進行管理）
マルチプレイの順序・認可・配信・永続を担当。

- 技術: Cloudflare Workers + Durable Objects（TypeScript）
- 役割:
  - `authoritative` に手番とイベント順序を管理
  - `expectedTurn` などを検証
  - `core.applyIntent` で状態遷移
  - `seq` 採番した `EVENT` を配信
  - 不正/不整合は `REJECT` を返す

### frontend（体験層）
表示・入力・サーバー確定イベントの反映を担当。

- 技術: React + TypeScript（Cloudflare Pages）
- 役割:
  - 7×7 盤面、駒、手札、ターン表示
  - ユーザー操作から `INTENT` を生成
  - 非手番時は UI を無効化（最終判定は backend）
  - `EVENT` を `seq` 順に適用

---

## ルーム（Durable Object）で管理する状態

- `seq`: イベント通し番号
- `turn`: 手番プレイヤー / `turnNo`
- `state`: 現在のゲーム状態（必要に応じてイベントログから復元可能）
- 接続中プレイヤー情報

---

## 通信と同期

- 接続時: `HELLO` / `WELCOME`
- 通常時:
  1. client が `INTENT` 送信
  2. backend が認可・手番チェック
  3. `core.applyIntent` 実行
  4. `seq` を付与した `EVENT` を全員へ配信
- 復帰時:
  - `WELCOME` + 必要な `SYNC`（スナップショットまたは欠番イベント）で再同期

フロントエンドは `EVENT/SYNC` を最終確定状態として扱う。

---

## 実装原則

- ルールの真実源は常に `core`
- `backend` の責務は「順序・認可・配信」に限定
- `frontend` は確定イベント適用に集中（ローカル予測は後続フェーズ）
- 仕様変更は README と `note/` に明示
- 各テーマ完了時に e2e smoke を最低 1 ケース追加

---

## 展開方針

1. **PWA**（先行リリース）
2. Electron / Tauri でデスクトップ化
3. Capacitor で iOS / Android 化
