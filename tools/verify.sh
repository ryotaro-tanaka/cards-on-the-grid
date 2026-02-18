#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

REPORT_FILE="${1:-tasks/verify_report.json}"
mkdir -p "$(dirname "$REPORT_FILE")"

write_step() {
  local name="$1"
  local cmd="$2"
  local rc="$3"
  local out_file="$4"
  local err_file="$5"

  node - "$REPORT_FILE" "$name" "$cmd" "$rc" "$out_file" "$err_file" <<'NODE'
const fs = require('fs');

const [reportPath, name, cmd, rcStr, outFile, errFile] = process.argv.slice(2);
const rc = Number(rcStr);

function readTail(path, maxLines) {
  try {
    const s = fs.readFileSync(path, 'utf8');
    const lines = s.split('\n');
    return lines.slice(Math.max(0, lines.length - maxLines)).join('\n').trimEnd();
  } catch {
    return '';
  }
}

let report = { ok: true, steps: [] };
if (fs.existsSync(reportPath)) {
  report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
}

const out = readTail(outFile, 40);
const err = readTail(errFile, 60);

report.steps.push({ name, cmd, rc, out, err });
report.ok = report.ok && rc === 0;

fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
NODE
}

run_step() {
  local name="$1"
  local cmd="$2"

  local out_path="tasks/.verify_${name}.out"
  local err_path="tasks/.verify_${name}.err"

  set +e
  bash -lc "$cmd" >"$out_path" 2>"$err_path"
  local rc=$?
  set -e

  write_step "$name" "$cmd" "$rc" "$out_path" "$err_path"
  return "$rc"
}

printf '{"ok":true,"steps":[]}\n' > "$REPORT_FILE"

run_step "typecheck" "npm run -s typecheck"
run_step "core_applyIntent_exists" "test -f packages/core/src/applyIntent.ts"

if node -e "const p=require('./package.json');process.exit(p.scripts&&p.scripts.test?0:1)"; then
  run_step "test" "npm test --silent"
fi

if node -e "const p=require('./package.json');process.exit(p.scripts&&p.scripts.lint?0:1)"; then
  run_step "lint" "npm run -s lint"
fi

node - "$REPORT_FILE" <<'NODE'
const fs = require('fs');
const reportPath = process.argv[2];
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

if (!report.ok) {
  for (const step of (report.steps || []).filter(s => s.rc !== 0)) {
    const head = (step.err || step.out || '')
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean)[0] || '(no detail)';
    console.error('[verify] ' + step.name + ' failed(rc=' + step.rc + '): ' + head);
  }
}

process.exit(report.ok ? 0 : 1);
NODE
