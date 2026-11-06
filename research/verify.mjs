import { parse, playGreedy, neighbors, countBlocks } from './engine.mjs';
import { aStar } from './solver_fast.mjs';
import { LEVELS } from './levels_seed.mjs';
import fs from 'fs';
import { fileURLToPath } from 'url';

const win = (st, tc) => {
  if (tc != null) { for (let i = 0; i < st.c.length; i++) if (st.c[i] === tc) return false; return true; }
  return countBlocks(st) === 0;
};
// 固定种子的伪随机，保证每次复跑得到同一组数值（可复算）
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randWin(start, budget, tc, seed, trials = 1000) {
  const rnd = mulberry32(seed);
  let w = 0;
  for (let t = 0; t < trials; t++) {
    let st = start;
    for (let s = 0; s < budget; s++) {
      if (win(st, tc)) { w++; break; }
      const nb = neighbors(st, 'A');
      if (!nb.length) break;
      st = nb[Math.floor(rnd() * nb.length)].state;
    }
    if (win(st, tc)) w++;
  }
  return Math.min(1, w / trials);
}

const fmt = (m) => m.res === 'pop' ? `POP (${m.r},${m.c})${m.d} x (${m.br},${m.bc})` : `SLD (${m.r},${m.c})${m.d} -> (${m.tr},${m.tc})`;

const report = [];
let fail = 0;
for (const lv of LEVELS) {
  const st = parse(lv.rows);
  const tc = lv.goal === 'color' ? lv.targetColor : null;
  const r = aStar(st, 'A', 300000, { targetColor: tc });
  if (!r) { console.log(`#${lv.id} ${lv.name}: UNSOLVED`); fail++; continue; }
  const pops = r.path.filter(p => p.move.res === 'pop').length;
  const greedy = playGreedy(st, 'A', 90);
  const rand = randWin(st, r.len, tc, lv.id * 7919 + 13);
  const mid = r.path.filter(p => p.move.res === 'move' && p.move.tr !== 1 && p.move.tr !== st.h - 2 && p.move.tc !== 1 && p.move.tc !== st.w - 2).length;
  report.push({ id: lv.id, stage: lv.stage, name: lv.name, goal: lv.goal, colors: lv.goal === 'color' ? lv.targetColor : null, par: r.len, limit: r.len + lv.slack, blocks: countBlocks(st), pops, staging: r.len - pops, midStops: mid, greedy: greedy.win ? greedy.steps : -1, rand: +(rand * 100).toFixed(0), expanded: r.expanded, rows: lv.rows, sol: r.path.map(p => fmt(p.move)) });
  console.log(`#${String(lv.id).padStart(2)} p${lv.stage} ${lv.name} | par=${r.len} limit=${r.len + lv.slack} blocks=${countBlocks(st)} pops=${pops} stage=${r.len - pops} mid=${mid} greedy=${greedy.win ? greedy.steps : 'FAIL'} rand@par=${(rand * 100).toFixed(0)}% exp=${r.expanded}`);
  console.log('    ' + r.path.map(p => fmt(p.move)).join(' '));
}
console.log(`\nlevels=${LEVELS.length} failed=${fail}`);
const OUT = fileURLToPath(new URL('./levels_report.json', import.meta.url));
fs.writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');
console.log(`wrote ${OUT}`);