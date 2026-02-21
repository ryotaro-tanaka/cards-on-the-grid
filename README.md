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
- all-in-one: `npm run deploy`

### 必須環境変数

- `CLOUDFLARE_PAGES_PROJECT`: Pages プロジェクト名（`deploy:frontend` で必須）

### 任意環境変数

- `BACKEND_WS_BASE_URL`: frontend の WebSocket 接続先（未指定時は `window.location.origin` から推測）
- `CLOUDFLARE_PAGES_BRANCH`: `wrangler pages deploy` の `--branch` に渡す値
