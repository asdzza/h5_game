import { parse, toRows, playGreedy, isGoal, neighbors, countBlocks } from './engine.mjs';
import { aStar } from './solver_fast.mjs';

function rng(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function randWin(st, b, trials = 100) {
  let w = 0;
  for (let t = 0; t < trials; t++) {
    let s = st;
    for (let i = 0; i < b; i++) { if (isGoal(s, 'A')) { w++; break; } const nb = neighbors(s, 'A'); if (!nb.length) break; s = nb[Math.floor(Math.random() * nb.length)].state; }
    if (isGoal(s, 'A')) w++;
  }
  return w / trials;
}

const [, , N, PAIRS, WALLS, LO, HI, COUNT] = process.argv.map(Number);
const onRing = (r, c) => r === 1 || r === N - 2 || c === 1 || c === N - 2;

function makeBoard(R) {
  const inner = [];
  for (let r = 1; r < N - 1; r++) for (let c = 1; c < N - 1; c++) inner.push([r, c]);
  for (let i = inner.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [inner[i], inner[j]] = [inner[j], inner[i]]; }
  const wallSet = new Set();
  for (let i = 0; i < WALLS; i++) wallSet.add(inner[i].join(','));
  const free = inner.slice(WALLS);
  const cells = [];
  for (let p = 0; p < PAIRS; p++) { cells.push(p + 1); cells.push(p + 1); }
  for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
  const g = [];
  for (let r = 0; r < N; r++) {
    let line = '';
    for (let c = 0; c < N; c++) line += (r === 0 || c === 0 || r === N - 1 || c === N - 1 || wallSet.has(r + ',' + c)) ? '#' : '.';
    g.push(line.split(''));
  }
  let k = 0;
  for (const [r, c] of free) if (k < cells.length) g[r][c] = String.fromCharCode(64 + cells[k++]);
  return g.map(r => r.join(''));
}

const out = [];
const t0 = Date.now();
for (let seed = 1; seed <= 4000 && out.length < COUNT; seed++) {
  const rows = makeBoard(rng(seed * 104729 + N * 31 + PAIRS));
  const st = parse(rows);
  const r = aStar(st, 'A', 150000);
  if (!r || r.len < LO || r.len > HI) continue;
  const mid = r.path.filter(p => p.move.res === 'move' && !onRing(p.move.tr, p.move.tc)).length;
  if (mid < 1) continue;
  const g = playGreedy(st, 'A', 60);
  if (g.win && g.steps <= r.len + 1) continue;
  if (randWin(st, r.len) > 0.01) continue;
  out.push({ seed, rows, r, mid, g });
}
console.log(`${N}x${N} ${PAIRS}对 ${WALLS}墙 par∈[${LO},${HI}]  命中${out.length}  用时${Date.now() - t0}ms`);
for (const x of out) {
  console.log(`\n--- seed ${x.seed} | par ${x.r.len} | 中腹停靠${x.mid} | 贪心${x.g.win ? x.g.steps + '步' : '失败'} | 展开${x.r.expanded} ---`);
  console.log(x.rows.join('\n'));
  console.log('  ' + x.r.path.map(p => p.move.res === 'pop'
    ? `撞(${p.move.r},${p.move.c})→(${p.move.br},${p.move.bc})`
    : `滑(${p.move.r},${p.move.c})${p.move.d}→(${p.move.tr},${p.move.tc})`).join(' '));
}