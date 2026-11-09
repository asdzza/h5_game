// S5 候选猎手：从已验收盘面出发做局部变异，先用 par 预筛，再跑完整 A–H + S5 额外门槛。
//
// 用法：
//   node research/s5_hunt.mjs --tag l41 --par 8 --limit 9 --tries 200 --seed 41
//   node research/s5_hunt.mjs --tag l43 --goal color --target 1 --par 8 --limit 9 --tries 200 --seed 43
//
// 参数：
//   --base 31-40        起始盘面范围（默认 31-40）
//   --goal clear|color  目标（默认 clear）
//   --target 1..5       清色目标（默认 0）
//   --par <n>           目标 par（默认 9）
//   --limit <n>         步数上限（默认 par+1）
//   --tries <n>         变异次数（默认 200）
//   --seed <n>          随机种子（默认 1）
//   --top <n>           最多保留几个通过候选（默认 3）
//   --mutations <n>     每次变异步数（默认 2）
//   --blocks <a-b>      块数范围（默认 10-12）
//   --walls <a-b>       内墙范围（默认 3-5）
//   --colors <n>        颜色数（默认 5）
//   --out <file>        结果 JSON 路径（默认 research/s5_found/<tag>.json）
//   --rows "r1,r2,..."  直接验证一个手写盘面（用 | 分隔行）
//
// 输出：通过全部门槛的候选（按压力/墙停/par 排序），含 nudge 文本。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEVELS } from '../src/levels.js';
import { parse, toRows } from './engine.mjs';
import { aStar } from './solver_fast.mjs';
import { analyze, gateChecks } from './s4_core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COLORS = ['红', '蓝', '绿', '黄', '紫'];
const DIRNAME = { U: '上', D: '下', L: '左', R: '右' };

function parseArgs(argv) {
  const o = {
    base: '31-40', goal: 'clear', target: 0, par: 9, limit: null,
    tries: 200, seed: 1, top: 3, mutations: 2,
    blocksMin: 10, blocksMax: 12, wallsMin: 3, wallsMax: 5, colorsMin: 5, colorsMax: 5,
    out: null, tag: null, rows: null, cap: 60000, analyzeCap: 200000, quiet: false, relaxLimit: false, relaxGates: false, softBudget: 1,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--base') o.base = next();
    else if (a === '--goal') o.goal = next();
    else if (a === '--target') o.target = Number(next());
    else if (a === '--par') o.par = Number(next());
    else if (a === '--limit') o.limit = Number(next());
    else if (a === '--tries') o.tries = Number(next());
    else if (a === '--seed') o.seed = Number(next());
    else if (a === '--top') o.top = Number(next());
    else if (a === '--mutations') o.mutations = Number(next());
    else if (a === '--blocks') { const [x, y = x] = next().split('-').map(Number); o.blocksMin = x; o.blocksMax = y; }
    else if (a === '--walls') { const [x, y = x] = next().split('-').map(Number); o.wallsMin = x; o.wallsMax = y; }
    else if (a === '--colors') { const [x, y = x] = next().split('-').map(Number); o.colorsMin = x; o.colorsMax = y; }
    else if (a === '--out') o.out = next();
    else if (a === '--tag') o.tag = next();
    else if (a === '--rows') o.rows = next();
    else if (a === '--cap') o.cap = Number(next());
    else if (a === '--analyze-cap') o.analyzeCap = Number(next());
    else if (a === '--quiet') o.quiet = true;
    else if (a === '--relax-limit') o.relaxLimit = true;
    else if (a === '--relax-gates') o.relaxGates = true;
    else if (a === '--soft-budget') o.softBudget = Number(next());
    else throw new Error(`未知参数 ${a}`);
  }
  if (o.limit == null) o.limit = o.par + 1;
  return o;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const keyOf = (rows) => rows.join('/');

function baseRange(spec) {
  if (spec.includes(',')) return spec.split(',').map(Number);
  if (spec.includes('-')) {
    const [a, b] = spec.split('-').map(Number);
    const out = [];
    for (let i = a; i <= b; i++) out.push(i);
    return out;
  }
  return [Number(spec)];
}

function stats(rows) {
  const blocks = [];
  const walls = [];
  const colors = new Set();
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const ch = rows[r][c];
      if (ch >= 'A' && ch <= 'E') { blocks.push([r, c, ch]); colors.add(ch); }
      else if (ch === '#') walls.push([r, c]);
    }
  }
  const H = rows.length, W = rows[0].length;
  const innerWalls = walls.filter(([r, c]) => r > 0 && r < H - 1 && c > 0 && c < W - 1);
  return { blocks, walls, innerWalls, colors, H, W };
}

function mutate(rows, rng, steps) {
  const g = rows.map((row) => row.split(''));
  const H = g.length, W = g[0].length;
  const empties = () => {
    const out = [];
    for (let r = 1; r < H - 1; r++) for (let c = 1; c < W - 1; c++) if (g[r][c] === '.') out.push([r, c]);
    return out;
  };
  let changed = 0;
  for (let s = 0; s < steps; s++) {
    const kind = rng();
    if (kind < 0.62) {
      const cand = [];
      for (let r = 1; r < H - 1; r++) for (let c = 1; c < W - 1; c++) if (g[r][c] >= 'A' && g[r][c] <= 'E') cand.push([r, c]);
      if (!cand.length) continue;
      const [r0, c0] = cand[Math.floor(rng() * cand.length)];
      const es = empties();
      if (!es.length) continue;
      const [r1, c1] = es[Math.floor(rng() * es.length)];
      g[r1][c1] = g[r0][c0];
      g[r0][c0] = '.';
      changed++;
    } else if (kind < 0.85) {
      const { innerWalls } = stats(g.map((row) => row.join('')));
      if (!innerWalls.length) continue;
      const [r0, c0] = innerWalls[Math.floor(rng() * innerWalls.length)];
      const es = empties();
      if (!es.length) continue;
      const [r1, c1] = es[Math.floor(rng() * es.length)];
      g[r1][c1] = '#';
      g[r0][c0] = '.';
      changed++;
    } else if (kind < 0.9) {
      const { innerWalls } = stats(g.map((row) => row.join('')));
      if (innerWalls.length <= 3) continue;
      const [r0, c0] = innerWalls[Math.floor(rng() * innerWalls.length)];
      g[r0][c0] = '.';
      changed++;
    } else if (kind < 0.95) {
      const { innerWalls } = stats(g.map((row) => row.join('')));
      if (innerWalls.length >= 5) continue;
      const es = empties();
      if (!es.length) continue;
      const [r1, c1] = es[Math.floor(rng() * es.length)];
      g[r1][c1] = '#';
      changed++;
    } else {
      const cand = [];
      for (let r = 1; r < H - 1; r++) for (let c = 1; c < W - 1; c++) if (g[r][c] >= 'A' && g[r][c] <= 'E') cand.push([r, c]);
      if (cand.length < 2) continue;
      const a = cand[Math.floor(rng() * cand.length)];
      const b = cand[Math.floor(rng() * cand.length)];
      if (a[0] === b[0] && a[1] === b[1]) continue;
      const t = g[a[0]][a[1]];
      g[a[0]][a[1]] = g[b[0]][b[1]];
      g[b[0]][b[1]] = t;
      changed++;
    }
  }
  return changed ? g.map((row) => row.join('')) : null;
}

function colorAt(rows, r, c) {
  const ch = rows[r][c];
  return ch >= 'A' && ch <= 'E' ? COLORS[ch.charCodeAt(0) - 65] : null;
}

function nudgeText(a) {
  const parts = [];
  for (let i = 0; i < a.path.length; i++) {
    const { move: m, before } = a.path[i];
    const br = toRows(before);
    const cname = colorAt(br, m.r, m.c);
    const who = `第${m.r + 1}行第${m.c + 1}列的${cname}块`;
    const dir = DIRNAME[m.d];
    if (m.res === 'pop') {
      const t = colorAt(br, m.br, m.bc);
      parts.push(`${i === 0 ? '先' : ''}把${who}向${dir}推，撞掉第${m.br + 1}行第${m.bc + 1}列的${t}块`);
    } else {
      const ar = m.tr + (m.d === 'U' ? -1 : m.d === 'D' ? 1 : 0);
      const ac = m.tc + (m.d === 'L' ? -1 : m.d === 'R' ? 1 : 0);
      const atStop = br[ar] && br[ar][ac];
      let stop = '';
      if (atStop === '#') stop = '，被墙挡住';
      else if (atStop >= 'A' && atStop <= 'E') stop = `，被${COLORS[atStop.charCodeAt(0) - 65]}块挡住`;
      parts.push(`${i === 0 ? '先' : ''}把${who}向${dir}推，停在第${m.tr + 1}行第${m.tc + 1}列${stop}`);
    }
  }
  return parts.join('；') + '。';
}

function evaluate(rows, o, seen) {
  const s = stats(rows);
  const blocks = s.blocks.length;
  const inner = s.innerWalls.length;
  if (blocks < o.blocksMin || blocks > o.blocksMax) return { fail: 'blocks' };
  if (inner < o.wallsMin || inner > o.wallsMax) return { fail: 'walls' };
  if (s.colors.size < o.colorsMin || s.colors.size > o.colorsMax) return { fail: 'colors' };
  if (o.goal === 'color') {
    const ch = String.fromCharCode(64 + o.target);
    const n = s.blocks.filter((b) => b[2] === ch).length;
    if (n < 2 || n % 2 !== 0) return { fail: 'target-even' };
  }
  const h = keyOf(rows);
  if (seen.has(h)) return { fail: 'dup' };

  const st0 = parse(rows);
  const r0 = aStar(st0, 'A', o.cap, o.goal === 'color' ? { targetColor: o.target } : {});
  if (!r0) return { fail: 'precheck-cap' };
  if (r0.len !== o.par) return { fail: `par=${r0.len}` };

  const a = analyze(rows, {
    goal: o.goal,
    target: o.goal === 'color' ? o.target : null,
    limit: o.limit,
    cap: o.analyzeCap,
    st0,
    r0,
  });
  if (!a.ok) return { fail: 'analyze' };
  // 分析阶段如果某个子解撞到节点上限，参数（载荷）就不可信，直接丢弃。
  if (!Number.isFinite(a.noWallsPar) || Object.values(a.loads).some((v) => !Number.isFinite(v))) {
    return { fail: 'analyze-cap' };
  }

  const checks = gateChecks(a, { par: o.par, limit: o.limit });
  if (o.relaxLimit) {
    // S5 精算段：允许“走错就被上限拦下”（撤销即可），但仍保证没有死局。
    const allSolvable = a.firstResults.every((x) => x.total !== Infinity);
    checks[2] = ['首步全部可解（无死局）', allSolvable, `${a.firstResults.filter((x) => x.total === Infinity).length} 个死步`];
  }
  const extra = [];
  const slack = o.limit - a.par;
  extra.push(['上限只多 1–2 步', slack === 1 || slack === 2, `limit-par=${slack}`]);
  extra.push(['块数达标', a.blocks >= o.blocksMin && a.blocks <= o.blocksMax, `${a.blocks} 块`]);
  extra.push(['颜色数达标', s.colors.size >= o.colorsMin && s.colors.size <= o.colorsMax, `${s.colors.size} 色`]);
  extra.push(['内墙 3–5 格', inner >= o.wallsMin && inner <= o.wallsMax, `${inner} 格`]);
  extra.push(['最优解至少一次墙停', a.stops.wall >= 1, `${a.stops.wall} 次`]);
  if (o.goal === 'clear') {
    const drop2 = Object.values(a.loads).filter((p) => a.par - p >= 2).length;
    extra.push(['至少两种颜色降 ≥2 步', drop2 >= 2, `${drop2} 种`]);
  } else {
    let n = 0;
    for (const ch of rows.join('')) if (ch === String.fromCharCode(64 + o.target)) n++;
    extra.push(['目标色块数为偶数', n > 0 && n % 2 === 0, `${n} 块`]);
  }
  const all = [...checks, ...extra];
  const SOFT = new Set([
    '保持 par 的首步 2–8 个',
    '非目标色全部承重',
    '至少一个顺序耦合点',
    '至少两种颜色降 ≥2 步',
  ]);
  const bad = all.filter(([, ok]) => !ok);
  const hardBad = bad.filter(([name]) => !SOFT.has(name));
  if (hardBad.length) return { fail: hardBad.map(([name, , d]) => `${name}(${d})`).join(',') };
  const softBad = bad.filter(([name]) => SOFT.has(name));
  if (!o.relaxGates && softBad.length) return { fail: softBad.map(([name, , d]) => `${name}(${d})`).join(',') };
  if (o.relaxGates && softBad.length > o.softBudget) return { fail: softBad.map(([name, , d]) => `${name}(${d})`).join(',') };

  return {
    ok: true,
    rows,
    goal: o.goal,
    target: o.goal === 'color' ? o.target : null,
    par: a.par,
    limit: o.limit,
    blocks: a.blocks,
    colors: s.colors.size,
    walls: inner,
    firstCount: a.firstCount,
    best: a.best,
    worst: a.worst,
    pressure: a.pressure.length,
    softMiss: softBad.map(([name]) => name),
    stops: a.stops,
    loads: a.loads,
    noWallsPar: a.noWallsPar,
    pathText: a.pathText,
    nudge: nudgeText(a),
  };
}

const o = parseArgs(process.argv.slice(2));
const rng = mulberry32(o.seed);
const seen = new Set(LEVELS.map((lv) => keyOf(lv.rows)));
const outPath = o.out || path.join(__dirname, 's5_found', `${o.tag || 'cand'}.json`);
fs.mkdirSync(path.dirname(outPath), { recursive: true });

const found = [];
const failCount = {};
const bump = (k) => { failCount[k] = (failCount[k] || 0) + 1; };

function saveFound() {
  fs.writeFileSync(outPath, JSON.stringify({ spec: o, found }, null, 2));
}

function consider(rows) {
  const r = evaluate(rows, o, seen);
  if (!r.ok) { bump(String(r.fail).split('(')[0].split(',')[0]); return false; }
  seen.add(keyOf(rows));
  found.push(r);
  saveFound();
  console.log(`  + #${found.length} par ${r.par} 首步 ${r.firstCount} 保持 ${r.best} 最差 ${r.worst} 压力 ${r.pressure} 墙停 ${r.stops.wall} 块停 ${r.stops.block} 拆墙 ${r.noWallsPar}`);
  for (const line of r.pathText) console.log(`      ${line}`);
  console.log(`      nudge: ${r.nudge}`);
  return true;
}

const t0 = Date.now();
if (o.rows) {
  const rows = o.rows.split('|');
  consider(rows);
} else {
  const from = baseRange(o.base);
  const bases = LEVELS.filter((lv) => from.includes(lv.id)).map((lv) => lv.rows);
  if (!bases.length) throw new Error('没有起始盘面');
  for (let i = 0; i < o.tries && found.length < o.top; i++) {
    const base = bases[Math.floor(rng() * bases.length)];
    const rows = mutate(base, rng, 1 + Math.floor(rng() * o.mutations));
    if (!rows) continue;
    consider(rows);
    if (!o.quiet && (i + 1) % 25 === 0) {
      const line = `  ... ${i + 1}/${o.tries} 用时 ${((Date.now() - t0) / 1000).toFixed(0)}s 命中 ${found.length} 失败 ${JSON.stringify(failCount)}`;
      console.log(line);
      fs.appendFileSync(outPath.replace(/\.json$/, '.log'), line + '\n');
    }
  }
}

const result = { spec: o, checked: o.tries, found };
fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
console.log(`\n完成：${found.length} 个候选 -> ${outPath}（${((Date.now() - t0) / 1000).toFixed(0)}s）`);
console.log('失败分布：' + JSON.stringify(failCount));