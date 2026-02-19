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

run_step "core_build" "rm -rf packages/core/dist && mkdir -p packages/core/dist && npx -y esbuild packages/core/src/index.ts --bundle --platform=node --format=esm --outfile=packages/core/dist/index.js --packages=bundle"
run_step "typecheck" "npm run -s typecheck"

run_step "core_applyIntent_runtime" "node <<'EOF'
const path = require('path');
const { pathToFileURL } = require('url');

(async () => {
  const entry = path.join(process.cwd(), 'packages', 'core', 'dist', 'index.js');
  const mod = await import(pathToFileURL(entry).href);
  const core = mod && (mod.default ?? mod);

  if (typeof core.applyIntent !== 'function') {
    console.error('applyIntent missing');
    process.exit(1);
  }

  // Minimal GameState for runtime test
  const state = {
    turn: 1,
    players: ['p1', 'p2'],
    activePlayer: 'p1',
    pieces: [
      { id: 'k1', owner: 'p1', position: { x: 0, y: 0 } },
      { id: 'k2', owner: 'p2', position: { x: 6, y: 6 } },
    ],
  };

  const result = core.applyIntent(state, { type: 'EndTurn' });

  if (!result || typeof result !== 'object') {
    console.error('invalid result: not an object');
    process.exit(1);
  }
  if (!result.state || typeof result.state.turn !== 'number') {
    console.error('invalid result shape');
    process.exit(1);
  }
  if (!Array.isArray(result.events)) {
    console.error('invalid events: not an array');
    process.exit(1);
  }
  if (result.state.turn !== state.turn + 1) {
    console.error('EndTurn did not increment turn');
    process.exit(1);
  }

  // Move test
  const moveResult = core.applyIntent(state, { type: 'Move', pieceId: 'k1', to: { x: 1, y: 0 } });

  if (!moveResult || typeof moveResult !== 'object') {
    console.error('invalid result: not an object');
    process.exit(1);
  }
  if (!moveResult.state || !Array.isArray(moveResult.state.pieces)) {
    console.error('invalid result shape');
    process.exit(1);
  }
  const movedPiece = moveResult.state.pieces.find(p => p.id === 'k1');
  if (!movedPiece) {
    console.error('piece not found after move');
    process.exit(1);
  }
  if (movedPiece.position.x !== 1 || movedPiece.position.y !== 0) {
    console.error('incorrect piece position after move');
    process.exit(1);
  }
  const event = moveResult.events.find(e => e.type === 'PieceMoved' && e.pieceId === 'k1');
  if (!event) {
    console.error('PieceMoved event not found');
    process.exit(1);
  }
  if (event.from.x !== 0 || event.from.y !== 0) {
    console.error('incorrect PieceMoved.from position');
    process.exit(1);
  }

  // T015: moving non-active player's piece must be ignored (no-op)
  const wrongMove = core.applyIntent(state, { type: 'Move', pieceId: 'k2', to: { x: 5, y: 6 } });
  if (!wrongMove || typeof wrongMove !== 'object') {
    console.error('invalid wrongMove result');
    process.exit(1);
  }
  if (wrongMove.events.length !== 0) {
    console.error('wrongMove should emit no events');
    process.exit(1);
  }

  const k2 = wrongMove.state.pieces.find(p => p.id === 'k2');
  if (!k2) {
    console.error('k2 missing after wrongMove');
    process.exit(1);
  }
  if (k2.position.x !== 6 || k2.position.y !== 6) {
    console.error('wrongMove should not change k2 position');
    process.exit(1);
  }

  const k1AfterWrong = wrongMove.state.pieces.find(p => p.id === 'k1');
  if (!k1AfterWrong) {
    console.error('k1 missing after wrongMove');
    process.exit(1);
  }
  if (k1AfterWrong.position.x !== 0 || k1AfterWrong.position.y !== 0) {
    console.error('wrongMove should not change other pieces');
    process.exit(1);
  }

  process.exit(0);
})().catch((e) => {
  console.error(String((e && e.stack) || e));
  process.exit(1);
});
EOF"

run_step "core_entry_importable" "node -e \"import('./packages/core/dist/index.js').then(()=>process.exit(0)).catch(()=>process.exit(1))\""
run_step "core_applyIntent_src_exists" "test -f packages/core/src/applyIntent.ts"

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
