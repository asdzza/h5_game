// S5 定稿：从 s5_found/*.json 里挑盘面，复验后写进 src/levels.js。
//
// 用法：
//   node research/s5_insert.mjs            # 只复验并打印
//   node research/s5_insert.mjs --write    # 复验通过后追加到 src/levels.js
//
// 复验内容：A–H 门槛 + S5 额外门槛（上限 +1/+2、10–12 块、3–5 墙、墙停 ≥1、
// 清场关至少两色降 ≥2 步）。任何一关不过就整体不写。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEVELS } from '../src/levels.js';
import { analyze, gateChecks } from './s4_core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const write = process.argv.includes('--write');

// id -> 名称 / 教学句 / 来源（s5_found 里的 tag + 序号，从 1 开始）
const PLAN = [
  {
    id: 41, name: '起手式', tag: 'l41c', idx: 1,
    teach: 'S5 开场：紫块四块、绿块一对。紫块先借绿块停车，绿块再借墙落底；黄块最后和同伴对撞收尾。',
  },
  {
    id: 42, name: '无退路', tag: 'l46c', idx: 1,
    teach: '十二块、五色，四个墙位都卡在通道口。紫块先借蓝块停一次、再借墙落底；红块借墙停住后最后收尾。',
  },
  {
    id: 43, name: '先手', tag: 'l43', idx: 1,
    teach: '只清红块，容错只有 1 步。第一手先消最上面一对；之后把黄块、右边红块依次往里挪，借蓝块和绿块卡位，最后上下两对各自撞掉。',
  },
  {
    id: 44, name: '红海之外', tag: 'l44c', idx: 1,
    teach: '六块红分在左上和底边两个区域，先清哪一对决定另一区还有没有停车位。蓝块先上提，借红块停一次。',
  },
  {
    id: 45, name: '两段路', tag: 'l46c', idx: 2,
    teach: '两段路：先把黄块和绿块清掉，紫块借墙停一次再落底；蓝块最后借墙绕到右上，红块收尾。',
  },
  {
    id: 46, name: '隔山打牛', tag: 'l46c', idx: 3,
    teach: '同一面底墙可以挡两次：蓝块左右两列各落一次底；黄块最后借顶边停车，再和同伴对撞。',
  },
  {
    id: 47, name: '五色终局', tag: 'l42c', idx: 1,
    teach: '五色十二块，十步。红块最后才动，前面九步都在给它铺一条能停住的直线。',
  },
  {
    id: 48, name: '窄缝', tag: 'l48', idx: 1,
    teach: '只清红块，四道墙把下半盘切成小格。红块要一格一格借墙、借蓝块挪到同伴旁边；蓝块先落到底边占位。',
  },
  {
    id: 49, name: '最后一课', tag: 'l42c', idx: 2,
    teach: '蓝块分居上下，谁先下来决定中盘还能不能借到墙。红块最后要横穿三格。',
  },
  {
    id: 50, name: '最后一撞', tag: 'l47c', idx: 2,
    teach: '毕业关：五色十二块，五个耦合点。红块第二步就要停在紫块旁边，后面蓝、黄、紫依次借位。',
  },
];

const CAP = Number(process.env.S5_NODES || 500000);
const cache = new Map();
function loadTag(tag) {
  if (!cache.has(tag)) {
    const p = path.join(__dirname, 's5_found', `${tag}.json`);
    cache.set(tag, JSON.parse(fs.readFileSync(p, 'utf8')));
  }
  return cache.get(tag);
}

const existing = LEVELS.map((lv) => lv.rows.join('/'));
const used = new Set(existing);
const levels = [];
let failed = 0;

for (const p of PLAN) {
  const j = loadTag(p.tag);
  const c = j.found[p.idx - 1];
  if (!c) {
    console.log(`#${p.id} ${p.name}  FAIL  找不到候选 ${p.tag}#${p.idx}`);
    failed++;
    continue;
  }
  const key = c.rows.join('/');
  if (used.has(key)) {
    console.log(`#${p.id} ${p.name}  FAIL  盘面重复`);
    failed++;
    continue;
  }

  const a = analyze(c.rows, {
    goal: c.goal,
    target: c.goal === 'color' ? c.target : null,
    limit: c.limit,
    cap: CAP,
  });
  if (!a.ok) {
    console.log(`#${p.id} ${p.name}  FAIL  ${a.reason}`);
    failed++;
    continue;
  }

  const checks = gateChecks(a, { par: c.par, limit: c.limit });
  const colors = new Set(c.rows.join('').replace(/[^A-E]/g, ''));
  const slack = a.par - c.par;
  checks.push(['上限 +1/+2', c.limit - c.par === 1 || c.limit - c.par === 2, `limit-par=${c.limit - c.par}`]);
  checks.push(['块数 10–12', a.blocks >= 10 && a.blocks <= 12, `${a.blocks}`]);
  checks.push(['颜色 4–5', colors.size >= 4 && colors.size <= 5, `${colors.size}`]);
  checks.push(['内墙 3–5', a.walls.length >= 3 && a.walls.length <= 5, `${a.walls.length}`]);
  checks.push(['至少一次墙停', a.stops.wall >= 1, `${a.stops.wall}`]);
  if (c.goal === 'clear') {
    const drop2 = Object.values(a.loads).filter((p2) => a.par - p2 >= 2).length;
    checks.push(['至少两色降 ≥2 步', drop2 >= 2, `${drop2}`]);
  }
  const bad = checks.filter(([, ok]) => !ok);
  if (bad.length) {
    failed++;
    console.log(`#${p.id} ${p.name}  FAIL  ${bad.map(([n, , d]) => `${n}(${d})`).join(', ')}`);
    continue;
  }

  used.add(key);
  levels.push({
    id: p.id,
    stage: 5,
    name: p.name,
    goal: c.goal,
    ...(c.goal === 'color' ? { targetColor: c.target } : {}),
    limit: c.limit,
    par: c.par,
    teach: p.teach,
    nudge: c.nudge,
    rows: c.rows,
  });
  const soft = c.softMiss && c.softMiss.length ? `  软门槛未过: ${c.softMiss.join(',')}` : '';
  console.log(
    `#${p.id} ${p.name}  OK  par ${a.par} / 上限 ${c.limit}  ${a.blocks} 块 ${colors.size} 色 ` +
      `${a.walls.length} 墙  首步 ${a.firstCount}（保持 ${a.best}，最差 ${a.worst}）` +
      `压力 ${a.pressure.length} 墙停 ${a.stops.wall} 块停 ${a.stops.block} 拆墙 ${a.noWallsPar}${soft}`,
  );
}

if (failed) {
  console.log(`\n共 ${failed} 关未通过，未写入。`);
  process.exitCode = 1;
} else if (write) {
  const file = path.join(__dirname, '..', 'src', 'levels.js');
  let src = fs.readFileSync(file, 'utf8');
  const at = src.lastIndexOf('];');
  if (at < 0) throw new Error('levels.js 结尾找不到 ];');
  const lines = levels.map((lv) => {
    const goalLine =
      lv.goal === 'color'
        ? `    goal: 'color',\n    targetColor: ${lv.targetColor},\n`
        : `    goal: 'clear',\n`;
    const rows = lv.rows.map((r) => `      '${r}',`).join('\n');
    return (
      `  {\n` +
      `    id: ${lv.id},\n` +
      `    stage: 5,\n` +
      `    name: '${lv.name}',\n` +
      goalLine +
      `    limit: ${lv.limit},\n` +
      `    par: ${lv.par},\n` +
      `    teach:\n      '${lv.teach}',\n` +
      `    nudge:\n      '${lv.nudge}',\n` +
      `    rows: [\n${rows}\n    ],\n` +
      `  },\n`
    );
  });
  src = src.slice(0, at) + lines.join('') + src.slice(at);
  fs.writeFileSync(file, src);
  console.log(`\n已写入 ${levels.length} 关到 src/levels.js。`);
} else {
  console.log('\n复验全部通过（未写入，加 --write 才会写）。');
}