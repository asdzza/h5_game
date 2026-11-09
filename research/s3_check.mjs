// 单盘面终检：par、首步、逐块/逐墙载荷
//
// 用法：
//   node research/s3_check.mjs <目标色 1-5> <row1> <row2> ... <row7>
// 例：
//   node research/s3_check.mjs 1 "#AB.A.#" "#.....#" "#C.#..#" "#.....#" "#A..A.#" "#######"
//
// 说明：第 6 参数起每行 7 个字符。目标是只清目标色。
import { parse, genA, applyA } from '../research/engine.mjs';
import { aStar } from '../research/solver_fast.mjs';

const targetColor = Number(process.argv[2]);
const rows = process.argv.slice(3);
if (rows.length < 5) throw new Error('至少需要 5 行棋盘');

const solve = (st) => aStar(st, 'A', 400000, { targetColor });
const parOf = (rs) => {
  const r = solve(parse(rs));
  return r ? r.len : Infinity;
};
const st0 = parse(rows);
const r0 = solve(st0);
if (!r0) throw new Error('目标色无解（节点上限内）');

const DIRV = { U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1] };
const H = rows.length;
const W = rows[0].length;
const removeAt = (rs, r, c) => rs.map((row, i) => (i === r ? row.slice(0, c) + '.' + row.slice(c + 1) : row));
const isWall = (r, c) => r > 0 && c > 0 && r < H - 1 && c < W - 1 && rows[r][c] === '#';

console.log(`rows=${H}x${W} 目标色=${String.fromCharCode(64 + targetColor)} par=${r0.len}`);
rows.forEach((r) => console.log('  ' + r));
console.log('路径：');
for (const [i, p] of r0.path.entries()) {
  const m = p.move;
  const col = String.fromCharCode(64 + p.before.c[m.r * W + m.c]);
  if (m.res === 'pop') {
    console.log(`  ${i + 1}. ${col}(${m.r},${m.c})${m.d} × (${m.br},${m.bc})`);
  } else {
    const [dr, dc] = DIRV[m.d];
    const nr = m.tr + dr;
    const nc = m.tc + dc;
    const why = isWall(nr, nc) ? '墙停' : p.after.c[nr * W + nc] > 0 ? '块停' : '边停';
    console.log(`  ${i + 1}. ${col}(${m.r},${m.c})${m.d} → (${m.tr},${m.tc}) ${why}`);
  }
}

console.log('\n首步（1+后续最短）：');
for (const m of genA(st0)) {
  const r = solve(applyA(st0, m));
  const total = r ? 1 + r.len : Infinity;
  console.log(`  ${String.fromCharCode(64 + st0.c[m.r * W + m.c])}(${m.r},${m.c})${m.d} ${m.res} → ${total === Infinity ? '超限/无解' : total}`);
}

console.log('\n逐块拿掉（非目标色）：');
for (let r = 0; r < H; r++) {
  for (let c = 0; c < W; c++) {
    const v = st0.c[r * W + c];
    if (v <= 0 || v === targetColor) continue;
    const p2 = parOf(removeAt(rows, r, c));
    console.log(
      `  ${String.fromCharCode(64 + v)}(${r},${c}) → ${p2 === Infinity ? '无解' : p2} ${
        p2 === r0.len ? '(装饰)' : p2 < r0.len ? '(拿掉更快)' : '(拿掉更慢, 有用)'
      }`,
    );
  }
}

const innerWalls = [];
for (let r = 1; r < H - 1; r++)
  for (let c = 1; c < W - 1; c++) if (rows[r][c] === '#') innerWalls.push([r, c]);
if (innerWalls.length) {
  console.log('\n逐格墙拿掉：');
  for (const [r, c] of innerWalls) {
    const p2 = parOf(removeAt(rows, r, c));
    console.log(`  (${r},${c}) → ${p2 === Infinity ? '无解' : p2} ${p2 === r0.len ? '(可拿掉)' : '(有用)'}`);
  }
  let noWalls = rows;
  for (const [r, c] of innerWalls) noWalls = removeAt(noWalls, r, c);
  console.log(`  整组拆掉 → ${parOf(noWalls)}`);
} else {
  console.log('\n无内墙');
}