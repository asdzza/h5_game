// 规则内核自测：与 research/engine.mjs 逐状态对照，确保"设计时能过 = 游戏里能过"。
import assert from 'node:assert/strict';
import {
  parse,
  legalMoves,
  moveFrom,
  applyMove,
  isGoal,
  countBlocks,
} from '../src/game.js';
import { LEVELS } from '../src/levels.js';
import { parse as rParse, genA, applyA, countBlocks as rCount } from '../research/engine.mjs';
import { LEVELS as RESEARCH_LEVELS } from '../research/levels_seed.mjs';

const sig = (m) =>
  m.res === 'pop'
    ? `${m.r},${m.c},${m.d},pop,${m.br},${m.bc}`
    : `${m.r},${m.c},${m.d},move,${m.tr},${m.tc}`;

const sigs = (ms) => ms.map(sig).sort().join('|');
const key = (st) => st.c.join(',');

// 从任意局面做 BFS，返回最少步数；banned(move, state) 可用于禁用某些走法
function solveFrom(start, lv, banned) {
  if (isGoal(start, lv)) return 0;
  const seen = new Set([key(start)]);
  let frontier = [start];
  for (let depth = 1; depth <= 30; depth++) {
    const next = [];
    for (const st of frontier) {
      for (const m of legalMoves(st)) {
        if (banned && banned(m, st)) continue;
        const ns = applyMove(st, m);
        if (isGoal(ns, lv)) return depth;
        const k = key(ns);
        if (seen.has(k)) continue;
        seen.add(k);
        next.push(ns);
      }
    }
    if (!next.length) return Infinity;
    frontier = next;
  }
  return Infinity;
}

const solve = (lv, banned) => solveFrom(parse(lv.rows), lv, banned);

// ---- 1. 第 1 关：拖动 + 同色消除 + 异色挡路（原第 1、2 关合并） ----
{
  const lv = LEVELS[0];
  const st = parse(lv.rows);
  assert.equal(lv.id, 1);
  assert.equal(countBlocks(st), 4, '第 1 关应有 4 块');
  assert.equal(legalMoves(st).length, 10, '第 1 关开局应有 10 个合法走法');

  // A(1,1) 向右：被 B(1,3) 挡住，只滑一格，不推动也不消
  const blocked = moveFrom(st, 1, 1, 'R');
  assert.deepEqual(blocked, { r: 1, c: 1, d: 'R', res: 'move', tr: 1, tc: 2 });

  // B(1,3) 向下：撞上同色 B(5,3)，双消
  const bPop = moveFrom(st, 1, 3, 'D');
  assert.deepEqual(bPop, { r: 1, c: 3, d: 'D', res: 'pop', br: 5, bc: 3 });

  // 解法：先消 B，两个 A 之间就通了
  const s1 = applyMove(st, bPop);
  assert.equal(countBlocks(s1), 2);
  const aPop = moveFrom(s1, 1, 1, 'R');
  assert.deepEqual(aPop, { r: 1, c: 1, d: 'R', res: 'pop', br: 1, bc: 5 });
  const s2 = applyMove(s1, aPop);
  assert.equal(isGoal(s2, lv), true, '两步后应通关');
  assert.equal(solve(lv), 2);
}

// ---- 2. 第 2 关：墙也是刹车（原第 3 关前移） ----
{
  const lv = LEVELS[1];
  const st = parse(lv.rows);
  assert.equal(countBlocks(st), 4);

  // A(5,4) 向上：会被 (3,4) 的墙挡住，正好停在 (4,4)
  const brake = moveFrom(st, 5, 4, 'U');
  assert.deepEqual(brake, { r: 5, c: 4, d: 'U', res: 'move', tr: 4, tc: 4 });

  const s1 = applyMove(st, brake);
  const aPop = moveFrom(s1, 4, 4, 'L');
  assert.equal(aPop.res, 'pop');
  const s2 = applyMove(s1, aPop);
  const s3 = applyMove(s2, moveFrom(s2, 3, 3, 'D'));
  assert.equal(isGoal(s3, lv), true, '三步后应通关');
  assert.equal(solve(lv), 3);

  // 关键步唯一性：只有 1 个首步能保持 3 步最优
  const firstMoves = legalMoves(st)
    .map((m) => ({ m, total: 1 + solveFrom(applyMove(st, m), lv) }))
    .filter((x) => Number.isFinite(x.total));
  const optimal = firstMoves.filter((x) => x.total === 3);
  assert.equal(optimal.length, 1, '第 2 关应有且仅有 1 个最优首步');
  assert.deepEqual(
    optimal[0].m,
    { r: 5, c: 4, d: 'U', res: 'move', tr: 4, tc: 4 },
    '关键步应为 A(5,4)U',
  );

  // 禁用关键步后，最优解退化为 4 步
  const withoutKey = solve(lv, (m) => m.r === 5 && m.c === 4 && m.d === 'U');
  assert.equal(withoutKey, 4, '禁用“靠墙停车”后 par 应变成 4');
}

// ---- 3. 第 3 关：借它停车（异色方块也能当刹车） ----
{
  const lv = LEVELS[2];
  const st = parse(lv.rows);
  assert.equal(countBlocks(st), 4);

  // 上方的墙把 A(3,4) 封在第三行：向上是无效操作
  assert.equal(moveFrom(st, 3, 4, 'U'), null, 'A(3,4) 上方是墙，向上应为无效操作');

  // A(1,2) 向下：撞到 B(4,2) 前停住，正好落在 (3,2)，与 A(3,4) 同行
  const brake = moveFrom(st, 1, 2, 'D');
  assert.deepEqual(brake, { r: 1, c: 2, d: 'D', res: 'move', tr: 3, tc: 2 });

  const s1 = applyMove(st, brake);
  const aPop = moveFrom(s1, 3, 2, 'R');
  assert.deepEqual(aPop, { r: 3, c: 2, d: 'R', res: 'pop', br: 3, bc: 4 });
  const s2 = applyMove(s1, aPop);
  const bPop = moveFrom(s2, 4, 2, 'R');
  assert.deepEqual(bPop, { r: 4, c: 2, d: 'R', res: 'pop', br: 4, bc: 4 });
  const s3 = applyMove(s2, bPop);
  assert.equal(isGoal(s3, lv), true, '三步后应通关');
  assert.equal(solve(lv), 3);

  // 只有 A(1,2) 向下能保持 3 步最优
  const optimal = legalMoves(st)
    .map((m) => ({ m, total: 1 + solveFrom(applyMove(st, m), lv) }))
    .filter((x) => x.total === 3);
  assert.equal(optimal.length, 1, '第 3 关应有且仅有 1 个最优首步');
  assert.deepEqual(optimal[0].m, {
    r: 1,
    c: 2,
    d: 'D',
    res: 'move',
    tr: 3,
    tc: 2,
  });

  // 诱惑步：先消 B 会失去刹车，最优退化为 4 步（仍能通关，2 星）
  const greedy = moveFrom(st, 4, 2, 'R');
  assert.equal(greedy.res, 'pop');
  assert.equal(
    1 + solveFrom(applyMove(st, greedy), lv),
    4,
    '先消 B 应退化为 4 步',
  );

  // 禁用关键步后，最优解同样退化为 4 步
  assert.equal(
    solve(lv, (m) => m.r === 1 && m.c === 2 && m.d === 'D'),
    4,
  );
}

// ---- 4. 关卡参数：par 必须等于 BFS 最优，且 par < 上限 ----
for (const lv of LEVELS) {
  const par = solve(lv);
  assert.equal(par, lv.par, `第 ${lv.id} 关 par 应为 ${lv.par}，实际 ${par}`);
  assert.ok(lv.par <= lv.limit, `第 ${lv.id} 关 par 不应超过步数上限`);
  assert.ok(lv.limit - lv.par >= 1, `第 ${lv.id} 关需要留出容错步数`);
  assert.equal(countBlocks(parse(lv.rows)), 4, `第 ${lv.id} 关方块数应为 4`);
}

// ---- 5. 与 research 引擎逐状态对拍（13 关 × 120 步固定随机游走） ----
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let compared = 0;
for (const lv of RESEARCH_LEVELS) {
  let a = parse(lv.rows);
  let b = rParse(lv.rows);
  assert.equal(countBlocks(a), rCount(b), `#${lv.id} 方块数不一致`);

  const rnd = mulberry32(lv.id * 7919 + 13);
  for (let step = 0; step < 120; step++) {
    const am = legalMoves(a);
    const bm = genA(b);
    assert.equal(
      sigs(am),
      sigs(bm.map((m) => ({ ...m, res: m.res }))),
      `#${lv.id} 第 ${step} 步合法走法不一致`,
    );
    compared++;
    if (!am.length) break;
    const pick = am[Math.floor(rnd() * am.length)];
    a = applyMove(a, pick);
    b = applyA(b, bm.find((m) => sig(m) === sig(pick)));
  }
}

console.log(
  `规则内核 OK：3 关 par = ${LEVELS.map((l) => l.par).join('/')}；` +
    `第 2、3 关最优首步唯一；第 3 关先消 B 退化为 4 步；` +
    `与 research 引擎对拍 ${compared} 个状态一致。`,
);