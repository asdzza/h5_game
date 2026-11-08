// 关卡生成器：模板 + 随机摆块 + 求解过滤
//
// 例：
//   node tools/gen.mjs --template two-shafts --blocks A2B2C2 --goal clear --par 6 --limit 10 --tries 400
//   node tools/gen.mjs --template open5 --blocks A2B2C2 --goal A --par 4 --no-open-pop --top 10
//
// 参数
//   --template <name>    tools/templates.mjs 里的模板名（必填）
//   --blocks  A2B2C2    颜色+数量（必填；大小写不敏感，颜色 A–E）
//   --goal    clear|A    清场，或只清某个颜色（默认 clear）
//   --par     <n>        目标 par（必填；只保留"恰好 n 步"的盘面）
//   --limit   <n>        步数上限（默认 par+3）
//   --tries   <n>        随机盘面数（默认 400）
//   --seed    <n>        随机种子（默认 1，结果可复算）
//   --top     <n>        最多输出几个候选（默认 20）
//   --no-open-pop        只保留"开局没有现成可消的一对"的盘面
//   --all-recoverable    只保留"每个首步都还能在上限内通关"的盘面
//   --dead               对最终候选扫死局（较慢）
//   --path    <n>        给前 n 个候选打印一条最优路径（默认 2）
//   --json               末尾输出候选盘面的 JSON 数组
//
// 输出每个候选的：par、首步数、保持 par 的首步、开局可消数、最差首步、以及
// 一条最优路径。评分只用来排序，不替代人工判断。

import { parse, legalMoves, applyMove, isGoal, countBlocks, at } from '../src/game.js';
import { TEMPLATES } from './templates.mjs';

const NODE_CAP = Number(process.env.GEN_NODES || 500000);
const DEAD_CAP = Number(process.env.GEN_DEAD_NODES || 1200000);

// ---------- 参数 ----------
function parseArgs(argv) {
  const o = {
    template: null,
    blocks: null,
    goal: 'clear',
    par: null,
    limit: null,
    tries: 400,
    seed: 1,
    top: 20,
    noOpenPop: false,
    allRecoverable: false,
    dead: false,
    path: 2,
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--template') o.template = next();
    else if (a === '--blocks') o.blocks = next();
    else if (a === '--goal') o.goal = next();
    else if (a === '--par') o.par = Number(next());
    else if (a === '--limit') o.limit = Number(next());
    else if (a === '--tries') o.tries = Number(next());
    else if (a === '--seed') o.seed = Number(next());
    else if (a === '--top') o.top = Number(next());
    else if (a === '--path') o.path = Number(next());
    else if (a === '--no-open-pop') o.noOpenPop = true;
    else if (a === '--all-recoverable') o.allRecoverable = true;
    else if (a === '--dead') o.dead = true;
    else if (a === '--json') o.json = true;
    else if (a === '-h' || a === '--help') {
      console.log('用法见 tools/gen.mjs 顶部注释');
      process.exit(0);
    } else throw new Error(`未知参数: ${a}`);
  }
  if (!o.template) throw new Error('缺少 --template');
  if (!o.blocks) throw new Error('缺少 --blocks（如 A2B2C2）');
  if (!o.par) throw new Error('缺少 --par');
  if (o.limit == null) o.limit = o.par + 3;
  return o;
}

// ---------- 工具 ----------
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const shuffle = (arr, rnd) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

// 只编码有方块的格子：比整盘 join 快一倍
function key(st) {
  let s = '';
  for (let i = 0; i < st.c.length; i++) {
    const v = st.c[i];
    if (v > 0) s += String.fromCharCode(i + 33) + String.fromCharCode(v + 48);
  }
  return s;
}

/** cap 步内最短解；Infinity=cap 内无解；-1=超节点上限 */
function parWithin(start, lv, cap, nodeCap = NODE_CAP) {
  if (isGoal(start, lv)) return 0;
  const seen = new Set([key(start)]);
  let frontier = [start];
  for (let d = 1; d <= cap; d++) {
    const next = [];
    for (const st of frontier) {
      for (const m of legalMoves(st)) {
        const ns = applyMove(st, m);
        if (isGoal(ns, lv)) return d;
        const k = key(ns);
        if (seen.has(k)) continue;
        seen.add(k);
        next.push(ns);
        if (seen.size > nodeCap) return -1;
      }
    }
    if (!next.length) return Infinity;
    frontier = next;
  }
  return Infinity;
}

/** 一条最短路径（含每步之前的局面，便于描述"被谁挡住"） */
function solvePath(start, lv, cap) {
  if (isGoal(start, lv)) return [];
  const seen = new Set([key(start)]);
  const parent = new Map([[key(start), null]]);
  let frontier = [start];
  for (let d = 1; d <= cap; d++) {
    const next = [];
    for (const st of frontier) {
      for (const m of legalMoves(st)) {
        const ns = applyMove(st, m);
        const k = key(ns);
        if (seen.has(k)) continue;
        seen.add(k);
        parent.set(k, { pk: key(st), m, st });
        if (isGoal(ns, lv)) {
          const path = [];
          let kk = k;
          while (parent.get(kk)) {
            const p = parent.get(kk);
            path.push({ m: p.m, st: p.st });
            kk = p.pk;
          }
          return path.reverse();
        }
        next.push(ns);
      }
    }
    if (!next.length) break;
    frontier = next;
  }
  return null;
}

function scanDeadEnds(start, lv, cap, nodeCap = DEAD_CAP) {
  const seen = new Set([key(start)]);
  let frontier = [start];
  let dead = 0;
  for (let d = 1; d <= cap; d++) {
    const next = [];
    for (const st of frontier) {
      for (const m of legalMoves(st)) {
        const ns = applyMove(st, m);
        const k = key(ns);
        if (seen.has(k)) continue;
        seen.add(k);
        if (!isGoal(ns, lv) && legalMoves(ns).length === 0) dead++;
        next.push(ns);
        if (seen.size > nodeCap) return { dead, states: seen.size, capped: true };
      }
    }
    if (!next.length) break;
    frontier = next;
  }
  return { dead, states: seen.size, capped: false };
}

const DIRN = { U: 'U', D: 'D', L: 'L', R: 'R' };
function moveText(p) {
  const col = at(p.st, p.m.r, p.m.c);
  const c = String.fromCharCode(64 + col);
  if (p.m.res === 'pop') return `${c}(${p.m.r},${p.m.c})${DIRN[p.m.d]}×${m_other(p)}`;
  return `${c}(${p.m.r},${p.m.c})${DIRN[p.m.d]}→(${p.m.tr},${p.m.tc})`;
}
function m_other(p) {
  return `(${p.m.br},${p.m.bc})`;
}

/** "A2B2C2" -> [['A',2],...] */
function parseBlocks(spec) {
  const out = [];
  const re = /([A-Ea-e])\s*(\d+)/g;
  let m;
  let rest = spec.replace(/[,\s]/g, '');
  while ((m = re.exec(rest))) out.push([m[1].toUpperCase(), Number(m[2])]);
  if (out.map(([c, n]) => c + n).join('') !== rest.toUpperCase()) {
    throw new Error(`--blocks 写法不认识: ${spec}`);
  }
  return out;
}

// ---------- 主流程 ----------
const opt = parseArgs(process.argv.slice(2));
const tpl = TEMPLATES[opt.template];
if (!tpl) throw new Error(`没有模板 ${opt.template}；可选: ${Object.keys(TEMPLATES).join(', ')}`);

const blockSpec = parseBlocks(opt.blocks);
const colors = [];
for (const [ch, n] of blockSpec) {
  const v = ch.charCodeAt(0) - 64;
  for (let i = 0; i < n; i++) colors.push(ch);
}
const totalBlocks = colors.length;

const freeCells = [];
for (let r = 1; r < tpl.length - 1; r++)
  for (let c = 1; c < tpl[r].length - 1; c++) if (tpl[r][c] === '.') freeCells.push([r, c]);
if (freeCells.length < totalBlocks) {
  throw new Error(`模板 ${opt.template} 只有 ${freeCells.length} 个空位，放不下 ${totalBlocks} 块`);
}

const goalColor = opt.goal === 'clear' ? null : opt.goal.toUpperCase().charCodeAt(0) - 64;
if (opt.goal !== 'clear' && !(goalColor >= 1 && goalColor <= 5)) {
  throw new Error(`--goal 只能是 clear 或颜色 A–E，收到 ${opt.goal}`);
}
if (goalColor != null) {
  const need = colors.filter((c) => c === opt.goal.toUpperCase()).length;
  if (need < 2 || need % 2 !== 0) throw new Error(`目标色 ${opt.goal.toUpperCase()} 必须至少 2 块且成对，当前 ${need} 块`);
}

const rnd = mulberry32(opt.seed);
const hist = new Map();
const candidates = [];
const seenBoards = new Set();
let capped = 0;

for (let t = 0; t < opt.tries; t++) {
  if (opt.tries >= 100 && t > 0 && t % 100 === 0) {
    console.log(`  ...${t}/${opt.tries}，已保留 ${candidates.length}`);
  }
  const cells = shuffle(freeCells.slice(), rnd).slice(0, totalBlocks);
  const cols = shuffle(colors.slice(), rnd);
  const g = tpl.map((row) => row.split(''));
  cells.forEach(([r, c], i) => { g[r][c] = cols[i]; });
  const rows = g.map((row) => row.join(''));
  const sig = rows.join('|');
  if (seenBoards.has(sig)) continue;
  seenBoards.add(sig);

  const lv = { rows, goal: goalColor == null ? 'clear' : 'color', targetColor: goalColor };
  const st0 = parse(rows);
  if (countBlocks(st0) !== totalBlocks) continue;

  const par = parWithin(st0, lv, opt.par);
  if (par === -1) { capped++; continue; }
  if (par === Infinity) { hist.set(`>${opt.par}`, (hist.get(`>${opt.par}`) || 0) + 1); continue; }
  hist.set(par, (hist.get(par) || 0) + 1);
  if (par !== opt.par) continue;

  // 首步表：距离按"上限内"算，超出上限统一记为 Infinity
  const firsts = legalMoves(st0).map((m) => {
    const d = parWithin(applyMove(st0, m), lv, opt.limit - 1);
    return { m, total: Number.isFinite(d) && d >= 0 ? 1 + d : Infinity };
  });
  const optFirst = firsts.filter((x) => x.total === opt.par).length;
  const openPop = firsts.filter((x) => x.m.res === 'pop').length;
  const punished = firsts.filter((x) => x.total > opt.par).length;
  const recoverable = firsts.filter((x) => x.total <= opt.limit).length;

  if (opt.noOpenPop && openPop > 0) continue;
  if (opt.allRecoverable && recoverable !== firsts.length) continue;

  let score = 0;
  score += optFirst >= 1 && optFirst <= 4 ? 3 : optFirst === 5 ? 1 : 0;
  score += openPop === 0 ? 3 : 0;
  score += Math.min(punished, 8);
  score += recoverable === firsts.length ? 2 : 0;

  candidates.push({ rows, lv, firsts, optFirst, openPop, punished, recoverable, score });
}

console.log(`\ngen: template=${opt.template} blocks=${blockSpec.map(([c, n]) => c + '×' + n).join(' ')} ` +
  `goal=${goalColor == null ? 'clear' : opt.goal.toUpperCase()} par=${opt.par} limit=${opt.limit} ` +
  `tries=${opt.tries} seed=${opt.seed}`);
console.log('par 分布:', [...hist.entries()].sort().map(([k, v]) => `${k}:${v}`).join('  ') || '（无）',
  capped ? `| 超节点上限 ${capped}` : '');
console.log(`保留 ${candidates.length} 个候选`);

candidates.sort((a, b) => b.score - a.score || a.optFirst - b.optFirst);
const top = candidates.slice(0, opt.top);

let deadFail = 0;
if (opt.dead) {
  for (const c of top) {
    const de = scanDeadEnds(parse(c.rows), c.lv, opt.limit);
    c.dead = de.dead;
    c.deadCapped = de.capped;
    c.deadStates = de.states;
    if (de.dead > 0) deadFail++;
  }
  console.log(`死局扫描：${top.length} 个候选，${deadFail} 个有死局`);
}

top.forEach((c, i) => {
  const worst = Math.max(...c.firsts.map((x) => (x.total === Infinity ? 99 : x.total)));
  console.log(
    `\n=== #${i + 1} score ${c.score} | par ${opt.par} | 首步 ${c.firsts.length}（保持 ${c.optFirst}，最差 ${
      worst === 99 ? '>上限' : worst
    }）| 开局可消 ${c.openPop} | 限内仍可过 ${c.recoverable}/${c.firsts.length}` +
      (c.dead != null ? ` | 死局 ${c.dead}${c.deadCapped ? '(未扫完)' : ''}` : '') + ' ===',
  );
  c.rows.forEach((r) => console.log('  ' + r));
  console.log('  最优首步: ' + c.firsts.filter((x) => x.total === opt.par).map((x) => `${x.m.r},${x.m.c}${x.m.d}`).join(' | '));
  if (i < opt.path) {
    const path = solvePath(parse(c.rows), c.lv, opt.par);
    if (path) console.log('  路径: ' + path.map(moveText).join(' → '));
  }
});

if (opt.json) {
  console.log('\nJSON ' + JSON.stringify(top.map((c) => c.rows)));
}
console.log(`\ncandidates=${candidates.length} printed=${top.length}`);