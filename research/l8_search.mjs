// 第 8 关「小结·四对」盘面搜索（S1 综合）
//
// 规格：7×7（内场 5×5）、6 块 / 3 色（A2 B2 C2）、清场、2 格内墙、par 5、上限 8。
// 目标：把 S1 的停靠方式各取一种——最优路径里必须同时出现
//   · 一次"内墙停靠"（落点的下一格是内墙）
//   · 一次"借块停车"（落点的下一格是异色方块，即第 3 关的机制）
// 两种铺垫各占 1 步，剩下 3 步正好消三对。
//
// 判据：
//   1. par === 5
//   2. 最优路径里两种停靠都被后续步骤用到
//   3. 开局没有现成可消的一对
//   4. 最优首步 2–4 个，且所有首步都能在 8 步内通关
//   5. 两格墙都改变 par（拿掉任一格，par != 5）
import { parse, legalMoves, applyMove, isGoal, at } from '../src/game.js';

const key = (s) => s.c.join(',');

function parWithin(start, lv, cap, nodeCap = 400000) {
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

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const shuffle = (arr, rand) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const LAYOUTS = {
  '中列双缺口': [[2, 3], [4, 3]],
  '横墙双缺口': [[3, 2], [3, 4]],
  '对角': [[2, 2], [4, 4]],
  '反对角': [[2, 4], [4, 2]],
  '错位A': [[2, 2], [4, 3]],
  '错位B': [[2, 3], [4, 2]],
  'L角': [[2, 2], [2, 3]],
  '反L角': [[4, 2], [4, 3]],
  '上中': [[1, 3], [3, 3]],
  '下中': [[3, 3], [5, 3]],
  '中心+角': [[3, 3], [1, 5]],
  '中心+边': [[3, 3], [1, 1]],
  '中列错位': [[2, 3], [4, 2]],
  '横墙错位': [[3, 2], [4, 3]],
  '双竖错位': [[1, 2], [4, 4]],
  '双横错位': [[2, 1], [4, 4]],
};

const COLORS = ['A', 'A', 'B', 'B', 'C', 'C'];
const cfg = { tries: Number(process.argv[2] || 300), seed: Number(process.argv[3] || 81) };
const rand = rng(cfg.seed);

const isInnerWall = (g, r, c) =>
  r > 0 && c > 0 && r < 6 && c < 6 && g[r][c] === '#';

const DIRV = { U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1] };

/** 落点再往前一格是内墙？返回 [r,c] 或 null */
function blockingWall(g, tr, tc, dir) {
  const [dr, dc] = DIRV[dir];
  const r = tr + dr;
  const c = tc + dc;
  return isInnerWall(g, r, c) ? [r, c] : null;
}

/** 落点再往前一格是方块？返回颜色或 0 */
function blockingBlock(after, tr, tc, dir) {
  const [dr, dc] = DIRV[dir];
  return at(after, tr + dr, tc + dc);
}

/** 这一步的方块（按颜色）之后还参不参与移动/消除 */
function usedLater(timeline, i, before, after) {
  const color = at(before, timeline[i].p.m.r, timeline[i].p.m.c);
  let later = after;
  for (let j = i + 1; j < timeline.length; j++) {
    const q = timeline[j].p;
    if (
      at(later, q.m.r, q.m.c) === color &&
      (q.m.res === 'pop' || q.m.res === 'move')
    ) {
      return true;
    }
    later = timeline[j].after;
  }
  return false;
}

const results = [];

for (const [lname, walls] of Object.entries(LAYOUTS)) {
  const base = Array.from({ length: 7 }, (_, r) =>
    Array.from({ length: 7 }, (_, c) =>
      r === 0 || c === 0 || r === 6 || c === 6 ? '#' : '.',
    ),
  );
  for (const [r, c] of walls) base[r][c] = '#';
  const free = [];
  for (let r = 1; r <= 5; r++)
    for (let c = 1; c <= 5; c++) if (base[r][c] === '.') free.push([r, c]);

  let par5 = 0;
  let kept = 0;
  const local = [];
  for (let t = 0; t < cfg.tries; t++) {
    const pick = shuffle(free.slice(), rand).slice(0, 6);
    const cols = shuffle(COLORS.slice(), rand);
    const g = base.map((row) => row.slice());
    pick.forEach(([r, c], i) => { g[r][c] = cols[i]; });
    const rows = g.map((row) => row.join(''));
    const lv = { rows, goal: 'clear', targetColor: null };
    const st0 = parse(rows);
    if (parWithin(st0, lv, 5) !== 5) continue;
    par5++;

    const path = solvePath(st0, lv, 5);
    if (!path) continue;

    let st = st0;
    const timeline = [];
    for (const p of path) {
      const after = applyMove(st, p.m);
      timeline.push({ st, p, after });
      st = after;
    }

    let wallStopsUsed = 0;
    let brakeStopsUsed = 0;
    const usedWalls = new Set();
    timeline.forEach((t2, i) => {
      const { p, st: before, after } = t2;
      if (p.m.res !== 'move') return;
      const { tr, tc } = p.m;
      if (!usedLater(timeline, i, before, after)) return;
      const bw = blockingWall(g, tr, tc, p.m.d);
      if (bw) {
        wallStopsUsed++;
        usedWalls.add(bw[0] * 7 + bw[1]);
        return;
      }
      if (blockingBlock(after, tr, tc, p.m.d) > 0) brakeStopsUsed++;
    });

    if (wallStopsUsed < 1 || brakeStopsUsed < 1) continue;

    const firsts = legalMoves(st0).map((m) => {
      const d = parWithin(applyMove(st0, m), lv, 7);
      return { m, total: Number.isFinite(d) && d >= 0 ? 1 + d : Infinity };
    });
    const opt = firsts.filter((x) => x.total === 5).length;
    const openPop = firsts.filter((x) => x.m.res === 'pop').length;
    const punished = firsts.filter((x) => x.total > 5).length;
    const recoverable = firsts.filter((x) => x.total <= 8).length;

    if (openPop > 0) continue;
    if (opt < 2 || opt > 4) continue;
    if (recoverable !== firsts.length) continue;
    kept++;

    let score = 0;
    score += Math.min(wallStopsUsed, 2) * 4;
    score += Math.min(brakeStopsUsed, 2) * 4;
    score += usedWalls.size * 3;
    score += Math.min(punished, 6);
    score += opt === 2 ? 2 : 1;
    local.push({
      lname,
      rows,
      path,
      walls,
      wallStopsUsed,
      brakeStopsUsed,
      wallsUsed: usedWalls.size,
      firsts,
      opt,
      openPop,
      punished,
      score,
    });
  }
  local.sort((a, b) => b.score - a.score);
  console.log(`${lname}: par5=${par5}/${cfg.tries}, 两种停靠齐全=${kept}`);
  results.push(...local.slice(0, 6));
}

// 两格墙是否都承重：拿掉任一格后 par 不再是 5
for (const c of results) {
  let dep = 0;
  const detail = [];
  for (const [wr, wc] of c.walls) {
    const g2 = c.rows.map((row) => row.split(''));
    g2[wr][wc] = '.';
    const rows2 = g2.map((row) => row.join(''));
    const p2 = parWithin(parse(rows2), { rows: rows2, goal: 'clear', targetColor: null }, 6, 2000000);
    if (p2 !== 5) dep++;
    detail.push(`${wr},${wc}→${p2}`);
  }
  c.wallsDependent = dep;
  c.wallDetail = detail;
  c.score += dep * 6;
}

// 硬性要求：两格墙都承重
const strict = results.filter((c) => c.wallsDependent === 2);
strict.sort((a, b) => b.score - a.score);

console.log(`\n候选 ${results.length} 个，两格墙都承重 ${strict.length} 个`);
const results2 = strict;
const DIR = { U: '上', D: '下', L: '左', R: '右' };
for (const c of results2.slice(0, 10)) {
  const stepText = c.path.map((p, i) => {
    const col = String.fromCharCode(64 + at(p.st, p.m.r, p.m.c));
    if (p.m.res === 'pop') return `${i + 1}.${col}(${p.m.r},${p.m.c})${DIR[p.m.d]}×(${p.m.br},${p.m.bc})`;
    const [dr, dc] = DIRV[p.m.d];
    const beyond = at(p.st, p.m.tr + dr, p.m.tc + dc);
    const why = beyond === -1 ? '墙停' : '块停';
    return `${i + 1}.${col}(${p.m.r},${p.m.c})${DIR[p.m.d]}→(${p.m.tr},${p.m.tc})${why}`;
  });
  console.log(
    `\n=== ${c.lname} | score ${c.score} | 墙停 ${c.wallStopsUsed} | 块停 ${c.brakeStopsUsed} | 用到墙 ${c.wallsUsed}/2 | 拿掉变 ${c.wallsDependent}/2 [${c.wallDetail.join(' ')}] | 首步 ${c.firsts.length}（保持 ${c.opt}）===`,
  );
  c.rows.forEach((r) => console.log('  ' + r));
  console.log('  ' + stepText.join(' → '));
  console.log(
    '  首步: ' +
      c.firsts
        .map((x) => `${x.m.r},${x.m.c}${x.m.d}${x.m.res === 'pop' ? '*' : ''}:${x.total === Infinity ? '>8' : x.total}`)
        .join(' '),
  );
}