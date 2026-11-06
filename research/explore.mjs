import { parse, analyze, solvePath, playGreedy, playRandom, toRows } from './engine.mjs';

const boards = {
  'A1 两对 5x5': [
    '#####',
    '#A.A#',
    '#...#',
    '#B.B#',
    '#####',
  ],
  'A2 错位+清障': [
    '#######',
    '#A.B..#',
    '#.....#',
    '#..B.A#',
    '#######',
  ],
  'A3 四色 6x6': [
    '#######',
    '#A..B.#',
    '#.#.#.#',
    '#C..D.#',
    '#.#.#.#',
    '#B..A.#',
    '#######',
  ],
  'A4 6x6 带内墙': [
    '#######',
    '#A...#',
    '#.##..#',
    '#..B..#',
    '#..#.A#',
    '#B....#',
    '#######',
  ],
  'A5 6x7 三色': [
    '#######',
    '#A..B.#',
    '#.#...#',
    '#C..A.#',
    '#...#.#',
    '#B..C.#',
    '#######',
  ],
};

for (const [name, rows] of Object.entries(boards)) {
  const st = parse(rows);
  const t0 = Date.now();
  const m = analyze(st, 'A');
  const dt = Date.now() - t0;
  const path = solvePath(st, 'A');
  const g = playGreedy(st, 'A');
  const r = playRandom(st, 'A', 300);
  console.log(`=== ${name}  (${dt}ms)`);
  console.log(`  可解=${m.solvable} 最短=${m.minMoves}步 开局分支=${m.branch0} 可消对=${m.pops0} 最优首步数=${m.optFirst}`);
  console.log(`  可达状态=${m.states} 不可解状态=${m.unwinnable} 无可行步状态=${m.deadEnd} 无对可消状态=${m.noPop}`);
  console.log(`  贪心=${g.win ? '过' : '卡'}(${g.steps}步) 随机胜率=${(r * 100).toFixed(1)}%`);
  if (path) {
    console.log('  最短解:', path.map(p => p.move.res === 'pop'
      ? `pop(${p.move.r},${p.move.c})->(${p.move.br},${p.move.bc})`
      : `(${p.move.r},${p.move.c})${p.move.d}->(${p.move.tr},${p.move.tc})`).join('  '));
  }
}