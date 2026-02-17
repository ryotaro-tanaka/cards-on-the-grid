#!/usr/bin/env bash
set -euo pipefail

MODEL="${MODEL:-ollama/qwen2.5-coder:7b}"
MAX_LOOPS="${MAX_LOOPS:-10}"
MAX_FAILS="${MAX_FAILS:-3}"
MAX_CHANGED_LINES="${MAX_CHANGED_LINES:-200}"
VERIFY_REPORT="${VERIFY_REPORT:-tasks/verify_report.json}"
FEEDBACK_LOG="${FEEDBACK_LOG:-tasks/feedback.jsonl}"
TASK_STATE_FILE="${TASK_STATE_FILE:-tasks/task_state.json}"

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
  git diff --numstat | awk '{add+=$1; del+=$2} END{print add+del+0}'
}

has_protected_changes() {
  git diff --name-only | grep -E "$PROTECTED_REGEX" >/dev/null 2>&1
}

run_verify() {
  tools/verify.sh "$VERIFY_REPORT"
}

init_task_state() {
  if [ ! -f "$TASK_STATE_FILE" ]; then
    printf '{"tasks":{}}\n' > "$TASK_STATE_FILE"
  fi
}

get_task_fail_streak() {
  local task_id="$1"
  node - <<NODE
const fs = require('fs');
const p = '$TASK_STATE_FILE';
const id = '$task_id';
const s = JSON.parse(fs.readFileSync(p, 'utf8'));
const n = s.tasks?.[id]?.failStreak ?? 0;
console.log(String(n));
NODE
}

set_task_fail_streak() {
  local task_id="$1"
  local streak="$2"
  node - <<NODE
const fs = require('fs');
const p = '$TASK_STATE_FILE';
const id = '$task_id';
const streak = Number('$streak');
const s = JSON.parse(fs.readFileSync(p, 'utf8'));
s.tasks = s.tasks || {};
s.tasks[id] = s.tasks[id] || {};
s.tasks[id].failStreak = streak;
fs.writeFileSync(p, JSON.stringify(s, null, 2) + '\n');
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
  const hint = (item.hint || '-').toString().slice(0, 200);
  console.log('- [' + item.type + '] loop=' + item.loop + ' failStreak=' + (item.failStreak ?? '-') + ' hint=' + hint);
}
NODE
}

build_verify_summary() {
  if [ ! -f "$VERIFY_REPORT" ]; then
    echo "(verify report not found)"
    return
  fi
  node - <<NODE
const fs = require('fs');
const report = JSON.parse(fs.readFileSync('$VERIFY_REPORT', 'utf8'));
const failed = (report.steps || []).filter(s => s.rc !== 0);
if (!failed.length) {
  console.log('all verify steps passed');
  process.exit(0);
}
for (const s of failed) {
  const src = (s.err || s.out || '').split('\n').map(x => x.trim()).filter(Boolean)[0] || '(no message)';
  console.log(s.name + '(rc=' + s.rc + '): ' + src);
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
  local feedback_context="$3"

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

  過去の失敗から抽出したヒント:
  $feedback_context

  達成条件:
  - tools/verify.sh が通ること
  - 失敗ログに出ている同一エラーを繰り返さないこと
  "
}

ensure_clean_branch

log "=== Ralph Loop start (model=$MODEL, max_loops=$MAX_LOOPS) ==="
log "verify command: tools/verify.sh"

touch tasks/progress.md
touch "$FEEDBACK_LOG"
init_task_state

for i in $(seq 1 "$MAX_LOOPS"); do
  log "--- loop $i/$MAX_LOOPS ---"

  if ! task_line="$(pick_next_task)"; then
    log "No remaining tasks. Stop."
    exit 0
  fi

  task_id="$(echo "$task_line" | cut -f1)"
  task_title="$(echo "$task_line" | cut -f2-)"
  log "task: $task_id $task_title"

  if ! git diff --quiet; then
    log "Working tree has uncommitted changes. Stop for safety."
    exit 1
  fi

  feedback_context="$(build_feedback_context "$task_id")"

  set +e
  run_aider_once "$task_id" "$task_title" "$feedback_context"
  aider_rc=$?
  set -e
  if [ $aider_rc -ne 0 ]; then
    log "aider exited with code $aider_rc"
  fi

  changed=0
  if ! git diff --quiet; then
    changed=1
    changed_lines="$(changed_lines_count)"
    log "changed lines(add+del): $changed_lines"
    if [ "$changed_lines" -gt "$MAX_CHANGED_LINES" ]; then
      log "Too many changes ($changed_lines > $MAX_CHANGED_LINES). Stop."
      exit 1
    fi
    if has_protected_changes; then
      log "Protected files changed. Stop."
      exit 1
    fi
  else
    log "No diff produced by aider. Run verify before deciding task state."
  fi

  errlog="tasks/last_error.log"
  rm -f "$errlog"
  set +e
  run_verify > /dev/null 2> "$errlog"
  verify_rc=$?
  set -e

  verify_summary="$(build_verify_summary)"

  if [ $verify_rc -eq 0 ]; then
    log "verify: OK"
    set_task_fail_streak "$task_id" 0
    append_feedback_event "$(node -e "console.log(JSON.stringify({ts:new Date().toISOString(),taskId:'$task_id',loop:$i,type:'verify_ok',changed:$changed,hint:\"$verify_summary\"}))")"

    mark_task_done "$task_id"
    if [ "$changed" -eq 1 ]; then
      git add packages/core tasks/tasks.json tasks/progress.md "$FEEDBACK_LOG" "$TASK_STATE_FILE" || true
      git commit -m "bot: $task_title" >/dev/null || true
      log "task marked done with code changes: $task_id"
    else
      git add tasks/tasks.json tasks/progress.md "$FEEDBACK_LOG" "$TASK_STATE_FILE" || true
      git commit -m "bot: $task_title (already satisfied)" >/dev/null || true
      log "task marked done without code diff after verify: $task_id"
    fi
  else
    log "verify: FAIL"
    log "verify summary: $verify_summary"

    fail_streak="$(get_task_fail_streak "$task_id")"
    fail_streak="$((fail_streak + 1))"
    set_task_fail_streak "$task_id" "$fail_streak"
    append_feedback_event "$(node -e "console.log(JSON.stringify({ts:new Date().toISOString(),taskId:'$task_id',loop:$i,type:'verify_fail',changed:$changed,failStreak:$fail_streak,hint:\"$verify_summary\"}))")"

    if [ "$fail_streak" -ge "$MAX_FAILS" ]; then
      log "Too many consecutive failures for task ($fail_streak >= $MAX_FAILS). Stop."
      exit 1
    fi

    if [ "$changed" -eq 1 ]; then
      git reset --hard >/dev/null
      log "changes reset after verify failure"
    else
      log "no-diff + verify fail: keep task open for retry with feedback context"
    fi
  fi
done

log "Reached max loops. Stop."
