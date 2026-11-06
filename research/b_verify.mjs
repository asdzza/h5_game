import { parse, playGreedy, toRows, countBlocks } from './engine.mjs';
import { aStar } from './solver_fast.mjs';

const fmt = (m) => `${String.fromCharCode(64 + m.color)}${m.d}`;

const B = [
  {
    name: 'B1 指挥红队', rows: [
      '#######',
      '#AA...#',
      '#.....#',
      '#.....#',
      '#..BB.#',
      '#.....#',
      '#######',
    ],
  },
  {
    name: 'B2 中间隔着蓝', rows: [
      '#######',
      '#A.B.A#',
      '#.....#',
      '#C...C#',
      '#.....#',
      '#..B..#',
      '#######',
    ],
  },
  {
    name: 'B3 三块怎么合', rows: [
      '#######',
      '#A..A.#',
      '#.....#',
      '#A....#',
      '#..B..#',
      '#...B.#',
      '#######',
    ],
  },
];

for (const lv of B) {
  const st = parse(lv.rows);
  const r = aStar(st, 'B', 400000);
  console.log(`\n=== ${lv.name} | blocks=${countBlocks(st)} ===`);
  console.log(toRows(st).join('\n'));
  if (!r) { console.log('  UNSOLVED'); continue; }
  const g = playGreedy(st, 'B', 40);
  console.log(`  par=${r.len}  greedy=${g.win ? g.steps : 'FAIL'}  expanded=${r.expanded}`);
  console.log('  ' + r.path.map(p => fmt(p.move)).join(' -> '));
  // 打印首步之后几步的棋面，便于检查
  for (const p of r.path.slice(0, 3)) {
    console.log('  after ' + fmt(p.move));
    console.log(toRows(p.after).map(l => '    ' + l).join('\n'));
  }
}