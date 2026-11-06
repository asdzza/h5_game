import { parse, toRows, playGreedy, isGoal, neighbors, countBlocks } from './engine.mjs';
import { aStar } from './solver_fast.mjs';

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function randomWinWithin(start, budget, trials = 150, rnd = Math.random) {
  let wins = 0;
  for (let t = 0; t < trials; t++) {
    let st = start;
    for (let s = 0; s < budget; s++) {
      if (isGoal(st, 'A')) { wins++; break; }
      const nb = neighbors(st, 'A');
      if (!nb.length) break;
      st = nb[Math.floor(rnd() * nb.length)].state;
    }
    if (isGoal(st, 'A')) wins++;
  }
  return Math.min(1, wins / trials);
}

function makeBoard(rnd, n, pairs, wallCount, colors) {
  const inner = [];
  for (let r = 1; r < n - 1; r++) for (let x = 1; x < n - 1; x++) inner.push([r, x]);
  for (let i = inner.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [inner[i], inner[j]] = [inner[j], inner[i]];
  }
  const wallSet = new Set();
  for (let i = 0; i < wallCount; i++) wallSet.add(inner[i].join(','));
  const free = inner.slice(wallCount);
  const cells = [];
  for (let p = 0; p < pairs; p++) { const c = 1 + (p % colors); cells.push(c); cells.push(c); }
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  const grid = [];
  for (let r = 0; r < n; r++) {
    let line = '';
    for (let x = 0; x < n; x++) {
      line += (r === 0 || x === 0 || r === n - 1 || x === n - 1 || wallSet.has(r + ',' + x)) ? '#' : '.';
    }
    grid.push(line.split(''));
  }
  let k = 0;
  for (const [r, x] of free) { if (k < cells.length) grid[r][x] = String.fromCharCode(64 + cells[k++]); }
  return grid.map(r => r.join(''));
}

function evaluate(rows) {
  const st = parse(rows);
  const r = aStar(st, 'A', 80000);
  if (!r) return null;
  const pops = r.path.filter(p => p.move.res === 'pop').length;
  const greedy = playGreedy(st, 'A', 80);
  const rand = randomWinWithin(st, r.len);
  return { rows, par: r.len, pops, staging: r.len - pops, path: r.path, greedyWin: greedy.win && greedy.steps <= r.len + 2, rand, blocks: countBlocks(st) };
}

const [target, n, pairs, walls, colors, seeds] = process.argv.slice(2).map(Number);
const stats = [];
const hits = [];
for (let seed = 1; seed <= (seeds || 300); seed++) {
  const rows = makeBoard(mulberry32(seed * 7919), n, pairs, walls, colors);
  const e = evaluate(rows);
  if (!e) continue;
  stats.push(e.par);
  if (e.par !== target) continue;
  if (e.rand > 0.02) continue;
  if (e.pops / e.par < 0.4) continue;
  e.seed = seed;
  hits.push(e);
  if (hits.length >= 8) break;
}
console.log(`目标par=${target} ${n}x${n} ${pairs}对 ${walls}墙 ${colors}色  扫描${seeds}  命中${hits.length}  最小par=${Math.min(...stats)} 最大par=${Math.max(...stats)}`);
for (const h of hits) {
  console.log(`\n--- seed ${h.seed} | par ${h.par} | 消${h.pops}/铺${h.staging} | 贪心${h.greedyWin ? '过' : '败'} | 乱滑${(h.rand * 100).toFixed(0)}% ---`);
  console.log(h.rows.join('\n'));
  console.log('   ' + h.path.map(p => p.move.res === 'pop'
    ? `撞(${p.move.r},${p.move.c})→(${p.move.br},${p.move.bc})`
    : `滑(${p.move.r},${p.move.c})${p.move.d}→(${p.move.tr},${p.move.tc})`).join(' '));
}