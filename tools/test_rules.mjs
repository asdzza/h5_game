// 规则内核自测：与 research/engine.mjs 逐状态对照，确保"设计时能过 = 游戏里能过"。
import assert from 'node:assert/strict';
import {
  parse,
  legalMoves,
  moveFrom,
  applyMove,
  isGoal,
  countBlocks,
  at,
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
  `规则内核 OK：7 关 par = ${LEVELS.map((l) => l.par).join('/')}；` +
    `2/3/4 关最优首步唯一、第 5 关两条（先竖或先横）、第 6 关两条（先 C 或先 A）、第 7 关两条（先 B 或先 A）；` +
    `第 3 关不先推块 par 退化为 5、第 4 关不碰蓝块直接无解、第 5 关不碰蓝或绿都退化为 5；` +
    `第 6 关 13 个首步全部仍能在 10 步内通关，先动右上 B 退化为 8；` +
    `第 7 关 13 个首步全部仍能在 8 步内通关，拿掉任意一格墙 par 都退化为 6；` +
    `与 research 引擎对拍 ${compared} 个状态一致。`,
);