import { parse, toRows, countBlocks, colorsPresent } from './engine.mjs';
import { aStar } from './solver_fast.mjs';

const BOARDS = {
  'S1-6块': ['#######', '#.A.#A#', '#.....#', '#B.B.C#', '#.C...#', '#..#..#', '#######'],
  'S2-8块': ['#######', '#C#B..#', '#A.A..#', '#D#...#', '#B...C#', '#..D..#', '#######'],
  'S2b-8块': ['#######', '##....#', '#CD...#', '#DC...#', '##...A#', '#.B.BA#', '#######'],
  'S4-10块': ['#######', '#..B#A#', '#.C##.#', '#BE.A.#', '#...C.#', '#.DDE.#', '#######'],
  'S5-10块': ['#######', '#A.D#B#', '#.#C..#', '#D....#', '#C..EE#', '#.BA.##', '#######'],
};

for (const [name, rows] of Object.entries(BOARDS)) {
  const st = parse(rows);
  const all = aStar(st, 'A', 300000);
  const cols = [...colorsPresent(st)].sort((a, b) => a - b);
  console.log(`\n=== ${name} | 方块${countBlocks(st)} | 清场par=${all?.len ?? '超限'}`);
  for (const c of cols) {
    const r = aStar(st, 'A', 300000, { targetColor: c });
    if (!r) { console.log(`  清${String.fromCharCode(64 + c)}: 超限`); continue; }
    const nonTargetPops = r.path.filter(p => p.move.res === 'pop' && p.before.c[p.move.r * st.w + p.move.c] !== c).length;
    console.log(`  清${String.fromCharCode(64 + c)}: par=${r.len} 非目标消除=${nonTargetPops} 展开=${r.expanded}`);
    if (!all) console.log('    解: ' + r.path.map(p => p.move.res === 'pop' ? `撞(${p.move.r},${p.move.c})` : `滑(${p.move.r},${p.move.c})${p.move.d}`).join(' '));
  }
}