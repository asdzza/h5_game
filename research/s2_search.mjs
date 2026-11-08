// S2 关卡搜索：固定墙体布局 + 随机摆块 + A* 求 par
//
// 用法：
//   node research/s2_search.mjs <布局> [tries] [par] [colors]
// 例：
//   node research/s2_search.mjs h-wall 3000 7 A2B2C2D2
//
// 过滤：
//   · par 恰好等于目标
//   · 开局没有现成的同色对
//   · 保持 par 的首步 1–4 个
//   · 所有首步都能在 limit 内通关
//   · 每格内墙要么被最优解当刹车用过，要么拿掉后 par 变慢
import { parse, genA, applyA, goalA, key } from '../research/engine.mjs';
import { aStar } from '../research/solver_fast.mjs';

const LAYOUTS = {
  'h-wall': [[3, 2], [3, 3], [3, 4]],
  cross9: [[1, 2], [3, 2]],
  ring6: [[1, 2], [1, 4], [3, 2], [3, 4]],
  gate: [[1, 3], [2, 3], [4, 3], [5, 3]],
  corridor: [[2, 2], [2, 3], [2, 4]],
  elbow: [[2, 2], [2, 3], [3, 2]],
  twin: [[2, 2], [2, 4]],
  notch: [[1, 3], [2, 3], [3, 3]],
  flank: [[2, 1], [2, 2], [2, 4], [2, 5]],
  concave3: [[2, 2], [2, 3], [3, 2]],
  bay3: [[2, 2], [2, 3], [2, 4]],
  ring3: [[2, 2], [2, 4], [4, 3]],
};

const name = process.argv[2] || 'h-wall';
const TRIES = Number(process.argv[3] || 3000);
const TARGET = Number(process.argv[4] || 7);
const COLORS = (process.argv[5] || 'A2B2C2D2').toUpperCase();
const LIMIT = TARGET + 3;
const WALLS = LAYOUTS[name];
if (!WALLS) throw new Error(`未知布局 ${name}；可选：${Object.keys(LAYOUTS).join(', ')}`);
const MIN_WALLS = Number(process.env.S2_MIN_WALLS || WALLS.length);

const counts = [];
for (let i = 0; i < COLORS.length; i += 2) counts.push([COLORS[i], Number(COLORS[i + 1])]);
const TOTAL = counts.reduce((a, [, n]) => a + n, 0);

const H = 7;
const W = 7;
const BASE = Array.from({ length: H }, (_, r) =>
  Array.from({ length: W }, (_, c) => (r === 0 || c === 0 || r === H - 1 || c === W - 1 ? '#' : '.')),
);
for (const [r, c] of WALLS) BASE[r][c] = '#';

const FREE = [];
for (let r = 1; r <= 5; r++) for (let c = 1; c <= 5; c++) if (BASE[r][c] === '.') FREE.push([r, c]);
if (TOTAL > FREE.length) throw new Error('方块数超过空位');

let seed = 0x9e3779b9;
function rnd() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const DIRV = { U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1] };
const isInnerWall = (rows, r, c) =>
  r > 0 && c > 0 && r < rows.length - 1 && c < rows[0].length - 1 && rows[r][c] === '#';

function usedLater(timeline, i) {
  const color = timeline[i].before.c[timeline[i].m.r * W + timeline[i].m.c];
  let later = timeline[i].after;
  for (let j = i + 1; j < timeline.length; j++) {
    const q = timeline[j].m;
    if (later.c[q.r * W + q.c] === color && (q.res === 'pop' || q.res === 'move')) return true;
    later = timeline[j].after;
  }
  return false;
}

function analyzePath(path) {
  const timeline = path.map((p) => ({ m: p.move, before: p.before, after: p.after }));
  const wallStops = new Map();
  let blockStops = 0;
  timeline.forEach((t, i) => {
    const { m, after } = t;
    if (m.res !== 'move') return;
    if (!usedLater(timeline, i)) return;
    const [dr, dc] = DIRV[m.d];
    const nr = m.tr + dr;
    const nc = m.tc + dc;
    if (isInnerWall(rowsForWalls, nr, nc)) wallStops.set(nr * 7 + nc, (wallStops.get(nr * 7 + nc) || 0) + 1);
    else if (after.c[nr * 7 + nc] > 0) blockStops++;
  });
  return { wallStops, blockStops };
}

let rowsForWalls = null;

function removeWall(rows, wr, wc) {
  return rows.map((row, r) => (r === wr ? row.slice(0, wc) + '.' + row.slice(wc + 1) : row));
}

const results = [];
const stats = { openPop: 0, parOk: 0, first: 0, wall: 0, accept: 0 };
const t0 = Date.now();
for (let t = 0; t < TRIES; t++) {
  if (t % 100 === 0 && t > 0) {
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`  ...${t}/${TRIES} | 候选 ${results.length} | ${sec}s`);
  }
  const cells = shuffle(FREE.slice()).slice(0, TOTAL);
  const bag = [];
  for (const [ch, n] of counts) for (let i = 0; i < n; i++) bag.push(ch);
  shuffle(bag);
  const g = BASE.map((row) => row.slice());
  cells.forEach(([r, c], i) => { g[r][c] = bag[i]; });
  const rows = g.map((row) => row.join(''));
  const st0 = parse(rows);
  if (genA(st0).some((m) => m.res === 'pop')) { stats.openPop++; continue; }

  const r0 = aStar(st0, 'A', 150000);
  if (!r0 || r0.len !== TARGET) continue;
  stats.parOk++;

  // 首步表
  const firsts = genA(st0);
  let opt = 0;
  let punished = 0;
  let recoverable = 0;
  for (const m of firsts) {
    const r = aStar(applyA(st0, m), 'A', 150000);
    if (!r) continue;
    const total = 1 + r.len;
    if (total === TARGET) opt++;
    if (total > TARGET) punished++;
    if (total <= LIMIT) recoverable++;
  }
  if (recoverable !== firsts.length) { stats.first++; continue; }
  if (opt < 1 || opt > 4) { stats.first++; continue; }
  if (punished < 1) { stats.first++; continue; }

  // 墙的用途：整组墙必须真的改变 par（拆掉整组后变快），
  // 且至少有一格被当刹车用过或单独拿掉会变慢。
  rowsForWalls = rows;
  const a = analyzePath(r0.path);
  let wallOk = 0;
  const wallDetail = [];
  for (const [wr, wc] of WALLS) {
    const used = a.wallStops.get(wr * 7 + wc) || 0;
    const r2 = removeWall(rows, wr, wc);
    const p2 = aStar(parse(r2), 'A', 150000);
    const p2len = p2 ? p2.len : Infinity;
    const load = p2len !== TARGET;
    if (used > 0 || load) wallOk++;
    wallDetail.push(`${wr},${wc}${used ? `×${used}` : ''}→${p2len}${load ? '*' : ''}`);
  }
  let rowsNoWalls = rows;
  for (const [wr, wc] of WALLS) rowsNoWalls = removeWall(rowsNoWalls, wr, wc);
  const pAll = aStar(parse(rowsNoWalls), 'A', 150000);
  const allPar = pAll ? pAll.len : Infinity;
  if (!(allPar < TARGET)) { stats.wall++; continue; }
  if (a.wallStops.size === 0 && wallOk === 0) { stats.wall++; continue; }
  stats.accept++;

  results.push({
    rows,
    par: r0.len,
    path: r0.path,
    opt,
    punished,
    firsts: firsts.length,
    wallDetail,
    wallStops: a.wallStops.size,
    blockStops: a.blockStops,
    allPar,
  });
  if (results.length >= 12) break;
}

console.log(`\n布局 ${name}（${WALLS.length} 墙，至少 ${MIN_WALLS} 格有用途）：扫描 ${TRIES} 次，候选 ${results.length} 个`);
console.log(`  诊断：开局可消 ${stats.openPop}，par 命中 ${stats.parOk}，首步不合 ${stats.first}，墙不合 ${stats.wall}，通过 ${stats.accept}`);

const DIR = { U: '上', D: '下', L: '左', R: '右' };
for (const c of results) {
  console.log(
    `\n=== par ${c.par} | 首步 ${c.firsts}（保持 ${c.opt}，走错 ${c.punished}）| 墙 ${c.wallDetail.join(' ')} | 拆整组→${c.allPar} | 墙停 ${c.wallStops} 块停 ${c.blockStops} ===`,
  );
  c.rows.forEach((r) => console.log('  ' + r));
  console.log(
    '  ' +
      c.path
        .map((p, i) => {
          const col = String.fromCharCode(64 + p.before.c[p.move.r * W + p.move.c]);
          if (p.move.res === 'pop') return `${i + 1}.${col}(${p.move.r},${p.move.c})${DIR[p.move.d]}×(${p.move.br},${p.move.bc})`;
          const [dr, dc] = DIRV[p.move.d];
          const nr = p.move.tr + dr;
          const nc = p.move.tc + dc;
          const why = isInnerWall(c.rows, nr, nc)
            ? '墙停'
            : p.after.c[nr * W + nc] > 0
              ? '块停'
              : '边停';
          return `${i + 1}.${col}(${p.move.r},${p.move.c})${DIR[p.move.d]}→(${p.move.tr},${p.move.tc})${why}`;
        })
        .join(' → '),
  );
}