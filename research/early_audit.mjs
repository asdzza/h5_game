import { LEVELS } from '../src/levels.js';
import { SOLUTIONS } from '../src/solutions.js';
import { analyze } from './s4_core.mjs';

const from = Number(process.argv[2] || 1);
const to = Number(process.argv[3] || 18);
const CAP = 2000000;

const fmtMove = (m) =>
  m.res === 'pop'
    ? `POP ${m.r},${m.c}${m.d}->${m.br},${m.bc}`
    : `SLD ${m.r},${m.c}${m.d}->${m.tr},${m.tc}`;

const DIRV = { U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1] };
function stopKind(m, rows) {
  if (m.res === 'pop') return 'pop';
  const [dr, dc] = DIRV[m.d];
  const nr = m.tr + dr;
  const nc = m.tc + dc;
  if (nr < 0 || nr >= rows.length || nc < 0 || nc >= rows[0].length) return 'edge';
  if (rows[nr][nc] === '#') return 'wall';
  return 'block';
}

for (const lv of LEVELS) {
  if (lv.id < from || lv.id > to) continue;
  const target = lv.goal === 'color' ? lv.targetColor : null;
  const a = analyze(lv.rows, { goal: lv.goal, target, limit: lv.limit, cap: CAP });
  if (!a.ok) {
    console.log(`#${lv.id} ${lv.name} FAIL ${a.reason}`);
    continue;
  }
  const bestMoves = a.firstResults.filter((x) => x.total === a.par).map((x) => x.m);
  const bestPops = bestMoves.filter((m) => m.res === 'pop').length;
  const kinds = bestMoves.reduce((acc, m) => {
    const k = stopKind(m, lv.rows);
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  const solFirst = (SOLUTIONS[lv.id] || '').trim().split(/\s+/)[0] || '';
  console.log(
    `#${String(lv.id).padStart(2)} ${lv.name}\n` +
      `   par ${a.par} / limit ${lv.limit} | 首步 ${a.firstCount} | 最优首步 ${a.best}（其中直接消 ${bestPops} / 铺垫 ${a.best - bestPops}）| 最差 ${a.worst}\n` +
      `   审计 best=${a.best} bestPops=${bestPops} pressure=${a.pressure.length} overLimit=${a.overLimit}\n` +
      `   最优首步停法: ${JSON.stringify(kinds)}\n` +
      `   最优首步: ${bestMoves.map(fmtMove).join(' ; ') || '(none)'}\n` +
      `   预置解首步: ${solFirst}`,
  );
}