// S4 批量终检：直接读 src/levels.js，对 31–40 逐关跑 A–H。
//
// 用法：
//   node research/s4_batchcheck.mjs            # 31 到最后一关
//   node research/s4_batchcheck.mjs --from 31 --to 40
//
// 环境变量：
//   S4_NODES  A* 节点上限（默认 2000000）
import { LEVELS } from '../src/levels.js';
import { analyze, gateChecks } from './s4_core.mjs';

const argv = process.argv.slice(2);
let from = 31;
let to = 40;
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
      `首步 ${a.firstCount}（保持 ${a.best}，最差 ${a.worst}）压力 ${a.pressure.length} ` +
      `墙停 ${a.stops.wall} 块停 ${a.stops.block} 拆墙 ${a.noWallsPar}`,
  );
  if (!ok) {
    for (const [name, pass, detail] of checks.filter(([, pass]) => !pass)) {
      console.log(`    FAIL ${name}（${detail}）`);
    }
  }
}

console.log(`\nS4 checked=${checked} failed=${failed}`);
if (failed) process.exitCode = 1;