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

// ---- 4. 第 4 关：只要红色（第一次换目标） ----
{
  const lv = LEVELS[3];
  const st = parse(lv.rows);
  assert.equal(lv.goal, 'color');
  assert.equal(lv.targetColor, 1);
  assert.equal(countBlocks(st), 5);

  // 三块蓝：怎么消都会剩一块，“清空全场”在这关根本不存在
  let blues = 0;
  for (const v of st.c) if (v === 2) blues++;
  assert.equal(blues, 3, '第 4 关应有 3 块蓝，清场不可能');

  // 右边的 A(3,5) 向左：被 (3,3) 的墙挡住，停在 (3,4)
  const pushLeft = moveFrom(st, 3, 5, 'L');
  assert.deepEqual(pushLeft, { r: 3, c: 5, d: 'L', res: 'move', tr: 3, tc: 4 });

  const s1 = applyMove(st, pushLeft);
  // 再向上：一路滑到 (1,4)，与左上角的 A 同排
  const pushUp = moveFrom(s1, 3, 4, 'U');
  assert.deepEqual(pushUp, { r: 3, c: 4, d: 'U', res: 'move', tr: 1, tc: 4 });

  const s2 = applyMove(s1, pushUp);
  const aPop = moveFrom(s2, 1, 1, 'R');
  assert.deepEqual(aPop, { r: 1, c: 1, d: 'R', res: 'pop', br: 1, bc: 4 });
  const s3 = applyMove(s2, aPop);
  assert.equal(isGoal(s3, lv), true, '三步后红色应全部消失');
  assert.ok(countBlocks(s3) > 0, '通关时蓝块还在');
  assert.equal(solve(lv), 3);

  // 唯一最优首步：右边那块 A 向左
  const optimal = legalMoves(st)
    .map((m) => ({ m, total: 1 + solveFrom(applyMove(st, m), lv) }))
    .filter((x) => x.total === 3);
  assert.equal(optimal.length, 1, '第 4 关应有且仅有 1 个最优首步');
  assert.deepEqual(optimal[0].m, { r: 3, c: 5, d: 'L', res: 'move', tr: 3, tc: 4 });

  // 诱惑步：先消一对蓝，白花一步 → 4 步（2 星）
  const greedy = moveFrom(st, 4, 2, 'R');
  assert.equal(greedy.res, 'pop');
  assert.equal(
    1 + solveFrom(applyMove(st, greedy), lv),
    4,
    '先消蓝应退化为 4 步',
  );

  // 禁用关键步后仍能通关（4 步），只是少星
  assert.equal(solve(lv, (m) => m.r === 3 && m.c === 5 && m.d === 'L'), 4);
}

// ---- 5. 关卡参数：par 必须等于 BFS 最优，且 par < 上限 ----
for (const lv of LEVELS) {
  const par = solve(lv);
  assert.equal(par, lv.par, `第 ${lv.id} 关 par 应为 ${lv.par}，实际 ${par}`);
  assert.ok(lv.par <= lv.limit, `第 ${lv.id} 关 par 不应超过步数上限`);
  assert.ok(lv.limit - lv.par >= 1, `第 ${lv.id} 关需要留出容错步数`);

  const st0 = parse(lv.rows);
  const total = countBlocks(st0);
  assert.ok(total >= 4 && total <= 12, `第 ${lv.id} 关方块数应在 4–12，实际 ${total}`);
  if (lv.goal === 'clear') {
    assert.equal(total % 2, 0, `第 ${lv.id} 关清场模式方块数必须成对`);
  } else {
    let target = 0;
    for (const v of st0.c) if (v === lv.targetColor) target++;
    assert.ok(target >= 2 && target % 2 === 0, `第 ${lv.id} 关目标色必须成对`);
  }
}

// ---- 6. 与 research 引擎逐状态对拍（13 关 × 120 步固定随机游走） ----
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
  `规则内核 OK：4 关 par = ${LEVELS.map((l) => l.par).join('/')}；` +
    `第 2、3、4 关最优首步唯一；第 3 关先消 B、第 4 关先消蓝都退化为 4 步；` +
    `与 research 引擎对拍 ${compared} 个状态一致。`,
);