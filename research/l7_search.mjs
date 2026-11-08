// 第 7 关「借墙停车」盘面搜索
//
// 规格：7×7（内场 5×5）、6 块 / 3 色（A2 B2 C2）、清场、2 格内墙、par 5、上限 8。
// 考点：**主动制造中腹停靠**——方块不是停在边框，而是停在内墙旁边；这块"停在内墙边"
// 的方块之后必须真的参与一次消除（当滑块或当被撞的那块都算）。
//
// 说明：同色在一条直线上必然双消，所以"把同色停在内墙边"不成立；能停的只有
// 异色路径上没有同色的块。因此这里的"借墙"指的是：把一块异色块滑到内墙边停住，
// 让它落在另一块的同一行/列上，下一步再消。
//
// 判据（按优先级）：
//   1. par === 5
//   2. 最优路径里至少有一次"内墙停靠"（落点不是外圈，且四邻有内墙）
//   3. 开局没有现成可消的一对
//   4. 最优首步 2–4 个
//   5. 8 步上限内所有首步都还能通关
//   6. 有"看起来该先动、其实会亏一步"的首步
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
};

const COLORS = ['A', 'A', 'B', 'B', 'C', 'C'];
const cfg = { tries: Number(process.argv[2] || 400), seed: Number(process.argv[3] || 71) };
const rand = rng(cfg.seed);

const isInnerWall = (g, r, c) =>
  r > 0 && c > 0 && r < 6 && c < 6 && g[r][c] === '#';

// 这一步的"停"是不是内墙造成的：落点的下一格（沿运动方向）必须是内墙
const DIRV = { U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1] };
function blockingWall(g, tr, tc, dir) {
  const [dr, dc] = DIRV[dir];
  const r = tr + dr;
  const c = tc + dc;
  return isInnerWall(g, r, c) ? [r, c] : null;
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

    // 路径里的内墙停靠：先算每一步之后的盘面，再看这一块最后是不是消掉了
    let st = st0;
    const timeline = [];
    for (const p of path) {
      const after = applyMove(st, p.m);
      timeline.push({ st, p, after });
      st = after;
    }
    let wallStops = 0;
    let wallStopsUsed = 0;
    const usedWalls = new Set();
    timeline.forEach((t2, i) => {
      const { p, st: before, after } = t2;
      if (p.m.res !== 'move') return;
      const { tr, tc } = p.m;
      const bw = blockingWall(g, tr, tc, p.m.d);
      if (!bw) return;
      wallStops++;
      // 这块（按颜色）之后是否还参与过移动/消除
      const color = at(before, p.m.r, p.m.c);
      let later = after;
      let used = false;
      for (let j = i + 1; j < timeline.length; j++) {
        const q = timeline[j].p;
        if (
          at(later, q.m.r, q.m.c) === color &&
          (q.m.res === 'pop' || q.m.res === 'move')
        ) {
          used = true;
          break;
        }
        later = timeline[j].after;
      }
      if (used) {
        wallStopsUsed++;
        usedWalls.add(bw[0] * 7 + bw[1]);
      }
    });
    const wallsUsed = usedWalls.size;

    const firsts = legalMoves(st0).map((m) => {
      const d = parWithin(applyMove(st0, m), lv, 7);
      return { m, total: Number.isFinite(d) && d >= 0 ? 1 + d : Infinity };
    });
    const opt = firsts.filter((x) => x.total === 5).length;
    const openPop = firsts.filter((x) => x.m.res === 'pop').length;
    const punished = firsts.filter((x) => x.total > 5).length;
    const recoverable = firsts.filter((x) => x.total <= 8).length;

    if (wallStopsUsed === 0) continue;
    if (openPop > 0) continue;
    if (opt < 2 || opt > 4) continue;
    if (recoverable !== firsts.length) continue;
    kept++;

    let score = 0;
    score += Math.min(wallStopsUsed, 3) * 4;
    score += wallsUsed * 3;
    score += Math.min(punished, 6);
    score += opt === 2 ? 2 : 1;
    local.push({ lname, rows, path, walls, wallStops, wallStopsUsed, wallsUsed, firsts, opt, openPop, punished, score });
  }
  local.sort((a, b) => b.score - a.score || b.wallStopsUsed - a.wallStopsUsed);
  console.log(`${lname}: par5=${par5}/${cfg.tries}, 满足全部条件=${kept}`);
  results.push(...local.slice(0, 3));
}

results.sort((a, b) => b.score - a.score || b.wallStopsUsed - a.wallStopsUsed);

// 两格墙是不是都真的改变了难度：拿掉任一格墙，par 应该不再是 5。
// 只对排序靠前的候选算，避免每个随机盘面都多做两次搜索。
for (const c of results.slice(0, 15)) {
  let dep = 0;
  for (const [wr, wc] of c.walls) {
    const g2 = c.rows.map((row) => row.split(''));
    g2[wr][wc] = '.';
    const rows2 = g2.map((row) => row.join(''));
    const p2 = parWithin(parse(rows2), { rows: rows2, goal: 'clear', targetColor: null }, 6, 250000);
    if (p2 !== 5) dep++;
  }
  c.wallsDependent = dep;
  c.score += dep * 5;
}
results.sort((a, b) => b.score - a.score || b.wallStopsUsed - a.wallStopsUsed);

console.log(`\n候选 ${results.length} 个`);
const DIR = { U: '上', D: '下', L: '左', R: '右' };
for (const c of results.slice(0, 10)) {
  const stepText = c.path.map((p, i) => {
    const col = String.fromCharCode(64 + at(p.st, p.m.r, p.m.c));
    return p.m.res === 'pop'
      ? `${i + 1}.${col}(${p.m.r},${p.m.c})${DIR[p.m.d]}×(${p.m.br},${p.m.bc})`
      : `${i + 1}.${col}(${p.m.r},${p.m.c})${DIR[p.m.d]}→(${p.m.tr},${p.m.tc})`;
  });
  console.log(
    `\n=== ${c.lname} | score ${c.score} | 内墙停靠 ${c.wallStopsUsed}/${c.wallStops} | 用到墙 ${c.wallsUsed}/2 | 拿掉后会变 ${c.wallsDependent}/2 | 首步 ${c.firsts.length}（保持 ${c.opt}，最差 ${Math.max(...c.firsts.map((x) => (x.total === Infinity ? 9 : x.total)))}）| 开局可消 ${c.openPop} ===`,
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