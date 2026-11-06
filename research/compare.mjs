import { parse, analyze, playGreedy, isGoal, neighbors, countBlocks } from './engine.mjs';

export function randomWinWithin(start, ruleset, budget, trials = 500, rnd = Math.random) {
  let wins = 0;
  for (let t = 0; t < trials; t++) {
    let st = start;
    for (let s = 0; s < budget; s++) {
      if (isGoal(st, ruleset)) { wins++; break; }
      const nb = neighbors(st, ruleset);
      if (!nb.length) break;
      st = nb[Math.floor(rnd() * nb.length)].state;
    }
    if (isGoal(st, ruleset)) wins++;
  }
  return Math.min(1, wins / trials);
}

// 同一批盘面，分别用 A / B 规则求解
function makeBoard(n, colors, walls = []) {
  const interior = [];
  for (let r = 1; r < n - 1; r++) for (let x = 1; x < n - 1; x++) interior.push([r, x]);
  for (const [r, x] of walls) {
    const i = interior.findIndex(([a, b]) => a === r && b === x);
    if (i >= 0) interior.splice(i, 1);
  }
  // 每种颜色 2 块
  const cells = [];
  for (let c = 0; c < colors; c++) { cells.push(c + 1); cells.push(c + 1); }
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  const rows = [];
  for (let r = 0; r < n; r++) {
    let line = '';
    for (let x = 0; x < n; x++) {
      if (r === 0 || x === 0 || r === n - 1 || x === n - 1) line += '#';
      else if (walls.some(([a, b]) => a === r && b === x)) line += '#';
      else line += '.';
    }
    rows.push(line);
  }
  const arr = rows.map(r => r.split(''));
  let k = 0;
  for (const [r, x] of interior) {
    if (k >= cells.length) break;
    arr[r][x] = String.fromCharCode(64 + cells[k++]);
  }
  return arr.map(r => r.join(''));
}

const wallSets = [
  [],
  [[2, 2], [3, 3]],
  [[2, 3], [3, 2], [4, 4]],
];

console.log('| 盘面 | 方块数 | 颜色 | A最短步 | A乱滑@par | A不可解状态 | B最短步 | B乱滑@par |');
console.log('|---|---|---|---|---|---|---|---|');
let n = 0;
for (const walls of wallSets) {
  for (let t = 0; t < 3; t++) {
    const rows = makeBoard(6, 3, walls);
    const st = parse(rows);
    const a = analyze(st, 'A', 400000);
    const b = analyze(st, 'B', 400000);
    if (!a.minMoves || !b.minMoves || a.truncated || b.truncated) continue;
    n++;
    console.log(`| #${n} | ${countBlocks(st)} | 3 | ${a.minMoves} | ${(randomWinWithin(st, 'A', a.minMoves) * 100).toFixed(0)}% | ${a.unwinnable} | ${b.minMoves} | ${(randomWinWithin(st, 'B', b.minMoves) * 100).toFixed(0)}% |`);
  }
}

// B 的关键性质验证：同色同行/同列，一次滑动必定合并
const demo = parse([
  '######',
  '#A..A#',
  '#....#',
  '#.B..#',
  '#..B.#',
  '#....#',
  '######',
]);
const bm = analyze(demo, 'B');
console.log('\nB规则验证盘：同行两个A + 斜向两个B');
console.log('  B最短步 =', bm.minMoves, '（颜色数=2）');
console.log('  A最短步 =', analyze(demo, 'A').minMoves);
console.log('  B首步=', JSON.stringify(bm.branch0), '个合法操作');