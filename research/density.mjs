import { parse, neighbors, countBlocks, colorsPresent } from './engine.mjs';
import { LEVELS } from './levels_seed.mjs';

// 对一个状态，统计“合法走法中有多少会直接减少方块数”
function progressDensity(st, ruleset) {
  const nb = neighbors(st, ruleset);
  if (!nb.length) return null;
  const before = countBlocks(st);
  const merges = nb.filter(n => countBlocks(n.state) < before).length;
  return { moves: nb.length, progress: merges, rate: merges / nb.length };
}

console.log('方案A 精选关卡：合法走法中的“直接消除”比例（开局）');
let sum = 0, cnt = 0;
for (const lv of LEVELS) {
  const st = parse(lv.rows);
  const d = progressDensity(st, 'A');
  if (!d) continue;
  sum += d.rate; cnt++;
  console.log(`  #${lv.id} ${lv.name}: ${d.progress}/${d.moves} = ${(d.rate * 100).toFixed(0)}%`);
}
console.log(`  平均 ${(sum / cnt * 100).toFixed(1)}%`);

const B = [
  ['B1', ['#######', '#AA...#', '#.....#', '#.....#', '#..BB.#', '#.....#', '#######']],
  ['B2', ['#######', '#A.B.A#', '#.....#', '#C...C#', '#.....#', '#..B..#', '#######']],
  ['B3', ['#######', '#A..A.#', '#.....#', '#A....#', '#..B..#', '#...B.#', '#######']],
];
console.log('\n方案B：合法走法中的“直接合并”比例（开局）');
let sb = 0;
for (const [n, rows] of B) {
  const st = parse(rows);
  const d = progressDensity(st, 'B');
  sb += d.rate;
  console.log(`  ${n}: ${d.progress}/${d.moves} = ${(d.rate * 100).toFixed(0)}%`);
}
console.log(`  平均 ${(sb / B.length * 100).toFixed(1)}%`);

// 整局平均：沿最优解路径逐步统计
console.log('\n沿最优解全过程的平均比例（A）');
let all = 0, c2 = 0;
for (const lv of LEVELS) {
  const st = parse(lv.rows);
  const { aStar } = await import('./solver_fast.mjs');
  const tc = lv.goal === 'color' ? lv.targetColor : null;
  const r = aStar(st, 'A', 300000, { targetColor: tc });
  if (!r) continue;
  let s = st, acc = 0, n = 0;
  for (const p of r.path) {
    const d = progressDensity(s, 'A');
    if (d) { acc += d.rate; n++; }
    s = p.after;
  }
  all += acc / n; c2++;
  console.log(`  #${lv.id}: ${(acc / n * 100).toFixed(0)}%  (合法走法均值 ${(neighbors(st,'A').length)})`);
}
console.log(`  全过程平均 ${(all / c2 * 100).toFixed(1)}%`);