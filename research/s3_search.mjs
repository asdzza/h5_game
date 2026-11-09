// S3 关卡搜索：目标切换（只清指定色）
//
// 用法：
//   node research/s3_search.mjs <布局> <par> <colors> [tries]
// 例：
//   node research/s3_search.mjs single-mid 3 A2B2C2 4000
//   node research/s3_search.mjs twin-diag 4 A4B2C2 6000
//
// 过滤（比 S2 多一条"非目标块必须有用"）：
//   · 目标色 A* par 恰好等于目标
//   · 所有首步都能在 limit 内通关
//   · 保持 par 的首步 1–5 个，且至少 1 个首步会多花步数
//   · 每种非目标色整色拿掉后 par 必须变化（否则这种颜色就是装饰）
//
// 环境变量：
//   S3_TARGETCOLOR  目标色（1=A 红，默认 1）
//   S3_LIMIT        步数上限（默认 par+3）
//   S3_ALLOW_OPEN   设为 1 时允许开局就有现成消除
import { parse, genA, applyA } from '../research/engine.mjs';
import { aStar } from '../research/solver_fast.mjs';

const TARGET_COLOR = Number(process.env.S3_TARGETCOLOR || 1);
const LAYOUTS = {
  // 单墙：目标切换第一关
  'single-mid': [[3, 3]],
  'single-left': [[3, 2]],
  'single-right': [[3, 4]],
  'single-up': [[2, 3]],
  'single-down': [[4, 3]],
  'single-nw': [[2, 2]],
  'single-se': [[4, 4]],
  // 两墙
  'twin-diag': [[2, 2], [4, 4]],
  'twin-mid': [[3, 2], [3, 4]],
  'twin-col': [[2, 3], [4, 3]],
  'twin-row': [[2, 2], [2, 4]],
  'twin-near': [[3, 2], [3, 3]],
  'twin-far': [[1, 3], [5, 3]],
};

const name = process.argv[2] || 'single-mid';
const TARGET = Number(process.argv[3] || 3);
const COLORS = (process.argv[4] || 'A2B2C2').toUpperCase();
const TRIES = Number(process.argv[5] || 4000);
const LIMIT = Number(process.env.S3_LIMIT || TARGET + 3);
const ALLOW_OPEN = process.env.S3_ALLOW_OPEN === '1';
const WALLS = LAYOUTS[name];
if (!WALLS) throw new Error(`未知布局 ${name}；可选：${Object.keys(LAYOUTS).join(', ')}`);

const counts = [];
for (let i = 0; i < COLORS.length; i += 2) counts.push([COLORS[i], Number(COLORS[i + 1])]);
const TOTAL = counts.reduce((a, [, n]) => a + n, 0);
const TARGET_CH = String.fromCharCode(64 + TARGET_COLOR);
if (!counts.some(([ch, n]) => ch === TARGET_CH && n >= 2 && n % 2 === 0)) {
  throw new Error(`目标色 ${TARGET_CH} 必须至少 2 块且成对`);
}

const H = 7;
const W = 7;
const BASE = Array.from({ length: H }, (_, r) =>
  Array.from({ length: W }, (_, c) => (r === 0 || c === 0 || r === H - 1 || c === W - 1 ? '#' : '.')),
);
for (const [r, c] of WALLS) BASE[r][c] = '#';

const FREE = [];
for (let r = 1; r <= 5; r++) for (let c = 1; c <= 5; c++) if (BASE[r][c] === '.') FREE.push([r, c]);
if (TOTAL > FREE.length) throw new Error('方块数超过空位');

let seed = 0x51ed270b;
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

const solve = (st) => aStar(st, 'A', 220000, { targetColor: TARGET_COLOR });
const parOf = (st) => {
  const r = solve(st);
  return r ? r.len : Infinity;
};

function removeCell(rows, r, c) {
  return rows.map((row, i) => (i === r ? row.slice(0, c) + '.' + row.slice(c + 1) : row));
}

const DIRV = { U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1] };
const isWall = (rows, r, c) =>
  r > 0 && c > 0 && r < H - 1 && c < W - 1 && rows[r][c] === '#';

const results = [];
const stats = { openPop: 0, par: 0, first: 0, load: 0, wall: 0, accept: 0 };
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

  if (!ALLOW_OPEN && genA(st0).some((m) => m.res === 'pop')) { stats.openPop++; continue; }

  const r0 = solve(st0);
  if (!r0 || r0.len !== TARGET) continue;
  stats.par++;

  const firsts = genA(st0);
  let opt = 0;
  let punished = 0;
  let recoverable = 0;
  for (const m of firsts) {
    const r = solve(applyA(st0, m));
    if (!r) continue;
    const total = 1 + r.len;
    if (total === TARGET) opt++;
    if (total > TARGET) punished++;
    if (total <= LIMIT) recoverable++;
  }
  if (recoverable !== firsts.length) { stats.first++; continue; }
  if (opt < 1 || opt > 5) { stats.first++; continue; }
  if (punished < 1) { stats.first++; continue; }

  // 墙：两格以上时整组拆掉必须变快；且至少一格被当刹车用过或单独拿掉会变慢
  let rowsNoWalls = rows;
  for (const [wr, wc] of WALLS) rowsNoWalls = removeCell(rowsNoWalls, wr, wc);
  const allPar = parOf(parse(rowsNoWalls));
  if (WALLS.length >= 2 && !(allPar < TARGET)) { stats.wall++; continue; }
  const wallDetail = [];
  let wallUsed = 0;
  for (const [wr, wc] of WALLS) {
    const used = (() => {
      let n = 0;
      for (const p of r0.path) {
        const m = p.move;
        if (m.res !== 'move') continue;
        const [dr, dc] = DIRV[m.d];
        if (m.tr + dr === wr && m.tc + dc === wc) n++;
      }
      return n;
    })();
    const p2 = parOf(parse(removeCell(rows, wr, wc)));
    if (used > 0 || p2 !== TARGET) wallUsed++;
    wallDetail.push(`${wr},${wc}${used ? `×${used}` : ''}→${p2 === Infinity ? '无解' : p2}`);
  }
  if (wallUsed === 0) { stats.wall++; continue; }
  if (process.env.S3_WALL_ALL === '1' && wallUsed !== WALLS.length) { stats.wall++; continue; }

  // 每种非目标色整色拿掉，par 必须变化（否则这种颜色就是装饰）
  const loadDetail = [];
  let loadOk = true;
  const otherColors = [...new Set(rows.join('').replace(/[^B-E]/g, ''))];
  for (const ch of otherColors) {
    const rows2 = rows.map((row) => row.replace(new RegExp(ch, 'g'), '.'));
    const p2 = parOf(parse(rows2));
    const load = p2 !== TARGET;
    if (!load) { loadOk = false; break; }
    const cellsOfColor = [];
    for (let r = 1; r <= 5; r++)
      for (let c = 1; c <= 5; c++) if (st0.c[r * W + c] === ch.charCodeAt(0) - 64) cellsOfColor.push(`(${r},${c})`);
    loadDetail.push(`${ch}${cellsOfColor.join('')}→${p2 === Infinity ? '无解' : p2}`);
  }
  if (!loadOk) { stats.load++; continue; }

  // 解法里至少有一次用非目标块/墙停车，避免全靠滑到底
  let blockStops = 0;
  let wallStops = 0;
  for (const p of r0.path) {
    const m = p.move;
    if (m.res !== 'move') continue;
    const [dr, dc] = DIRV[m.d];
    const nr = m.tr + dr;
    const nc = m.tc + dc;
    if (isWall(rows, nr, nc)) wallStops++;
    else if (p.after.c[nr * W + nc] > 0) blockStops++;
  }

  stats.accept++;
  results.push({ rows, path: r0.path, opt, punished, firsts: firsts.length, loadDetail, blockStops, wallStops, allPar, wallDetail });
  if (results.length >= 16) break;
}

console.log(`\n布局 ${name}（${WALLS.length} 墙）目标色 ${TARGET_CH} par ${TARGET} 上限 ${LIMIT} 块 ${COLORS}`);
console.log(`  扫描 ${TRIES} 次：开局可消 ${stats.openPop}，par 命中 ${stats.par}，首步不合 ${stats.first}，有装饰色 ${stats.load}，墙不合 ${stats.wall}，通过 ${stats.accept}`);

const DIR = { U: '上', D: '下', L: '左', R: '右' };
for (const c of results) {
  console.log(
    `\n=== par ${TARGET} | 首步 ${c.firsts}（保持 ${c.opt}，走错 ${c.punished}）| 墙 ${c.wallDetail.join(' ')} | 拆整组→${c.allPar} | 墙停 ${c.wallStops} 块停 ${c.blockStops} ===`,
  );
  c.rows.forEach((r) => console.log('  ' + r));
  console.log('  非目标块载荷: ' + c.loadDetail.join(' '));
  console.log(
    '  ' +
      c.path
        .map((p, i) => {
          const col = String.fromCharCode(64 + p.before.c[p.move.r * W + p.move.c]);
          if (p.move.res === 'pop') return `${i + 1}.${col}(${p.move.r},${p.move.c})${DIR[p.move.d]}×(${p.move.br},${p.move.bc})`;
          const [dr, dc] = DIRV[p.move.d];
          const nr = p.move.tr + dr;
          const nc = p.move.tc + dc;
          const why = isWall(c.rows, nr, nc) ? '墙停' : p.after.c[nr * W + nc] > 0 ? '块停' : '边停';
          return `${i + 1}.${col}(${p.move.r},${p.move.c})${DIR[p.move.d]}→(${p.move.tr},${p.move.tc})${why}`;
        })
        .join(' → '),
  );
}