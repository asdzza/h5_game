// 墙位扫描：固定方块布局，枚举两个内墙位置，找出 par 不变的候选。
//
// 用法：
//   node research/s3_wallscan.mjs <目标色> <目标par> <row1> ... <row7>
// 例：
//   node research/s3_wallscan.mjs 1 4 "#....A.#" "#.C.B..#" "#....A.#" "#......#" "#.A.A..#"
import { parse, genA, applyA } from '../research/engine.mjs';
import { aStar } from '../research/solver_fast.mjs';

const targetColor = Number(process.argv[2]);
const targetPar = Number(process.argv[3]);
const inner = process.argv.slice(4);
if (inner.length !== 5) throw new Error('需要 5 行内场（不含上下边界）');

const H = 7;
const W = 7;
const rowsOf = (walls) => [
  '#######',
  ...inner.map((row, r) => {
    const cells = row.padEnd(5, '.').slice(0, 5).split('');
    for (const [wr, wc] of walls) if (wr === r + 1) cells[wc - 1] = '#';
    return '#' + cells.join('') + '#';
  }),
  '#######',
];

const solve = (st) => aStar(st, 'A', 300000, { targetColor });
const parOf = (rows) => {
  const r = solve(parse(rows));
  return r ? r.len : Infinity;
};

const free = [];
for (let r = 1; r <= 5; r++)
  for (let c = 1; c <= 5; c++) if (inner[r - 1][c - 1] === '.') free.push([r, c]);

const results = [];
for (let i = 0; i < free.length; i++) {
  for (let j = i + 1; j < free.length; j++) {
    const walls = [free[i], free[j]];
    const rows = rowsOf(walls);
    const st0 = parse(rows);
    const r0 = solve(st0);
    if (!r0 || r0.len !== targetPar) continue;
    if (genA(st0).some((m) => m.res === 'pop')) continue;

    // 每个墙：被当刹车用过，或单独拿掉会变慢
    const detail = [];
    let useful = 0;
    for (const [wr, wc] of walls) {
      let used = 0;
      for (const p of r0.path) {
        const m = p.move;
        if (m.res !== 'move') continue;
        const [dr, dc] = { U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1] }[m.d];
        if (m.tr + dr === wr && m.tc + dc === wc) used++;
      }
      const rows2 = rows.map((row, r) => (r === wr ? row.slice(0, wc) + '.' + row.slice(wc + 1) : row));
      const p2 = parOf(rows2);
      if (used > 0 || p2 !== targetPar) useful++;
      detail.push(`${wr},${wc}${used ? `×${used}` : ''}→${p2 === Infinity ? 'X' : p2}`);
    }
    const allRows = rows.map((row, r) =>
      walls.some(([wr]) => wr === r)
        ? row
            .split('')
            .map((ch, c) => (walls.some(([wr, wc]) => wr === r && wc === c) ? '.' : ch))
            .join('')
        : row,
    );

    // 每种非目标色整色拿掉后 par 必须变化
    let loadOk = true;
    const loadDetail = [];
    const otherColors = [...new Set(rows.join('').replace(/[^B-E]/g, ''))];
    for (const ch of otherColors) {
      const rows2 = rows.map((row) => row.replace(new RegExp(ch, 'g'), '.'));
      const p2 = parOf(rows2);
      loadDetail.push(`${ch}→${p2 === Infinity ? 'X' : p2}`);
      if (p2 === targetPar) { loadOk = false; break; }
    }
    if (!loadOk) continue;
    const allParVal = parOf(allRows);
    if (!(allParVal < targetPar)) continue;

    // 首步表
    const firsts = genA(st0);
    let opt = 0;
    let recoverable = 0;
    for (const m of firsts) {
      const rr = solve(applyA(st0, m));
      const total = rr ? 1 + rr.len : Infinity;
      if (total === targetPar) opt++;
      if (total <= targetPar + 3) recoverable++;
    }
    results.push({ walls, rows, useful, detail, loadDetail, allPar: allParVal, opt, firsts: firsts.length, recoverable });
  }
}

results.sort((a, b) => b.useful - a.useful || b.opt - a.opt || b.recoverable - a.recoverable);
console.log(`扫描 ${free.length} 个空位，候选 ${results.length} 个（par=${targetPar}）`);
for (const c of results.slice(0, 10)) {
  console.log(
    `\n=== 墙 ${c.walls.map(([r, c2]) => `${r},${c2}`).join(' + ')} | 有用 ${c.useful}/2 | ${c.detail.join(' ')} | 非目标 ${c.loadDetail.join(' ')} | 拆整组→${
      c.allPar === Infinity ? 'X' : c.allPar
    } | 最优首步 ${c.opt}/${c.firsts} | 限内 ${c.recoverable}/${c.firsts} ===`,
  );
  c.rows.forEach((r) => console.log('  ' + r));
}