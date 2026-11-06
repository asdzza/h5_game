import { parse, analyze, solvePath, toRows, playGreedy, countBlocks, isGoal, neighbors } from './engine.mjs';

export function randomWinWithin(start, ruleset, budget, trials = 600, rnd = Math.random) {
  let wins = 0;
  for (let t = 0; t < trials; t++) {
    let st = start;
    for (let s = 0; s < budget; s++) {
      if (isGoal(st, ruleset)) { wins++; break; }
      const nb = neighbors(st, ruleset);
      if (!nb.length) break;
      st = nb[Math.floor(rnd() * nb.length)].state;
    }
    if (isGoal(st, ruleset)) wins++;
  }
  return Math.min(1, wins / trials);
}

export function show(name, rows, opts = {}) {
  const st = parse(rows);
  const m = analyze(st, 'A', 400000);
  const path = solvePath(st, 'A', 400000);
  const g = playGreedy(st, 'A', 60);
  const pops = path ? path.filter(p => p.move.res === 'pop').length : 0;
  console.log(`\n===== ${name} =====`);
  console.log(toRows(st).join('\n'));
  console.log(`可解=${m.solvable} 最短=${m.minMoves} 方块=${countBlocks(st)} 消除数=${pops} 铺垫步=${path ? path.length - pops : '-'}`);
  console.log(`开局分支=${m.branch0} 状态数=${m.states} 不可解状态=${m.unwinnable} 冻结=${m.deadEnd}`);
  if (m.minMoves) {
    console.log(`乱滑@par=${(randomWinWithin(st, 'A', m.minMoves) * 100).toFixed(0)}%  @par+1=${(randomWinWithin(st, 'A', m.minMoves + 1) * 100).toFixed(0)}%  @par+2=${(randomWinWithin(st, 'A', m.minMoves + 2) * 100).toFixed(0)}%`);
  }
  console.log(`贪心策略: ${g.win ? '过 ' + g.steps + '步' : '失败'}`);
  if (path) {
    console.log('解法:');
    for (const p of path) {
      const mv = p.move;
      const name2 = mv.res === 'pop'
        ? `撞(${mv.r},${mv.c})→(${mv.br},${mv.bc})`
        : `滑(${mv.r},${mv.c})${mv.d}→(${mv.tr},${mv.tc})`;
      console.log('  ' + name2);
    }
    if (opts.trace) {
      let s = st;
      for (const p of path) {
        s = p.after;
        console.log(toRows(s).map(r => '    ' + r).join('\n'));
      }
    }
  }
  return { m, path, g };
}

// ---- 候选：教学三关 ----
show('L1 一碰就消', [
  '#######',
  '#.....#',
  '#.A.A.#',
  '#.....#',
  '#..B..#',
  '#..B..#',
  '#######',
]);

show('L2 挡路的先清掉', [
  '#######',
  '#.....#',
  '#A.B.A#',
  '#.....#',
  '#..B..#',
  '#.....#',
  '#######',
]);

show('L3 借位停靠', [
  '#########',
  '#.......#',
  '#.A.....#',
  '#.......#',
  '#.....A.#',
  '#...B...#',
  '#.....B.#',
  '#########',
]);