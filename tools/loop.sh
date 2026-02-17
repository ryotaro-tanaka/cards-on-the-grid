#!/usr/bin/env bash
set -euo pipefail

MODEL="${MODEL:-ollama/qwen2.5-coder:7b}"
MAX_LOOPS="${MAX_LOOPS:-10}"
MAX_FAILS="${MAX_FAILS:-3}"
MAX_CHANGED_LINES="${MAX_CHANGED_LINES:-200}"
VERIFY_REPORT="${VERIFY_REPORT:-tasks/verify_report.json}"
FEEDBACK_LOG="${FEEDBACK_LOG:-tasks/feedback.jsonl}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# 破壊防止：重要ファイルは触らせない（万一変更されたら停止）
PROTECTED_REGEX='^(README\.md|note/|docs/|LICENSE)'

log() { printf "%s %s\n" "$(date '+%F %T')" "$*" | tee -a tasks/progress.md; }

ensure_clean_branch() {
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "Not a git repo"; exit 1
  fi
}

pick_next_task() {
  node - <<'NODE'
const fs = require('fs');
const p = 'tasks/tasks.json';
const j = JSON.parse(fs.readFileSync(p,'utf8'));
const next = j.tasks.find(t => !t.done);
if (!next) process.exit(2);
console.log(next.id + "\t" + next.title);
NODE
}

mark_task_done() {
  local id="$1"
  node - <<NODE
const fs = require('fs');
const p = 'tasks/tasks.json';
const j = JSON.parse(fs.readFileSync(p,'utf8'));
const t = j.tasks.find(t => t.id === "$id");
if (t) t.done = true;
fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
NODE
}

changed_lines_count() {
  # 追加+削除の合計
  git diff --numstat | awk '{add+=$1; del+=$2} END{print add+del+0}'
}

has_protected_changes() {
  git diff --name-only | grep -E "$PROTECTED_REGEX" >/dev/null 2>&1
}

run_verify() {
  tools/verify.sh "$VERIFY_REPORT"
}

task_failures_count() {
  local task_id="$1"
  if [ ! -f "$FEEDBACK_LOG" ]; then
    echo "0"
    return
  fi
  node - <<NODE
const fs = require('fs');
const p = '$FEEDBACK_LOG';
const id = '$task_id';
const n = fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean)
  .map(line => { try { return JSON.parse(line); } catch { return null; } })
  .filter(Boolean)
  .filter(x => x.taskId === id && x.type === 'verify_fail').length;
console.log(String(n));
NODE
}

build_feedback_context() {
  local task_id="$1"
  if [ ! -f "$FEEDBACK_LOG" ]; then
    echo "(none)"
    return
  fi
  node - <<NODE
const fs = require('fs');
const p = '$FEEDBACK_LOG';
const id = '$task_id';
const lines = fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean)
  .map(line => { try { return JSON.parse(line); } catch { return null; } })
  .filter(Boolean)
  .filter(x => x.taskId === id)
  .slice(-3);
if (!lines.length) {
  console.log('(none)');
  process.exit(0);
}
for (const item of lines) {
  console.log(`- [${item.type}] loop=${item.loop} failCount=${item.failCount ?? '-'} hint=${item.hint ?? '-'}`);
}
NODE
}

append_feedback_event() {
  local payload="$1"
  printf "%s\n" "$payload" >> "$FEEDBACK_LOG"
}

run_aider_once() {
  local task_id="$1"
  local task_title="$2"
  local errlog="$3"
  local feedback_context="$4"

  aider --model "$MODEL" \
    --yes --no-gitignore \
    --edit-format diff \
    --no-auto-commits \
    --no-show-model-warnings \
    packages/core/src/index.ts \
    packages/core/src/types.ts \
    --message "
  あなたはこのリポジトリの実装エージェントです。

  絶対制約:
  - tsconfig.json / packages/**/tsconfig.json は編集禁止（提案も禁止）。
  - README.md と note/ 配下は編集禁止。
  - 変更は最小差分。既存内容の削除は禁止。
  - 今回のタスク以外は触らない。

  タスク: [$task_id] $task_title

  直近の検証エラー（あれば）:
  $( [ -f "$errlog" ] && tail -n 80 "$errlog" || echo "(none)" )

  過去の失敗から抽出したヒント:
  $feedback_context

  達成条件:
  - npm run typecheck が通ること
  - tools/verify.sh が通ること
  - 失敗ログに出ている同一エラーを繰り返さないこと
  "
}

ensure_clean_branch

log "=== Ralph Loop start (model=$MODEL, max_loops=$MAX_LOOPS) ==="
log "verify command: npm run typecheck"

touch tasks/progress.md
touch "$FEEDBACK_LOG"

for i in $(seq 1 "$MAX_LOOPS"); do
  log "--- loop $i/$MAX_LOOPS ---"

  if ! task_line="$(pick_next_task)"; then
    log "No remaining tasks. Stop."
    exit 0
  fi

  task_id="$(echo "$task_line" | cut -f1)"
  task_title="$(echo "$task_line" | cut -f2-)"
  log "task: $task_id $task_title"

  # 直前diffが残っていたら危険なので停止（ループ外の手動介入を想定）
  if ! git diff --quiet; then
    log "Working tree has uncommitted changes. Stop for safety."
    exit 1
  fi

  errlog="tasks/last_error.log"
  rm -f "$errlog"
  feedback_context="$(build_feedback_context "$task_id")"

  set +e
  run_aider_once "$task_id" "$task_title" "$errlog" "$feedback_context"
  aider_rc=$?
  set -e
  if [ $aider_rc -ne 0 ]; then
    log "aider exited with code $aider_rc"
  fi

  # 変更が無いなら「既に達成済み」とみなしてタスクを進める
  if git diff --quiet; then
    log "No diff produced. Assume task already satisfied. Mark done and continue."
    append_feedback_event "$(node -e "console.log(JSON.stringify({ts:new Date().toISOString(),taskId:'$task_id',loop:$i,type:'no_diff'}))")"
    mark_task_done "$task_id"
    git add tasks/tasks.json tasks/progress.md || true
    git commit -m "bot: $task_title (no-op)" >/dev/null || true
    continue
  fi

  # 変更行数が大きすぎたら停止
  changed="$(changed_lines_count)"
  log "changed lines(add+del): $changed"
  if [ "$changed" -gt "$MAX_CHANGED_LINES" ]; then
    log "Too many changes ($changed > $MAX_CHANGED_LINES). Stop."
    exit 1
  fi

  # 保護ファイルを触ったら停止
  if has_protected_changes; then
    log "Protected files changed. Stop."
    exit 1
  fi

  # 検証
  set +e
  run_verify > /dev/null 2> "$errlog"
  verify_rc=$?
  set -e

  if [ $verify_rc -eq 0 ]; then
    log "verify: OK"
    append_feedback_event "$(node -e "console.log(JSON.stringify({ts:new Date().toISOString(),taskId:'$task_id',loop:$i,type:'verify_ok'}))")"
    mark_task_done "$task_id"
    git add packages/core tasks/tasks.json tasks/progress.md || true
    git commit -m "bot: $task_title" >/dev/null || true
    log "task marked done: $task_id"
  else
    log "verify: FAIL"
    log "last error (tail):"
    tail -n 20 "$errlog" | sed 's/^/  /' | tee -a tasks/progress.md >/dev/null

    hint="$(tail -n 1 "$errlog" | sed 's/"/\"/g')"
    fails="$(task_failures_count "$task_id")"
    fails="$((fails + 1))"
    append_feedback_event "$(node -e "console.log(JSON.stringify({ts:new Date().toISOString(),taskId:'$task_id',loop:$i,type:'verify_fail',failCount:$fails,hint:\"$hint\"}))")"

    if [ "$fails" -ge "$MAX_FAILS" ]; then
      log "Too many failures ($fails >= $MAX_FAILS). Stop."
      exit 1
    fi

    # 失敗時はコミットせずにリセット（次ループでやり直し）
    git reset --hard >/dev/null
  fi
done

log "Reached max loops. Stop."
