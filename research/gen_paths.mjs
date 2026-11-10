// 为 50 关生成「最优解回放」用的走法序列，写进 src/solutions.js。
//
// 用法：
//   node research/gen_paths.mjs            # 生成并覆写 src/solutions.js
//   node research/gen_paths.mjs --check    # 只校验现有文件，不写盘
//   S4_NODES=3000000 node research/gen_paths.mjs
//
// 为什么会话里有这一份数据：关卡说明（nudge）是给人读的中文散文，前 33 关用的是
// 「左上角的红块」这类相对描述，没法稳定解析成坐标；回放需要机器可读的走法。
import { writeFileSync } from 'node:fs';
import { LEVELS } from '../src/levels.js';
import { parse, moveFrom, applyMove, isGoal, countBlocks } from '../src/game.js';
import { parse as rParse } from './engine.mjs';
import { aStar } from './solver_fast.mjs';

const CAP = Number(process.env.S4_NODES || 3000000);
const CHECK = process.argv.includes('--check');
const DIR_NAME = { U: '上', D: '下', L: '左', R: '右' };

function encode(path) {
  return path
    .map((p) => `${p.move.r + 1},${p.move.c + 1}${p.move.d}`)
    .join(' ');
}

// 用 src 规则逐步回放，确认「回放能过 = 玩家照着点也能过」
function verify(lv, str) {
  const moves = str
    ? str.split(/\s+/).map((t) => {
        const m = /^(\d+),(\d+)([UDLR])$/.exec(t);
        return m ? { r: +m[1] - 1, c: +m[2] - 1, d: m[3] } : null;
      })
    : [];
  if (moves.some((m) => !m)) return '格式错误';
  let st = parse(lv.rows);
  for (let i = 0; i < moves.length; i++) {
    const mv = moves[i];
    const found = moveFrom(st, mv.r, mv.c, mv.d);
    if (!found) return `第 ${i + 1} 步非法（第${mv.r + 1}行第${mv.c + 1}列向${DIR_NAME[mv.d]}）`;
    st = applyMove(st, found);
  }
  if (!isGoal(st, lv)) return `回放结束未通关（剩 ${countBlocks(st)} 块）`;
  if (moves.length !== lv.par) return `步数 ${moves.length} ≠ par ${lv.par}`;
  return null;
}

const lines = [];
let failed = 0;
let total = 0;

for (const lv of LEVELS) {
  const t0 = Date.now();
  const res = aStar(rParse(lv.rows), 'A', CAP, lv.goal === 'color' ? { targetColor: lv.targetColor } : {});
  total++;
  if (!res) {
    console.log(`#${lv.id} ${lv.name}  求解失败（cap=${CAP}）`);
    failed++;
    continue;
  }
  if (res.len !== lv.par) {
    console.log(`#${lv.id} ${lv.name}  最优步数 ${res.len} ≠ par ${lv.par}`);
    failed++;
    continue;
  }
  const str = encode(res.path);
  const err = verify(lv, str);
  if (err) {
    console.log(`#${lv.id} ${lv.name}  校验失败：${err}`);
    failed++;
    continue;
  }
  console.log(`#${lv.id} ${lv.name}  ${res.len} 步  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  lines.push(`  ${lv.id}: '${str}',`);
}

if (failed) {
  console.log(`failed=${failed}/${total}，未写盘`);
  process.exit(1);
}

const body = `// 最优解走法，供结算页的「看最优解回放」使用。
// 由 research/gen_paths.mjs 生成；tools/test_rules.mjs 会逐关回放校验（长度 = par、每步合法、终局通关）。
// 格式：'行,列方向'，行列从 1 开始、方向 U/D/L/R，按空格分隔、按顺序执行。
export const SOLUTIONS = {
${lines.join('\n')}
};
`;

if (CHECK) {
  console.log(`校验通过 ${lines.length}/${total} 关（--check 未写盘）`);
} else {
  writeFileSync(new URL('../src/solutions.js', import.meta.url), body, 'utf8');
  console.log(`已写入 src/solutions.js（${lines.length} 关）`);
}