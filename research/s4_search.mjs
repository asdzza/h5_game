// S4 关卡搜索：布局 + 颜色配比 + 随机摆块 → 便宜过滤 → 完整 A–H 分析
//
// 用法：
//   node research/s4_search.mjs --layout tri-step --blocks A2B2C2D4 --goal clear --par 7 --limit 9
//   node research/s4_search.mjs --layout quad-s --blocks A2B2C2D4 --goal color --target 1 --par 7 --limit 9
//
// 参数：
//   --layout <name>   布局名（见 LAYOUTS）
//   --blocks A2B2C2D4 颜色+数量（清场关每种颜色必须偶数；目标色必须偶数）
//   --goal clear|color
//   --target 1..5     清色关目标色（1=红 2=蓝 3=绿 4=黄 5=紫）
//   --par <n>        目标 par
//   --limit <n>      步数上限（默认 par+2）
//   --tries <n>      随机盘面数（默认 3000）
//   --seed <n>       随机种子（默认 1）
//   --max-open <n>   开局现成对上限（默认 8）
//   --min-drop2 <n>  清场关至少几种颜色整色拿掉后降 ≥2 步（默认 2）
//   --min-blockstop <n>  最优解里至少几次“停在别的方块旁边”（默认 0）
//   --top <n>        最多输出几个通过 A–H 的候选（默认 5）
//
// 环境变量：
//   S4_SEARCH_NODES  便宜过滤阶段的 A* 节点上限（默认 900000）
//   S4_NODES         完整分析阶段的 A* 节点上限（默认 2000000）
//
// 流程：先只算 par + 首步（便宜），全部达标后才跑 analyze() 的整色/逐墙载荷。
import { parse, genA, applyA, at } from './engine.mjs';
import { aStar } from './solver_fast.mjs';
import { analyze, gateChecks } from './s4_core.mjs';

const LAYOUTS = {
  'tri-l': [[2, 2], [3, 2], [2, 3]],
  'tri-bar': [[3, 2], [3, 3], [3, 4]],
  'tri-step': [[2, 2], [3, 3], [4, 3]],
  'tri-corner': [[2, 2], [4, 4], [2, 4]],
  'tri-spread': [[2, 2], [4, 3], [2, 5]],
  'tri-tri': [[2, 2], [2, 4], [4, 3]],
  'tri-v': [[2, 3], [4, 2], [4, 4]],
  'quad-corners': [[2, 2], [2, 4], [4, 2], [4, 4]],
  'quad-bars': [[2, 2], [2, 3], [4, 3], [4, 4]],
  'quad-s': [[2, 2], [3, 2], [3, 4], [4, 4]],
  'quad-c': [[2, 2], [3, 2], [4, 2], [3, 4]],
  'quad-l': [[2, 2], [3, 2], [4, 2], [4, 3]],
  'quad-mid': [[2, 3], [3, 2], [3, 4], [4, 3]],
  'pent-x': [[2, 2], [2, 4], [3, 3], [4, 2], [4, 4]],
  'pent-plus': [[2, 3], [3, 2], [3, 3], [3, 4], [4, 3]],
  'pent-c': [[2, 2], [2, 4], [3, 2], [4, 2], [4, 4]],
  'pent-z': [[2, 2], [3, 2], [3, 3], [4, 3], [4, 4]],
  'pent-u': [[2, 2], [4, 2], [3, 2], [2, 3], [2, 4]],
};

// ---------- 参数 ----------
const argv = process.argv.slice(2);
const opts = {
  layout: 'tri-step',
  blocks: 'A2B2C2D4',
  goal: 'clear',
  target: null,
  par: 7,
  limit: null,
  tries: 3000,
  seed: 1,
  maxOpen: 8,
  minDrop2: null,
  minBlockstop: 0,
  top: 5,
};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const next = () => argv[++i];
  if (a === '--layout') opts.layout = next();
  else if (a === '--blocks') opts.blocks = next().toUpperCase();
  else if (a === '--goal') opts.goal = next();
  else if (a === '--target') opts.target = Number(next());
  else if (a === '--par') opts.par = Number(next());
  else if (a === '--limit') opts.limit = Number(next());
  else if (a === '--tries') opts.tries = Number(next());
  else if (a === '--seed') opts.seed = Number(next());
  else if (a === '--max-open') opts.maxOpen = Number(next());
  else if (a === '--min-drop2') opts.minDrop2 = Number(next());
  else if (a === '--min-blockstop') opts.minBlockstop = Number(next());
  else if (a === '--top') opts.top = Number(next());
  else throw new Error(`未知参数 ${a}`);
}
if (opts.goal !== 'clear' && opts.goal !== 'color') throw new Error('--goal 只能是 clear 或 color');
if (opts.goal === 'color' && !(opts.target >= 1 && opts.target <= 5)) {
  throw new Error('--goal color 时必须给 --target 1..5');
}
if (opts.limit == null) opts.limit = opts.par + 2;
if (opts.minDrop2 == null) opts.minDrop2 = opts.goal === 'clear' ? 2 : 0;

const WALLS = LAYOUTS[opts.layout];
if (!WALLS) throw new Error(`未知布局 ${opts.layout}；可选：${Object.keys(LAYOUTS).join(', ')}`);

const counts = [];
for (let i = 0; i < opts.blocks.length; i += 2) counts.push([opts.blocks[i], Number(opts.blocks[i + 1])]);
const TOTAL = counts.reduce((s, [, n]) => s + n, 0);
const TARGET_CH = opts.target ? String.fromCharCode(64 + opts.target) : null;
for (const [ch, n] of counts) {
  if (opts.goal === 'clear' && n % 2 !== 0) throw new Error(`清场关颜色 ${ch} 数量 ${n} 不是偶数`);
  if (ch === TARGET_CH && n % 2 !== 0) throw new Error(`目标色 ${ch} 数量 ${n} 不是偶数`);
}

const H = 7;
const W = 7;
const BASE = Array.from({ length: H }, (_, r) =>
  Array.from({ length: W }, (_, c) => (r === 0 || c === 0 || r === H - 1 || c === W - 1 ? '#' : '.')),
);
for (const [r, c] of WALLS) BASE[r][c] = '#';

const FREE = [];
for (let r = 1; r <= 5; r++) for (let c = 1; c <= 5; c++) if (BASE[r][c] === '.') FREE.push([r, c]);
if (TOTAL > FREE.length) throw new Error(`方块数 ${TOTAL} 超过空位 ${FREE.length}`);

// ---------- 随机 ----------
let seed = (opts.seed * 0x9e3779b9) >>> 0;
function rnd() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const SEARCH_CAP = Number(process.env.S4_SEARCH_NODES || 900000);
const ANALYZE_CAP = Number(process.env.S4_NODES || 2000000);
const solve = (st) => aStar(st, 'A', SEARCH_CAP, opts.target ? { targetColor: opts.target } : {});
const parOf = (st) => {
  const r = solve(st);
  return r ? r.len : Infinity;
};

// ---------- 搜索 ----------
const stats = { parMiss: 0, openPop: 0, firstFail: 0, blockStop: 0, analyzeFail: 0, gateFail: 0, accept: 0 };
const results = [];
const bagBase = [];
for (const [ch, n] of counts) for (let i = 0; i < n; i++) bagBase.push(ch);
const t0 = Date.now();

for (let t = 0; t < opts.tries && results.length < opts.top; t++) {
  if (t % 200 === 0 && t > 0) {
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`  ...${t}/${opts.tries} | 通过 ${results.length} | ${sec}s`);
  }
  const cells = shuffle(FREE).slice(0, TOTAL);
  const bag = shuffle(bagBase);
  const g = BASE.map((row) => row.slice());
  cells.forEach(([r, c], i) => { g[r][c] = bag[i]; });
  const rows = g.map((row) => row.join(''));
  const st0 = parse(rows);

  // 先做最便宜的“开局现成对”过滤，再解 par（顺序反过来会浪费大量 A*）
  const firsts = genA(st0);
  const openPops = firsts.filter((m) => m.res === 'pop').length;
  if (openPops > opts.maxOpen) { stats.openPop++; continue; }

  const r0 = solve(st0);
  if (!r0 || r0.len !== opts.par) { stats.parMiss++; continue; }

  const totals = firsts.map((m) => {
    const r = solve(applyA(st0, m));
    return r ? 1 + r.len : Infinity;
  });
  if (totals.some((n) => n === Infinity || n > opts.limit)) { stats.firstFail++; continue; }
  const best = totals.filter((n) => n === opts.par).length;
  const worst = Math.max(...totals);
  if (best < 2 || best > 8) { stats.firstFail++; continue; }
  if (worst <= opts.par) { stats.firstFail++; continue; }

  // 最优解里“停在别的方块旁边”的次数（用于「借位 / 锁与钥匙」这类关卡）
  const DIRV = { U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1] };
  let blockStops = 0;
  for (const p of r0.path) {
    if (p.move.res !== 'move') continue;
    const [dr, dc] = DIRV[p.move.d];
    if (at(p.before, p.move.tr + dr, p.move.tc + dc) > 0) blockStops++;
  }
  if (blockStops < opts.minBlockstop) { stats.blockStop++; continue; }

  // 便宜过滤通过，跑完整载荷分析
  const a = analyze(rows, {
    goal: opts.goal,
    target: opts.target,
    limit: opts.limit,
    cap: ANALYZE_CAP,
    st0,
    r0,
  });
  if (!a.ok) { stats.analyzeFail++; continue; }

  const checks = gateChecks(a, { par: opts.par, limit: opts.limit });
  if (checks.some(([, ok]) => !ok)) {
    const failed = checks.filter(([, ok]) => !ok).map(([name]) => name).join(',');
    stats.gateFail++;
    if (process.env.S4_VERBOSE === '1') console.log(`  x ${failed} | ${rows[1]}`);
    continue;
  }
  if (opts.goal === 'clear') {
    const drops = Object.values(a.loads).filter((p) => p < a.par).map((p) => a.par - p);
    const drop2 = drops.filter((d) => d >= 2).length;
    if (drop2 < opts.minDrop2) { stats.gateFail++; continue; }
  } else {
    const targetCount = rows.join('').split(TARGET_CH).length - 1;
    if (targetCount % 2 !== 0) { stats.gateFail++; continue; }
  }

  stats.accept++;
  results.push(a);
}

// ---------- 输出 ----------
console.log(
  `\n布局 ${opts.layout}（${WALLS.length} 墙）| goal=${opts.goal}${TARGET_CH ? ` target=${TARGET_CH}` : ''} ` +
    `par ${opts.par} 上限 ${opts.limit} | 块 ${opts.blocks} | 扫描 ${opts.tries} 次`,
);
console.log(
  `  未命中 par ${stats.parMiss}，开局对过多 ${stats.openPop}，首步不合 ${stats.firstFail}，` +
    `块停不足 ${stats.blockStop}，超节点/不可解 ${stats.analyzeFail}，A–H 不合 ${stats.gateFail}，通过 ${stats.accept}`,
);

const DIR = { U: '上', D: '下', L: '左', R: '右' };
for (const [i, a] of results.entries()) {
  console.log(
    `\n=== 候选 ${i + 1} | par ${a.par} / 上限 ${a.limit} | 首步 ${a.firstCount}（保持 ${a.best}，` +
      `最差 ${a.worst}）| 开局对 ${a.openPops} | 顺序压力 ${a.pressure.length} | ` +
      `墙停 ${a.stops.wall} 块停 ${a.stops.block} ===`,
  );
  for (const row of a.rows) console.log('  ' + row);
  console.log(
    '  整色载荷 ' +
      Object.entries(a.loads)
        .map(([c, p]) => `${c}→${p === Infinity ? 'X' : p}${p < a.par ? `(-${a.par - p})` : ''}`)
        .join(' '),
  );
  console.log(
    `  逐墙 ${a.perWall.map((x) => `${x.cell}→${x.par}`).join(' ')} | 拆整组→${a.noWallsPar}`,
  );
  for (const p of a.pressure) {
    console.log(
      `  耦合点 第 ${p.step} 步：${p.pops} 个可消对，${p.punished} 个错选被惩罚` +
        `（剩余最优 ${p.remain}，候选总步 ${p.totals.join('/')}）`,
    );
  }
  console.log(
    '  路径 ' +
      a.path
        .map((p, j) => {
          const col = String.fromCharCode(64 + p.before.c[p.move.r * W + p.move.c]);
          if (p.move.res === 'pop') return `${j + 1}.${col}(${p.move.r},${p.move.c})${DIR[p.move.d]}×(${p.move.br},${p.move.bc})`;
          const [dr, dc] = { U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1] }[p.move.d];
          const nr = p.move.tr + dr;
          const nc = p.move.tc + dc;
          const why = a.rows[nr] && a.rows[nr][nc] === '#' ? '墙停' : p.after.c[nr * W + nc] > 0 ? '块停' : '边停';
          return `${j + 1}.${col}(${p.move.r},${p.move.c})${DIR[p.move.d]}→(${p.move.tr},${p.move.tc})${why}`;
        })
        .join(' → '),
  );
  console.log('  判定：' + checksText(a, opts));
}

function checksText(a, o) {
  const checks = gateChecks(a, { par: o.par, limit: o.limit });
  return checks.map(([name, ok]) => `${ok ? 'OK' : 'FAIL'} ${name}`).join(' · ');
}