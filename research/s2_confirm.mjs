// S2 候选终检：用 src/game.js 复核 par、回放最优路径、首步表、墙依赖、死局
//
// 用法：node research/s2_confirm.mjs [候选名]
// 候选写在 CANDIDATES 里。par 由 research A* 给出（已对 1–8 关校准），
// 但最优路径必须能在 src/game.js 里逐步回放并通关——这是"设计时能过 = 游戏里能过"的保证。
import { parse as sp, legalMoves, applyMove, isGoal, at, countBlocks } from '../src/game.js';
import { parse as ep } from '../research/engine.mjs';
import { aStar } from '../research/solver_fast.mjs';

const CANDIDATES = {
  'seed13-对角': {
    rows: [
      '#######',
      '##....#',
      '#CD...#',
      '#DC...#',
      '##...A#',
      '#.B.BA#',
      '#######',
    ],
    limit: 11,
  },
  'seed18-挤一挤': {
    rows: [
      '#######',
      '#..B#A#',
      '#.C##.#',
      '#BE.A.#',
      '#...C.#',
      '#.DDE.#',
      '#######',
    ],
    limit: 12,
  },
  'concave3-#14': {
    rows: [
      '#######',
      '#..C.B#',
      '#.##..#',
      '#.#...#',
      '#....C#',
      '#.AB.A#',
      '#######',
    ],
    limit: 9,
  },
  'notch-#15': {
    rows: [
      '#######',
      '#A.#AC#',
      '#B.#..#',
      '#A.#.A#',
      '#.B...#',
      '#.C...#',
      '#######',
    ],
    limit: 10,
  },
  'ring6-#16': {
    rows: [
      '#######',
      '#.#.#.#',
      '#.B.A.#',
      '#.#B#A#',
      '#A....#',
      '#C..AC#',
      '#######',
    ],
    limit: 10,
  },
  'hwall-#17': {
    rows: [
      '#######',
      '#..BC.#',
      '#.C...#',
      '#.###B#',
      '#..C..#',
      '#..ACA#',
      '#######',
    ],
    limit: 10,
  },
  'cross9-#13': {
    rows: [
      '#######',
      '#A#C..#',
      '#.B.D.#',
      '#D#.C.#',
      '#A....#',
      '#...B.#',
      '#######',
    ],
    limit: 11,
  },
  'ring3-#18': {
    rows: [
      '#######',
      '#..A.D#',
      '#.#.#A#',
      '#B.C.B#',
      '#..#..#',
      '#.CD..#',
      '#######',
    ],
    limit: 11,
  },
  'ring3-#12': {
    rows: [
      '#######',
      '#.A.BA#',
      '#.#.#.#',
      '#..C.B#',
      '#..#..#',
      '#.C...#',
      '#######',
    ],
    limit: 9,
  },
  'ring3-#8': {
    rows: [
      '#######',
      '#A..C.#',
      '#B#C#.#',
      '#.....#',
      '#A.#..#',
      '#.B...#',
      '#######',
    ],
    limit: 9,
  },
  'twin-D': {
    rows: [
      '#######',
      '#.A.BA#',
      '#.#.#.#',
      '#C....#',
      '#.C...#',
      '#...B.#',
      '#######',
    ],
    limit: 9,
  },
  'twin-A': {
    rows: [
      '#######',
      '#.....#',
      '#.#A#C#',
      '#.....#',
      '#B..CB#',
      '#....A#',
      '#######',
    ],
    limit: 9,
  },
  'cross9-#2': {
    rows: [
      '#######',
      '#.#..B#',
      '#DB.A.#',
      '#C#.C.#',
      '#.....#',
      '#D..A.#',
      '#######',
    ],
    limit: 10,
  },
  'cross9-#5': {
    rows: [
      '#######',
      '#B#D..#',
      '#..A..#',
      '#.#D..#',
      '#.C.BC#',
      '#A....#',
      '#######',
    ],
    limit: 10,
  },
  'gate-#2': {
    rows: [
      '#######',
      '#..#..#',
      '#A.#A.#',
      '#....C#',
      '#..#.B#',
      '#..#BC#',
      '#######',
    ],
    limit: 9,
  },
  'concave3-#3': {
    rows: [
      '#######',
      '#..C.B#',
      '#.##..#',
      '#.#...#',
      '#....C#',
      '#.AB.A#',
      '#######',
    ],
    limit: 9,
  },
};

const DIRV = { U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1] };
const key = (s) => s.c.join(',');

function innerWalls(rows) {
  const out = [];
  for (let r = 1; r < rows.length - 1; r++)
    for (let c = 1; c < rows[0].length - 1; c++) if (rows[r][c] === '#') out.push([r, c]);
  return out;
}
function removeWall(rows, wr, wc) {
  return rows.map((row, r) => (r === wr ? row.slice(0, wc) + '.' + row.slice(wc + 1) : row));
}
function replay(rows, path) {
  let st = sp(rows);
  const moves = [];
  for (const p of path) {
    const want = p.move;
    const m = legalMoves(st).find((x) => x.r === want.r && x.c === want.c && x.d === want.d);
    if (!m) throw new Error(`回放失败：(${want.r},${want.c})${want.d} 在 src 里不合法`);
    if (m.res !== want.res) throw new Error(`回放失败：(${want.r},${want.c})${want.d} 结果不一致`);
    if (m.res === 'pop' && (m.br !== want.br || m.bc !== want.bc))
      throw new Error(`回放失败：(${want.r},${want.c})${want.d} 消除目标不一致`);
    if (m.res === 'move' && (m.tr !== want.tr || m.tc !== want.tc))
      throw new Error(`回放失败：(${want.r},${want.c})${want.d} 停靠位置不一致`);
    st = applyMove(st, m);
    moves.push(m);
  }
  return { st, moves };
}
function scanDead(rows, lv, cap = 4000000) {
  const st0 = sp(rows);
  const seen = new Set([key(st0)]);
  let frontier = [st0];
  let dead = 0;
  for (let d = 1; d <= lv.limit; d++) {
    const next = [];
    for (const st of frontier) {
      for (const m of legalMoves(st)) {
        const ns = applyMove(st, m);
        const k = key(ns);
        if (seen.has(k)) continue;
        seen.add(k);
        if (!isGoal(ns, lv) && legalMoves(ns).length === 0) dead++;
        next.push(ns);
      }
    }
    if (!next.length) break;
    frontier = next;
    if (seen.size > cap) return { dead, states: seen.size, capped: true };
  }
  return { dead, states: seen.size, capped: false };
}

const only = process.argv[2] || null;
let ok = 0;
let bad = 0;
for (const [name, def] of Object.entries(CANDIDATES)) {
  if (only && name !== only) continue;
  const { rows, limit } = def;
  const lv = { goal: 'clear', targetColor: null, rows, limit };
  const st = sp(rows);
  const es = ep(rows);
  const r = aStar(es, 'A', 800000);
  const blocks = countBlocks(st);
  const colors = new Set();
  for (const v of st.c) if (v > 0) colors.add(v);
  const walls = innerWalls(rows);
  const firsts = legalMoves(st);
  const openPops = firsts.filter((m) => m.res === 'pop').length;

  console.log(`\n=== ${name} | ${blocks} 块 / ${colors.size} 色 | 内墙 ${walls.length} ===`);
  rows.forEach((x) => console.log('  ' + x));

  if (!r) {
    console.log('  ✗ A* 未找到解（超节点上限/无解）');
    bad++;
    continue;
  }
  const par = r.len;
  let replayed;
  try {
    replayed = replay(rows, r.path);
  } catch (e) {
    console.log('  ✗ ' + e.message);
    bad++;
    continue;
  }
  const done = isGoal(replayed.st, lv) && countBlocks(replayed.st) === 0;
  console.log(`  par ${par} / 上限 ${limit} | 回放 ${replayed.moves.length} 步 → ${done ? '通关 ✓' : '未通关 ✗'}`);
  console.log(
    '  路径 ' +
      replayed.moves
        .map((m, i) => {
          if (m.res === 'pop') return `${i + 1}.(${m.r},${m.c})${m.d}×(${m.br},${m.bc})`;
          const [dr, dc] = DIRV[m.d];
          const nr = m.tr + dr;
          const nc = m.tc + dc;
          const why =
            nr < 1 || nc < 1 || nr > 5 || nc > 5
              ? '边停'
              : rows[nr][nc] === '#'
                ? '墙停'
                : '块停';
          return `${i + 1}.(${m.r},${m.c})${m.d}→(${m.tr},${m.tc})${why}`;
        })
        .join(' → '),
  );

  // 停靠类型
  let wallStops = 0;
  let blockStops = 0;
  let edgeStops = 0;
  const wallUsed = new Map();
  replayed.moves.forEach((m) => {
    if (m.res !== 'move') return;
    const [dr, dc] = DIRV[m.d];
    const nr = m.tr + dr;
    const nc = m.tc + dc;
    if (nr < 1 || nc < 1 || nr > 5 || nc > 5) edgeStops++;
    else if (rows[nr][nc] === '#') {
      wallStops++;
      wallUsed.set(`${nr},${nc}`, (wallUsed.get(`${nr},${nc}`) || 0) + 1);
    } else blockStops++;
  });

  // 首步表
  const totals = firsts.map((m) => {
    const rr = aStar(applyMoveEngine(es, m), 'A', 800000);
    return { m, total: rr ? 1 + rr.len : Infinity };
  });
  const opt = totals.filter((x) => x.total === par).length;
  const punished = totals.filter((x) => x.total > par).length;
  const recoverable = totals.filter((x) => x.total <= limit).length;
  const maxTotal = Math.max(...totals.filter((x) => Number.isFinite(x.total)).map((x) => x.total));

  // 墙依赖
  const wallDetail = walls.map(([wr, wc]) => {
    const rr = aStar(ep(removeWall(rows, wr, wc)), 'A', 800000);
    const p2 = rr ? rr.len : Infinity;
    return { wr, wc, p2, used: wallUsed.get(`${wr},${wc}`) || 0 };
  });
  let rowsNo = rows;
  for (const [wr, wc] of walls) rowsNo = removeWall(rowsNo, wr, wc);
  const rrAll = aStar(ep(rowsNo), 'A', 800000);
  const allPar = rrAll ? rrAll.len : Infinity;

  const dead = blocks <= 6 ? scanDead(rows, lv) : { dead: -1, states: 0, capped: true };

  console.log(`  首步 ${firsts.length} | 保持 ${opt} | 走错 ${punished} | 限内可通 ${recoverable}/${firsts.length} | 最差 ${maxTotal === Infinity ? '>上限' : maxTotal}`);
  console.log('  ' + totals.map((x) => `${x.m.r},${x.m.c}${x.m.d}${x.m.res === 'pop' ? '*' : ''}:${x.total === Infinity ? 'X' : x.total}`).join(' '));
  console.log(`  停靠：墙 ${wallStops} / 块 ${blockStops} / 边 ${edgeStops} | 开局可消 ${openPops}`);
  console.log(`  墙：${wallDetail.map((w) => `(${w.wr},${w.wc})${w.used ? '×' + w.used : ''}→${w.p2}`).join(' ')} | 拆整组→${allPar}`);
  console.log(`  死局 ${dead.dead < 0 ? '未扫（8 块）' : `${dead.dead} / ${dead.states}${dead.capped ? '（未扫完）' : ''}`}`);

  const checks = [
    ['路径在 src 里通关', done],
    ['开局无现成消除', openPops === 0],
    ['保持 par 的首步 1–4', opt >= 1 && opt <= 4],
    ['所有首步限内可通', recoverable === firsts.length],
    ['至少 1 次墙停', wallStops >= 1],
    ['拆整组更快', allPar < par],
    ['无死局或已跳过', dead.dead === 0 || dead.dead === -1],
  ].filter(([, v]) => !v);
  if (checks.length) {
    console.log('  ✗ ' + checks.map(([k]) => k).join('；'));
    bad++;
  } else {
    console.log('  ✓ 全部通过');
    ok++;
  }
}

function applyMoveEngine(st, m) {
  // research applyA 的语义与 src 完全一致；这里手写一份避免多 import
  const ns = { w: st.w, h: st.h, c: Int8Array.from(st.c) };
  if (m.res === 'pop') {
    ns.c[m.r * st.w + m.c] = 0;
    ns.c[m.br * st.w + m.bc] = 0;
  } else {
    const v = st.c[m.r * st.w + m.c];
    ns.c[m.r * st.w + m.c] = 0;
    ns.c[m.tr * st.w + m.tc] = v;
  }
  return ns;
}

console.log(`\n汇总：通过 ${ok}，有问题 ${bad}`);
process.exit(bad ? 1 : 0);