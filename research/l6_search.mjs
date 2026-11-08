// 临时脚本：第 6 关「双通道」——只看"单格缺口 / 缺口在中"两种强结构，按"跨井配对"打分
import { parse, legalMoves, applyMove, isGoal, countBlocks, at } from '../src/game.js';

const key = (s) => s.c.join(',');

function bfsPar(start, lv, cap, nodeCap = 250000) {
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

const TEMPLATES = {
  '单格缺口': [[1, 3], [2, 3], [4, 3], [5, 3]],
  '缺口在中': [[2, 3], [3, 3], [4, 3]],
  '双缺口': [[1, 3], [3, 3], [5, 3]],
};

const COLORS = ['A', 'A', 'B', 'B', 'C', 'C'];
const cfg = { tries: Number(process.argv[2] || 500), seed: Number(process.argv[3] || 62) };
const rand = rng(cfg.seed);

const out = [];

for (const [tname, walls] of Object.entries(TEMPLATES)) {
  const g0 = Array.from({ length: 7 }, (_, r) =>
    Array.from({ length: 7 }, (_, c) =>
      r === 0 || c === 0 || r === 6 || c === 6 ? '#' : '.',
    ),
  );
  for (const [r, c] of walls) g0[r][c] = '#';
  const free = [];
  for (let r = 1; r <= 5; r++) for (let c = 1; c <= 5; c++) if (g0[r][c] === '.') free.push([r, c]);

  let par6 = 0;
  const best = [];
  for (let t = 0; t < cfg.tries; t++) {
    const pick = shuffle(free.slice(), rand).slice(0, 6);
    const colors = shuffle(COLORS.slice(), rand);
    const g = g0.map((row) => row.slice());
    pick.forEach(([r, c], i) => { g[r][c] = colors[i]; });
    const rows = g.map((row) => row.join(''));
    const lv = { rows, goal: 'clear', targetColor: null };
    const st0 = parse(rows);
    if (countBlocks(st0) !== 6) continue;
    if (bfsPar(st0, lv, 6) !== 6) continue;
    par6++;

    const firsts = legalMoves(st0).map((m) => ({ m, d: 1 + bfsPar(applyMove(st0, m), lv, 5) }));
    const opt = firsts.filter((x) => x.d === 6);
    const popAtStart = firsts.filter((x) => x.m.res === 'pop').length;
    const punished = firsts.filter((x) => x.d >= 7).length;

    // 跨井配对：某颜色的两块分别落在缺口左右
    const byColor = { A: [], B: [], C: [] };
    for (let r = 1; r <= 5; r++) for (let c = 1; c <= 5; c++) {
      const v = at(st0, r, c);
      if (v > 0) byColor[String.fromCharCode(64 + v)].push([r, c]);
    }
    let split = 0;
    for (const list of Object.values(byColor)) {
      if (list.length === 2) {
        const side = (c) => (c < 3 ? -1 : c > 3 ? 1 : 0);
        if (side(list[0][1]) * side(list[1][1]) < 0) split++;
      }
    }

    const score =
      (popAtStart === 0 ? 4 : 0) +
      (opt.length >= 2 && opt.length <= 4 ? 3 : opt.length === 1 ? 1 : 0) +
      Math.min(punished, 8) +
      split * 2;
    best.push({ rows, opt, popAtStart, punished, split, score, firsts });
  }
  best.sort((a, b) => b.score - a.score || a.opt.length - b.opt.length);
  console.log(`${tname}: par6=${par6}/${cfg.tries}, top score ${best[0]?.score ?? '-'}`);
  for (const c of best.slice(0, 4)) out.push({ tname, ...c });
}

out.sort((a, b) => b.score - a.score || a.opt.length - b.opt.length);
for (const c of out.slice(0, 10)) {
  console.log(
    `\n=== ${c.tname} | score ${c.score} | 最优首步 ${c.opt.length} | 开局可消 ${c.popAtStart} | 掉星 ${c.punished} | 跨井对 ${c.split} ===`,
  );
  c.rows.forEach((r) => console.log('  ' + r));
  console.log('  opt: ' + c.opt.map((x) => `${x.m.r},${x.m.c}${x.m.d}`).join(' | '));
  console.log('  firsts: ' + c.firsts.map((x) => `${x.m.r},${x.m.c}${x.m.d}${x.m.res === 'pop' ? '*' : ''}:${x.d}`).join(' '));
}