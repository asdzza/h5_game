// 规则内核自测：与 research/engine.mjs 逐状态对照，确保"设计时能过 = 游戏里能过"。
import assert from 'node:assert/strict';
import {
  parse,
  legalMoves,
  moveFrom,
  isLastPairBlocked,
  applyMove,
  isGoal,
  countBlocks,
  at,
  isFixed,
  berthsLeft,
} from '../src/game.js';
import { LEVELS } from '../src/levels.js';
import { SOLUTIONS } from '../src/solutions.js';
import { parse as rParse, genA, applyA, countBlocks as rCount } from '../research/engine.mjs';
import { LEVELS as RESEARCH_LEVELS } from '../research/levels_seed.mjs';
import { aStar } from '../research/solver_fast.mjs';
import { canStillWin } from '../src/solver.js';

// 测试很重（A* 全量 50 关），没有输出会让人以为卡死。
const TEST_T0 = Date.now();
const progress = (msg) => {
  const s = ((Date.now() - TEST_T0) / 1000).toFixed(1);
  process.stdout.write(`[test ${s}s] ${msg}\n`);
};
progress('开始规则内核测试');

const sig = (m) =>
  m.res === 'pop'
    ? `${m.r},${m.c},${m.d},pop,${m.br},${m.bc}`
    : `${m.r},${m.c},${m.d},move,${m.tr},${m.tc}`;

const sigs = (ms) => ms.map(sig).sort().join('|');
const key = (st) => {
  let k = st.c.join(',');
  if (st.fixed) for (let i = 0; i < st.fixed.length; i++) if (st.fixed[i]) k += `|${i}`;
  if (st.berths && st.berths.length) k += `|P${st.filled || 0}`;
  return k;
};

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

// 9 关起块数变多，par 用已校准的 A* 求；具体解法仍在下面对 src/game.js 逐步回放。
const astarParCap = (lv, cap) => {
  const r = aStar(rParse(lv.rows), 'A', cap, lv.goal === 'color' ? { targetColor: lv.targetColor } : {});
  return r ? r.len : Infinity;
};
const astarPar = (lv) => astarParCap(lv, 800000);
const astarTotal = (lv, m) => {
  const r = aStar(applyA(rParse(lv.rows), m), 'A', 800000, lv.goal === 'color' ? { targetColor: lv.targetColor } : {});
  return r ? 1 + r.len : Infinity;
};
const emptyCell = (lv, r, c) => ({
  ...lv,
  rows: lv.rows.map((row, i) => (i === r ? row.slice(0, c) + '.' + row.slice(c + 1) : row)),
});
const removeColor = (lv, ch) => ({
  ...lv,
  // 整色拿掉时，对应数字标记（如 D 的 '4'）也要一起清掉，否则「最后一对」规则会残留
  rows: lv.rows.map((row) => row.split(ch).join('.').split(String(ch.charCodeAt(0) - 64)).join('.')),
});
const solveLevel = (lv) => (lv.id <= 8 ? solve(lv) : astarPar(lv));

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

// ---- 3. 第 3 关：借它停车（异色方块当刹车，而且停车位要自己推出来） ----
{
  const lv = LEVELS[2];
  const st = parse(lv.rows);
  assert.equal(countBlocks(st), 4);

  // 首步不是消对，而是把挡路的 B 推到墙边
  const push = moveFrom(st, 4, 4, 'R');
  assert.deepEqual(push, { r: 4, c: 4, d: 'R', res: 'move', tr: 4, tc: 5 });

  // 推完之后，A(4,2) 向右正好停在 B 前面——这就是“借它停车”
  const s1 = applyMove(st, push);
  const park = moveFrom(s1, 4, 2, 'R');
  assert.deepEqual(park, { r: 4, c: 2, d: 'R', res: 'move', tr: 4, tc: 4 });

  const s2 = applyMove(s1, park);
  const aPop = moveFrom(s2, 2, 4, 'D');
  assert.deepEqual(aPop, { r: 2, c: 4, d: 'D', res: 'pop', br: 4, bc: 4 });
  const s3 = applyMove(s2, aPop);
  const bPop = moveFrom(s3, 2, 5, 'D');
  assert.deepEqual(bPop, { r: 2, c: 5, d: 'D', res: 'pop', br: 4, bc: 5 });
  const s4 = applyMove(s3, bPop);
  assert.equal(isGoal(s4, lv), true, '四步后应通关');
  assert.equal(solve(lv), 4);

  // 只有 B(4,4) 向右能保持 4 步最优
  const firstMoves = legalMoves(st)
    .map((m) => ({ m, total: 1 + solveFrom(applyMove(st, m), lv) }))
    .filter((x) => Number.isFinite(x.total));
  const optimal = firstMoves.filter((x) => x.total === 4);
  assert.equal(optimal.length, 1, '第 3 关应有且仅有 1 个最优首步');
  assert.deepEqual(optimal[0].m, push);

  // 其余 12 个首步全部要多走至少一步——不先推块当刹车就要绕远
  assert.equal(firstMoves.length, 13);
  const rest = firstMoves.filter((x) => x.total !== 4);
  assert.equal(rest.length, 12);
  assert.equal(Math.min(...rest.map((x) => x.total)), 5);

  // 禁用关键步后 par 退化为 5
  assert.equal(solve(lv, (m) => m.r === 4 && m.c === 4 && m.d === 'R'), 5);
}

// ---- 4. 第 4 关：只要红色（第一次换目标） ----
{
  const lv = LEVELS[3];
  const st = parse(lv.rows);
  assert.equal(lv.goal, 'color');
  assert.equal(lv.targetColor, 1);
  assert.equal(countBlocks(st), 4);

  // 2 红 + 2 蓝：蓝块正好是一对，所以“清空”是能做到的——但要 6 步，上限只有 5 步
  let blues = 0;
  for (const v of st.c) if (v === 2) blues++;
  assert.equal(blues, 2, '第 4 关应有 2 块蓝');
  assert.equal(
    solve({ ...lv, goal: 'clear' }),
    6,
    '清空全场要 6 步，超过上限 5——所以只能按“只清红”来打',
  );
  assert.ok(lv.limit < 6, '上限必须小于清场步数，否则玩家可以靠清场蒙过去');

  // 左上角的 A(1,1) 开局一步也动不了：右边是蓝块、下面是墙
  assert.equal(moveFrom(st, 1, 1, 'R'), null, 'A(1,1) 向右被蓝块堵死');
  assert.equal(moveFrom(st, 1, 1, 'D'), null, 'A(1,1) 向下被墙堵死');

  // 首步必须是把蓝块推开：B(1,2) 向右一路滑到墙边 (1,5)
  const pushBlue = moveFrom(st, 1, 2, 'R');
  assert.deepEqual(pushBlue, { r: 1, c: 2, d: 'R', res: 'move', tr: 1, tc: 5 });

  const s1 = applyMove(st, pushBlue);
  // 红块这才有路，而且正好停在蓝块前面（借它停车）
  const aRight = moveFrom(s1, 1, 1, 'R');
  assert.deepEqual(aRight, { r: 1, c: 1, d: 'R', res: 'move', tr: 1, tc: 4 });

  const s2 = applyMove(s1, aRight);
  // 再向下，被第二块蓝 B(4,4) 停住，正好与另一块红同排
  const aDown = moveFrom(s2, 1, 4, 'D');
  assert.deepEqual(aDown, { r: 1, c: 4, d: 'D', res: 'move', tr: 3, tc: 4 });

  const s3 = applyMove(s2, aDown);
  const aPop = moveFrom(s3, 3, 4, 'R');
  assert.deepEqual(aPop, { r: 3, c: 4, d: 'R', res: 'pop', br: 3, bc: 5 });
  const s4 = applyMove(s3, aPop);
  assert.equal(isGoal(s4, lv), true, '四步后红色应全部消失');
  assert.equal(countBlocks(s4), 2, '通关时两块蓝都还在');
  assert.equal(solve(lv), 4);

  // 唯一最优首步：推蓝块向右
  const optimal = legalMoves(st)
    .map((m) => ({ m, total: 1 + solveFrom(applyMove(st, m), lv) }))
    .filter((x) => x.total === 4);
  assert.equal(optimal.length, 1, '第 4 关应有且仅有 1 个最优首步');
  assert.deepEqual(optimal[0].m, pushBlue);

  // 诱惑步：把蓝块往下推（也是“推开它”，但位置不对）→ 5 步
  const wrong = moveFrom(st, 1, 2, 'D');
  assert.equal(1 + solveFrom(applyMove(st, wrong), lv), 5, '蓝块推错方向应退化为 5 步');

  // 禁掉所有“推蓝块 / 借蓝块停车”的走法后，这一关无解 —— 蓝块是解法本身
  const usesBlue = (m, s) => {
    if (m.res === 'pop') return false;
    if (s.c[m.r * s.w + m.c] === 2) return true;
    const dr = Math.sign(m.tr - m.r);
    const dc = Math.sign(m.tc - m.c);
    return s.c[(m.tr + dr) * s.w + (m.tc + dc)] === 2;
  };
  assert.equal(solve(lv, usesBlue), Infinity, '不碰蓝块就无解');
}

// ---- 4.5 第 5 关「红色两对」 ----
{
  const lv = LEVELS[4];
  const st = parse(lv.rows);
  assert.equal(lv.goal, 'color');
  assert.equal(lv.targetColor, 1);
  assert.equal(countBlocks(st), 6);

  let reds = 0;
  let blues = 0;
  let greens = 0;
  for (const v of st.c) {
    if (v === 1) reds++;
    else if (v === 2) blues++;
    else if (v === 3) greens++;
  }
  assert.equal(reds, 4, '第 5 关应有 4 块红（两对）');
  assert.equal(blues, 1, '蓝块只有 1 块，永远消不掉');
  assert.equal(greens, 1, '绿块只有 1 块，永远消不掉');
  assert.equal(
    blues % 2,
    1,
    '蓝块只有 1 块（奇数）：消除永远同色成对，清场在数学上不可能',
  );
  assert.equal(
    greens % 2,
    1,
    '绿块只有 1 块（奇数）：消除永远同色成对，清场在数学上不可能',
  );

  // 开局没有任何一对是现成能消的：玩家得先决定“谁跟谁配”
  const firsts = legalMoves(st);
  assert.equal(firsts.filter((m) => m.res === 'pop').length, 0, '第 5 关开局不应有现成的配对');
  assert.equal(solve(lv), 4);

  // 竖着的一对：绿块 (3,1) 当刹车，把红停在 (3,2)，正好压住下面的红
  const aLeft = moveFrom(st, 3, 3, 'L');
  assert.deepEqual(aLeft, { r: 3, c: 3, d: 'L', res: 'move', tr: 3, tc: 2 });
  const s1 = applyMove(st, aLeft);
  const aDown = moveFrom(s1, 3, 2, 'D');
  assert.deepEqual(aDown, { r: 3, c: 2, d: 'D', res: 'pop', br: 4, bc: 2 });
  const s2 = applyMove(s1, aDown);

  // 横着的一对：蓝块 (1,4) 当刹车，把红停在 (2,4)，与左边的红同排
  const aUp = moveFrom(s2, 5, 4, 'U');
  assert.deepEqual(aUp, { r: 5, c: 4, d: 'U', res: 'move', tr: 2, tc: 4 });
  const s3 = applyMove(s2, aUp);
  const aRight = moveFrom(s3, 2, 1, 'R');
  assert.deepEqual(aRight, { r: 2, c: 1, d: 'R', res: 'pop', br: 2, bc: 4 });
  const s4 = applyMove(s3, aRight);
  assert.equal(isGoal(s4, lv), true, '四步后红色应全部消失');
  assert.equal(countBlocks(s4), 2, '通关时蓝绿都还在');

  // 两条最优路线，都是 4 步：先竖后横，或先横后竖（两对互不依赖，顺序可换）
  const optimal = firsts
    .map((m) => ({ m, total: 1 + solveFrom(applyMove(st, m), lv) }))
    .filter((x) => x.total === 4);
  assert.equal(optimal.length, 2, '第 5 关应恰好有 2 个最优首步');
  assert.deepEqual(
    optimal.map((x) => `${x.m.r},${x.m.c}${x.m.d}`).sort(),
    ['3,3L', '5,4U'],
  );

  // 蓝、绿各当一次刹车：只禁掉其中一块，par 都会退化为 5
  const usesColor = (color) => (m, s) => {
    if (m.res === 'pop') return false;
    if (s.c[m.r * s.w + m.c] === color) return true;
    const dr = Math.sign(m.tr - m.r);
    const dc = Math.sign(m.tc - m.c);
    return s.c[(m.tr + dr) * s.w + (m.tc + dc)] === color;
  };
  assert.equal(solve(lv, usesColor(2)), 5, '不碰蓝块就退化为 5 步');
  assert.equal(solve(lv, usesColor(3)), 5, '不碰绿块就退化为 5 步');
}

// ---- 4.6 第 6 关「双通道」 ----
{
  const lv = LEVELS[5];
  const st = parse(lv.rows);
  assert.equal(lv.id, 6);
  assert.equal(lv.goal, 'clear');
  assert.equal(countBlocks(st), 6);

  // 结构：中间一列 3 格墙 (2,3)(3,3)(4,3)，只在第 1 行和第 5 行留出口
  let walls = 0;
  for (let r = 1; r <= 5; r++)
    for (let c = 1; c <= 5; c++) if (at(st, r, c) === -1) walls++;
  assert.equal(walls, 3, '第 6 关应有 3 格内墙（一列隔断）');
  assert.equal(at(st, 1, 3), 0, '第 1 行必须留出上通道');
  assert.equal(at(st, 5, 3), 0, '第 5 行必须留出下通道');
  assert.equal(at(st, 3, 3), -1, '第 3 行必须有墙，否则两井在中段就通了');

  // 三色各两块，而且每种颜色都一块在左井、一块在右井——每一对都必须跨井
  const sides = { 1: [0, 0], 2: [0, 0], 3: [0, 0] };
  for (let r = 1; r <= 5; r++)
    for (let c = 1; c <= 5; c++) {
      const v = at(st, r, c);
      if (v > 0) sides[v][c < 3 ? 0 : 1]++;
    }
  for (const color of [1, 2, 3]) {
    assert.deepEqual(sides[color], [1, 1], `颜色 ${color} 应左右各一块（必须跨井配对）`);
  }

  assert.equal(solve(lv), 6);

  const firsts = legalMoves(st);
  assert.equal(firsts.length, 13, '第 6 关开局应有 13 个合法走法');
  assert.equal(firsts.filter((m) => m.res === 'pop').length, 0, '开局没有现成的配对');

  // 下通道：C(1,2) 顺着左井落到最下面，最后再从下通道横过去和另一块 C 会合
  const cDown = moveFrom(st, 1, 2, 'D');
  assert.deepEqual(cDown, { r: 1, c: 2, d: 'D', res: 'move', tr: 5, tc: 2 });
  const s1 = applyMove(st, cDown);

  // 上通道：A(1,1) 穿过 (1,3) 的缺口，被右井的 B(1,5) 停在 (1,4)
  const aRight = moveFrom(s1, 1, 1, 'R');
  assert.deepEqual(aRight, { r: 1, c: 1, d: 'R', res: 'move', tr: 1, tc: 4 });
  const s2 = applyMove(s1, aRight);
  const aDown = moveFrom(s2, 1, 4, 'D');
  assert.deepEqual(aDown, { r: 1, c: 4, d: 'D', res: 'pop', br: 3, bc: 4 });
  const s3 = applyMove(s2, aDown);

  // A 消掉之后，B 才贴得上边界滑到 (1,1)——这就是“顺序耦合”
  const bLeft = moveFrom(s3, 1, 5, 'L');
  assert.deepEqual(bLeft, { r: 1, c: 5, d: 'L', res: 'move', tr: 1, tc: 1 });
  const s4 = applyMove(s3, bLeft);
  const bDown = moveFrom(s4, 1, 1, 'D');
  assert.deepEqual(bDown, { r: 1, c: 1, d: 'D', res: 'pop', br: 3, bc: 1 });
  const s5 = applyMove(s4, bDown);

  // 最后从下通道收掉 C 这一对
  const cRight = moveFrom(s5, 5, 2, 'R');
  assert.deepEqual(cRight, { r: 5, c: 2, d: 'R', res: 'pop', br: 5, bc: 5 });
  const s6 = applyMove(s5, cRight);
  assert.equal(isGoal(s6, lv), true, '六步后应清场');
  assert.equal(countBlocks(s6), 0);

  // 另一条最优开局：先把 A(3,4) 提到 (1,4)，再让 A(1,1) 横过来撞它
  const aUp = moveFrom(st, 3, 4, 'U');
  assert.deepEqual(aUp, { r: 3, c: 4, d: 'U', res: 'move', tr: 1, tc: 4 });
  assert.equal(1 + solveFrom(applyMove(st, aUp), lv), 6, '先动 A 也应该是 6 步');

  const totals = firsts.map((m) => ({
    m,
    total: 1 + solveFrom(applyMove(st, m), lv),
  }));
  const optimal = totals.filter((x) => x.total === 6);
  assert.equal(optimal.length, 2, '第 6 关应恰好有 2 个最优首步');
  assert.deepEqual(
    optimal.map((x) => `${x.m.r},${x.m.c}${x.m.d}`).sort(),
    ['1,2D', '3,4U'],
  );

  // 13 个首步全部还能在上限内通关：走错只掉星，不会一步走进死路
  for (const x of totals) {
    assert.ok(
      Number.isFinite(x.total) && x.total <= lv.limit,
      `首步 ${x.m.r},${x.m.c}${x.m.d} 之后仍应能在 ${lv.limit} 步内通关`,
    );
  }
  assert.equal(Math.min(...totals.filter((x) => x.total !== 6).map((x) => x.total)), 7);

  // 诱惑：右上角的 B 看起来最该先动，但它一动，A 的停车位就没了 → 8 步
  const bFirst = moveFrom(st, 1, 5, 'L');
  assert.deepEqual(bFirst, { r: 1, c: 5, d: 'L', res: 'move', tr: 1, tc: 3 });
  assert.equal(1 + solveFrom(applyMove(st, bFirst), lv), 8, '先动 B 会丢掉 A 的停车位');
}

// ---- 4.7 第 7 关「借墙停车」 ----
{
  const lv = LEVELS[6];
  const st = parse(lv.rows);
  assert.equal(lv.id, 7);
  assert.equal(lv.goal, 'clear');
  assert.equal(countBlocks(st), 6);

  // 三色各两块
  const counts = { 1: 0, 2: 0, 3: 0 };
  for (const v of st.c) if (v > 0) counts[v]++;
  assert.deepEqual(counts, { 1: 2, 2: 2, 3: 2 }, '第 7 关应是 A2 B2 C2');

  // 两格内墙，横在第三行 (3,2)(3,3)——不在边框，方块会停在棋盘半路
  const walls = [];
  for (let r = 1; r <= 5; r++)
    for (let c = 1; c <= 5; c++) if (at(st, r, c) === -1) walls.push(`${r},${c}`);
  assert.deepEqual(walls, ['3,2', '3,3'], '第 7 关应只有两格内墙，且横在第三行');

  assert.equal(solve(lv), 5);

  const firsts = legalMoves(st);
  assert.equal(firsts.length, 13, '第 7 关开局应有 13 个合法走法');
  assert.equal(firsts.filter((m) => m.res === 'pop').length, 0, '开局没有现成的配对');

  // 顺序链：B 借 (3,2) 那格墙停在 (2,2) → 消掉 (2,4) 的 B，给 A 让出第 4 列
  //        → A 借 (3,3) 那格墙停在 (3,4) → 消掉后给 C 让出第 5 列 → C 才能到底
  assert.equal(moveFrom(st, 1, 4, 'D'), null, 'B 没消掉之前，A 被 (2,4) 的 B 顶住，下不去');

  const cFirst = moveFrom(st, 1, 5, 'D');
  assert.deepEqual(
    cFirst,
    { r: 1, c: 5, d: 'D', res: 'move', tr: 2, tc: 5 },
    'A 还挡在 (3,5) 时，C 只能滑到 (2,5)',
  );

  const bDown = moveFrom(st, 1, 2, 'D');
  assert.deepEqual(bDown, { r: 1, c: 2, d: 'D', res: 'move', tr: 2, tc: 2 });
  const s1 = applyMove(st, bDown);

  const bRight = moveFrom(s1, 2, 2, 'R');
  assert.deepEqual(bRight, { r: 2, c: 2, d: 'R', res: 'pop', br: 2, bc: 4 });
  const s2 = applyMove(s1, bRight);

  // B 消掉后第 4 列空了，但 A 还得先借墙停在 (3,4)
  const aLeft = moveFrom(s2, 3, 5, 'L');
  assert.deepEqual(aLeft, { r: 3, c: 5, d: 'L', res: 'move', tr: 3, tc: 4 });
  const s3 = applyMove(s2, aLeft);

  const aDown = moveFrom(s3, 1, 4, 'D');
  assert.deepEqual(aDown, { r: 1, c: 4, d: 'D', res: 'pop', br: 3, bc: 4 });
  const s4 = applyMove(s3, aDown);

  // A 消掉后第 5 列才通，C 从 (1,5) 落到 (5,5)
  const cDown = moveFrom(s4, 1, 5, 'D');
  assert.deepEqual(cDown, { r: 1, c: 5, d: 'D', res: 'pop', br: 5, bc: 5 });
  const s5 = applyMove(s4, cDown);
  assert.equal(isGoal(s5, lv), true, '五步后应清场');
  assert.equal(countBlocks(s5), 0);

  // 另一条最优开局：先让 A 借 (3,3) 停到 (3,4)，再回头做 B 那对
  const aFirst = moveFrom(st, 3, 5, 'L');
  assert.deepEqual(aFirst, { r: 3, c: 5, d: 'L', res: 'move', tr: 3, tc: 4 });
  assert.equal(1 + solveFrom(applyMove(st, aFirst), lv), 5, '先动 A 也应该是 5 步');

  const totals = firsts.map((m) => ({ m, total: 1 + solveFrom(applyMove(st, m), lv) }));
  const optimal = totals.filter((x) => x.total === 5);
  assert.equal(optimal.length, 2, '第 7 关应恰好有 2 个最优首步');
  assert.deepEqual(
    optimal.map((x) => `${x.m.r},${x.m.c}${x.m.d}`).sort(),
    ['1,2D', '3,5L'],
  );

  // 13 个首步全部还能在上限内通关；走错至少多花 1 步
  for (const x of totals) {
    assert.ok(
      Number.isFinite(x.total) && x.total <= lv.limit,
      `首步 ${x.m.r},${x.m.c}${x.m.d} 之后仍应能在 ${lv.limit} 步内通关`,
    );
  }
  assert.equal(Math.min(...totals.filter((x) => x.total !== 5).map((x) => x.total)), 6);

  // 两格墙都是承重的：拿掉任意一格，停车位没了，par 退化为 6
  const withoutWall = (wr, wc) => {
    const rows = lv.rows.map((row, i) =>
      i === wr ? row.slice(0, wc) + '.' + row.slice(wc + 1) : row,
    );
    return solve({ ...lv, rows });
  };
  assert.equal(withoutWall(3, 2), 6, '拿掉 (3,2) 的墙，B 停不到 (2,2)，par 应为 6');
  assert.equal(withoutWall(3, 3), 6, '拿掉 (3,3) 的墙，A 停不到 (3,4)，par 应为 6');
}

// ---- 4.8 第 8 关「钉子户」：锚块（拖不动，但会被同色撞掉） ----
{
  const lv = LEVELS[7];
  const st = parse(lv.rows);
  assert.equal(lv.id, 8);
  assert.equal(lv.goal, 'clear');
  assert.equal(countBlocks(st), 6);

  const counts = { 1: 0, 2: 0, 3: 0 };
  for (const v of st.c) if (v > 0) counts[v]++;
  assert.deepEqual(counts, { 1: 2, 2: 2, 3: 2 }, '第 8 关应是红2 蓝2 绿2');

  const walls = [];
  for (let r = 1; r <= 5; r++)
    for (let c = 1; c <= 5; c++) if (at(st, r, c) === -1) walls.push(`${r},${c}`);
  assert.deepEqual(walls, ['5,3'], '第 8 关应只有 (5,3) 一格内墙');

  // 锚块：只有 (2,1) 是 fixed，且颜色是红
  const anchors = [];
  for (let r = 0; r < st.h; r++)
    for (let c = 0; c < st.w; c++) if (isFixed(st, r, c)) anchors.push(`${r},${c}:${at(st, r, c)}`);
  assert.deepEqual(anchors, ['2,1:1'], '第 8 关应只有 (2,1) 一个红色锚块');

  // 锚块四个方向都拖不动，也不出现在合法走法里
  for (const d of ['U', 'D', 'L', 'R']) {
    assert.equal(moveFrom(st, 2, 1, d), null, `锚块向 ${d} 应拖不动`);
  }
  assert.equal(
    legalMoves(st).filter((m) => m.r === 2 && m.c === 1).length,
    0,
    '锚块不应出现在合法走法里',
  );

  assert.equal(solve(lv), 6);

  const firsts = legalMoves(st);
  assert.equal(firsts.length, 8, '第 8 关开局应有 8 个合法走法');
  assert.equal(firsts.filter((m) => m.res === 'pop').length, 0, '开局没有现成的配对');

  // 同色伙伴 (1,3) 开局够不到锚块：往下停在 (3,3)、往右停在 (1,5)，都没有更近
  const startDist = Math.abs(1 - 2) + Math.abs(3 - 1);
  const partnerMoves = firsts.filter((m) => m.r === 1 && m.c === 3);
  assert.equal(partnerMoves.length, 2, '同色伙伴开局只有两个方向能走');
  for (const m of partnerMoves) {
    const end = m.res === 'pop' ? [m.br, m.bc] : [m.tr, m.tc];
    assert.ok(
      Math.abs(end[0] - 2) + Math.abs(end[1] - 1) >= startDist,
      `同色伙伴向 ${m.d} 不应靠近锚块，必须先清顶排`,
    );
  }

  // 锚块也挡住别的颜色：绿块 (1,1) 往下 0 位移
  assert.equal(moveFrom(st, 1, 1, 'D'), null, '锚块应挡住绿块向下');

  // 最优解：先清蓝、再清绿，最后红块往左滑、往下撞钉子
  const sol = SOLUTIONS[8].split(' ');
  assert.equal(sol.length, 6);
  let s = st;
  let anchorPopStep = -1;
  sol.forEach((tok, i) => {
    const m = /^(\d+),(\d+)([UDLR])$/.exec(tok);
    const mv = moveFrom(s, +m[1] - 1, +m[2] - 1, m[3]);
    assert.ok(mv, `第 8 关第 ${i + 1} 步走不动：${tok}`);
    const poppedAnchor =
      mv.res === 'pop' && (isFixed(s, mv.r, mv.c) || isFixed(s, mv.br, mv.bc));
    if (poppedAnchor) anchorPopStep = i;
    s = applyMove(s, mv);
  });
  assert.equal(anchorPopStep, 5, '锚块应是最后一步被撞掉的');
  assert.equal(isGoal(s, lv), true, '六步后应清场');
  assert.equal(countBlocks(s), 0);

  // 8 个首步全部还能在上限内通关；只有 1 个保持 par
  const totals = firsts.map((m) => ({ m, total: 1 + solveFrom(applyMove(st, m), lv) }));
  assert.deepEqual(
    totals.filter((x) => x.total === 6).map((x) => `${x.m.r},${x.m.c}${x.m.d}`),
    ['1,2D'],
    '第 8 关应只有 1 个最优首步（先送蓝块下去）',
  );
  for (const x of totals) {
    assert.ok(
      Number.isFinite(x.total) && x.total <= lv.limit,
      `首步 ${x.m.r},${x.m.c}${x.m.d} 之后仍应能在 ${lv.limit} 步内通关`,
    );
  }
  assert.equal(Math.min(...totals.filter((x) => x.total !== 6).map((x) => x.total)), 7);

  // 锚块是“拆不掉的刹车”：换成可动同色块后，规则层必须允许它移动，par 不变
  const mobileRows = lv.rows.map((row) => row.replace('a', 'A'));
  const mst = parse(mobileRows);
  assert.equal(isFixed(mst, 2, 1), false, '换成大写后不再是锚块');
  assert.ok(moveFrom(mst, 2, 1, 'D'), '同色普通块应能移动');
  assert.equal(solve({ ...lv, rows: mobileRows }), 6, '拿掉钉子后仍应是 6 步');

  // 与 research 引擎对拍：锚块规则两边必须一致（随机游走 60 步）
  let a8 = st;
  let b8 = rParse(lv.rows);
  let seed8 = 0x9e3779b9;
  const rnd8 = () => (seed8 = (Math.imul(seed8, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let step = 0; step < 60; step++) {
    const am = legalMoves(a8);
    const bm = genA(b8);
    assert.equal(sigs(am), sigs(bm), `第 8 关锚块状态第 ${step} 步两边走法不一致`);
    if (!am.length) break;
    const pick = am[Math.floor(rnd8() * am.length)];
    a8 = applyMove(a8, pick);
    b8 = applyA(b8, bm.find((m) => sig(m) === sig(pick)));
  }
}

// ---- 4.9 第 9 关「缺口」 ----
{
  const lv = LEVELS[8];
  const st = parse(lv.rows);
  assert.equal(lv.id, 9);
  assert.equal(lv.goal, 'clear');
  assert.equal(countBlocks(st), 8);

  const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const v of st.c) if (v > 0) counts[v]++;
  assert.deepEqual(counts, { 1: 2, 2: 2, 3: 2, 4: 2 }, '第 9 关应是 A2 B2 C2 D2');

  // 两格墙竖在第 2 列，只留 (2,2) 一个缺口
  const walls = [];
  for (let r = 1; r <= 5; r++)
    for (let c = 1; c <= 5; c++) if (at(st, r, c) === -1) walls.push(`${r},${c}`);
  assert.deepEqual(walls, ['1,2', '3,2'], '第 9 关应只有 (1,2)(3,2) 两格内墙');
  assert.ok(at(st, 2, 2) > 0, '缺口 (2,2) 开局被 B 占着');

  // 墙把第 3 行切断：C(3,1) 不能直接往右
  assert.equal(moveFrom(st, 3, 1, 'R'), null, 'C(3,1) 被 (3,2) 的墙挡住，只能往下绕');

  assert.equal(astarPar(lv), 7);

  const firsts = legalMoves(st);
  assert.equal(firsts.length, 16, '第 9 关开局应有 16 个合法走法');
  assert.equal(firsts.filter((m) => m.res === 'pop').length, 0, '开局没有现成的配对');

  // 解法：右边的 C 借 A 停在 (4,4)，再横到左列；A 消掉后 B 从缺口穿出；
  // 左列的 C、D 依次下落会合
  const cDown = moveFrom(st, 3, 4, 'D');
  assert.deepEqual(cDown, { r: 3, c: 4, d: 'D', res: 'move', tr: 4, tc: 4 });
  assert.equal(at(applyMove(st, cDown), 5, 4), 1, '把 C 停在 (4,4) 的刹车是之后还要消掉的 A');
  const s1 = applyMove(st, cDown);

  const cLeft = moveFrom(s1, 4, 4, 'L');
  assert.deepEqual(cLeft, { r: 4, c: 4, d: 'L', res: 'move', tr: 4, tc: 1 });
  const s2 = applyMove(s1, cLeft);

  const aDown = moveFrom(s2, 2, 4, 'D');
  assert.deepEqual(aDown, { r: 2, c: 4, d: 'D', res: 'pop', br: 5, bc: 4 });
  const s3 = applyMove(s2, aDown);

  const bRight = moveFrom(s3, 2, 2, 'R');
  assert.deepEqual(bRight, { r: 2, c: 2, d: 'R', res: 'move', tr: 2, tc: 5 }, 'B 从缺口穿出去');
  const s4 = applyMove(s3, bRight);

  const bDown = moveFrom(s4, 1, 5, 'D');
  assert.deepEqual(bDown, { r: 1, c: 5, d: 'D', res: 'pop', br: 2, bc: 5 });
  const s5 = applyMove(s4, bDown);

  const cPop = moveFrom(s5, 3, 1, 'D');
  assert.deepEqual(cPop, { r: 3, c: 1, d: 'D', res: 'pop', br: 4, bc: 1 });
  const s6 = applyMove(s5, cPop);

  const dPop = moveFrom(s6, 2, 1, 'D');
  assert.deepEqual(dPop, { r: 2, c: 1, d: 'D', res: 'pop', br: 5, bc: 1 });
  const s7 = applyMove(s6, dPop);
  assert.equal(isGoal(s7, lv), true, '七步后应清场');
  assert.equal(countBlocks(s7), 0);

  const totals = firsts.map((m) => ({ m, total: astarTotal(lv, m) }));
  const optimal = totals.filter((x) => x.total === 7);
  assert.equal(optimal.length, 2, '第 9 关应恰好有 2 个最优首步');
  assert.deepEqual(
    optimal.map((x) => `${x.m.r},${x.m.c}${x.m.d}`).sort(),
    ['3,1D', '3,4D'],
  );
  for (const x of totals) {
    assert.ok(
      Number.isFinite(x.total) && x.total <= lv.limit,
      `首步 ${x.m.r},${x.m.c}${x.m.d} 之后仍应能在 ${lv.limit} 步内通关`,
    );
  }
  assert.equal(Math.max(...totals.map((x) => x.total)), 10);

  // 两格墙是一整组路障：拆掉 (3,2) 直路打开，par 掉到 5
  const withoutWall = (wr, wc) =>
    astarPar({ ...lv, rows: lv.rows.map((row, i) => (i === wr ? row.slice(0, wc) + '.' + row.slice(wc + 1) : row)) });
  assert.equal(withoutWall(1, 2), 7, '只拿掉上半格，(3,2) 仍然切断第 3 行');
  assert.equal(withoutWall(3, 2), 5, '拿掉下半格，C 可以直接横过去，par 降为 5');
  const noWalls = {
    ...lv,
    rows: lv.rows.map((row, r) => (r === 0 || r === 6 ? row : '#' + row.slice(1, 6).replace(/#/g, '.') + '#')),
  };
  assert.equal(astarPar(noWalls), 5, '拆掉整组墙后直路打通，par 降为 5');
}

// ---- 4.10 第 10 关「回廊」 ----
{
  const lv = LEVELS[9];
  const st = parse(lv.rows);
  assert.equal(lv.id, 10);
  assert.equal(lv.goal, 'clear');
  assert.equal(countBlocks(st), 6);

  const counts = { 1: 0, 2: 0, 3: 0 };
  for (const v of st.c) if (v > 0) counts[v]++;
  assert.deepEqual(counts, { 1: 2, 2: 2, 3: 2 }, '第 10 关应是 A2 B2 C2');

  const walls = [];
  for (let r = 1; r <= 5; r++)
    for (let c = 1; c <= 5; c++) if (at(st, r, c) === -1) walls.push(`${r},${c}`);
  assert.deepEqual(walls, ['2,2', '2,4', '4,3'], '第 10 关应有三格内墙');

  assert.equal(astarPar(lv), 6);

  const firsts = legalMoves(st);
  assert.equal(firsts.length, 13, '第 10 关开局应有 13 个合法走法');
  assert.equal(firsts.filter((m) => m.res === 'pop').length, 0, '开局没有现成的配对');

  // C 借 (2,2) 的墙停在 (3,2)，再横消；B 借 A 停在 (1,3)，再借 (4,3) 的墙停到 (3,3)
  const cUp = moveFrom(st, 5, 2, 'U');
  assert.deepEqual(cUp, { r: 5, c: 2, d: 'U', res: 'move', tr: 3, tc: 2 });
  const s1 = applyMove(st, cUp);

  const cPop = moveFrom(s1, 3, 2, 'R');
  assert.deepEqual(cPop, { r: 3, c: 2, d: 'R', res: 'pop', br: 3, bc: 3 });
  const s2 = applyMove(s1, cPop);

  const bLeft = moveFrom(s2, 1, 4, 'L');
  assert.deepEqual(bLeft, { r: 1, c: 4, d: 'L', res: 'move', tr: 1, tc: 3 });
  assert.equal(at(s2, 1, 2), 1, '把 B 停在 (1,3) 的刹车，是之后还要消掉的 A');
  const s3 = applyMove(s2, bLeft);

  const bDown = moveFrom(s3, 1, 3, 'D');
  assert.deepEqual(bDown, { r: 1, c: 3, d: 'D', res: 'move', tr: 3, tc: 3 });
  const s4 = applyMove(s3, bDown);

  const aPop = moveFrom(s4, 1, 2, 'R');
  assert.deepEqual(aPop, { r: 1, c: 2, d: 'R', res: 'pop', br: 1, bc: 5 });
  const s5 = applyMove(s4, aPop);

  const bPop = moveFrom(s5, 3, 3, 'R');
  assert.deepEqual(bPop, { r: 3, c: 3, d: 'R', res: 'pop', br: 3, bc: 5 });
  const s6 = applyMove(s5, bPop);
  assert.equal(isGoal(s6, lv), true, '六步后应清场');
  assert.equal(countBlocks(s6), 0);

  const totals = firsts.map((m) => ({ m, total: astarTotal(lv, m) }));
  const optimal = totals.filter((x) => x.total === 6);
  assert.equal(optimal.length, 2, '第 10 关应恰好有 2 个最优首步');
  assert.deepEqual(
    optimal.map((x) => `${x.m.r},${x.m.c}${x.m.d}`).sort(),
    ['1,4L', '5,2U'],
  );
  for (const x of totals) {
    assert.ok(
      Number.isFinite(x.total) && x.total <= lv.limit,
      `首步 ${x.m.r},${x.m.c}${x.m.d} 之后仍应能在 ${lv.limit} 步内通关`,
    );
  }
  assert.equal(Math.max(...totals.map((x) => x.total)), 9);

  const withoutWall = (wr, wc) =>
    astarPar({ ...lv, rows: lv.rows.map((row, i) => (i === wr ? row.slice(0, wc) + '.' + row.slice(wc + 1) : row)) });
  assert.equal(withoutWall(2, 2), 7, '拿掉 (2,2) 的墙，C 停不到 (3,2)，par 退化为 7');
  assert.equal(withoutWall(4, 3), 7, '拿掉 (4,3) 的墙，B 停不到 (3,3)，par 退化为 7');
  assert.equal(withoutWall(2, 4), 5, '拿掉 (2,4) 后第 2 行直通，反而只要 5 步——它是挡路件');
}

// ---- 4.11 第 11 关「窄门」 ----
{
  const lv = LEVELS[10];
  const st = parse(lv.rows);
  assert.equal(lv.id, 11);
  assert.equal(lv.goal, 'clear');
  assert.equal(countBlocks(st), 6);

  const counts = { 1: 0, 2: 0, 3: 0 };
  for (const v of st.c) if (v > 0) counts[v]++;
  assert.deepEqual(counts, { 1: 2, 2: 2, 3: 2 }, '第 11 关应是 A2 B2 C2');

  // 第 3 列四格墙，只在 (3,3) 留一个单格缺口
  const walls = [];
  for (let r = 1; r <= 5; r++)
    for (let c = 1; c <= 5; c++) if (at(st, r, c) === -1) walls.push(`${r},${c}`);
  assert.deepEqual(walls, ['1,3', '2,3', '4,3', '5,3'], '第 11 关应是第 3 列四格墙');
  assert.equal(at(st, 3, 3), 0, '第 3 行必须留出单格缺口');

  // 右半场的方块不能从第 4 行横穿：只能走缺口
  assert.deepEqual(moveFrom(st, 4, 5, 'L'), { r: 4, c: 5, d: 'L', res: 'move', tr: 4, tc: 4 });

  assert.equal(astarPar(lv), 6);

  const firsts = legalMoves(st);
  assert.equal(firsts.length, 10, '第 11 关开局应有 10 个合法走法');
  assert.equal(firsts.filter((m) => m.res === 'pop').length, 0, '开局没有现成的配对');

  // B 先借 (4,3) 的墙停在 (4,4)；C 消掉后 A 借这块 B 停在 (3,4)；
  // B 消掉，A 穿过缺口到左半场；最后两块 A 会合
  const bLeft = moveFrom(st, 4, 5, 'L');
  assert.deepEqual(bLeft, { r: 4, c: 5, d: 'L', res: 'move', tr: 4, tc: 4 });
  const s1 = applyMove(st, bLeft);

  const cDown = moveFrom(s1, 3, 5, 'D');
  assert.deepEqual(cDown, { r: 3, c: 5, d: 'D', res: 'pop', br: 5, bc: 5 });
  const s2 = applyMove(s1, cDown);

  const aDown = moveFrom(s2, 2, 4, 'D');
  assert.deepEqual(aDown, { r: 2, c: 4, d: 'D', res: 'move', tr: 3, tc: 4 });
  assert.equal(at(s2, 4, 4), 2, '把 A 停在 (3,4) 的刹车，是之后还要消掉的 B');
  const s3 = applyMove(s2, aDown);

  const bPop = moveFrom(s3, 4, 4, 'D');
  assert.deepEqual(bPop, { r: 4, c: 4, d: 'D', res: 'pop', br: 5, bc: 4 });
  const s4 = applyMove(s3, bPop);

  // A 穿过单格缺口 (3,3)
  const aLeft = moveFrom(s4, 3, 4, 'L');
  assert.deepEqual(aLeft, { r: 3, c: 4, d: 'L', res: 'move', tr: 3, tc: 1 }, 'A 从 (3,3) 的缺口穿到左半场');
  const s5 = applyMove(s4, aLeft);

  const aPop = moveFrom(s5, 2, 1, 'D');
  assert.deepEqual(aPop, { r: 2, c: 1, d: 'D', res: 'pop', br: 3, bc: 1 });
  const s6 = applyMove(s5, aPop);
  assert.equal(isGoal(s6, lv), true, '六步后应清场');
  assert.equal(countBlocks(s6), 0);

  const totals = firsts.map((m) => ({ m, total: astarTotal(lv, m) }));
  const optimal = totals.filter((x) => x.total === 6);
  assert.equal(optimal.length, 1, '第 11 关只有一条最优首步');
  assert.deepEqual(optimal.map((x) => `${x.m.r},${x.m.c}${x.m.d}`), ['4,5L']);
  for (const x of totals) {
    assert.ok(
      Number.isFinite(x.total) && x.total <= lv.limit,
      `首步 ${x.m.r},${x.m.c}${x.m.d} 之后仍应能在 ${lv.limit} 步内通关`,
    );
  }
  assert.equal(Math.max(...totals.map((x) => x.total)), 8);

  const withoutWall = (wr, wc) =>
    astarPar({ ...lv, rows: lv.rows.map((row, i) => (i === wr ? row.slice(0, wc) + '.' + row.slice(wc + 1) : row)) });
  assert.equal(withoutWall(2, 3), 4, '拿掉 (2,3) 后第 2 行也通了，par 掉到 4');
  assert.equal(withoutWall(4, 3), 7, '拿掉 (4,3) 后 B 停不到 (4,4)，par 退化为 7');
  const noWalls11 = {
    ...lv,
    rows: lv.rows.map((row, r) => (r === 0 || r === 6 ? row : '#' + row.slice(1, 6).replace(/#/g, '.') + '#')),
  };
  assert.equal(astarPar(noWalls11), 5, '拆掉整列墙后左右直通，par 降为 5');
}

// ---- 4.12 第 12 关「三色台阶」 ----
{
  const lv = LEVELS[11];
  const st = parse(lv.rows);
  assert.equal(lv.id, 12);
  assert.equal(lv.goal, 'clear');
  assert.equal(countBlocks(st), 6);

  const counts = { 1: 0, 2: 0, 3: 0 };
  for (const v of st.c) if (v > 0) counts[v]++;
  assert.deepEqual(counts, { 1: 2, 2: 2, 3: 2 }, '第 12 关应是 A2 B2 C2');

  const walls = [];
  for (let r = 1; r <= 5; r++)
    for (let c = 1; c <= 5; c++) if (at(st, r, c) === -1) walls.push(`${r},${c}`);
  assert.deepEqual(walls, ['2,2', '2,4'], '第 12 关应只有两格内墙');

  assert.equal(astarPar(lv), 6);

  const firsts = legalMoves(st);
  assert.equal(firsts.length, 14, '第 12 关开局应有 14 个合法走法');
  assert.equal(firsts.filter((m) => m.res === 'pop').length, 0, '开局没有现成的配对');

  // B 借 A 停在 (1,3)，再落到底行；A 横消；B 在底行会合；C 借 (2,2) 的墙停在 (3,2)
  const bLeft = moveFrom(st, 1, 4, 'L');
  assert.deepEqual(bLeft, { r: 1, c: 4, d: 'L', res: 'move', tr: 1, tc: 3 });
  assert.equal(at(st, 1, 2), 1, '把 B 停在 (1,3) 的刹车，是之后还要消掉的 A');
  const s1 = applyMove(st, bLeft);

  const bDown = moveFrom(s1, 1, 3, 'D');
  assert.deepEqual(bDown, { r: 1, c: 3, d: 'D', res: 'move', tr: 5, tc: 3 });
  const s2 = applyMove(s1, bDown);

  const aPop = moveFrom(s2, 1, 2, 'R');
  assert.deepEqual(aPop, { r: 1, c: 2, d: 'R', res: 'pop', br: 1, bc: 5 });
  const s3 = applyMove(s2, aPop);

  const bPop = moveFrom(s3, 5, 3, 'R');
  assert.deepEqual(bPop, { r: 5, c: 3, d: 'R', res: 'pop', br: 5, bc: 4 });
  const s4 = applyMove(s3, bPop);

  const cUp = moveFrom(s4, 4, 2, 'U');
  assert.deepEqual(cUp, { r: 4, c: 2, d: 'U', res: 'move', tr: 3, tc: 2 });
  const s5 = applyMove(s4, cUp);

  const cPop = moveFrom(s5, 3, 1, 'R');
  assert.deepEqual(cPop, { r: 3, c: 1, d: 'R', res: 'pop', br: 3, bc: 2 });
  const s6 = applyMove(s5, cPop);
  assert.equal(isGoal(s6, lv), true, '六步后应清场');
  assert.equal(countBlocks(s6), 0);

  const totals = firsts.map((m) => ({ m, total: astarTotal(lv, m) }));
  const optimal = totals.filter((x) => x.total === 6);
  assert.equal(optimal.length, 3, '第 12 关应有 3 个最优首步');
  assert.deepEqual(
    optimal.map((x) => `${x.m.r},${x.m.c}${x.m.d}`).sort(),
    ['1,4L', '4,2L', '4,2U'],
  );
  for (const x of totals) {
    assert.ok(
      Number.isFinite(x.total) && x.total <= lv.limit,
      `首步 ${x.m.r},${x.m.c}${x.m.d} 之后仍应能在 ${lv.limit} 步内通关`,
    );
  }
  assert.equal(Math.max(...totals.map((x) => x.total)), 9);

  const withoutWall = (wr, wc) =>
    astarPar({ ...lv, rows: lv.rows.map((row, i) => (i === wr ? row.slice(0, wc) + '.' + row.slice(wc + 1) : row)) });
  assert.equal(withoutWall(2, 2), 6, '拿掉 (2,2) 后 C 还有别的停法，par 仍是 6（但这格是给定解法的刹车）');
  assert.equal(withoutWall(2, 4), 4, '拿掉 (2,4) 后上半场直通，par 掉到 4');
  const noWalls12 = {
    ...lv,
    rows: lv.rows.map((row, r) => (r === 0 || r === 6 ? row : '#' + row.slice(1, 6).replace(/#/g, '.') + '#')),
  };
  assert.equal(astarPar(noWalls12), 4, '拆掉整组墙后上半场直通，par 降为 4');
}

// ---- 4.13 第 13 关「对角」 ----
{
  const lv = LEVELS[12];
  const st = parse(lv.rows);
  assert.equal(lv.id, 13);
  assert.equal(lv.goal, 'clear');
  assert.equal(countBlocks(st), 8);

  const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const v of st.c) if (v > 0) counts[v]++;
  assert.deepEqual(counts, { 1: 2, 2: 2, 3: 2, 4: 2 }, '第 13 关应是 A2 B2 C2 D2');

  const walls = [];
  for (let r = 1; r <= 5; r++)
    for (let c = 1; c <= 5; c++) if (at(st, r, c) === -1) walls.push(`${r},${c}`);
  assert.deepEqual(walls, ['1,2', '3,2'], '第 13 关应只有两格竖墙');

  assert.equal(astarPar(lv), 8);

  const firsts = legalMoves(st);
  assert.equal(firsts.length, 17, '第 13 关开局应有 17 个合法走法');
  assert.equal(firsts.filter((m) => m.res === 'pop').length, 0, '开局没有现成的配对');

  // 绿块先贴 (3,2) 的墙停在 (3,3)，另一块绿块从上面落下会合
  const cLeft = moveFrom(st, 3, 4, 'L');
  assert.deepEqual(cLeft, { r: 3, c: 4, d: 'L', res: 'move', tr: 3, tc: 3 });
  const s1 = applyMove(st, cLeft);

  const cDown = moveFrom(s1, 1, 3, 'D');
  assert.deepEqual(cDown, { r: 1, c: 3, d: 'D', res: 'pop', br: 3, bc: 3 });
  const s2 = applyMove(s1, cDown);

  const dRight = moveFrom(s2, 2, 4, 'R');
  assert.deepEqual(dRight, { r: 2, c: 4, d: 'R', res: 'move', tr: 2, tc: 5 });
  const s3 = applyMove(s2, dRight);

  const bRight = moveFrom(s3, 2, 2, 'R');
  assert.deepEqual(bRight, { r: 2, c: 2, d: 'R', res: 'move', tr: 2, tc: 4 });
  const s4 = applyMove(s3, bRight);

  const bDown = moveFrom(s4, 2, 4, 'D');
  assert.deepEqual(bDown, { r: 2, c: 4, d: 'D', res: 'pop', br: 5, bc: 4 });
  const s5 = applyMove(s4, bDown);

  const dUp = moveFrom(s5, 3, 1, 'U');
  assert.deepEqual(dUp, { r: 3, c: 1, d: 'U', res: 'move', tr: 2, tc: 1 });
  const s6 = applyMove(s5, dUp);

  const dPop = moveFrom(s6, 2, 1, 'R');
  assert.deepEqual(dPop, { r: 2, c: 1, d: 'R', res: 'pop', br: 2, bc: 5 });
  const s7 = applyMove(s6, dPop);

  const aPop = moveFrom(s7, 1, 1, 'D');
  assert.deepEqual(aPop, { r: 1, c: 1, d: 'D', res: 'pop', br: 4, bc: 1 });
  const s8 = applyMove(s7, aPop);
  assert.equal(isGoal(s8, lv), true, '八步后应清场');
  assert.equal(countBlocks(s8), 0);

  const totals = firsts.map((m) => ({ m, total: astarTotal(lv, m) }));
  const optimal = totals.filter((x) => x.total === 8);
  assert.equal(optimal.length, 4, '第 13 关应有 4 个最优首步');
  assert.deepEqual(
    optimal.map((x) => `${x.m.r},${x.m.c}${x.m.d}`).sort(),
    ['2,2R', '2,4R', '3,1U', '3,4L'],
  );
  for (const x of totals) {
    assert.ok(
      Number.isFinite(x.total) && x.total <= lv.limit,
      `首步 ${x.m.r},${x.m.c}${x.m.d} 之后仍应能在 ${lv.limit} 步内通关`,
    );
  }
  assert.equal(Math.max(...totals.map((x) => x.total)), 10);

  const withoutWall = (wr, wc) =>
    astarPar({ ...lv, rows: lv.rows.map((row, i) => (i === wr ? row.slice(0, wc) + '.' + row.slice(wc + 1) : row)) });
  assert.equal(withoutWall(1, 2), 8, '拿掉 (1,2) 后仍要 8 步');
  assert.equal(withoutWall(3, 2), 7, '拿掉 (3,2) 后绿块不用贴墙，par 降为 7');
  const noWalls13 = {
    ...lv,
    rows: lv.rows.map((row, r) => (r === 0 || r === 6 ? row : '#' + row.slice(1, 6).replace(/#/g, '.') + '#')),
  };
  assert.equal(astarPar(noWalls13), 7, '拆掉整组墙后 par 降为 7');
}

// ---- 4.14 第 14 关「内外圈」 ----
{
  const lv = LEVELS[13];
  const st = parse(lv.rows);
  assert.equal(lv.id, 14);
  assert.equal(lv.goal, 'clear');
  assert.equal(countBlocks(st), 6);

  const counts = { 1: 0, 2: 0, 3: 0 };
  for (const v of st.c) if (v > 0) counts[v]++;
  assert.deepEqual(counts, { 1: 2, 2: 2, 3: 2 }, '第 14 关应是 A2 B2 C2');

  const walls = [];
  for (let r = 1; r <= 5; r++)
    for (let c = 1; c <= 5; c++) if (at(st, r, c) === -1) walls.push(`${r},${c}`);
  assert.deepEqual(walls, ['2,2', '2,3', '3,2'], '第 14 关应是凹形三格墙');

  assert.equal(astarPar(lv), 6);

  const firsts = legalMoves(st);
  assert.equal(firsts.length, 11, '第 14 关开局应有 11 个合法走法');
  assert.equal(firsts.filter((m) => m.res === 'pop').length, 0, '开局没有现成的配对');

  // 蓝块借 (2,3) 的墙停在 (3,3)，红块在底行横消；另一块蓝块借绿块停在 (3,5)
  const bUp = moveFrom(st, 5, 3, 'U');
  assert.deepEqual(bUp, { r: 5, c: 3, d: 'U', res: 'move', tr: 3, tc: 3 });
  const s1 = applyMove(st, bUp);

  const aRight = moveFrom(s1, 5, 2, 'R');
  assert.deepEqual(aRight, { r: 5, c: 2, d: 'R', res: 'pop', br: 5, bc: 5 });
  const s2 = applyMove(s1, aRight);

  const bDown = moveFrom(s2, 1, 5, 'D');
  assert.deepEqual(bDown, { r: 1, c: 5, d: 'D', res: 'move', tr: 3, tc: 5 });
  const s3 = applyMove(s2, bDown);

  const bPop = moveFrom(s3, 3, 3, 'R');
  assert.deepEqual(bPop, { r: 3, c: 3, d: 'R', res: 'pop', br: 3, bc: 5 });
  const s4 = applyMove(s3, bPop);

  const cRight = moveFrom(s4, 1, 3, 'R');
  assert.deepEqual(cRight, { r: 1, c: 3, d: 'R', res: 'move', tr: 1, tc: 5 });
  const s5 = applyMove(s4, cRight);

  const cPop = moveFrom(s5, 1, 5, 'D');
  assert.deepEqual(cPop, { r: 1, c: 5, d: 'D', res: 'pop', br: 4, bc: 5 });
  const s6 = applyMove(s5, cPop);
  assert.equal(isGoal(s6, lv), true, '六步后应清场');
  assert.equal(countBlocks(s6), 0);

  const totals = firsts.map((m) => ({ m, total: astarTotal(lv, m) }));
  const optimal = totals.filter((x) => x.total === 6);
  assert.equal(optimal.length, 4, '第 14 关应有 4 个最优首步');
  assert.deepEqual(
    optimal.map((x) => `${x.m.r},${x.m.c}${x.m.d}`).sort(),
    ['1,5D', '1,5L', '5,3R', '5,3U'],
  );
  for (const x of totals) {
    assert.ok(
      Number.isFinite(x.total) && x.total <= lv.limit,
      `首步 ${x.m.r},${x.m.c}${x.m.d} 之后仍应能在 ${lv.limit} 步内通关`,
    );
  }
  assert.equal(Math.max(...totals.map((x) => x.total)), 8);

  const withoutWall = (wr, wc) =>
    astarPar({ ...lv, rows: lv.rows.map((row, i) => (i === wr ? row.slice(0, wc) + '.' + row.slice(wc + 1) : row)) });
  assert.equal(withoutWall(2, 2), 6, '拿掉 (2,2) 后蓝块仍有别的停法，par 仍是 6');
  assert.equal(withoutWall(2, 3), 5, '拿掉 (2,3) 后凹口断开，par 降为 5');
  assert.equal(withoutWall(3, 2), 6, '拿掉 (3,2) 后蓝块仍有别的停法，par 仍是 6');
  const noWalls14 = {
    ...lv,
    rows: lv.rows.map((row, r) => (r === 0 || r === 6 ? row : '#' + row.slice(1, 6).replace(/#/g, '.') + '#')),
  };
  assert.equal(astarPar(noWalls14), 5, '拆掉整组墙后 par 降为 5');
}

// ---- 4.15 第 15 关「双缺口」 ----
{
  const lv = LEVELS[14];
  const st = parse(lv.rows);
  assert.equal(lv.id, 15);
  assert.equal(lv.goal, 'clear');
  assert.equal(countBlocks(st), 8);

  const counts = { 1: 0, 2: 0, 3: 0 };
  for (const v of st.c) if (v > 0) counts[v]++;
  assert.deepEqual(counts, { 1: 4, 2: 2, 3: 2 }, '第 15 关应是 A4 B2 C2');

  const walls = [];
  for (let r = 1; r <= 5; r++)
    for (let c = 1; c <= 5; c++) if (at(st, r, c) === -1) walls.push(`${r},${c}`);
  assert.deepEqual(walls, ['1,3', '2,3', '3,3'], '第 15 关应是第 3 列上半段三格墙');
  assert.equal(at(st, 4, 3), 0, '第 4 行必须留出下方的出口');

  assert.equal(astarPar(lv), 7);

  const firsts = legalMoves(st);
  assert.equal(firsts.length, 14, '第 15 关开局应有 14 个合法走法');
  assert.equal(firsts.filter((m) => m.res === 'pop').length, 0, '开局没有现成的配对');

  // 蓝块贴墙停在 (2,2)；红块竖向对消；另一块红块贴墙停到 (3,4)
  const bRight = moveFrom(st, 2, 1, 'R');
  assert.deepEqual(bRight, { r: 2, c: 1, d: 'R', res: 'move', tr: 2, tc: 2 });
  const s1 = applyMove(st, bRight);

  const aDown = moveFrom(s1, 1, 1, 'D');
  assert.deepEqual(aDown, { r: 1, c: 1, d: 'D', res: 'pop', br: 3, bc: 1 });
  const s2 = applyMove(s1, aDown);

  const aLeft = moveFrom(s2, 3, 5, 'L');
  assert.deepEqual(aLeft, { r: 3, c: 5, d: 'L', res: 'move', tr: 3, tc: 4 });
  const s3 = applyMove(s2, aLeft);

  const cRight = moveFrom(s3, 5, 2, 'R');
  assert.deepEqual(cRight, { r: 5, c: 2, d: 'R', res: 'move', tr: 5, tc: 5 });
  const s4 = applyMove(s3, cRight);

  const cDown = moveFrom(s4, 1, 5, 'D');
  assert.deepEqual(cDown, { r: 1, c: 5, d: 'D', res: 'pop', br: 5, bc: 5 });
  const s5 = applyMove(s4, cDown);

  const aPop = moveFrom(s5, 1, 4, 'D');
  assert.deepEqual(aPop, { r: 1, c: 4, d: 'D', res: 'pop', br: 3, bc: 4 });
  const s6 = applyMove(s5, aPop);

  const bPop = moveFrom(s6, 2, 2, 'D');
  assert.deepEqual(bPop, { r: 2, c: 2, d: 'D', res: 'pop', br: 4, bc: 2 });
  const s7 = applyMove(s6, bPop);
  assert.equal(isGoal(s7, lv), true, '七步后应清场');
  assert.equal(countBlocks(s7), 0);

  const totals = firsts.map((m) => ({ m, total: astarTotal(lv, m) }));
  const optimal = totals.filter((x) => x.total === 7);
  assert.equal(optimal.length, 3, '第 15 关应有 3 个最优首步');
  assert.deepEqual(
    optimal.map((x) => `${x.m.r},${x.m.c}${x.m.d}`).sort(),
    ['2,1R', '3,5L', '5,2R'],
  );
  for (const x of totals) {
    assert.ok(
      Number.isFinite(x.total) && x.total <= lv.limit,
      `首步 ${x.m.r},${x.m.c}${x.m.d} 之后仍应能在 ${lv.limit} 步内通关`,
    );
  }
  assert.equal(Math.max(...totals.map((x) => x.total)), 9);

  const withoutWall = (wr, wc) =>
    astarPar({ ...lv, rows: lv.rows.map((row, i) => (i === wr ? row.slice(0, wc) + '.' + row.slice(wc + 1) : row)) });
  assert.equal(withoutWall(1, 3), 7, '拿掉 (1,3) 后仍要 7 步');
  assert.equal(withoutWall(2, 3), 8, '拿掉 (2,3) 后蓝块失去停车位，par 变慢为 8');
  assert.equal(withoutWall(3, 3), 8, '拿掉 (3,3) 后红块失去停车位，par 变慢为 8');
  const noWalls15 = {
    ...lv,
    rows: lv.rows.map((row, r) => (r === 0 || r === 6 ? row : '#' + row.slice(1, 6).replace(/#/g, '.') + '#')),
  };
  assert.equal(astarPar(noWalls15), 6, '拆掉整组墙后 par 降为 6');
}

// ---- 4.16 第 16 关「假出口」 ----
{
  const lv = LEVELS[15];
  const st = parse(lv.rows);
  assert.equal(lv.id, 16);
  assert.equal(lv.goal, 'clear');
  assert.equal(countBlocks(st), 8);

  const counts = { 1: 0, 2: 0, 3: 0 };
  for (const v of st.c) if (v > 0) counts[v]++;
  assert.deepEqual(counts, { 1: 4, 2: 2, 3: 2 }, '第 16 关应是 A4 B2 C2');

  const walls = [];
  for (let r = 1; r <= 5; r++)
    for (let c = 1; c <= 5; c++) if (at(st, r, c) === -1) walls.push(`${r},${c}`);
  assert.deepEqual(walls, ['1,2', '1,4', '3,2', '3,4'], '第 16 关应是两排交错墙');

  assert.equal(astarPar(lv), 7);

  const firsts = legalMoves(st);
  assert.equal(firsts.length, 14, '第 16 关开局应有 14 个合法走法');
  assert.equal(firsts.filter((m) => m.res === 'pop').length, 0, '开局没有现成的配对');

  // 红块借 (3,4) 的墙停在第四行，再横过去和同伴会合
  const aUp = moveFrom(st, 5, 4, 'U');
  assert.deepEqual(aUp, { r: 5, c: 4, d: 'U', res: 'move', tr: 4, tc: 4 });
  const s1 = applyMove(st, aUp);

  const aPop = moveFrom(s1, 4, 1, 'R');
  assert.deepEqual(aPop, { r: 4, c: 1, d: 'R', res: 'pop', br: 4, bc: 4 });
  const s2 = applyMove(s1, aPop);

  const cPop = moveFrom(s2, 5, 1, 'R');
  assert.deepEqual(cPop, { r: 5, c: 1, d: 'R', res: 'pop', br: 5, bc: 5 });
  const s3 = applyMove(s2, cPop);

  const bRight = moveFrom(s3, 2, 2, 'R');
  assert.deepEqual(bRight, { r: 2, c: 2, d: 'R', res: 'move', tr: 2, tc: 3 });
  const s4 = applyMove(s3, bRight);

  const bPop = moveFrom(s4, 2, 3, 'D');
  assert.deepEqual(bPop, { r: 2, c: 3, d: 'D', res: 'pop', br: 3, bc: 3 });
  const s5 = applyMove(s4, bPop);

  const aRight = moveFrom(s5, 2, 4, 'R');
  assert.deepEqual(aRight, { r: 2, c: 4, d: 'R', res: 'move', tr: 2, tc: 5 });
  const s6 = applyMove(s5, aRight);

  const aDown = moveFrom(s6, 2, 5, 'D');
  assert.deepEqual(aDown, { r: 2, c: 5, d: 'D', res: 'pop', br: 3, bc: 5 });
  const s7 = applyMove(s6, aDown);
  assert.equal(isGoal(s7, lv), true, '七步后应清场');
  assert.equal(countBlocks(s7), 0);

  const totals = firsts.map((m) => ({ m, total: astarTotal(lv, m) }));
  const optimal = totals.filter((x) => x.total === 7);
  assert.equal(optimal.length, 2, '第 16 关应有 2 个最优首步');
  assert.deepEqual(
    optimal.map((x) => `${x.m.r},${x.m.c}${x.m.d}`).sort(),
    ['2,2R', '5,4U'],
  );
  for (const x of totals) {
    assert.ok(
      Number.isFinite(x.total) && x.total <= lv.limit,
      `首步 ${x.m.r},${x.m.c}${x.m.d} 之后仍应能在 ${lv.limit} 步内通关`,
    );
  }
  assert.equal(Math.max(...totals.map((x) => x.total)), 9);

  const withoutWall = (wr, wc) =>
    astarPar({ ...lv, rows: lv.rows.map((row, i) => (i === wr ? row.slice(0, wc) + '.' + row.slice(wc + 1) : row)) });
  assert.equal(withoutWall(1, 2), 7, '拿掉 (1,2) 后仍要 7 步');
  assert.equal(withoutWall(1, 4), 7, '拿掉 (1,4) 后仍要 7 步');
  assert.equal(withoutWall(3, 2), 7, '拿掉 (3,2) 后仍要 7 步');
  assert.equal(withoutWall(3, 4), 6, '拿掉 (3,4) 后红块不用贴墙，par 降为 6');
  const noWalls16 = {
    ...lv,
    rows: lv.rows.map((row, r) => (r === 0 || r === 6 ? row : '#' + row.slice(1, 6).replace(/#/g, '.') + '#')),
  };
  assert.equal(astarPar(noWalls16), 6, '拆掉整组墙后 par 降为 6');
}

// ---- 4.17 第 17 关「长走廊」 ----
{
  const lv = LEVELS[16];
  const st = parse(lv.rows);
  assert.equal(lv.id, 17);
  assert.equal(lv.goal, 'clear');
  assert.equal(countBlocks(st), 8);

  const counts = { 1: 0, 2: 0, 3: 0 };
  for (const v of st.c) if (v > 0) counts[v]++;
  assert.deepEqual(counts, { 1: 2, 2: 2, 3: 4 }, '第 17 关应是 A2 B2 C4');

  const walls = [];
  for (let r = 1; r <= 5; r++)
    for (let c = 1; c <= 5; c++) if (at(st, r, c) === -1) walls.push(`${r},${c}`);
  assert.deepEqual(walls, ['3,2', '3,3', '3,4'], '第 17 关应是第三行三格横墙');

  assert.equal(astarPar(lv), 7);

  const firsts = legalMoves(st);
  assert.equal(firsts.length, 14, '第 17 关开局应有 14 个合法走法');
  assert.equal(firsts.filter((m) => m.res === 'pop').length, 0, '开局没有现成的配对');

  // 绿块借 (3,4) 的墙停在 (4,4)；红块在底行横消；另一块绿块从上方落到墙边
  const cUp = moveFrom(st, 5, 4, 'U');
  assert.deepEqual(cUp, { r: 5, c: 4, d: 'U', res: 'move', tr: 4, tc: 4 });
  const s1 = applyMove(st, cUp);

  const aPop = moveFrom(s1, 5, 3, 'R');
  assert.deepEqual(aPop, { r: 5, c: 3, d: 'R', res: 'pop', br: 5, bc: 5 });
  const s2 = applyMove(s1, aPop);

  const cDown = moveFrom(s2, 1, 4, 'D');
  assert.deepEqual(cDown, { r: 1, c: 4, d: 'D', res: 'move', tr: 2, tc: 4 });
  const s3 = applyMove(s2, cDown);

  const cPop1 = moveFrom(s3, 2, 2, 'R');
  assert.deepEqual(cPop1, { r: 2, c: 2, d: 'R', res: 'pop', br: 2, bc: 4 });
  const s4 = applyMove(s3, cPop1);

  const cPop2 = moveFrom(s4, 4, 3, 'R');
  assert.deepEqual(cPop2, { r: 4, c: 3, d: 'R', res: 'pop', br: 4, bc: 4 });
  const s5 = applyMove(s4, cPop2);

  const bRight = moveFrom(s5, 1, 3, 'R');
  assert.deepEqual(bRight, { r: 1, c: 3, d: 'R', res: 'move', tr: 1, tc: 5 });
  const s6 = applyMove(s5, bRight);

  const bDown = moveFrom(s6, 1, 5, 'D');
  assert.deepEqual(bDown, { r: 1, c: 5, d: 'D', res: 'pop', br: 3, bc: 5 });
  const s7 = applyMove(s6, bDown);
  assert.equal(isGoal(s7, lv), true, '七步后应清场');
  assert.equal(countBlocks(s7), 0);

  const totals = firsts.map((m) => ({ m, total: astarTotal(lv, m) }));
  const optimal = totals.filter((x) => x.total === 7);
  assert.equal(optimal.length, 3, '第 17 关应有 3 个最优首步');
  assert.deepEqual(
    optimal.map((x) => `${x.m.r},${x.m.c}${x.m.d}`).sort(),
    ['1,4D', '3,5U', '5,4U'],
  );
  for (const x of totals) {
    assert.ok(
      Number.isFinite(x.total) && x.total <= lv.limit,
      `首步 ${x.m.r},${x.m.c}${x.m.d} 之后仍应能在 ${lv.limit} 步内通关`,
    );
  }
  assert.equal(Math.max(...totals.map((x) => x.total)), 9);

  const withoutWall = (wr, wc) =>
    astarPar({ ...lv, rows: lv.rows.map((row, i) => (i === wr ? row.slice(0, wc) + '.' + row.slice(wc + 1) : row)) });
  assert.equal(withoutWall(3, 2), 7, '拿掉 (3,2) 后仍要 7 步');
  assert.equal(withoutWall(3, 3), 7, '拿掉 (3,3) 后仍要 7 步');
  assert.equal(withoutWall(3, 4), 7, '拿掉 (3,4) 后仍要 7 步');
  const noWalls17 = {
    ...lv,
    rows: lv.rows.map((row, r) => (r === 0 || r === 6 ? row : '#' + row.slice(1, 6).replace(/#/g, '.') + '#')),
  };
  assert.equal(astarPar(noWalls17), 6, '拆掉整排墙后 par 降为 6');
}

// ---- 4.18 第 18 关「挤一挤」：两颗锚块（绿 + 黄） ----
{
  const lv = LEVELS[17];
  const st = parse(lv.rows);
  assert.equal(lv.id, 18);
  assert.equal(lv.goal, 'clear');
  assert.equal(countBlocks(st), 8);

  const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const v of st.c) if (v > 0) counts[v]++;
  assert.deepEqual(counts, { 1: 2, 2: 2, 3: 2, 4: 2 }, '第 18 关应是红2 蓝2 绿2 黄2');

  const walls = [];
  for (let r = 1; r <= 5; r++)
    for (let c = 1; c <= 5; c++) if (at(st, r, c) === -1) walls.push(`${r},${c}`);
  assert.deepEqual(walls, ['2,2', '2,4', '4,3'], '第 18 关应有三格内墙');

  // 两颗钉子：绿 (3,3)、黄 (5,3)
  const anchors = [];
  for (let r = 0; r < st.h; r++)
    for (let c = 0; c < st.w; c++) if (isFixed(st, r, c)) anchors.push(`${r},${c}:${at(st, r, c)}`);
  assert.deepEqual(anchors, ['3,3:3', '5,3:4'], '第 18 关应有两颗锚块：绿 (3,3) 和黄 (5,3)');

  for (const [ar, ac] of [[3, 3], [5, 3]]) {
    for (const d of ['U', 'D', 'L', 'R']) {
      assert.equal(moveFrom(st, ar, ac, d), null, `锚块 (${ar},${ac}) 向 ${d} 应拖不动`);
    }
    assert.equal(
      legalMoves(st).filter((m) => m.r === ar && m.c === ac).length,
      0,
      `锚块 (${ar},${ac}) 不应出现在合法走法里`,
    );
  }

  assert.equal(astarPar(lv), 8);

  const firsts = legalMoves(st);
  assert.equal(firsts.length, 11, '第 18 关开局应有 11 个合法走法');
  assert.equal(firsts.filter((m) => m.res === 'pop').length, 0, '开局没有现成的配对');

  // 绿钉挡住蓝块的横向通路：蓝块右滑只能停在 (3,2)，绿钉还在时过不去
  const bRight = moveFrom(st, 3, 1, 'R');
  assert.deepEqual(bRight, { r: 3, c: 1, d: 'R', res: 'move', tr: 3, tc: 2 });
  assert.equal(moveFrom(applyMove(st, bRight), 3, 2, 'R'), null, '绿钉还在时蓝块不能穿过去');

  // 黄钉挡住绿块向右：它只能先上到 (3,2)，再撞绿钉
  assert.equal(moveFrom(st, 5, 2, 'R'), null, '黄钉挡住绿块向右');

  // 最优解：绿钉第 2 步、黄钉第 8 步
  const tokens = SOLUTIONS[18].trim().split(/\s+/);
  assert.equal(tokens.length, 8, '第 18 关回放应是 8 步');
  let s = st;
  const anchorPops = [];
  tokens.forEach((tok, i) => {
    const m = /^(\d+),(\d+)([UDLR])$/.exec(tok);
    assert.ok(m, `第 18 关第 ${i + 1} 步格式不对：${tok}`);
    const mv = moveFrom(s, Number(m[1]) - 1, Number(m[2]) - 1, m[3]);
    assert.ok(mv, `第 18 关第 ${i + 1} 步走不动：${tok}`);
    if (mv.res === 'pop' && (isFixed(s, mv.r, mv.c) || isFixed(s, mv.br, mv.bc))) {
      anchorPops.push(i + 1);
    }
    s = applyMove(s, mv);
  });
  assert.deepEqual(anchorPops, [2, 8], '绿钉应第 2 步被撞掉，黄钉第 8 步');
  assert.equal(isGoal(s, lv), true, '八步后应清场');
  assert.equal(countBlocks(s), 0);

  const totals = firsts.map((m) => ({ m, total: astarTotal(lv, m) }));
  const optimal = totals.filter((x) => x.total === 8);
  assert.equal(optimal.length, 1, '第 18 关应只有 1 个最优首步');
  assert.deepEqual(optimal.map((x) => `${x.m.r},${x.m.c}${x.m.d}`), ['5,2U']);
  for (const x of totals) {
    assert.ok(
      Number.isFinite(x.total) && x.total <= lv.limit,
      `首步 ${x.m.r},${x.m.c}${x.m.d} 之后仍应能在 ${lv.limit} 步内通关`,
    );
  }
  assert.equal(Math.max(...totals.map((x) => x.total)), 11);

  // 墙仍然承重：(2,2) 是绿块向上滑的刹车，(2,4) 拆掉后中路提前打开
  const withoutWall = (wr, wc) =>
    astarPar({ ...lv, rows: lv.rows.map((row, i) => (i === wr ? row.slice(0, wc) + '.' + row.slice(wc + 1) : row)) });
  assert.equal(withoutWall(2, 2), 10, '拿掉 (2,2) 后绿块失去向上的刹车，par 变成 10');
  assert.equal(withoutWall(2, 4), 7, '拿掉 (2,4) 后中路提前打开，par 降为 7');
  assert.equal(withoutWall(4, 3), 8, '拿掉 (4,3) 后仍要 8 步');
  const noWalls18 = {
    ...lv,
    rows: lv.rows.map((row, r) => (r === 0 || r === 6 ? row : '#' + row.slice(1, 6).replace(/#/g, '.') + '#')),
  };
  assert.equal(astarPar(noWalls18), 9, '拆掉整组墙后 par 变成 9');

  // 钉子换成可动同色块：par 仍是 8——钉子约束的是走法，不是步数
  const mobileRows = lv.rows.map((row) => row.replace('c', 'C').replace('d', 'D'));
  const mst = parse(mobileRows);
  assert.equal(isFixed(mst, 3, 3), false);
  assert.equal(isFixed(mst, 5, 3), false);
  assert.ok(moveFrom(mst, 3, 3, 'U'), '换成大写后绿块可以移动');
  assert.equal(astarPar({ ...lv, rows: mobileRows }), 8, '拿掉两颗钉子后仍应是 8 步');
}

// ---- 4.19 第 19 关「只要红色·入门」 ----
{
  const lv = LEVELS[18];
  const st = parse(lv.rows);
  assert.equal(lv.id, 19);
  assert.equal(lv.goal, 'color');
  assert.equal(lv.targetColor, 1);
  assert.equal(countBlocks(st), 6);

  const counts = { 1: 0, 2: 0, 3: 0 };
  for (const v of st.c) if (v > 0) counts[v]++;
  assert.deepEqual(counts, { 1: 4, 2: 1, 3: 1 }, '第 19 关应是红 4 + 蓝 1 + 绿 1');

  const walls = [];
  for (let r = 1; r <= 5; r++)
    for (let c = 1; c <= 5; c++) if (at(st, r, c) === -1) walls.push(`${r},${c}`);
  assert.deepEqual(walls, ['3,3'], '第 19 关应有一格内墙');

  assert.equal(astarPar(lv), 3);

  // 只清红：通关时蓝、绿两块原地不动
  const aPop = moveFrom(st, 1, 4, 'D');
  assert.deepEqual(aPop, { r: 1, c: 4, d: 'D', res: 'pop', br: 5, bc: 4 });
  const s1 = applyMove(st, aPop);

  const cRight = moveFrom(s1, 3, 1, 'R');
  assert.deepEqual(cRight, { r: 3, c: 1, d: 'R', res: 'move', tr: 3, tc: 2 }, '绿块应停在 (3,2) 墙边');
  const s2 = applyMove(s1, cRight);

  const aDown = moveFrom(s2, 1, 1, 'D');
  assert.deepEqual(aDown, { r: 1, c: 1, d: 'D', res: 'pop', br: 5, bc: 1 });
  const s3 = applyMove(s2, aDown);
  assert.equal(isGoal(s3, lv), true, '三步后红色应全部消失');
  assert.equal(countBlocks(s3), 2, '通关时蓝块和绿块都还在');

  const firsts = legalMoves(st);
  const totals = firsts.map((m) => ({ m, total: astarTotal(lv, m) }));
  const optimal = totals.filter((x) => x.total === 3);
  assert.equal(optimal.length, 5, '第 19 关应有 5 个最优首步');
  assert.deepEqual(
    optimal.map((x) => `${x.m.r},${x.m.c}${x.m.d}`).sort(),
    ['1,4D', '3,1R', '5,1R', '5,4L', '5,4U'],
  );
  for (const x of totals) {
    assert.ok(
      Number.isFinite(x.total) && x.total <= lv.limit,
      `首步 ${x.m.r},${x.m.c}${x.m.d} 之后仍应能在 ${lv.limit} 步内通关`,
    );
  }
  assert.ok(Math.max(...totals.map((x) => x.total)) <= 4, '第 19 关走错一步最多也只多花一步');

  // 蓝、绿各只有一块：永远消不掉，但两块都影响最优解
  assert.equal(astarPar(emptyCell(lv, 1, 2)), 2, '拿掉蓝块后可以直接竖消，par 降为 2');
  assert.equal(astarPar(emptyCell(lv, 3, 1)), 2, '拿掉绿块后可以直接竖消，par 降为 2');

  // 中间墙只当停车位：拿掉后仍要 3 步，但解法里绿块正停在这格墙边
  assert.equal(astarPar(emptyCell(lv, 3, 3)), 3, '拿掉 (3,3) 后 par 仍是 3');
}

// ---- 4.20 第 20 关「红块两对」 ----
{
  const lv = LEVELS[19];
  const st = parse(lv.rows);
  assert.equal(lv.id, 20);
  assert.equal(lv.goal, 'color');
  assert.equal(lv.targetColor, 1);
  assert.equal(countBlocks(st), 6);

  const counts = { 1: 0, 2: 0, 3: 0 };
  for (const v of st.c) if (v > 0) counts[v]++;
  assert.deepEqual(counts, { 1: 4, 2: 1, 3: 1 }, '第 20 关应是红 4 + 蓝 1 + 绿 1');

  const walls = [];
  for (let r = 1; r <= 5; r++)
    for (let c = 1; c <= 5; c++) if (at(st, r, c) === -1) walls.push(`${r},${c}`);
  assert.deepEqual(walls, ['1,3', '5,3'], '第 20 关应有两格内墙');

  assert.equal(astarPar(lv), 4);

  const firsts0 = legalMoves(st);
  assert.equal(firsts0.filter((m) => m.res === 'pop').length, 0, '第 20 关开局没有现成的配对');

  // 蓝块先让开，红块下落；绿块再把左下红块刹在第三行
  const bLeft = moveFrom(st, 2, 4, 'L');
  assert.deepEqual(bLeft, { r: 2, c: 4, d: 'L', res: 'move', tr: 2, tc: 3 }, '蓝块应停在绿块旁边');
  const s1 = applyMove(st, bLeft);

  const aPop = moveFrom(s1, 1, 4, 'D');
  assert.deepEqual(aPop, { r: 1, c: 4, d: 'D', res: 'pop', br: 5, bc: 4 });
  const s2 = applyMove(s1, aPop);

  const aUp = moveFrom(s2, 5, 2, 'U');
  assert.deepEqual(aUp, { r: 5, c: 2, d: 'U', res: 'move', tr: 3, tc: 2 }, '红块应被绿块刹在 (3,2)');
  const s3 = applyMove(s2, aUp);

  const aRight = moveFrom(s3, 3, 2, 'R');
  assert.deepEqual(aRight, { r: 3, c: 2, d: 'R', res: 'pop', br: 3, bc: 5 });
  const s4 = applyMove(s3, aRight);
  assert.equal(isGoal(s4, lv), true, '四步后红色应全部消失');
  assert.equal(countBlocks(s4), 2, '通关时蓝块和绿块都还在');

  const totals = firsts0.map((m) => ({ m, total: astarTotal(lv, m) }));
  const optimal = totals.filter((x) => x.total === 4);
  assert.equal(optimal.length, 3, '第 20 关应有 3 个最优首步');
  assert.deepEqual(
    optimal.map((x) => `${x.m.r},${x.m.c}${x.m.d}`).sort(),
    ['2,4L', '2,4R', '5,2U'],
  );
  for (const x of totals) {
    assert.ok(
      Number.isFinite(x.total) && x.total <= lv.limit,
      `首步 ${x.m.r},${x.m.c}${x.m.d} 之后仍应能在 ${lv.limit} 步内通关`,
    );
  }
  assert.ok(Math.max(...totals.map((x) => x.total)) <= 6, '第 20 关走错一步最多也只多花两步');

  // 两块非目标块都不能少：蓝块是障碍，绿块是刹车
  assert.equal(astarPar(emptyCell(lv, 2, 4)), 3, '拿掉蓝块后 par 降为 3');
  assert.equal(astarPar(emptyCell(lv, 2, 2)), 5, '拿掉绿块后红块失去了停车点，par 升为 5');

  // 两堵墙：拆整组后 par 降为 3；(5,3) 是实打实的捷径封堵
  assert.equal(astarPar(emptyCell(lv, 5, 3)), 3, '拿掉 (5,3) 后底行横消捷径打开，par 降为 3');
  assert.equal(astarPar(emptyCell(lv, 1, 3)), 4, '拿掉 (1,3) 后 par 不变');
  assert.equal(astarPar(emptyCell(emptyCell(lv, 1, 3), 5, 3)), 3, '拆掉整组墙后 par 降为 3');
}

// ---- 4.21 第 21–25 关：S3 清色产线 ----
{
  const cases = [
    {
      id: 21,
      target: 1,
      blocks: { 1: 4, 2: 2, 3: 2 },
      walls: ['3,2', '3,4'],
      par: 5,
      limit: 8,
      firsts: 13,
      optimal: 3,
      worst: 6,
      openPops: 0,
      loads: { B: 3, C: 4 },
      noWallsPar: 4,
      path: [[2, 3, 'L'], [2, 1, 'D'], [1, 1, 'D'], [2, 1, 'R'], [1, 3, 'D']],
    },
    {
      id: 22,
      target: 1,
      blocks: { 1: 4, 2: 1, 3: 1, 4: 2 },
      walls: ['2,2', '2,5', '4,3'],
      par: 5,
      limit: 8,
      firsts: 14,
      optimal: 3,
      worst: 7,
      openPops: 0,
      loads: { B: 3, C: 3, D: 4 },
      noWallsPar: 4,
      path: [[2, 3, 'D'], [2, 4, 'L'], [1, 4, 'D'], [4, 2, 'L'], [1, 1, 'D']],
    },
    {
      id: 23,
      target: 3,
      blocks: { 1: 2, 2: 1, 3: 4, 4: 1 },
      walls: ['2,2', '4,4'],
      par: 5,
      limit: 7,
      firsts: 14,
      optimal: 5,
      worst: 6,
      openPops: 0,
      loads: { A: 4, B: 4, D: 4 },
      noWallsPar: 4,
      path: [[3, 2, 'D'], [5, 2, 'R'], [4, 5, 'D'], [1, 4, 'D'], [1, 1, 'R']],
    },
    {
      id: 24,
      target: 1,
      blocks: { 1: 6, 2: 2, 3: 2 },
      walls: ['2,2', '2,5', '4,3'],
      par: 6,
      limit: 8,
      firsts: 19,
      optimal: 4,
      worst: 8,
      openPops: 2,
      loads: { B: 5, C: 5 },
      noWallsPar: 4,
      path: [[3, 2, 'R'], [3, 1, 'R'], [2, 1, 'D'], [3, 5, 'D'], [1, 4, 'D'], [1, 2, 'R']],
    },
    {
      id: 25,
      target: 1,
      blocks: { 1: 4, 2: 2, 3: 2 },
      walls: ['3,2', '3,4'],
      par: 4,
      limit: 7,
      firsts: 17,
      optimal: 2,
      worst: 6,
      openPops: 0,
      loads: { B: 3, C: 3 },
      noWallsPar: 3,
      path: [[5, 2, 'U'], [5, 1, 'R'], [1, 3, 'D'], [1, 1, 'R']],
    },
    {
      id: 26,
      target: 2,
      blocks: { 1: 2, 2: 4, 3: 2, 4: 2 },
      walls: ['3,2', '3,3', '3,4'],
      par: 6,
      limit: 8,
      firsts: 11,
      optimal: 4,
      worst: 8,
      openPops: 0,
      loads: { A: 5, C: 5, D: 5 },
      noWallsPar: 4,
      path: [[5, 3, 'U'], [5, 2, 'U'], [5, 4, 'L'], [3, 1, 'D'], [2, 3, 'R'], [2, 5, 'D']],
    },
    {
      id: 27,
      target: 1,
      blocks: { 1: 4, 2: 2, 3: 2, 4: 2 },
      walls: ['2,2', '3,3', '4,3'],
      par: 5,
      limit: 7,
      firsts: 15,
      optimal: 3,
      worst: 7,
      openPops: 0,
      loads: { B: 4, C: 4, D: 4 },
      noWallsPar: 4,
      path: [[3, 4, 'U'], [3, 5, 'L'], [3, 4, 'D'], [5, 2, 'U'], [5, 1, 'R']],
    },
    {
      id: 28,
      target: 1,
      blocks: { 1: 4, 2: 2, 3: 2, 4: 2 },
      walls: ['2,2', '3,2', '3,4', '4,4'],
      par: 6,
      limit: 8,
      firsts: 12,
      optimal: 4,
      worst: 8,
      openPops: 0,
      loads: { B: 4, C: 5, D: 5 },
      noWallsPar: 4,
      path: [[1, 1, 'D'], [3, 3, 'D'], [4, 3, 'L'], [2, 3, 'D'], [4, 5, 'D'], [5, 1, 'R']],
    },
    {
      id: 29,
      target: 3,
      blocks: { 1: 2, 2: 2, 3: 4, 4: 2 },
      walls: ['2,2', '3,3', '4,3'],
      par: 7,
      limit: 9,
      firsts: 14,
      optimal: 5,
      worst: 8,
      openPops: 0,
      loads: { A: 6, B: 5, D: 5 },
      noWallsPar: 5,
      path: [[3, 4, 'U'], [1, 4, 'R'], [4, 1, 'D'], [2, 1, 'D'], [1, 1, 'D'], [3, 1, 'R'], [3, 2, 'D']],
    },
    {
      id: 30,
      target: 1,
      blocks: { 1: 4, 2: 2, 3: 2, 4: 2 },
      walls: ['2,2', '2,4', '4,2', '4,4'],
      par: 7,
      limit: 9,
      firsts: 11,
      optimal: 3,
      worst: 9,
      openPops: 0,
      loads: { B: 8, C: 6, D: 4 },
      noWallsPar: 4,
      path: [[3, 5, 'D'], [2, 5, 'D'], [3, 5, 'L'], [4, 5, 'U'], [1, 5, 'L'], [5, 4, 'L'], [5, 3, 'U']],
    },
  ];

  for (const cs of cases) {
    const lv = LEVELS[cs.id - 1];
    progress(`S3/S4 第 ${cs.id} 关`);
    const st = parse(lv.rows);
    assert.equal(lv.id, cs.id);
    assert.equal(lv.goal, 'color');
    assert.equal(lv.targetColor, cs.target);
    assert.equal(countBlocks(st), Object.values(cs.blocks).reduce((a, b) => a + b, 0));

    const counts = {};
    for (const v of st.c) if (v > 0) counts[v] = (counts[v] || 0) + 1;
    assert.deepEqual(counts, cs.blocks, `第 ${cs.id} 关颜色配比不对`);

    const walls = [];
    for (let r = 1; r <= 5; r++)
      for (let c = 1; c <= 5; c++) if (at(st, r, c) === -1) walls.push(`${r},${c}`);
    assert.deepEqual(walls, cs.walls, `第 ${cs.id} 关内墙位置不对`);

    assert.equal(astarPar(lv), cs.par);
    assert.equal(lv.par, cs.par);
    assert.equal(lv.limit, cs.limit);

    const firsts = legalMoves(st);
    assert.equal(firsts.length, cs.firsts, `第 ${cs.id} 关合法首步数不对`);
    assert.equal(firsts.filter((m) => m.res === 'pop').length, cs.openPops, `第 ${cs.id} 关开局现成对数不对`);
    const totals = firsts.map((m) => ({ m, total: astarTotal(lv, m) }));
    for (const x of totals) {
      assert.ok(
        Number.isFinite(x.total) && x.total <= lv.limit,
        `第 ${cs.id} 关首步 ${x.m.r},${x.m.c}${x.m.d} 之后仍应能在 ${lv.limit} 步内通关`,
      );
    }
    assert.equal(totals.filter((x) => x.total === cs.par).length, cs.optimal, `第 ${cs.id} 关最优首步数不对`);
    assert.equal(Math.max(...totals.map((x) => x.total)), cs.worst, `第 ${cs.id} 关最差首步应为 ${cs.worst}`);

    // 逐步回放：src/game.js 与 research A* 的解法一致
    let cur = st;
    for (const [r, c, d] of cs.path) {
      const m = moveFrom(cur, r, c, d);
      assert.ok(m, `第 ${cs.id} 关路径 ${r},${c}${d} 应为合法走法`);
      cur = applyMove(cur, m);
    }
    assert.equal(isGoal(cur, lv), true, `第 ${cs.id} 关按路径应通关`);

    // 每种非目标色整色拿掉后 par 必须变化（不能有装饰色）
    for (const [ch, expected] of Object.entries(cs.loads)) {
      assert.equal(astarPar(removeColor(lv, ch)), expected, `第 ${cs.id} 关拿掉整色 ${ch} 后 par 应变为 ${expected}`);
    }

    // 拆掉整组内墙后 par 必须下降
    let noWalls = lv;
    for (const w of cs.walls) {
      const [r, c] = w.split(',').map(Number);
      noWalls = emptyCell(noWalls, r, c);
    }
    assert.equal(astarPar(noWalls), cs.noWallsPar, `第 ${cs.id} 关拆掉整组墙后 par 应变为 ${cs.noWallsPar}`);
    assert.ok(cs.noWallsPar < cs.par, `第 ${cs.id} 关墙必须承重`);
  }
}

// ---- 4.21b 第 30 关：目标色锚块（红钉） ----
{
  const lv = LEVELS[29];
  const st = parse(lv.rows);
  assert.equal(lv.id, 30);
  assert.equal(lv.goal, 'color');
  assert.equal(lv.targetColor, 1);
  assert.equal(lv.limit, 9);
  assert.equal(countBlocks(st), 10);
  assert.equal(st.c.filter((v) => v === 1).length, 4, '第 30 关应有 4 块红块');

  // 两颗红钉：(1,4)、(2,3)
  const anchors = [];
  for (let r = 0; r < st.h; r++)
    for (let c = 0; c < st.w; c++) if (isFixed(st, r, c)) anchors.push(`${r},${c}:${at(st, r, c)}`);
  assert.deepEqual(anchors, ['1,4:1', '2,3:1'], '第 30 关应有两颗红锚块');

  for (const [ar, ac] of [[1, 4], [2, 3]]) {
    for (const d of ['U', 'D', 'L', 'R']) {
      assert.equal(moveFrom(st, ar, ac, d), null, `红钉 (${ar},${ac}) 向 ${d} 应拖不动`);
    }
    assert.equal(
      legalMoves(st).filter((m) => m.r === ar && m.c === ac).length,
      0,
      `红钉 (${ar},${ac}) 不应出现在合法走法里`,
    );
  }

  // 四道墙单独拿掉都会让 par 变化
  const withoutWall = (wr, wc) =>
    astarPar({ ...lv, rows: lv.rows.map((row, i) => (i === wr ? row.slice(0, wc) + '.' + row.slice(wc + 1) : row)) });
  assert.equal(withoutWall(2, 2), 6, '拿掉 (2,2) 后 par 应降为 6');
  assert.equal(withoutWall(2, 4), 5, '拿掉 (2,4) 后 par 应降为 5');
  assert.equal(withoutWall(4, 2), 6, '拿掉 (4,2) 后 par 应降为 6');
  assert.equal(withoutWall(4, 4), 6, '拿掉 (4,4) 后 par 应降为 6');

  // 回放：红钉第 5、7 步被撞掉
  const tokens = SOLUTIONS[30].trim().split(/\s+/);
  assert.equal(tokens.length, 7, '第 30 关回放应是 7 步');
  let s = st;
  const anchorPops = [];
  tokens.forEach((tok, i) => {
    const m = /^(\d+),(\d+)([UDLR])$/.exec(tok);
    assert.ok(m, `第 30 关第 ${i + 1} 步格式不对：${tok}`);
    const mv = moveFrom(s, Number(m[1]) - 1, Number(m[2]) - 1, m[3]);
    assert.ok(mv, `第 30 关第 ${i + 1} 步走不动：${tok}`);
    if (mv.res === 'pop' && (isFixed(s, mv.r, mv.c) || isFixed(s, mv.br, mv.bc))) anchorPops.push(i + 1);
    s = applyMove(s, mv);
  });
  assert.deepEqual(anchorPops, [5, 7], '第一颗红钉应第 5 步被撞掉，第二颗第 7 步');
  assert.equal(isGoal(s, lv), true, '七步后应清完红色');
  assert.equal(s.c.filter((v) => v === 1).length, 0);

  const firsts = legalMoves(st);
  assert.equal(firsts.length, 11, '第 30 关开局应有 11 个合法走法');
  const totals = firsts.map((m) => ({ m, total: astarTotal(lv, m) }));
  const optimal = totals.filter((x) => x.total === 7);
  assert.equal(optimal.length, 3, '第 30 关应有 3 个最优首步');
  assert.deepEqual(optimal.map((x) => `${x.m.r},${x.m.c}${x.m.d}`).sort(), ['3,5D', '3,5L', '5,4L']);
  assert.equal(Math.max(...totals.map((x) => x.total)), 9);
  for (const x of totals) {
    assert.ok(Number.isFinite(x.total) && x.total <= lv.limit, `首步之后仍应能在 ${lv.limit} 步内清完红色`);
  }

  // 钉子可动化后 par 不变：压力来自「把红块送到钉子面前」的路线，不是省步
  const mobileRows = lv.rows.map((row) => row.replace('a', 'A'));
  const mst = parse(mobileRows);
  assert.equal(isFixed(mst, 1, 4), false);
  assert.equal(isFixed(mst, 2, 3), false);
  assert.equal(astarPar({ ...lv, rows: mobileRows }), 7, '红钉可动化后仍应是 7 步');
}

// ---- 4.22 第 31–40 关：S4 耦合段（清场为主，顺序决定落点） ----
{
  const cases = [
    {
      id: 31,
      blocks: { 1: 2, 2: 2, 3: 2, 4: 4 },
      walls: ['2,2', '2,3', '3,2'],
      par: 7,
      limit: 9,
      firsts: 18,
      optimal: 5,
      worst: 9,
      openPops: 6,
      loads: { A: 5, B: 4, C: 6, D: 5 },
      noWallsPar: 6,
      path: [
        [2, 4, 'R'],
        [1, 4, 'D'],
        [1, 3, 'R'],
        [1, 5, 'D'],
        [3, 3, 'D'],
        [4, 2, 'R'],
        [5, 1, 'R'],
      ],
    },
    {
      id: 32,
      blocks: { 1: 2, 2: 2, 3: 4, 4: 4 },
      walls: ['2,2', '2,3', '4,3', '4,4'],
      par: 8,
      limit: 10,
      firsts: 13,
      optimal: 6,
      worst: 10,
      openPops: 6,
      loads: { A: 7, B: 5, C: 6, D: 6 },
      noWallsPar: 7,
      path: [
        [3, 1, 'R'],
        [2, 5, 'D'],
        [1, 5, 'D'],
        [1, 2, 'R'],
        [1, 4, 'D'],
        [5, 2, 'U'],
        [3, 2, 'R'],
        [5, 1, 'R'],
      ],
    },
    {
      id: 33,
      blocks: { 1: 4, 2: 2, 3: 2, 4: 2 },
      walls: ['2,2', '3,2', '4,2', '4,3'],
      par: 7,
      limit: 9,
      firsts: 18,
      optimal: 7,
      worst: 9,
      openPops: 6,
      loads: { A: 4, B: 4, C: 6, D: 6 },
      noWallsPar: 6,
      path: [
        [1, 3, 'R'],
        [1, 2, 'R'],
        [1, 4, 'D'],
        [1, 1, 'R'],
        [2, 1, 'D'],
        [3, 3, 'R'],
        [4, 5, 'D'],
      ],
    },
    {
      id: 34,
      blocks: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2 },
      walls: ['1,4', '2,2', '5,5'],
      par: 10,
      limit: 12,
      firsts: 20,
      optimal: 5,
      worst: 12,
      openPops: 2,
      loads: { A: 8, B: 7, C: 9, D: 8, E: 9 },
      noWallsPar: 9,
      path: [
        [4, 4, 'R'],
        [2, 3, 'D'],
        [1, 3, 'D'],
        [3, 1, 'R'],
        [4, 1, 'R'],
        [1, 1, 'R'],
        [1, 3, 'D'],
        [5, 2, 'U'],
        [3, 2, 'R'],
        [1, 5, 'D'],
      ],
    },
    {
      id: 35,
      blocks: { 1: 2, 2: 2, 3: 2, 4: 4 },
      walls: ['2,2', '3,2', '4,2', '4,3'],
      par: 8,
      limit: 10,
      firsts: 15,
      optimal: 5,
      worst: 10,
      openPops: 6,
      loads: { A: 6, B: 5, C: 7, D: 6 },
      noWallsPar: 7,
      path: [
        [1, 4, 'D'],
        [3, 5, 'D'],
        [4, 4, 'U'],
        [5, 1, 'R'],
        [5, 4, 'U'],
        [1, 1, 'R'],
        [2, 4, 'R'],
        [1, 5, 'D'],
      ],
    },
    {
      id: 36,
      blocks: { 1: 2, 2: 2, 3: 2, 4: 4 },
      walls: ['2,2', '2,4', '4,4'],
      par: 7,
      limit: 9,
      firsts: 15,
      optimal: 6,
      worst: 9,
      openPops: 4,
      loads: { A: 6, B: 6, C: 5, D: 3 },
      noWallsPar: 6,
      path: [
        [3, 5, 'D'],
        [2, 5, 'D'],
        [1, 4, 'L'],
        [1, 3, 'D'],
        [1, 2, 'R'],
        [2, 1, 'D'],
        [5, 1, 'R'],
      ],
    },
    {
      id: 37,
      blocks: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 4 },
      walls: ['2,2', '2,3', '4,3', '4,4'],
      par: 8,
      limit: 10,
      firsts: 20,
      optimal: 8,
      worst: 10,
      openPops: 8,
      loads: { A: 7, B: 7, C: 6, D: 7, E: 5 },
      noWallsPar: 7,
      path: [
        [1, 4, 'R'],
        [5, 1, 'R'],
        [2, 4, 'D'],
        [3, 2, 'R'],
        [3, 5, 'L'],
        [2, 1, 'D'],
        [2, 5, 'D'],
        [3, 2, 'D'],
      ],
    },
    {
      id: 38,
      goal: 'color',
      target: 1,
      blocks: { 1: 6, 2: 2, 3: 2, 4: 2 },
      walls: ['3,2', '3,4', '5,2'],
      par: 7,
      limit: 9,
      firsts: 20,
      optimal: 8,
      worst: 9,
      openPops: 6,
      loads: { B: 6, C: 5, D: 5 },
      noWallsPar: 4,
      path: [
        [1, 1, 'D'],
        [1, 2, 'R'],
        [4, 3, 'U'],
        [4, 5, 'L'],
        [5, 4, 'U'],
        [4, 4, 'R'],
        [3, 5, 'D'],
      ],
    },
    {
      id: 39,
      blocks: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 4 },
      walls: ['2,2', '3,2', '3,4', '4,4'],
      par: 9,
      limit: 11,
      firsts: 17,
      optimal: 6,
      worst: 11,
      openPops: 8,
      loads: { A: 6, B: 7, C: 8, D: 8, E: 5 },
      noWallsPar: 8,
      path: [
        [4, 2, 'D'],
        [3, 3, 'D'],
        [2, 3, 'D'],
        [4, 3, 'L'],
        [1, 3, 'D'],
        [4, 1, 'D'],
        [2, 1, 'D'],
        [5, 1, 'R'],
        [2, 5, 'D'],
      ],
    },
    {
      id: 40,
      blocks: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 4 },
      walls: ['2,2', '3,2', '3,4', '4,4'],
      par: 9,
      limit: 12,
      firsts: 19,
      optimal: 5,
      worst: 11,
      openPops: 6,
      loads: { A: 8, B: 6, C: 8, D: 7, E: 8 },
      noWallsPar: 7,
      path: [
        [1, 3, 'R'],
        [1, 2, 'R'],
        [5, 2, 'R'],
        [3, 3, 'D'],
        [4, 3, 'L'],
        [3, 1, 'D'],
        [2, 5, 'D'],
        [5, 4, 'R'],
        [2, 3, 'D'],
      ],
    },
  ];

  for (const cs of cases) {
    const lv = LEVELS.find((l) => l.id === cs.id);
    progress(`S4 第 ${cs.id} 关`);
    const st = parse(lv.rows);
    assert.equal(lv.id, cs.id);
    assert.equal(lv.goal, cs.goal || 'clear', `第 ${cs.id} 关目标类型不对`);
    if ((cs.goal || 'clear') === 'color') {
      assert.equal(lv.targetColor, cs.target, `第 ${cs.id} 关目标色不对`);
    }
    assert.equal(countBlocks(st), Object.values(cs.blocks).reduce((a, b) => a + b, 0));

    const counts = {};
    for (const v of st.c) if (v > 0) counts[v] = (counts[v] || 0) + 1;
    assert.deepEqual(counts, cs.blocks, `第 ${cs.id} 关颜色配比不对`);

    const walls = [];
    for (let r = 1; r <= 5; r++)
      for (let c = 1; c <= 5; c++) if (at(st, r, c) === -1) walls.push(`${r},${c}`);
    assert.deepEqual(walls, cs.walls, `第 ${cs.id} 关内墙位置不对`);

    assert.equal(astarPar(lv), cs.par);
    assert.equal(lv.par, cs.par);
    assert.equal(lv.limit, cs.limit);

    const firsts = legalMoves(st);
    assert.equal(firsts.length, cs.firsts, `第 ${cs.id} 关合法首步数不对`);
    assert.equal(firsts.filter((m) => m.res === 'pop').length, cs.openPops, `第 ${cs.id} 关开局现成对数不对`);
    const totals = firsts.map((m) => ({ m, total: astarTotal(lv, m) }));
    for (const x of totals) {
      assert.ok(
        Number.isFinite(x.total) && x.total <= lv.limit,
        `第 ${cs.id} 关首步 ${x.m.r},${x.m.c}${x.m.d} 之后仍应能在 ${lv.limit} 步内通关`,
      );
    }
    assert.equal(totals.filter((x) => x.total === cs.par).length, cs.optimal, `第 ${cs.id} 关最优首步数不对`);
    assert.equal(Math.max(...totals.map((x) => x.total)), cs.worst, `第 ${cs.id} 关最差首步应为 ${cs.worst}`);

    // 逐步回放：src/game.js 与 research A* 的解法一致
    let cur = st;
    for (const [r, c, d] of cs.path) {
      const m = moveFrom(cur, r, c, d);
      assert.ok(m, `第 ${cs.id} 关路径 ${r},${c}${d} 应为合法走法`);
      cur = applyMove(cur, m);
    }
    assert.equal(isGoal(cur, lv), true, `第 ${cs.id} 关按路径应通关`);

    // 清场关：每种颜色整色拿掉后 par 都必须变化，且至少两种降 ≥2 步；
    // 清色关：每种非目标色整色拿掉后 par 都必须变化。
    let drop2 = 0;
    for (const [ch, expected] of Object.entries(cs.loads)) {
      assert.equal(astarPar(removeColor(lv, ch)), expected, `第 ${cs.id} 关拿掉整色 ${ch} 后 par 应变为 ${expected}`);
      assert.ok(expected < cs.par, `第 ${cs.id} 关颜色 ${ch} 必须承重`);
      if (cs.par - expected >= 2) drop2++;
    }
    if ((cs.goal || 'clear') === 'clear') {
      assert.ok(drop2 >= 2, `第 ${cs.id} 关至少两种颜色拿掉后 par 降 ≥2 步，实际 ${drop2}`);
    }

    // 拆掉整组内墙后 par 必须下降
    let noWalls = lv;
    for (const w of cs.walls) {
      const [r, c] = w.split(',').map(Number);
      noWalls = emptyCell(noWalls, r, c);
    }
    assert.equal(astarPar(noWalls), cs.noWallsPar, `第 ${cs.id} 关拆掉整组墙后 par 应变为 ${cs.noWallsPar}`);
    assert.ok(cs.noWallsPar < cs.par, `第 ${cs.id} 关墙必须承重`);
  }
}

// ---- 4.22b 第 40 关：最后一对（黄色必须留到最后） ----
{
  const lv = LEVELS.find((l) => l.id === 40);
  const st = parse(lv.rows);
  assert.equal(lv.id, 40);
  assert.equal(st.lastColor, 4, '第 40 关应把黄色标成最后一对');

  const yellows = [];
  for (let r = 0; r < st.h; r++)
    for (let c = 0; c < st.w; c++) if (at(st, r, c) === 4) yellows.push(`${r},${c}`);
  assert.deepEqual(yellows, ['2,3', '5,2'], '第 40 关应有两块黄块');

  // 两块黄块本身能拖（不是锚块），只是「最后一次消除」被锁
  assert.equal(isFixed(st, 2, 3), false);
  assert.equal(isFixed(st, 5, 2), false);
  assert.ok(moveFrom(st, 2, 3, 'R'), '第一块黄块应能向右滑');
  assert.ok(moveFrom(st, 5, 2, 'R'), '第二块黄块应能向右滑');

  // 按新解先走 5 步，把两块黄块凑到同一列：此时消黄会提前清完「最后一对」，必须被挡
  const pre = [
    [1, 3, 'R'],
    [1, 2, 'R'],
    [5, 2, 'R'],
    [3, 3, 'D'],
    [4, 3, 'L'],
  ];
  let s = st;
  for (const [r, c, d] of pre) {
    const m = moveFrom(s, r, c, d);
    assert.ok(m, `第 40 关预热步骤 ${r},${c}${d} 应合法`);
    s = applyMove(s, m);
  }
  assert.equal(at(s, 2, 3), 4);
  assert.equal(at(s, 5, 3), 4);
  assert.equal(moveFrom(s, 2, 3, 'D'), null, '还有别的颜色时，最后一对不能提前消');
  assert.equal(
    isLastPairBlocked(s, 2, 3, 'D'),
    true,
    '这次拦截应来自最后一条规则，而不是被墙或异色挡住',
  );
  assert.equal(
    legalMoves(s).filter((m) => m.res === 'pop' && at(s, m.r, m.c) === 4).length,
    0,
    '最后一对的消除不应出现在合法走法里',
  );

  // 旧解把消黄放在第 6 步：现在这一步就该违规
  const oldTokens = '2,4R 2,3R 6,3R 4,4D 5,4L 3,4D 3,6D 4,2D 6,5R'.split(' ');
  let o = st;
  let oldStep = 0;
  for (const tok of oldTokens) {
    const m = /^(\d+),(\d+)([UDLR])$/.exec(tok);
    const mv = moveFrom(o, Number(m[1]) - 1, Number(m[2]) - 1, m[3]);
    if (!mv) break;
    o = applyMove(o, mv);
    oldStep++;
  }
  assert.equal(oldStep, 5, '旧解应恰好走到第 5 步，第 6 步消黄被挡');

  // 新解 9 步通关，且全程只有最后一步消黄
  const tokens = SOLUTIONS[40].trim().split(/\s+/);
  assert.equal(tokens.length, 9);
  let n = st;
  const yellowPops = [];
  tokens.forEach((tok, i) => {
    const m = /^(\d+),(\d+)([UDLR])$/.exec(tok);
    assert.ok(m, `第 40 关第 ${i + 1} 步格式不对：${tok}`);
    const mv = moveFrom(n, Number(m[1]) - 1, Number(m[2]) - 1, m[3]);
    assert.ok(mv, `第 40 关第 ${i + 1} 步走不动：${tok}`);
    if (mv.res === 'pop' && at(n, mv.r, mv.c) === 4) yellowPops.push(i + 1);
    if (i === tokens.length - 2) assert.equal(countBlocks(n), 4, '第 40 关第 8 步时场上应还剩两对');
    n = applyMove(n, mv);
  });
  assert.deepEqual(yellowPops, [9], '第 40 关只允许在最后一步消黄');
  assert.equal(isGoal(n, lv), true, '九步后应通关');
  assert.equal(countBlocks(n), 0);

  // 规则本身不额外加步：把数字标记换回普通字母后 par 仍是 9
  const plain = lv.rows.map((row) => row.split('4').join('D'));
  assert.equal(astarPar({ ...lv, rows: plain }), 9, '关掉「最后一对」规则后 par 仍应是 9');
}

// ---- 4.23 第 41–50 关：S5 精算段（容错收紧，顺序耦合） ----
{
  const s5 = LEVELS.filter((lv) => lv.id >= 41 && lv.id <= 50);
  assert.equal(s5.length, 10, 'S5（41–50）应有 10 关');
  let tight = 0;
  for (const lv of s5) {
    progress(`S5 第 ${lv.id} 关`);
    assert.equal(lv.stage, 5, `第 ${lv.id} 关应属于阶段 5`);
    const slack = lv.limit - lv.par;
    // #45 是首次引入泊位：按官方答疑「新机制先学后组合」有意放宽到 par+3，
    // 多给 1 步熟悉「停进泊位」；其余 S5 关卡仍保持 par+1 / par+2。
    const slackOk = slack === 1 || slack === 2 || (lv.id === 45 && slack === 3);
    assert.ok(slackOk, `第 ${lv.id} 关容错应为 par+1 / par+2（#45 可为 par+3），实际 ${slack}`);
    if (slack === 1) tight++;
    assert.equal(astarPar(lv), lv.par, `第 ${lv.id} 关 par 应为 ${lv.par}`);

    const st0 = rParse(lv.rows);
    const total = rCount(st0);
    assert.ok(total >= 10 && total <= 12, `第 ${lv.id} 关方块数应在 10–12，实际 ${total}`);
    const colors = new Set([...st0.c].filter((v) => v > 0));
    assert.ok(colors.size >= 4 && colors.size <= 5, `第 ${lv.id} 关应为 4–5 色`);

    let innerWalls = 0;
    for (let r = 1; r < lv.rows.length - 1; r++) {
      for (let c = 1; c < lv.rows[0].length - 1; c++) if (lv.rows[r][c] === '#') innerWalls++;
    }
    assert.ok(innerWalls >= 3 && innerWalls <= 5, `第 ${lv.id} 关内墙应为 3–5 格，实际 ${innerWalls}`);

    // 首步：全部能在上限内通关；保持 par 的首步 2–8 个；至少一个错选被惩罚
    const firsts = genA(st0);
    const totals = firsts.map((m) => astarTotal(lv, m));
    assert.ok(totals.every((t) => t !== Infinity && t <= lv.limit), `第 ${lv.id} 关存在超出上限的首步`);
    const best = totals.filter((t) => t === lv.par).length;
    assert.ok(best >= 2 && best <= 8, `第 ${lv.id} 关保持 par 的首步应 2–8 个，实际 ${best}`);
    assert.ok(Math.max(...totals) > lv.par, `第 ${lv.id} 关至少应有一个首步被惩罚`);

    // 墙承重：第 50 关是三合一，拿掉内墙后仍被泊位/锚块/最后一对约束住，
    // #45（泊位）与 #49（最后一对）也由新增规则承重，par 可能不再下降；
    // 其余 S5 关仍要求墙承重。
    let noWalls = lv;
    for (let r = 1; r < lv.rows.length - 1; r++) {
      for (let c = 1; c < lv.rows[0].length - 1; c++) {
        if (lv.rows[r][c] === '#') noWalls = emptyCell(noWalls, r, c);
      }
    }
    if (lv.id === 50) {
      assert.equal(astarPar(noWalls), lv.par, '第 50 关拆墙后仍应可解，par 不变');
    } else if ((st0.berths && st0.berths.length) || st0.lastColor) {
      // #45 的泊位 / #49 的最后一对会把路线锁住：拆掉整组墙后 par 可能不再下降。
      // 这两关由新增规则承重，允许 noWalls == par，但不能比 par 更慢。
      assert.ok(astarPar(noWalls) <= lv.par, `第 ${lv.id} 关拆墙后 par 不应上升`);
    } else {
      assert.ok(astarPar(noWalls) < lv.par, `第 ${lv.id} 关拆掉整组墙后 par 必须下降`);
    }

    // 承重颜色
    if (lv.id === 50) {
      // 红、蓝各有一个泊位：拿掉整色后泊位永远停不满，比「par 下降」更强的不可解
      assert.equal(astarPar(removeColor(lv, 'A')), Infinity, '第 50 关拿掉红块后应无解（红泊位停不满）');
      assert.equal(astarPar(removeColor(lv, 'B')), Infinity, '第 50 关拿掉蓝块后应无解（蓝泊位停不满）');
      continue;
    }
    const berthColors = new Set((st0.berths || []).map((b) => b.color));
    let drop2 = 0;
    for (const v of colors) {
      if (lv.goal === 'color' && v === lv.targetColor) continue;
      const ch = String.fromCharCode(64 + v);
      if (berthColors.has(v)) {
        // 拿掉泊位色后泊位永远停不满：用小上限确认不可解，
        // 避免 800k 空搜把内存吃满。
        assert.equal(astarParCap(removeColor(lv, ch), 120000), Infinity, `第 ${lv.id} 关拿掉${['红', '蓝', '绿', '黄', '紫'][v - 1]}块后应无解（泊位停不满）`);
        continue;
      }
      const p = astarPar(removeColor(lv, ch));
      assert.notEqual(p, lv.par, `第 ${lv.id} 关${['红', '蓝', '绿', '黄', '紫'][v - 1]}块必须承重`);
      if (lv.par - p >= 2) drop2++;
    }
    if (lv.goal === 'clear') {
      assert.ok(drop2 >= 2, `第 ${lv.id} 关至少两种颜色拿掉后 par 降 ≥2 步，实际 ${drop2}`);
    }
  }
  assert.ok(tight >= 2, `S5 中至少 2 关应为 par+1（其余 par+2），实际 ${tight}`);
}

// ---- 4.24 第 50 关：三合一（锚块 + 泊位 + 最后一对） ----
{
  const lv = LEVELS.find((l) => l.id === 50);
  const st = parse(lv.rows);
  assert.equal(lv.id, 50);
  assert.equal(lv.name, '毕业考·三合一');
  assert.equal(lv.par, 10);
  assert.equal(countBlocks(st), 12);
  assert.equal(st.lastColor, 5, '第 50 关应把紫块标成最后一对');
  assert.deepEqual(
    st.berths,
    [
      { i: 11, color: 1 },
      { i: 29, color: 2 },
    ],
    '第 50 关应有一个红泊位（第 2 行第 5 列）和一个蓝泊位（第 5 行第 2 列）',
  );
  assert.equal(berthsLeft(st), 2);
  assert.equal(st.filled, 0);

  // 红锚块钉死；红块只能向右停进泊位
  assert.equal(isFixed(st, 2, 4), true, '第 3 行第 5 列的红块应是锚块');
  assert.equal(moveFrom(st, 2, 4, 'U'), null, '锚块拖不动');
  const toBerth = moveFrom(st, 1, 3, 'R');
  assert.ok(toBerth, '红块应能向右滑进泊位');
  assert.deepEqual(toBerth, { r: 1, c: 3, d: 'R', res: 'move', tr: 1, tc: 4 });

  const path = String(SOLUTIONS[50]).trim().split(/\s+/);
  let s = st;
  for (let i = 0; i < path.length; i++) {
    const m = /^(\d+),(\d+)([UDLR])$/.exec(path[i]);
    assert.ok(m, `第 50 关第 ${i + 1} 步格式不对：${path[i]}`);
    const mv = moveFrom(s, Number(m[1]) - 1, Number(m[2]) - 1, m[3]);
    assert.ok(mv, `第 50 关第 ${i + 1} 步（${path[i]}）应合法`);
    s = applyMove(s, mv);

    if (i === 1) {
      assert.equal(s.filled, 1, '第 2 步红块停进泊位后应打勾');
      assert.equal(berthsLeft(s), 1);
    }
    if (i === 2) {
      assert.equal(s.filled, 1, '红块离开泊位后，泊位完成状态应保留');
    }
    if (i === 3) {
      // 第一对紫块消掉后只剩两块紫，最后一对规则开始生效
      let purple = 0;
      for (const v of s.c) if (v === 5) purple++;
      assert.equal(purple, 2);
      assert.equal(moveFrom(s, 5, 4, 'R'), null, '还有别的颜色时，最后一对不能提前消');
      assert.equal(isLastPairBlocked(s, 5, 4, 'R'), true);
    }
  }
  assert.equal(berthsLeft(s), 0, '通关时两个泊位都应停好');
  assert.equal(s.filled, 3);
  assert.ok(isGoal(s, lv), '第 50 关应按最优解通关');

  // 棋盘清空但泊位没停，不算通关
  const noBerth = { ...s, filled: 0 };
  assert.equal(isGoal(noBerth, lv), false, '泊位没停好时不能通关');
}

// ---- 5. 关卡参数：par 必须等于最优解，且 par < 上限 ----
// 1–8 关用 src BFS 精确穷举；9 关起块数变多，改用已校准的 A*（路径仍在下面的
// 单关断言里用 src/game.js 逐步回放，保证"设计时能过 = 游戏里能过"）。
for (const lv of LEVELS) {
  const par = solveLevel(lv);
  assert.equal(par, lv.par, `第 ${lv.id} 关 par 应为 ${lv.par}，实际 ${par}`);
  assert.ok(lv.par <= lv.limit, `第 ${lv.id} 关 par 不应超过步数上限`);
  assert.ok(lv.limit - lv.par >= 1, `第 ${lv.id} 关需要留出容错步数`);

  // 方块只有颜色、没有字母：教学与提示文案不能出现 A–E 这种颜色代号
  assert.ok(
    !/[A-E]/.test(`${lv.teach}${lv.nudge}${lv.caution || ''}`),
    `第 ${lv.id} 关的 teach/nudge/caution 不能出现颜色代号 A–E，应写成"红/蓝/绿/黄/紫"`,
  );

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

// ---- 5b. 挑战关标记：只给 S5 里「保持 par 的首步 ≤6 且 par ≥9」的四关 ----
// 它只做进关前的预期管理（一句 caution + 选关页小旗），不改任何 par / limit。
const challengeIds = LEVELS.filter((lv) => lv.challenge).map((lv) => lv.id);
assert.deepEqual(
  challengeIds,
  [42, 47, 48, 50],
  `挑战关应恰好是 42/47/48/50，实际 ${challengeIds.join('/')}`,
);
for (const lv of LEVELS) {
  if (!lv.challenge) {
    assert.equal(lv.caution, undefined, `第 ${lv.id} 关未标挑战关，不应有 caution`);
    continue;
  }
  assert.equal(lv.stage, 5, `第 ${lv.id} 关标了挑战关，应属于 S5`);
  assert.ok(lv.par >= 9, `第 ${lv.id} 关标了挑战关，par 应 ≥9`);
  assert.ok(
    typeof lv.caution === 'string' && lv.caution.length >= 10 && lv.caution.length <= 40,
    `第 ${lv.id} 关的 caution 应是 10–40 字的一句话，实际 ${lv.caution}`,
  );
}

// ---- 5c. 最优解回放数据：每关都有走法，且严格按 par 步通关 ----
const solutionIds = Object.keys(SOLUTIONS)
  .map(Number)
  .sort((a, b) => a - b);
assert.deepEqual(
  solutionIds,
  LEVELS.map((lv) => lv.id),
  `SOLUTIONS 应覆盖全部 ${LEVELS.length} 关，实际 ${solutionIds.length} 关`,
);
for (const lv of LEVELS) {
  const tokens = String(SOLUTIONS[lv.id] || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  assert.equal(
    tokens.length,
    lv.par,
    `第 ${lv.id} 关回放应是 ${lv.par} 步，实际 ${tokens.length}`,
  );
  let st = parse(lv.rows);
  tokens.forEach((tok, i) => {
    const m = /^(\d+),(\d+)([UDLR])$/.exec(tok);
    assert.ok(m, `第 ${lv.id} 关第 ${i + 1} 步格式不对：${tok}`);
    const mv = moveFrom(st, Number(m[1]) - 1, Number(m[2]) - 1, m[3]);
    assert.ok(mv, `第 ${lv.id} 关第 ${i + 1} 步（${tok}）在当前局面走不动`);
    st = applyMove(st, mv);
    if (i + 1 < tokens.length) {
      assert.ok(!isGoal(st, lv), `第 ${lv.id} 关第 ${i + 1} 步就通关了，与 par 不符`);
    }
  });
  assert.ok(isGoal(st, lv), `第 ${lv.id} 关回放结束没有通关`);
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
  progress(`逐状态对拍 #${lv.id}`);
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

// ---- 7. 死局判定：par 内必可解、par-1 必无解（50 关交叉验证） ----
progress('死局判定：50 关 par / par-1 交叉验证');
{
  const opts = { maxNodes: 500000, maxMs: 8000 };
  for (const lv of LEVELS) {
    const start = parse(lv.rows);
    const yes = canStillWin(start, lv, lv.par, opts);
    assert.equal(yes.win, true, `第 ${lv.id} 关：par ${lv.par} 步内应可解`);
    assert.equal(yes.complete, true, `第 ${lv.id} 关：par 内的搜索应当算完`);
    const no = canStillWin(start, lv, lv.par - 1, opts);
    assert.equal(no.win, false, `第 ${lv.id} 关：par-1 步内不应有解`);
    assert.equal(no.complete, true, `第 ${lv.id} 关：par-1 的搜索应当算完`);
  }
}
progress('死局判定：50 关通过');

progress('所有断言通过，输出汇总');
console.log(
  `规则内核 OK：${LEVELS.length} 关 par = ${LEVELS.map((l) => l.par).join('/')}；` +
    `2/3/4 关最优首步唯一、第 5 关两条（先竖或先横）、第 6 关两条（先 C 或先 A）、第 7 关两条（先 B 或先 A）、第 8 关一条（先送蓝块下去）；` +
    `第 9 关两条（先动左边或右边的 C）、第 10 关两条（先 C 借墙或先 B 借 A）、第 11 关一条（先推右下 B）、第 12 关三条（先 B 借 A 或先 C 借墙）；` +
    `第 3 关不先推块 par 退化为 5、第 4 关不碰蓝块直接无解、第 5 关不碰蓝或绿都退化为 5；` +
    `第 6 关 13 个首步全部仍能在 10 步内通关，先动右上 B 退化为 8；` +
    `第 7 关 13 个首步全部仍能在 8 步内通关，拿掉任意一格墙 par 都退化为 6；` +
    `第 8 关 8 个首步全部仍能在 9 步内通关，只有先送蓝块下去能保持 6 步，锚块四个方向都拖不动且必须是最后一步被撞掉；` +
    `第 9–12 关所有首步都在上限内可通关；第 9、10、11、12 关拆掉整组墙后 par 分别降为 5/5/5/4；` +
    `第 13–18 关所有首步都在上限内可通关；第 13–18 关最优首步分别为 4/4/3/2/3/3 个，拆掉整组墙后 par 分别降为 7/5/6/6/6/7；` +
    `第 19–20 关所有首步都在上限内可通关；第 19 关 5 个最优首步、拆墙后 par 不变；第 20 关 3 个最优首步、拆整组墙后 par 降为 3；两关的非目标块拿掉后 par 都会变；` +
    `第 21–25 关所有首步都在上限内可通关，最优首步分别为 3/3/5/4/2 个，每种非目标色整色拿掉后 par 都变，拆整组墙后 par 分别降为 4/4/4/4/3；` +
    `第 26–30 关所有首步都在上限内可通关，最优首步分别为 4/3/4/5/3 个，每种非目标色整色拿掉后 par 都变，拆整组墙后 par 分别降为 4/4/4/5/4；第 30 关两颗红钉都拖不动、第 5/7 步被撞掉，红钉可动化后 par 仍是 7；` +
    `第 31–40 关所有首步都在上限内可通关，最优首步分别为 5/6/7/5/5/6/8/8/6/5 个；第 31–37 关与第 39、40 关每种颜色整色拿掉后 par 都变，第 38 关每种非目标色整色拿掉后 par 都变；拆整组墙后 par 分别降为 6/7/6/9/7/6/7/4/8/7；第 40 关两块黄块可动但提前消会被「最后一对」挡住，旧解第 6 步违规，新解 9 步且最后一步才消黄，关掉该规则后 par 仍是 9；` +
    `第 41–50 关（S5）全部在上限内可通关，par 分别为 9/9/8/7/9/9/10/9/10/10，最优首步 8/6/4/7/8/8/5/4/7/5 个；第 43、48 关为 par+1，第 45 关因首次引入泊位放宽到 par+3，其余为 par+2；第 41–49 关拆整组墙后 par 分别变为 7/8/4/3/9/7/9/4/9，第 50 关因泊位/锚块/最后一对仍被锁在 10；第 45 关新增紫色泊位、第 49 关紫色改为「最后一对」，两关 par 均不变；第 50 关红蓝各有一个泊位，拿掉红或蓝整色后泊位永远停不满（无解），红锚块拖不动、紫块在只剩一对时被「最后一对」挡住；` +
    `与 research 引擎对拍 ${compared} 个状态一致。`,
);