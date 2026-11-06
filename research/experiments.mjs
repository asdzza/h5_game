import { parse, playGreedy, countBlocks } from './engine.mjs';
import { aStar } from './solver_fast.mjs';

function rng(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function mk(R, N, walls, pairs, colors) {
  const inner = [];
  for (let r = 1; r < N - 1; r++) for (let c = 1; c < N - 1; c++) inner.push([r, c]);
  for (let i = inner.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [inner[i], inner[j]] = [inner[j], inner[i]]; }
  const ws = inner.slice(0, walls), free = inner.slice(walls);
  const cells = [];
  for (let p = 0; p < pairs; p++) { const c = 1 + (p % colors); cells.push(c); cells.push(c); }
  for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
  const g = [];
  for (let r = 0; r < N; r++) {
    let l = '';
    for (let c = 0; c < N; c++) l += (r === 0 || c === 0 || r === N - 1 || c === N - 1 || ws.some(w => w[0] === r && w[1] === c)) ? '#' : '.';
    g.push(l.split(''));
  }
  free.forEach(([r, c], i) => { if (i < cells.length) g[r][c] = String.fromCharCode(64 + cells[i]); });
  return g.map(r => r.join(''));
}

function measure(N, walls, pairs, colors, n = 40) {
  const pars = [], mids = [];
  let solved = 0;
  for (let s = 1; s <= n; s++) {
    const rows = mk(rng(s * 7919 + walls * 131 + pairs * 17 + N), N, walls, pairs, colors);
    const st = parse(rows);
    const r = aStar(st, 'A', 200000);
    if (!r) continue;
    solved++;
    pars.push(r.len);
    mids.push(r.path.filter(p => p.move.res === 'move' && p.move.tr !== 1 && p.move.tr !== N - 2 && p.move.tc !== 1 && p.move.tc !== N - 2).length);
  }
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  return { solved, n, par: avg(pars).toFixed(1), mid: avg(mids).toFixed(1) };
}

console.log('实验1：7x7 固定 6 方块，改变内墙数量');
for (const w of [0, 1, 2, 3, 4]) {
  const m = measure(7, w, 3, 3);
  console.log(`  内墙${w}: 平均par ${m.par} | 平均中腹停靠 ${m.mid} | 可解 ${m.solved}/${m.n}`);
}
console.log('\n实验2：7x7 固定 2 面内墙，改变方块数量（2色）');
for (const p of [2, 3, 4, 5]) {
  const m = measure(7, 2, p, 2);
  console.log(`  ${p * 2}块: 平均par ${m.par} | 平均中腹停靠 ${m.mid} | 可解 ${m.solved}/${m.n}`);
}
console.log('\n实验3：同 8 方块，棋盘从 7x7 放大到 9x9（密度下降）');
for (const N of [7, 8, 9]) {
  const m = measure(N, 2, 4, 2);
  console.log(`  ${N}x${N}: 平均par ${m.par} | 平均中腹停靠 ${m.mid}`);
}