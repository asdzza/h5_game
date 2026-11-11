// 关卡校验：node tools/verify.mjs [--dead] [--first]
//
// 与 tools/test_rules.mjs 的区别：test_rules 断言的是"关卡设计意图"（某一步必须
// 怎么走、禁掉什么会退化），这里只做流水线体检——任何新关卡入库前都能跑：
//
//   · 结构：外圈必须是墙、方块数 4–12、清场必须成对、清色目标必须≥2 且成对
//   · 可解：在声明的 par 步内必须真的能通关（par 只能是"不超过"，不能虚报）
//   · 预算：par ≤ 上限，且至少留 1 步容错
//   · --dead  再扫 10 步/上限内可达局面的死局（无路可走且未达标）
//   · --first 再统计每个首步离最优差几步（用来判断"一步走错掉几颗星"）
//   · 第 9 关起 BFS 状态数过大，par 与 --first 改用 A*（VERIFY_ASTAR_NODES，默认 90 万）
//
// 输出末行固定为 levels=<N> failed=<M>，失败时进程退出码为 1。
import { parse, legalMoves, applyMove, isGoal, countBlocks, at } from '../src/game.js';
import { LEVELS } from '../src/levels.js';
import { parse as rParse, genA, applyA } from '../research/engine.mjs';
import { aStar } from '../research/solver_fast.mjs';

const argv = process.argv.slice(2);
const OPT_DEAD = argv.includes('--dead');
const OPT_FIRST = argv.includes('--first');
const NODE_CAP = Number(process.env.VERIFY_NODES || 600000);
const DEAD_CAP = Number(process.env.VERIFY_DEAD_NODES || 1200000);
const ASTAR_CAP = Number(process.env.VERIFY_ASTAR_NODES || 900000);
// 9 关起块数变多，BFS 状态数会超过 60 万；改用已校准的 A*（与 tools/test_rules.mjs 同一内核）
const FAST_FROM = 9;
const goalOpts = (lv) => (lv.goal === 'color' ? { targetColor: lv.targetColor } : {});
const fastPar = (lv) => {
  const r = aStar(rParse(lv.rows), 'A', ASTAR_CAP, goalOpts(lv));
  return r ? r.len : -1;
};

// 紧凑 key：只编码"有方块的格子 + 颜色"，比整盘 join 快约 2 倍。
function key(st) {
  let s = '';
  for (let i = 0; i < st.c.length; i++) {
    const v = st.c[i];
    if (v > 0) s += String.fromCharCode(i + 33) + String.fromCharCode(v + 48);
  }
  if (st.fixed) for (let i = 0; i < st.fixed.length; i++) if (st.fixed[i]) s += `|${i}`;
  if (st.berths && st.berths.length) s += `|P${st.filled || 0}`;
  return s;
}

/** 在 cap 步内找最短解；返回 0..cap / Infinity（cap 内无解）/ -1（超出节点上限） */
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

const show = (v) => (v === -1 ? '#' : v === 0 ? '.' : String.fromCharCode(64 + v));

let failed = 0;
const rowsOut = [];

for (const lv of LEVELS) {
  const errs = [];
  const notes = [];
  let par = null;
  let st = null;

  try {
    if (!Array.isArray(lv.rows) || lv.rows.length < 3) throw new Error('rows 缺失');
    const w = Math.max(...lv.rows.map((r) => r.length));
    if (lv.rows.some((r) => r.length !== w)) errs.push('rows 不是矩形');

    // 外圈必须是墙
    for (let c = 0; c < w; c++) {
      if (lv.rows[0][c] !== '#' || lv.rows[lv.rows.length - 1][c] !== '#') {
        errs.push('外圈不是墙');
        break;
      }
    }
    for (let r = 0; r < lv.rows.length; r++) {
      if (lv.rows[r][0] !== '#' || lv.rows[r][w - 1] !== '#') {
        errs.push('外圈不是墙');
        break;
      }
    }

    st = parse(lv.rows);
    const total = countBlocks(st);
    if (total < 4 || total > 12) errs.push(`方块数 ${total} 不在 4–12`);

    if (lv.goal === 'clear') {
      if (total % 2 !== 0) errs.push(`清场模式方块数 ${total} 是奇数`);
    } else if (lv.goal === 'color') {
      const tc = lv.targetColor;
      if (!(tc >= 1 && tc <= 5)) errs.push('targetColor 未设置');
      else {
        let n = 0;
        for (const v of st.c) if (v === tc) n++;
        if (n < 2 || n % 2 !== 0) errs.push(`目标色 ${show(tc)} 有 ${n} 块（需≥2 且成对）`);
        notes.push(`目标 ${show(tc)}×${n}`);
      }
    } else {
      errs.push(`未知 goal: ${lv.goal}`);
    }

    // par 只能是"不超过"：在声明的 par 步内必须真的能通关
    if (lv.id >= FAST_FROM) {
      par = fastPar(lv);
      if (par === -1) {
        errs.push(`A* 超出节点上限（${ASTAR_CAP}），无法确认 par`);
      } else if (par !== lv.par) {
        errs.push(`实际最少 ${par} 步，声明 par=${lv.par}`);
      }
    } else {
      par = parWithin(st, lv, lv.par);
      if (par === -1) {
        errs.push(`搜索超出节点上限（${NODE_CAP}），无法确认 par`);
      } else if (par === Infinity) {
        errs.push(`声明的 par=${lv.par} 步内无解（par 虚报或关卡无解）`);
      } else if (par !== lv.par) {
        errs.push(`实际最少 ${par} 步，声明 par=${lv.par}`);
      }
    }

    if (lv.par > lv.limit) errs.push(`par ${lv.par} > 上限 ${lv.limit}`);
    if (lv.limit - lv.par < 1) errs.push('上限没有留出容错步数（limit - par < 1）');

    let innerWalls = 0;
    for (let r = 1; r < st.h - 1; r++)
      for (let c = 1; c < st.w - 1; c++) if (at(st, r, c) === -1) innerWalls++;
    notes.push(`${w}×${st.h} ${total}块 ${innerWalls}墙`);

    if (OPT_DEAD && !errs.length) {
      const de = scanDeadEnds(parse(lv.rows), lv, lv.limit);
      notes.push(`死局 ${de.dead}${de.capped ? '（扫描未完成）' : ''}`);
      if (de.dead > 0) errs.push(`可达 ${de.dead} 个死局`);
    }

    if (OPT_FIRST && !errs.length) {
      if (lv.id >= FAST_FROM) {
        const start = rParse(lv.rows);
        const firsts = genA(start).map((m) => {
          const r = aStar(applyA(start, m), 'A', ASTAR_CAP, goalOpts(lv));
          return { m, total: r ? 1 + r.len : Infinity };
        });
        const best = firsts.filter((x) => x.total === lv.par).length;
        const worst = firsts.length ? Math.max(...firsts.map((x) => (x.total === Infinity ? 99 : x.total))) : 0;
        notes.push(`首步 ${firsts.length}（保持 par ${best}，最差 ${worst === 99 ? '>上限' : worst}）`);
      } else {
        const st0 = parse(lv.rows);
        const firsts = legalMoves(st0).map((m) => {
          const d = parWithin(applyMove(st0, m), lv, lv.limit - 1);
          return { m, total: Number.isFinite(d) ? 1 + d : Infinity };
        });
        const best = firsts.filter((x) => x.total === lv.par).length;
        const worst = firsts.length ? Math.max(...firsts.map((x) => (x.total === Infinity ? 99 : x.total))) : 0;
        notes.push(`首步 ${firsts.length}（保持 par ${best}，最差 ${worst === 99 ? '>上限' : worst}）`);
      }
    }
  } catch (e) {
    errs.push(e.message);
  }

  if (errs.length) failed++;
  const badge = errs.length ? 'FAIL' : ' ok ';
  rowsOut.push(
    `#${String(lv.id).padStart(2)} ${badge} par ${lv.par}/${lv.limit}  ${lv.name}` +
      (notes.length ? `  [${notes.join(', ')}]` : '') +
      (errs.length ? `\n       ${errs.join('\n       ')}` : ''),
  );
}

console.log(rowsOut.join('\n'));
console.log(`\nlevels=${LEVELS.length} failed=${failed}`);
if (failed) process.exitCode = 1;