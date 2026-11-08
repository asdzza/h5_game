// 第 8 关：在第 7 关式"par4 双墙停骨架"上插入第三对 C
//
// 对每个 par4 双墙停骨架，取它的那条 4 步解 P（2 次墙停 + 2 次消除），
// 再枚举 C 对的位置、C 的"借块停车"和"一步消掉"，把这两步插入 P 的 6 个槽位。
// 这样得到的 6 步解一定含：2 次内墙停靠（两格墙各一次）+ 1 次借块停车。
//
// 用法：node research/l8_insert.mjs [骨架数上限]
import { parse, legalMoves, applyMove, isGoal, at, moveFrom } from '../src/game.js';
import { readFileSync } from 'node:fs';

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
const CACHE = `research/l8_gold4_${Buffer.from(WHICH).toString('hex').slice(0, 12)}.json`;
let SKELETONS = JSON.parse(readFileSync(CACHE, 'utf8'));
const LIMIT = Number(process.argv[2] || SKELETONS.length);

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
const DIRS = ['U', 'D', 'L', 'R'];
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
    const { p, after } = t2;
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

/** 找骨架的一条 4 步解：2 次内墙停靠 + 2 次消除 */
function findSkeletonPath(st0, lv, g) {
  const seen = new Set();
  const path = [];
  let result = null;
  const dfs = (st, depth, walls, usedWalls) => {
    if (result) return;
    if (depth === 4) {
      if (!isGoal(st, lv)) return;
      const a = analyzePath(path, g);
      if (a.wallStopsUsed >= 2 && a.usedWalls.size >= 2) result = path.slice();
      return;
    }
    const k = key(st) + '|' + Math.min(walls, 2) + '|' + [...usedWalls].sort().join(',') + '|' + depth;
    if (seen.has(k)) return;
    seen.add(k);
    for (const m of legalMoves(st)) {
      const ns = applyMove(st, m);
      if (depth + 1 < 4 && isGoal(ns, lv)) continue;
      let nw = walls;
      const nu = new Set(usedWalls);
      if (m.res === 'move') {
        const bw = blockingWall(g, m.tr, m.tc, m.d);
        if (bw) {
          nw++;
          nu.add(bw[0] * 7 + bw[1]);
        }
      }
      path.push({ m, st });
      dfs(ns, depth + 1, nw, nu);
      path.pop();
      if (result) return;
    }
  };
  dfs(st0, 0, 0, new Set());
  return result;
}

function withoutWall(rows, wr, wc) {
  return rows.map((row, r) => (r === wr ? row.slice(0, wc) + '.' + row.slice(wc + 1) : row));
}

// 可选：只保留"两格墙都承重"的骨架（拿掉任一格后 par 不再等于 4）
if (process.env.L8_SKEL_DEP) {
  const filtered = [];
  for (const rows of SKELETONS) {
    let dep = 0;
    for (const [wr, wc] of WALLS) {
      const r2 = withoutWall(rows, wr, wc);
      const p2 = parWithin(parse(r2), { rows: r2, goal: 'clear', targetColor: null }, 6);
      if (p2 !== 4) dep++;
    }
    if (dep === 2) filtered.push(rows);
  }
  console.log(`骨架承重过滤：${SKELETONS.length} → ${filtered.length}`);
  SKELETONS = filtered;
}

function stepText(path) {
  return path
    .map((p, i) => {
      const col = String.fromCharCode(64 + at(p.st, p.m.r, p.m.c));
      if (p.m.res === 'pop') return `${i + 1}.${col}(${p.m.r},${p.m.c})${DIR[p.m.d]}×(${p.m.br},${p.m.bc})`;
      const [dr, dc] = DIRV[p.m.d];
      const beyond = at(p.st, p.m.tr + dr, p.m.tc + dc);
      const why = beyond === -1 ? '墙停' : beyond === 0 ? '边停' : '块停';
      return `${i + 1}.${col}(${p.m.r},${p.m.c})${DIR[p.m.d]}→(${p.m.tr},${p.m.tc})${why}`;
    })
    .join(' → ');
}

function insertPath(st0, rows, lv, P) {
  const pMoves = P.map((p) => ({ r: p.m.r, c: p.m.c, d: p.m.d }));
  // C 的 setup 候选：从开局出发，合法 move 且落点再往前是方块
  const cCells = [];
  for (let r = 1; r <= 5; r++)
    for (let c = 1; c <= 5; c++) if (rows[r][c] === 'C') cCells.push([r, c]);
  const setups = [];
  for (const [r, c] of cCells) {
    for (const d of DIRS) {
      const m = moveFrom(st0, r, c, d);
      if (!m || m.res !== 'move') continue;
      const [dr, dc] = DIRV[d];
      if (at(st0, m.tr + dr, m.tc + dc) > 0) setups.push(m);
    }
  }
  if (!setups.length) return null;
  const pops = [];
  for (const setup of setups) {
    const s1 = applyMove(st0, setup);
    for (const [r, c] of cCells) {
      for (const d of DIRS) {
        const m = moveFrom(s1, r, c, d);
        if (m && m.res === 'pop') pops.push({ setup, pop: m });
      }
    }
  }
  if (!pops.length) return null;

  for (const { setup, pop } of pops) {
    for (let i = 0; i < 6; i++) {
      for (let j = i + 1; j < 6; j++) {
        let st = st0;
        const path = [];
        let pi = 0;
        let ok = true;
        for (let slot = 0; slot < 6; slot++) {
          let m;
          if (slot === i) {
            m = moveFrom(st, setup.r, setup.c, setup.d);
            if (!m || m.res !== 'move') { ok = false; break; }
          } else if (slot === j) {
            m = moveFrom(st, pop.r, pop.c, pop.d);
            if (!m || m.res !== 'pop') { ok = false; break; }
          } else {
            const pm = pMoves[pi++];
            m = moveFrom(st, pm.r, pm.c, pm.d);
            if (!m) { ok = false; break; }
          }
          path.push({ m, st });
          st = applyMove(st, m);
          if (slot < 5 && isGoal(st, lv)) { ok = false; break; }
        }
        if (!ok || pi !== 4 || !isGoal(st, lv)) continue;
        const a = analyzePath(path, rows);
        if (a.wallStopsUsed >= 2 && a.usedWalls.size >= 2 && a.brakeStopsUsed >= 1) {
          return { path, ...a, setup, pop };
        }
      }
    }
  }
  return null;
}

const results = [];
const seenBoards = new Set();
const t0 = Date.now();
for (let si = 0; si < Math.min(LIMIT, SKELETONS.length); si++) {
  const skRows = SKELETONS[si];
  if (si % 20 === 0) console.log(`  ...骨架 ${si}/${Math.min(LIMIT, SKELETONS.length)} | 候选 ${results.length} | ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const skSt = parse(skRows);
  const skLv = { rows: skRows, goal: 'clear', targetColor: null };
  const P = findSkeletonPath(skSt, skLv, skRows);
  if (!P) continue;

  const free = [];
  for (let r = 1; r <= 5; r++)
    for (let c = 1; c <= 5; c++) if (skRows[r][c] === '.') free.push([r, c]);

  for (let i = 0; i < free.length; i++) {
    for (let j = i + 1; j < free.length; j++) {
      const g = skRows.map((row) => row.split(''));
      g[free[i][0]][free[i][1]] = 'C';
      g[free[j][0]][free[j][1]] = 'C';
      const rows = g.map((row) => row.join(''));
      if (seenBoards.has(rows.join(''))) continue;
      const lv = { rows, goal: 'clear', targetColor: null };
      const st0 = parse(rows);
      const firsts0 = legalMoves(st0);
      if (firsts0.some((m) => m.res === 'pop')) continue;

      const found = insertPath(st0, rows, lv, P);
      if (!found) continue;
      seenBoards.add(rows.join(''));

      // 确认 par 恰为 6（构造出来的是 6 步，只需排除 5 步）
      if (parWithin(st0, lv, 5) !== Infinity) continue;

      const firsts = firsts0.map((m) => {
        const d = parWithin(applyMove(st0, m), lv, 9);
        return { m, total: Number.isFinite(d) && d >= 0 ? 1 + d : Infinity };
      });
      const opt = firsts.filter((x) => x.total === 6).length;
      const punished = firsts.filter((x) => x.total > 6).length;
      const recoverable = firsts.filter((x) => x.total <= 9).length;
      if (opt < 2 || opt > 4) continue;
      if (recoverable !== firsts.length) continue;
      if (punished < 1) continue;

      let dep = 0;
      const detail = [];
      for (const [wr, wc] of WALLS) {
        const rows2 = withoutWall(rows, wr, wc);
        const p2 = parWithin(parse(rows2), { rows: rows2, goal: 'clear', targetColor: null }, 9);
        if (p2 !== 6) dep++;
        detail.push(`${wr},${wc}→${p2}`);
      }
      if (dep !== 2) continue;

      let score = found.usedWalls.size * 10 + Math.min(found.brakeStopsUsed, 2) * 8;
      score += Math.min(punished, 6) + (opt === 2 ? 3 : 1);
      results.push({
        cPos: [free[i], free[j]],
        rows,
        path: found.path,
        firsts,
        opt,
        punished,
        wallStopsUsed: found.wallStopsUsed,
        brakeStopsUsed: found.brakeStopsUsed,
        wallsUsed: found.usedWalls.size,
        dep,
        detail,
        score,
      });
    }
  }
}

results.sort((a, b) => b.score - a.score);
console.log(`\n布局 ${WHICH}：满足全部条件 ${results.length} 个`);
for (const c of results.slice(0, 20)) {
  console.log(
    `\n=== C 在 (${c.cPos[0]})(${c.cPos[1]}) | score ${c.score} | 墙停 ${c.wallStopsUsed} | 块停 ${c.brakeStopsUsed} | 墙数 ${c.wallsUsed} | 拿掉变 ${c.dep}/2 [${c.detail.join(' ')}] | 首步 ${c.firsts.length}（保持 ${c.opt}）===`,
  );
  c.rows.forEach((r) => console.log('  ' + r));
  console.log('  ' + stepText(c.path));
  console.log(
    '  首步: ' +
      c.firsts
        .map((x) => `${x.m.r},${x.m.c}${x.m.d}${x.m.res === 'pop' ? '*' : ''}:${x.total === Infinity ? '>9' : x.total}`)
        .join(' '),
  );
}