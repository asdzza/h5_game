// 第 8 关「小结·三对」盘面搜索（S1 综合版）
//
// 规格：7×7（内场 5×5）、6 块 / 3 色（A2 B2 C2）、清场、2 格内墙、par 6、上限 9。
//
// 为什么是 par 6：6 块必须在 3 步里消完，par 6 = 3 次消除 + 3 次铺垫。
// 这 3 次铺垫正好可以放下：
//   · 2 次「内墙停靠」——两格墙各当一次刹车（第 2、7 关的机制）
//   · 1 次「借块停车」——异色块当刹车（第 3 关的机制）
// 这样两格墙都在最优解里被真正用到，不存在“装饰墙”。
//
// 判据：
//   1. par === 6
//   2. 存在一条最优路径：2 次内墙停靠（分别停到两格不同的墙）+ 1 次借块停车，
//      且这三块之后都继续参与移动/消除
//   3. 开局没有现成可消的一对
//   4. 最优首步 2–4 个，所有首步都能在 9 步内通关
//   5. 拿掉任意一格墙后 par !== 6（两格墙都承重）
import { parse, legalMoves, applyMove, isGoal, at } from '../src/game.js';

// 紧凑 key：只编码有方块的格子（墙/空地由关卡固定）
const key = (s) => {
  let out = '';
  for (let i = 0; i < s.c.length; i++) {
    const v = s.c[i];
    if (v > 0) out += String.fromCharCode(i + 33) + String.fromCharCode(v + 48);
  }
  return out;
};

function parWithin(start, lv, cap, nodeCap = 3000000) {
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
  '竖墙中列对': [[2, 3], [4, 3]],
  '横墙中行对': [[3, 2], [3, 4]],
  '中心+上': [[1, 3], [3, 3]],
  '中心+下': [[3, 3], [5, 3]],
  '中心+左': [[3, 1], [3, 3]],
  '中心+右': [[3, 3], [3, 5]],
  '中心竖双': [[2, 3], [3, 3]],
  '中心横双': [[3, 3], [3, 2]],
  '对角': [[2, 2], [4, 4]],
  '反对角': [[2, 4], [4, 2]],
  '双竖边': [[2, 2], [4, 2]],
  '双横边': [[2, 2], [2, 4]],
  'L角': [[2, 2], [2, 3]],
  '反L角': [[4, 2], [4, 3]],
  '错位A': [[2, 2], [4, 3]],
  '错位B': [[2, 3], [4, 2]],
};

const COLORS = ['A', 'A', 'B', 'B', 'C', 'C'];
const cfg = {
  tries: Number(process.argv[2] || 300),
  seed: Number(process.argv[3] || 81),
  onlyLayout: process.argv[4] || null,
};
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

/** 这一块（按颜色）之后还参不参与移动/消除 */
function usedLater(timeline, i) {
  const color = at(timeline[i].st, timeline[i].p.m.r, timeline[i].p.m.c);
  let later = timeline[i].after;
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

/** 分析一条路径：内墙停靠 / 借块停车各用了几次（只算之后还被用到的） */
function analyzePath(path, g) {
  const timeline = path.map((p) => ({
    p,
    st: p.st,
    after: applyMove(p.st, p.m),
  }));
  let wallStopsUsed = 0;
  let brakeStopsUsed = 0;
  const usedWalls = new Set();
  timeline.forEach((t2, i) => {
    const { p, st: before, after } = t2;
    if (p.m.res !== 'move') return;
    if (!usedLater(timeline, i)) return;
    const bw = blockingWall(g, p.m.tr, p.m.tc, p.m.d);
    if (bw) {
      wallStopsUsed++;
      usedWalls.add(bw[0] * 7 + bw[1]);
      return;
    }
    if (blockingBlock(after, p.m.tr, p.m.tc, p.m.d) > 0) brakeStopsUsed++;
  });
  return { wallStopsUsed, brakeStopsUsed, usedWalls };
}

/** DFS 找一条恰好 target 步、且有 2 次内墙停靠 + 1 次借块停车的解 */
function findFeaturePath(st0, lv, g, target) {
  const seen = new Set();
  const path = [];
  let result = null;
  const dfs = (st, depth, walls, brakes, usedWalls) => {
    if (result) return;
    if (depth === target) {
      if (!isGoal(st, lv)) return;
      const a = analyzePath(path, g);
      if (a.wallStopsUsed >= 2 && a.usedWalls.size >= 2 && a.brakeStopsUsed >= 1) {
        result = path.slice();
      }
      return;
    }
    const k =
      key(st) +
      '|' + Math.min(walls, 2) +
      '|' + Math.min(brakes, 1) +
      '|' + [...usedWalls].sort().join(',') +
      '|' + depth;
    if (seen.has(k)) return;
    seen.add(k);
    for (const m of legalMoves(st)) {
      const ns = applyMove(st, m);
      if (depth + 1 < target && isGoal(ns, lv)) continue;
      let nw = walls;
      let nb = brakes;
      const nu = new Set(usedWalls);
      if (m.res === 'move') {
        const bw = blockingWall(g, m.tr, m.tc, m.d);
        if (bw) {
          nw++;
          nu.add(bw[0] * 7 + bw[1]);
        } else {
          const [dr, dc] = DIRV[m.d];
          if (at(ns, m.tr + dr, m.tc + dc) > 0) nb++;
        }
      }
      path.push({ m, st });
      dfs(ns, depth + 1, nw, nb, nu);
      path.pop();
      if (result) return;
    }
  };
  dfs(st0, 0, 0, 0, new Set());
  return result;
}

const results = [];

for (const [lname, walls] of Object.entries(LAYOUTS)) {
  if (cfg.onlyLayout && lname !== cfg.onlyLayout) continue;
  const base = Array.from({ length: 7 }, (_, r) =>
    Array.from({ length: 7 }, (_, c) =>
      r === 0 || c === 0 || r === 6 || c === 6 ? '#' : '.',
    ),
  );
  for (const [r, c] of walls) base[r][c] = '#';
  const free = [];
  for (let r = 1; r <= 5; r++)
    for (let c = 1; c <= 5; c++) if (base[r][c] === '.') free.push([r, c]);

  let par6 = 0;
  let kept = 0;
  const local = [];
  const debugCombos = new Map();
  for (let t = 0; t < cfg.tries; t++) {
    const pick = shuffle(free.slice(), rand).slice(0, 6);
    const cols = shuffle(COLORS.slice(), rand);
    const g = base.map((row) => row.slice());
    pick.forEach(([r, c], i) => {
      g[r][c] = cols[i];
    });
    const rows = g.map((row) => row.join(''));
    const lv = { rows, goal: 'clear', targetColor: null };
    const st0 = parse(rows);
    if (parWithin(st0, lv, 6) !== 6) continue;
    par6++;

    // 最优路径：DFS 找一条同时用上两次内墙停靠 + 一次借块停车的 6 步解
    const firstsAll = legalMoves(st0);
    const path = findFeaturePath(st0, lv, g, 6);
    if (path) {
      const a = analyzePath(path, g);
      if (process.env.L8_DEBUG) {
        const dk = `墙${a.wallStopsUsed}/块${a.brakeStopsUsed}/墙数${a.usedWalls.size}`;
        debugCombos.set(dk, (debugCombos.get(dk) || 0) + 1);
      }
    }
    if (!path) continue;
    const found = { path, ...analyzePath(path, g) };

    const firsts = firstsAll.map((m) => {
      const d = parWithin(applyMove(st0, m), lv, 8);
      return { m, total: Number.isFinite(d) && d >= 0 ? 1 + d : Infinity };
    });
    const opt = firsts.filter((x) => x.total === 6).length;
    const openPop = firsts.filter((x) => x.m.res === 'pop').length;
    const punished = firsts.filter((x) => x.total > 6).length;
    const recoverable = firsts.filter((x) => x.total <= 9).length;

    if (openPop > 0) continue;
    if (opt < 2 || opt > 4) continue;
    if (recoverable !== firsts.length) continue;
    if (punished < 1) continue;
    kept++;

    let score = 0;
    score += found.usedWalls.size * 6;
    score += Math.min(found.wallStopsUsed, 2) * 4;
    score += Math.min(found.brakeStopsUsed, 1) * 4;
    score += Math.min(punished, 6);
    score += opt === 2 ? 3 : 1;
    local.push({
      lname,
      rows,
      path: found.path,
      walls,
      wallStopsUsed: found.wallStopsUsed,
      brakeStopsUsed: found.brakeStopsUsed,
      wallsUsed: found.usedWalls.size,
      firsts,
      opt,
      openPop,
      punished,
      score,
    });
  }
  local.sort((a, b) => b.score - a.score);
  console.log(`${lname}: par6=${par6}/${cfg.tries}, 两种停靠齐全=${kept}`);
  if (process.env.L8_DEBUG) {
    console.log(
      '  debug: ' +
        [...debugCombos.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => `${k}=${v}`)
          .join('  '),
    );
  }
  results.push(...local.slice(0, 6));
}

// 两格墙是否都承重：拿掉任一格后 par 不再是 6
for (const c of results) {
  let dep = 0;
  const detail = [];
  for (const [wr, wc] of c.walls) {
    const g2 = c.rows.map((row) => row.split(''));
    g2[wr][wc] = '.';
    const rows2 = g2.map((row) => row.join(''));
    const p2 = parWithin(parse(rows2), { rows: rows2, goal: 'clear', targetColor: null }, 8);
    if (p2 !== 6) dep++;
    detail.push(`${wr},${wc}→${p2}`);
  }
  c.wallsDependent = dep;
  c.wallDetail = detail;
  c.score += dep * 8;
}

// 硬性要求：两格墙都承重
const strict = results.filter((c) => c.wallsDependent === 2);
strict.sort((a, b) => b.score - a.score);

console.log(`\n候选 ${results.length} 个，两格墙都承重 ${strict.length} 个`);
const DIR = { U: '上', D: '下', L: '左', R: '右' };
for (const c of strict.slice(0, 10)) {
  const stepText = c.path.map((p, i) => {
    const col = String.fromCharCode(64 + at(p.st, p.m.r, p.m.c));
    if (p.m.res === 'pop')
      return `${i + 1}.${col}(${p.m.r},${p.m.c})${DIR[p.m.d]}×(${p.m.br},${p.m.bc})`;
    const [dr, dc] = DIRV[p.m.d];
    const beyond = at(p.st, p.m.tr + dr, p.m.tc + dc);
    const why = beyond === -1 ? '墙停' : beyond === 0 ? '边停' : '块停';
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
        .map((x) => `${x.m.r},${x.m.c}${x.m.d}${x.m.res === 'pop' ? '*' : ''}:${x.total === Infinity ? '>9' : x.total}`)
        .join(' '),
  );
}