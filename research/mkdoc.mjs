import fs from 'fs';
import { fileURLToPath } from 'url';
import { parse } from './engine.mjs';
import { aStar } from './solver_fast.mjs';
import { LEVELS } from './levels_seed.mjs';

const DIRNAME = { U: '上', D: '下', L: '左', R: '右' };
const colorAt = (st, r, c) => String.fromCharCode(64 + st.c[r * st.w + c]);

let md = '';
for (const lv of LEVELS) {
  const st = parse(lv.rows);
  const tc = lv.goal === 'color' ? lv.targetColor : null;
  const r = aStar(st, 'A', 300000, { targetColor: tc });
  const rows = lv.rows;
  const n = rows.length - 2;
  md += `\n### ${lv.id}. ${lv.name}（par ${r.len} / 上限 ${r.len + lv.slack}）\n\n`;
  md += '```\n';
  md += '     ' + [...Array(n).keys()].map(i => String(i + 1).padStart(2)).join('') + '\n';
  for (let i = 1; i <= n; i++) {
    const line = rows[i].slice(1, -1).split('').map(ch => ch === '.' ? '·' : ch === '#' ? '■' : ch).join(' ');
    md += String(i).padStart(2) + '   ' + line + '\n';
  }
  md += '```\n\n';
  const steps = r.path.map((p, i) => {
    const m = p.move;
    const col = colorAt(p.before, m.r, m.c);
    return m.res === 'pop'
      ? `**${i + 1}.** R${m.r}C${m.c} 的 ${col} 向${DIRNAME[m.d]}撞向 R${m.br}C${m.bc} 的 ${col} → 双消`
      : `**${i + 1}.** R${m.r}C${m.c} 的 ${col} 向${DIRNAME[m.d]}滑到 R${m.tr}C${m.tc}`;
  });
  md += '解法（一步一行，均经求解器验证）：\n\n' + steps.join('\n') + '\n';
}
const OUT = fileURLToPath(new URL('./levels_md.md', import.meta.url));
fs.writeFileSync(OUT, md, 'utf8');
console.log(`written ${OUT}`);