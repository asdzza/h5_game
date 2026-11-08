// 第 8 关「小结·三对」：先找"黄金骨架"，再补第三对
//
// 思路：
//   6 块 / 3 对 / par 6 必然是 3 次消除 + 3 次铺垫。
//   先把前两对（A2 B2）做成一个 par 5 的 4 块骨架，它的 3 次铺垫里
//   正好有 2 次内墙停靠（两格墙各一次）+ 1 次借块停车；
//   再补第三对 C，要求 C 在第 6 步"一步消掉"（不占铺垫）。
//
// 这样两格墙都在最优解里当刹车，且拿掉任一格墙骨架就会变慢。
//
// 用法：node research/l8_gold.mjs [tries]
import { parse, legalMoves, applyMove, isGoal, at } from '../src/game.js';

const LAYOUTS = {
  '横双(3,2)(3,3)': [[3, 2], [3, 3]],
  '竖双(2,3)(3,3)': [[2, 3], [3, 3]],
  '中心+上(1,3)(3,3)': [[1, 3], [3, 3]],
  '中心+下(3,3)(5,3)': [[3, 3], [5, 3]],
  '中心+左(3,1)(3,3)': [[3, 1], [3, 3]],
  '中心+右(3,3)(3,5)': [[3, 3], [3, 5]],
  '对角(2,2)(4,4)': [[2, 2], [4, 4]],
  '反对角(2,4)(4,2)': [[2, 4], [4, 2]],
  'L角(2,2)(2,3)': [[2, 2], [2, 3]],
  '反L角(4,2)(4,3)': [[4, 2], [4, 3]],
};

const WHICH = process.env.L8_LAYOUT || '横双(3,2)(3,3)';
const WALLS = LAYOUTS[WHICH];

const key = (s) => {
  let out = '';
  for (let i = 0; i < s.c.length; i++) {
    const v = s.c[i];
    if (v > 0) out += String.fromCharCode(i + 33) + String.fromCharCode(v + 48);
  }
  return out;
};

function parWithin(start, level, cap, nodeCap = 3000000) {
  if (isGoal(start, level)) return 0;
  const seen = new Set([key(start)]);
  let frontier = [start];
  for (let d = 1; d <= cap; d++) {
    const next = [];
    for (const st of frontier) {
      for (const m of legalMoves(st)) {
        const ns = applyMove(st, m);
        if (isGoal(ns, level)) return d;
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

const DIRV = { U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1] };
const isInnerWall = (g, r, c) => r > 0 && c > 0 && r < 6 && c < 6 && g[r][c] === '#';
const blockingWall = (g, tr, tc, dir) => {
  const [dr, dc] = DIRV[dir];
  return isInnerWall(g, tr + dr, tc + dc) ? [tr + dr, tc + dc] : null;
};

function usedLater(timeline, i) {
  const color = at(timeline[i].st, timeline[i].p.m.r, timeline[i].p.m.c);
  let later = timeline[i].after;
  for (let j = i + 1; j < timeline.length; j++) {
    const q = timeline[j].p;
    if (at(later, q.m.r, q.m.c) === color && (q.m.res === 'pop' || q.m.res === 'move')) return true;
    later = timeline[j].after;
  }
  return false;
}

/** 分析一条完整路径：几块墙各停一次、几次借块停车（只算之后还被用到的） */
function analyzePath(path, g) {
  const timeline = path.map((p) => ({ p, st: p.st, after: applyMove(p.st, p.m) }));
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
    const [dr, dc] = DIRV[p.m.d];
    if (at(after, p.m.tr + dr, p.m.tc + dc) > 0) brakeStopsUsed++;
  });
  return { wallStopsUsed, brakeStopsUsed, usedWalls };
}

/** DFS 找一条恰好 target 步、且 2 格墙各停一次 + 至少一次借块停车的解 */
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

function rowsWithoutWall(rows, wr, wc) {
  return rows.map((row, r) => (r === wr ? row.slice(0, wc) + '.' + row.slice(wc + 1) : row));
}

const BASE = Array.from({ length: 7 }, (_, r) =>
  Array.from({ length: 7 }, (_, c) => (r === 0 || c === 0 || r === 6 || c === 6 ? '#' : '.')),
);
for (const [r, c] of WALLS) BASE[r][c] = '#';

const FREE = [];
for (let r = 1; r <= 5; r++)
  for (let c = 1; c <= 5; c++) if (BASE[r][c] === '.') FREE.push([r, c]);

const combos4 = [];
for (let a = 0; a < FREE.length; a++)
  for (let b = a + 1; b < FREE.length; b++)
    for (let c = b + 1; c < FREE.length; c++)
      for (let d = c + 1; d < FREE.length; d++) combos4.push([a, b, c, d]);

const t0 = Date.now();
const golden = [];
let par5 = 0;
let feat = 0;
let qi = 0;
for (const quad of combos4) {
  qi++;
  if (qi % 1000 === 0) {
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`  ...${qi}/${combos4.length} 组 | par5=${par5} 有停靠特征=${feat} 黄金=${golden.length} | ${sec}s`);
  }
  const cells = quad.map((i) => FREE[i]);
  for (let mask = 0; mask < 16; mask++) {
    let bits = 0;
    for (let i = 0; i < 4; i++) if (mask & (1 << i)) bits++;
    if (bits !== 2) continue;
    const g = BASE.map((row) => row.slice());
    cells.forEach(([r, c], i) => {
      g[r][c] = mask & (1 << i) ? 'B' : 'A';
    });
    const rows = g.map((row) => row.join(''));
    const lv = { rows, goal: 'clear', targetColor: null };
    const st = parse(rows);
    if (parWithin(st, lv, 5) !== 5) continue;
    par5++;
    const path = findFeaturePath(st, lv, rows, 5);
    if (!path) continue;
    feat++;
    // 两格墙都承重
    let dep = 0;
    const detail = [];
    for (const [wr, wc] of WALLS) {
      const rows2 = rowsWithoutWall(rows, wr, wc);
      const p2 = parWithin(parse(rows2), { rows: rows2, goal: 'clear', targetColor: null }, 6);
      if (p2 !== 5) dep++;
      detail.push(`${wr},${wc}→${p2}`);
    }
    if (dep !== 2) continue;
    const a = analyzePath(path, rows);
    golden.push({ rows, path, a, detail });
  }
}
console.log(`\n布局 ${WHICH}`);
console.log(`四格骨架 ${combos4.length * 6} 个：par5=${par5}，有"2 墙停 + 1 块停"=${feat}，两格墙都承重=${golden.length}`);

// ---- 第二阶段：给黄金骨架补第三对 C ----
const results = [];
let full6 = 0;
for (const sk of golden) {
  const occupied = new Set();
  for (let r = 1; r <= 5; r++)
    for (let c = 1; c <= 5; c++) if (sk.rows[r][c] !== '.') occupied.add(r * 7 + c);
  const free = FREE.filter(([r, c]) => !occupied.has(r * 7 + c));
  for (let i = 0; i < free.length; i++) {
    for (let j = i + 1; j < free.length; j++) {
      const g = sk.rows.map((row) => row.split(''));
      g[free[i][0]][free[i][1]] = 'C';
      g[free[j][0]][free[j][1]] = 'C';
      const rows = g.map((row) => row.join(''));
      const lv = { rows, goal: 'clear', targetColor: null };
      const st0 = parse(rows);
      if (parWithin(st0, lv, 7) !== 6) continue;
      full6++;
      const path = findFeaturePath(st0, lv, rows, 6);
      if (!path) continue;

      const firsts = legalMoves(st0).map((m) => {
        const d = parWithin(applyMove(st0, m), lv, 9);
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

      let dep = 0;
      const detail = [];
      for (const [wr, wc] of WALLS) {
        const rows2 = rowsWithoutWall(rows, wr, wc);
        const p2 = parWithin(parse(rows2), { rows: rows2, goal: 'clear', targetColor: null }, 9);
        if (p2 !== 6) dep++;
        detail.push(`${wr},${wc}→${p2}`);
      }
      if (dep !== 2) continue;

      const a = analyzePath(path, rows);
      let score = Math.min(a.wallStopsUsed, 2) * 10 + Math.min(a.brakeStopsUsed, 2) * 8;
      score += Math.min(punished, 6) + (opt === 2 ? 3 : 1);
      results.push({
        cPos: [free[i], free[j]],
        rows,
        path,
        firsts,
        opt,
        openPop,
        punished,
        wallStopsUsed: a.wallStopsUsed,
        brakeStopsUsed: a.brakeStopsUsed,
        wallsUsed: a.usedWalls.size,
        dep,
        detail,
        score,
      });
    }
  }
}

results.sort((a, b) => b.score - a.score);
console.log(`\n补第三对：par6 盘面 ${full6} 个；满足全部条件 ${results.length} 个`);

const DIR = { U: '上', D: '下', L: '左', R: '右' };
for (const c of results.slice(0, 15)) {
  const stepText = c.path.map((p, i) => {
    const col = String.fromCharCode(64 + at(p.st, p.m.r, p.m.c));
    if (p.m.res === 'pop')
      return `${i + 1}.${col}(${p.m.r},${p.m.c})${DIR[p.m.d]}×(${p.m.br},${p.m.bc})`;
    const [dr, dc] = DIRV[p.m.d];
    const beyond = at(p.st, p.m.tr + dr, p.m.tc + dc);
    const why = isInnerWall(c.rows, p.m.tr + dr, p.m.tc + dc)
      ? '墙停'
      : beyond === 0
        ? '边停'
        : '块停';
    return `${i + 1}.${col}(${p.m.r},${p.m.c})${DIR[p.m.d]}→(${p.m.tr},${p.m.tc})${why}`;
  });
  console.log(
    `\n=== C 在 (${c.cPos[0]})(${c.cPos[1]}) | score ${c.score} | 墙停 ${c.wallStopsUsed} | 块停 ${c.brakeStopsUsed} | 墙数 ${c.wallsUsed} | 拿掉变 ${c.dep}/2 [${c.detail.join(' ')}] | 首步 ${c.firsts.length}（保持 ${c.opt}）===`,
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