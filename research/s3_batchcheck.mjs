// 批量终检 S3 候选：par / 首步 / 整色载荷 / 墙载荷 / 开局现成对
import { parse, genA, applyA } from './engine.mjs';
import { aStar } from './solver_fast.mjs';

const CANDIDATES = [
  {
    id: 21,
    target: 1,
    par: 5,
    limit: 8,
    rows: ['#######', '#ACA..#', '#..BA.#', '#.#A#.#', '#C..B.#', '#.....#', '#######'],
  },
  {
    id: 22,
    target: 1,
    par: 5,
    limit: 8,
    rows: ['#######', '#AC.A.#', '#.#DB##', '#...A.#', '#.A#..#', '#..D..#', '#######'],
  },
  {
    id: 23,
    target: 3,
    par: 5,
    limit: 7,
    rows: ['#######', '#C..AC#', '#.#...#', '#DCA.B#', '#...#C#', '#.....#', '#######'],
  },
  {
    id: 24,
    target: 1,
    par: 6,
    limit: 8,
    rows: ['#######', '#.A.CA#', '#A#B.##', '#BA...#', '#..#.A#', '#A..C.#', '#######'],
  },
  {
    id: 25,
    target: 1,
    par: 4,
    limit: 7,
    rows: ['#######', '#A.CA.#', '#.....#', '#.#.#.#', '#C.B..#', '#AB.A.#', '#######'],
  },
  {
    id: 26,
    target: 2,
    par: 6,
    limit: 8,
    rows: ['#######', '#..C..#', '#..B..#', '#B###B#', '#...DA#', '#.CABD#', '#######'],
  },
  {
    id: 27,
    target: 1,
    par: 5,
    limit: 7,
    rows: ['#######', '#.D.B.#', '#.#...#', '#C.#DA#', '#..#AC#', '#AB..A#', '#######'],
  },
  {
    id: 28,
    target: 1,
    par: 6,
    limit: 8,
    rows: ['#######', '#ADC.B#', '#.#AC.#', '#.#B#D#', '#...#A#', '#..A..#', '#######'],
  },
  {
    id: 29,
    target: 3,
    par: 7,
    limit: 9,
    rows: ['#######', '#CA..C#', '#D#..A#', '#..#C.#', '#BC#DB#', '#.....#', '#######'],
  },
  {
    id: 30,
    target: 1,
    par: 7,
    limit: 9,
    rows: ['#######', '#.B.A.#', '#C#A#D#', '#....A#', '#.#.#.#', '#DB.AC#', '#######'],
  },
];

const removeCell = (rows, r, c) => rows.map((row, i) => (i === r ? row.slice(0, c) + '.' + row.slice(c + 1) : row));
const H = 7;
const W = 7;
const DIRV = { U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1] };
const isWall = (rows, r, c) => r > 0 && c > 0 && r < H - 1 && c < W - 1 && rows[r][c] === '#';

for (const cand of CANDIDATES) {
  const solve = (st) => aStar(st, 'A', 500000, { targetColor: cand.target });
  const parOf = (rs) => {
    const r = solve(parse(rs));
    return r ? r.len : Infinity;
  };
  const rows = cand.rows;
  const st0 = parse(rows);
  const r0 = solve(st0);
  const firsts = genA(st0);
  const totals = firsts.map((m) => {
    const r = solve(applyA(st0, m));
    return r ? 1 + r.len : Infinity;
  });
  const finite = totals.filter((n) => n !== Infinity);
  const opt = totals.filter((n) => n === cand.par).length;
  const worst = finite.length ? Math.max(...finite) : Infinity;
  const bad = firsts.filter((m, i) => totals[i] > cand.limit).length;

  const colors = [...new Set(rows.join('').replace(/[^A-E]/g, ''))];
  const targetCh = String.fromCharCode(64 + cand.target);
  const load = colors
    .filter((ch) => ch !== targetCh)
    .map((ch) => {
      const p = parOf(rows.map((row) => row.replace(new RegExp(ch, 'g'), '.')));
      return `${ch}→${p === Infinity ? '无解' : p}${p === cand.par ? ' (装饰!)' : ''}`;
    });

  const walls = [];
  for (let r = 1; r < H - 1; r++) for (let c = 1; c < W - 1; c++) if (rows[r][c] === '#') walls.push([r, c]);
  const wallEach = walls.map(([r, c]) => `(${r},${c})→${parOf(removeCell(rows, r, c))}`);
  const noWalls = walls.reduce((rs, [r, c]) => removeCell(rs, r, c), rows);

  const openPops = firsts
    .filter((m) => m.res === 'pop')
    .map((m) => `${String.fromCharCode(64 + st0.c[m.r * W + m.c])}(${m.r},${m.c})`);
  const pathPops = r0.path.filter((p) => p.move.res === 'pop').length;
  const otherPops = r0.path.filter(
    (p) => p.move.res === 'pop' && p.before.c[p.move.r * W + p.move.c] !== cand.target,
  ).length;
  let blockStops = 0;
  let wallStops = 0;
  for (const p of r0.path) {
    const m = p.move;
    if (m.res !== 'move') continue;
    const [dr, dc] = DIRV[m.d];
    const nr = m.tr + dr;
    const nc = m.tc + dc;
    if (isWall(rows, nr, nc)) wallStops++;
    else if (p.after.c[nr * W + nc] > 0) blockStops++;
  }

  const blocks = rows.join('').replace(/[^A-E]/g, '').length;
  const okPar = r0.len === cand.par;
  const okFirst = finite.length === firsts.length && bad === 0 && opt >= 1 && opt <= 5;
  const okLoad = load.every((s) => !s.includes('装饰'));
  const okWall = parOf(noWalls) < cand.par;

  console.log(`\n#${cand.id} 目标${targetCh} par ${r0.len}/${cand.par} limit ${cand.limit} 块 ${blocks} 色 ${colors.length} 墙 ${walls.length}`);
  console.log(`  首步 ${firsts.length}（保持 ${opt}，走错 ${firsts.length - opt}，最差 ${worst === Infinity ? 'X' : worst}，超上限 ${bad}）| 开局现成对 ${openPops.join(' ') || '无'}`);
  console.log(`  整色载荷 ${load.join(' ')}`);
  console.log(`  逐墙 ${wallEach.join(' ')} | 拆整组→${parOf(noWalls)}`);
  console.log(`  优化路径：${pathPops} 次消除（非目标 ${otherPops}）| 墙停 ${wallStops} 块停 ${blockStops}`);
  console.log(
    `  判定 par ${okPar ? 'OK' : 'FAIL'} / 首步 ${okFirst ? 'OK' : 'FAIL'} / 载荷 ${okLoad ? 'OK' : 'FAIL'} / 墙 ${okWall ? 'OK' : 'FAIL'}`,
  );
}