import { parse, genB, applyB, key, toRows, neighbors, isGoal, colorsPresent, countBlocks } from './engine.mjs';

const rows = ['######', '#A..A#', '#.B..#', '#C..B#', '#.C..#', '######'];
let st = parse(rows);
console.log('初始'); console.log(toRows(st).join('\n'));

// BFS 直到找到“无可行步但未完成”的状态
const seen = new Set([key(st)]);
const q = [st];
let found = null;
while (q.length && !found) {
  const s = q.shift();
  const nb = neighbors(s, 'B');
  if (nb.length === 0 && !isGoal(s, 'B')) { found = s; break; }
  for (const n of nb) {
    const k = key(n.state);
    if (!seen.has(k)) { seen.add(k); q.push(n.state); }
    if (q.length > 200000) break;
  }
}
if (found) {
  console.log('\n发现冻结状态:');
  console.log(toRows(found).join('\n'));
  console.log('剩余方块', countBlocks(found), '颜色', [...colorsPresent(found)]);
}

// 统计：随机游走 30 步中出现冻结的比例、平均每步可选分支
let freeze = 0, trials = 300, branchSum = 0, steps = 0;
for (let t = 0; t < trials; t++) {
  let s = parse(rows);
  for (let i = 0; i < 30; i++) {
    if (isGoal(s, 'B')) break;
    const nb = neighbors(s, 'B');
    branchSum += nb.length; steps++;
    if (!nb.length) { freeze++; break; }
    s = nb[Math.floor(Math.random() * nb.length)].state;
  }
}
console.log(`\n随机游走: 冻结率=${(freeze / trials * 100).toFixed(1)}%  平均分支=${(branchSum / steps).toFixed(1)}`);