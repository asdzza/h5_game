// S4 单盘面终检：par / 首步 / 顺序压力 / 整色载荷 / 墙载荷
//
// 用法（7 行棋盘，外圈必须是墙）：
//   node research/s4_check.mjs --goal clear --par 10 --limit 12 "#A.D#B#" "#.#C..#" "#D....#" "#C..EE#" "#.BA.##"
//   node research/s4_check.mjs --goal color --target 1 --par 7 --limit 9 "#AAA.C#" "#.B..D#" "#A#.#A#" "#..B.D#" "#.#.AC#"
//
// 说明：
//   - goal=clear 时检查每种颜色整色拿掉后的 par（每种颜色都应承重）。
//   - goal=color 时只检查非目标色整色拿掉后的 par。
//   - 顺序压力：沿最优路径回放，若某一步有 ≥2 个可消对，且其中至少一个
//     不是最优选择（总步数更大），记一个耦合点。
//   - 墙载荷按「整组承重 + 最优解有墙停」验收，不要求每格单独有用。
import { analyze, gateChecks } from './s4_core.mjs';

const argv = process.argv.slice(2);
const opts = { goal: 'clear', target: null, par: null, limit: null, rows: [] };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const next = () => argv[++i];
  if (a === '--goal') opts.goal = next();
  else if (a === '--target') opts.target = Number(next());
  else if (a === '--par') opts.par = Number(next());
  else if (a === '--limit') opts.limit = Number(next());
  else if (a.startsWith('--')) throw new Error(`未知参数 ${a}`);
  else opts.rows.push(a);
}
if (opts.rows.length < 5) throw new Error('至少需要 5 行棋盘');
if (opts.goal !== 'clear' && opts.goal !== 'color') throw new Error('--goal 只能是 clear 或 color');
if (opts.goal === 'color' && !(opts.target >= 1 && opts.target <= 5)) {
  throw new Error('--goal color 时必须给 --target 1..5');
}

const CAP = Number(process.env.S4_NODES || 2000000);
const rows = opts.rows.length === 5
  ? ['#######', ...opts.rows, '#######']
  : opts.rows;
if (rows.length !== 7 || rows.some((r) => r.length !== 7)) {
  throw new Error('棋盘必须是 7×7（可以省略上下外框）');
}

const a = analyze(rows, {
  goal: opts.goal,
  target: opts.goal === 'color' ? opts.target : null,
  limit: opts.limit,
  cap: CAP,
});
if (!a.ok) throw new Error(a.reason);

console.log(
  `rows=${a.H}x${a.W} goal=${a.goal}${a.target ? ` target=${a.targetCh}` : ''} ` +
    `par=${a.par}${opts.limit != null ? ` limit=${opts.limit}` : ''} blocks=${a.blocks} colors=${a.colors.length} walls=${a.walls.length}`,
);
for (const row of rows) console.log('  ' + row);
console.log('最优路径：');
for (const line of a.pathText) console.log(`  ${line}`);

console.log(
  `\n首步 ${a.firstCount}（保持 par ${a.best}，走错 ${a.firstCount - a.best}，` +
    `最差 ${a.worst === Infinity ? 'X' : a.worst}${opts.limit != null ? `，超上限 ${a.overLimit}` : ''}）| 开局现成对 ${a.openPops}`,
);
console.log(`顺序压力 ${a.pressure.length} 个耦合点`);
for (const p of a.pressure) {
  console.log(
    `  第 ${p.step} 步：${p.pops} 个可消对，${p.punished} 个错选被惩罚` +
      `（剩余最优 ${p.remain}，候选总步 ${p.totals.join('/')}）`,
  );
}
const loadText = Object.entries(a.loads)
  .map(([c, p]) => `${c}→${p === Infinity ? 'X' : p}${p < a.par ? `(-${a.par - p})` : ''}`)
  .join(' ');
console.log(`整色载荷 ${loadText || '无'}`);
console.log(
  `逐墙 ${a.perWall.map((x) => `${x.cell}→${x.par === Infinity ? 'X' : x.par}`).join(' ')} | ` +
    `拆整组→${a.noWallsPar === Infinity ? 'X' : a.noWallsPar}`,
);
console.log(
  `最优路径停靠：墙停 ${a.stops.wall} / 块停 ${a.stops.block} / 边停 ${a.stops.edge} / 消除 ${a.stops.pop}`,
);

const checks = gateChecks(a, { par: opts.par == null ? a.par : opts.par, limit: opts.limit });
console.log('\n判定：');
for (const [name, ok, detail] of checks) console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${name}（${detail}）`);
console.log(`  => ${checks.every(([, ok]) => ok) ? 'PASS' : 'FAIL'}`);
if (!checks.every(([, ok]) => ok)) process.exitCode = 1;