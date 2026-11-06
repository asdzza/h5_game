import { parse, analyze, solvePath, playGreedy, playRandom, neighbors, isGoal, key } from './engine.mjs';

// 限定步数内的随机通关率：衡量“乱滑是否能过关”
export function randomWinWithin(start, ruleset, budget, trials = 400, rnd = Math.random) {
  let wins = 0;
  for (let t = 0; t < trials; t++) {
    let st = start;
    for (let s = 0; s < budget; s++) {
      if (isGoal(st, ruleset)) { wins++; break; }
      const nb = neighbors(st, ruleset);
      if (!nb.length) break;
      st = nb[Math.floor(rnd() * nb.length)].state;
      if (isGoal(st, ruleset)) { wins++; break; }
    }
  }
  return wins / trials;
}

const A = {
  'A1': ['#####', '#A.A#', '#...#', '#B.B#', '#####'],
  'A4': ['#######', '#A...#', '#.##..#', '#..B..#', '#..#.A#', '#B....#', '#######'],
  'A6': ['######', '#A..B#', '#.#..#', '#C.A.#', '#.#..#', '#B..C#', '######'],
};

console.log('--- 方案A：不同步数预算下的乱滑通关率 ---');
for (const [n, rows] of Object.entries(A)) {
  const st = parse(rows);
  const m = analyze(st, 'A');
  const line = [`${n} 最短=${m.minMoves}`, `状态=${m.states}`, `开局可消对=${m.pops0}`, `不可解=${m.unwinnable}`];
  for (const b of [m.minMoves, m.minMoves + 1, m.minMoves + 2, m.minMoves + 4, m.minMoves * 2, 40]) {
    line.push(`预算${b}:${(randomWinWithin(st, 'A', b) * 100).toFixed(0)}%`);
  }
  console.log(line.join('  '));
}

const B = {
  'B1': ['#####', '#AA..#', '#....#', '#..BB#', '#####'],
  'B2': ['######', '#AA.B#', '#....#', '#CC.B#', '######'],
  'B3': ['######', '#A..A#', '#.B..#', '#C..B#', '#.C..#', '######'],
};
console.log('\n--- 方案B：同色齐动 ---');
for (const [n, rows] of Object.entries(B)) {
  const st = parse(rows);
  const m = analyze(st, 'B', 400000);
  const p = solvePath(st, 'B', 400000);
  console.log(`${n} 可解=${m.solvable} 最短=${m.minMoves} 状态=${m.states} 分支=${m.branch0} 不可解=${m.unwinnable} 死局=${m.deadEnd} 最优首步=${m.optFirst} 随机=${(randomWinWithin(st, 'B', 30) * 100).toFixed(0)}%`);
  if (p) console.log('   解:', p.map(x => `${String.fromCharCode(64 + x.move.color)}${x.move.d}`).join(' '));
}