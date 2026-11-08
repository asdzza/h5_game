// 固定第 7 关 B/A 骨架 + C1=(1,5)（堵住 A 的边界替代路线），枚举 C2
import { parse, legalMoves, applyMove, isGoal, at } from '../src/game.js';

const BASE = [
  '#######',
  '#.B.AC#',
  '#...B.#',
  '#.##.A#',
  '#.....#',
  '#.....#',
  '#######',
];
const WALLS = [
  [3, 2],
  [3, 3],
];
// BASE 里 C 在 (1,5)，下面把它当 C1，枚举 C2

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
const DIR = { U: '上', D: '下', L: '左', R: '右' };
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

function findFeaturePath(st0, lv, g, target) {
  const seen = new Set();
  const path = [];
  let result = null;
  const dfs = (st, depth, walls, brakes, usedWalls) => {
    if (result) return;
    if (depth === target) {
      if (!isGoal(st, lv)) return;
      const a = analyzePath(path, g);
      if (a.wallStopsUsed >= 2 && a.usedWalls.size >= 2 && a.brakeStopsUsed >= 1) result = path.slice();
      return;
    }
    const k = key(st) + '|' + Math.min(walls, 2) + '|' + Math.min(brakes, 1) + '|' + [...usedWalls].sort().join(',') + '|' + depth;
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

function withoutWall(rows, wr, wc) {
  return rows.map((row, r) => (r === wr ? row.slice(0, wc) + '.' + row.slice(wc + 1) : row));
}

const rows0 = BASE;
for (let r = 1; r <= 5; r++) {
  for (let c = 1; c <= 5; c++) {
    if (rows0[r][c] !== '.') continue;
    const g = rows0.map((row) => row.split(''));
    g[r][c] = 'C';
    const rows = g.map((row) => row.join(''));
    const lv = { rows, goal: 'clear', targetColor: null };
    const st0 = parse(rows);
    const par = parWithin(st0, lv, 9);
    const p2a = (() => {
      const r2 = withoutWall(rows, WALLS[0][0], WALLS[0][1]);
      return parWithin(parse(r2), { rows: r2, goal: 'clear', targetColor: null }, 9);
    })();
    const p2b = (() => {
      const r2 = withoutWall(rows, WALLS[1][0], WALLS[1][1]);
      return parWithin(parse(r2), { rows: r2, goal: 'clear', targetColor: null }, 9);
    })();
    const path = findFeaturePath(st0, lv, rows, 6);
    const a = path ? analyzePath(path, rows) : null;
    console.log(
      `C2(${r},${c}) par=${par} 拿墙=${p2a}/${p2b} 特征=${path ? `墙${a.wallStopsUsed}块${a.brakeStopsUsed}墙数${a.usedWalls.size}` : '无'}`,
    );
  }
}