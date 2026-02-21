# CARDS ON THE GRID

## Documents

- [spec](docs/spec.md): 実装全体の方針・責務分離・進め方
- [api](docs/api.md): WebSocket 通信のメッセージ仕様（型・項目・同期手順）
- [game rules](docs/game_rules.md)
- [progress](docs/progress_report.md)
- [core integration](docs/core_integration.md): Core実装サマリとbackend/frontendでの利用想定

通信メッセージの詳細は `docs/api.md` を正とし、`docs/spec.md` には概要のみ記載する。

## Deploy

Worker(backend) と Pages(frontend) は Cloudflare 上では別デプロイ単位のため、
本リポジトリでは `npm run deploy` で順番に実行する。

- backend: `npm run deploy:backend`
- frontend: `npm run deploy:frontend`
- frontend build: `npm run build:frontend:pages` (Vite で `.pages-dist` を生成)
- all-in-one: `npm run deploy`

### 必須環境変数

- `CLOUDFLARE_PAGES_PROJECT`: Pages プロジェクト名（`deploy:frontend` で必須）

### 任意環境変数

- `VITE_BACKEND_WS_BASE_URL`: frontend の WebSocket 接続先（`packages/frontend/.env*` で管理。Cloudflare Pages 配信時は実質必須）
- `CLOUDFLARE_PAGES_BRANCH`: `wrangler pages deploy` の `--branch` に渡す値

### WebSocket 接続先について

- Cloudflare Pages (`*.pages.dev`) は静的配信のため、`/ws/...` に接続しても Worker に到達せず WebSocket handshake が失敗します。
- 本frontendは `*.pages.dev` 上で `VITE_BACKEND_WS_BASE_URL` が未設定の場合、誤接続を避けるため接続を開始しません。
- 一時的にブラウザから切り替える場合は `?wsBaseUrl=wss://<backend-domain>` をURLに付与してください。


### 入室時のseat割り当て

- `HELLO.payload.playerId` を省略すると、空席を `p1` → `p2` の順で自動割り当てします。
- `playerId` を指定した場合は、そのseatへの接続を試みます（同seat再接続を許可）。

