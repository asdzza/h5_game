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
function randWin(start, budget, trials = 120) {
  let wins = 0;
  for (let t = 0; t < trials; t++) {
    let st = start;
    for (let s = 0; s < budget; s++) {
      if (isGoal(st, 'A')) { wins++; break; }
      const nb = neighbors(st, 'A');
      if (!nb.length) break;
      st = nb[Math.floor(Math.random() * nb.length)].state;
    }
    if (isGoal(st, 'A')) wins++;
  }
  return wins / trials;
}

const N = 7;
function makeBoard(rnd, pairs, walls, colors) {
  const inner = [];
  for (let r = 1; r < N - 1; r++) for (let x = 1; x < N - 1; x++) inner.push([r, x]);
  for (let i = inner.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [inner[i], inner[j]] = [inner[j], inner[i]];
  }
  const wallSet = new Set();
  for (let i = 0; i < walls; i++) wallSet.add(inner[i].join(','));
  const free = inner.slice(walls);
  const cells = [];
  for (let p = 0; p < pairs; p++) { const c = 1 + (p % colors); cells.push(c); cells.push(c); }
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  const grid = [];
  for (let r = 0; r < N; r++) {
    let line = '';
    for (let x = 0; x < N; x++) line += (r === 0 || x === 0 || r === N - 1 || x === N - 1 || wallSet.has(r + ',' + x)) ? '#' : '.';
    grid.push(line.split(''));
  }
  let k = 0;
  for (const [r, x] of free) if (k < cells.length) grid[r][x] = String.fromCharCode(64 + cells[k++]);
  return grid.map(r => r.join(''));
}

const onRing = (r, c) => r === 1 || r === N - 2 || c === 1 || c === N - 2;
const results = [];
for (let seed = 1; seed <= 3000; seed++) {
  const rows = makeBoard(mulberry32(seed * 104729), 3, 2, 2);
  const st = parse(rows);
  const r = aStar(st, 'A', 60000);
  if (!r || r.len < 4 || r.len > 6) continue;
  const code = r.path.map(p => p.move);
  // 最优解中必须有“停在中腹（被方块挡住）”的铺垫步
  const midStops = code.filter(m => m.res === 'move' && !onRing(m.tr, m.tc));
  if (!midStops.length) continue;
  const greedy = playGreedy(st, 'A', 60);
  if (greedy.win && greedy.steps <= r.len + 1) continue;
  if (randWin(st, r.len) > 0.01) continue;
  results.push({ seed, rows, r, midStops: midStops.length, greedy });
  if (results.length >= 6) break;
}

console.log(`找到 ${results.length} 个“必须借方块停靠”的盘面`);
for (const x of results) {
  console.log(`\n--- seed ${x.seed} | par ${x.r.len} | 中腹停靠 ${x.midStops} | 贪心 ${x.greedy.win ? x.greedy.steps + '步' : '失败'} ---`);
  console.log(x.rows.join('\n'));
  console.log('  ' + x.r.path.map(p => p.move.res === 'pop'
    ? `撞(${p.move.r},${p.move.c})→(${p.move.br},${p.move.bc})`
    : `滑(${p.move.r},${p.move.c})${p.move.d}→(${p.move.tr},${p.move.tc})`).join('  '));
}