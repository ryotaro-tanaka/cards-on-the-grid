#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

REPORT_FILE="${1:-tasks/verify_report.json}"
mkdir -p "$(dirname "$REPORT_FILE")"

run_step() {
  local name="$1"
  local cmd="$2"

  set +e
  bash -lc "$cmd" >"tasks/.verify_${name}.out" 2>"tasks/.verify_${name}.err"
  local rc=$?
  set -e

  local out err
  out="$(tail -n 40 "tasks/.verify_${name}.out" 2>/dev/null || true)"
  err="$(tail -n 60 "tasks/.verify_${name}.err" 2>/dev/null || true)"

  node - <<NODE
const fs = require('fs');
const reportPath = '$REPORT_FILE';
const name = ${name@Q};
const cmd = ${cmd@Q};
const rc = Number('$rc');
const out = ${out@Q};
const err = ${err@Q};
let report = { ok: true, steps: [] };
if (fs.existsSync(reportPath)) report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
report.steps.push({ name, cmd, rc, out, err });
report.ok = report.ok && rc === 0;
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
NODE

  return "$rc"
}

printf '{"ok":true,"steps":[]}\n' > "$REPORT_FILE"

run_step "typecheck" "npm run -s typecheck"

if node -e "const p=require('./package.json');process.exit(p.scripts&&p.scripts.test?0:1)"; then
  run_step "test" "npm test --silent"
fi

if node -e "const p=require('./package.json');process.exit(p.scripts&&p.scripts.lint?0:1)"; then
  run_step "lint" "npm run -s lint"
fi

node - <<NODE
const fs = require('fs');
const report = JSON.parse(fs.readFileSync('$REPORT_FILE', 'utf8'));
if (!report.ok) {
  for (const step of report.steps.filter(s => s.rc !== 0)) {
    const head = (step.err || step.out || '').split('\n').map(s => s.trim()).filter(Boolean)[0] || '(no detail)';
    console.error('[verify] ' + step.name + ' failed(rc=' + step.rc + '): ' + head);
  }
}
process.exit(report.ok ? 0 : 1);
NODE
