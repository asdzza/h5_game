// S5 批量终检：直接读 src/levels.js，对 41–50 逐关跑 A–I。
//
// 用法：
//   node research/s5_batchcheck.mjs
//   node research/s5_batchcheck.mjs --from 41 --to 45
//
// 环境变量：
//   S4_NODES  A* 节点上限（默认 2000000）
import { LEVELS } from '../src/levels.js';
import { analyze, gateChecks } from './s4_core.mjs';

const argv = process.argv.slice(2);
let from = 41;
let to = 50;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--from') from = Number(argv[++i]);
  else if (argv[i] === '--to') to = Number(argv[++i]);
  else throw new Error(`未知参数 ${argv[i]}`);
}

const CAP = Number(process.env.S4_NODES || 2000000);
let failed = 0;
let checked = 0;

for (const lv of LEVELS) {
  if (lv.id < from || lv.id > to) continue;
  checked++;
  const target = lv.goal === 'color' ? lv.targetColor : null;
  const a = analyze(lv.rows, { goal: lv.goal, target, limit: lv.limit, cap: CAP });
  if (!a.ok) {
    failed++;
    console.log(`#${lv.id} ${lv.name}  FAIL  ${a.reason}`);
    continue;
  }

  const checks = gateChecks(a, { par: lv.par, limit: lv.limit });
  const colors = new Set(lv.rows.join('').replace(/[^A-E]/g, '')).size;
  const slack = lv.limit - lv.par;
  checks.push(['上限只多 1–2 步', slack === 1 || slack === 2, `limit-par=${slack}`]);
  checks.push(['块数 10–12', a.blocks >= 10 && a.blocks <= 12, `${a.blocks} 块`]);
  checks.push(['颜色 4–5 色', colors >= 4 && colors <= 5, `${colors} 色`]);
  checks.push(['内墙 3–5 格', a.walls.length >= 3 && a.walls.length <= 5, `${a.walls.length} 格`]);
  checks.push(['最优解至少一次墙停', a.stops.wall >= 1, `${a.stops.wall} 次`]);
  if (lv.goal === 'clear') {
    const drop2 = Object.values(a.loads).filter((p) => a.par - p >= 2).length;
    checks.push(['至少两种颜色降 ≥2 步', drop2 >= 2, `${drop2} 种`]);
  } else {
    let targetCount = 0;
    for (const ch of lv.rows.join('')) if (ch === a.targetCh) targetCount++;
    checks.push(['目标色块数为偶数', targetCount > 0 && targetCount % 2 === 0, `${targetCount} 块`]);
  }
  const ok = checks.every(([, pass]) => pass);
  if (!ok) failed++;

  console.log(
    `#${lv.id} ${lv.name}  ${ok ? 'PASS' : 'FAIL'}  par ${a.par}/${lv.par} ` +
      `上限 ${lv.limit} 首步 ${a.firstCount}（保持 ${a.best}，最差 ${a.worst}）压力 ${a.pressure.length} ` +
      `墙停 ${a.stops.wall} 块停 ${a.stops.block} 拆墙 ${a.noWallsPar}`,
  );
  if (!ok) {
    for (const [name, pass, detail] of checks.filter(([, pass]) => !pass)) {
      console.log(`    FAIL ${name}（${detail}）`);
    }
  }
}

console.log(`\nS5 checked=${checked} failed=${failed}`);
if (failed) process.exitCode = 1;