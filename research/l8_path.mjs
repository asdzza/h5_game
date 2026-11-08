// 看某个盘面在"有墙 / 拿掉某格墙"时的最短路径，用来分析替代路线
import { parse, legalMoves, applyMove, isGoal, at } from '../src/game.js';

const BASE = [
  '#######',
  '#.B.AC#',
  '#...B.#',
  '#.##.A#',
  '#C....#',
  '#.....#',
  '#######',
];

const DIRV = { U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1] };
const DIR = { U: '上', D: '下', L: '左', R: '右' };

const key = (s) => {
  let out = '';
  for (let i = 0; i < s.c.length; i++) {
    const v = s.c[i];
    if (v > 0) out += String.fromCharCode(i + 33) + String.fromCharCode(v + 48);
  }
  return out;
};

function solvePath(start, level, cap) {
  if (isGoal(start, level)) return [];
  const seen = new Set([key(start)]);
  const parent = new Map([[key(start), null]]);
  let frontier = [start];
  for (let d = 1; d <= cap; d++) {
    const next = [];
    for (const st of frontier) {
      for (const m of legalMoves(st)) {
        const ns = applyMove(st, m);
        const k = key(ns);
        if (seen.has(k)) continue;
        seen.add(k);
        parent.set(k, { pk: key(st), m, st });
        if (isGoal(ns, level)) {
          const path = [];
          let kk = k;
          while (parent.get(kk)) {
            const p = parent.get(kk);
            path.push({ m: p.m, st: p.st });
            kk = p.pk;
          }
          return path.reverse();
        }
        next.push(ns);
      }
    }
    if (!next.length) break;
    frontier = next;
  }
  return null;
}

function show(name, rows) {
  const lv = { rows, goal: 'clear', targetColor: null };
  const path = solvePath(parse(rows), lv, 12);
  console.log(`\n=== ${name} | par ${path ? path.length : '?'} ===`);
  rows.forEach((r) => console.log('  ' + r));
  if (!path) return;
  path.forEach((p, i) => {
    const col = String.fromCharCode(64 + at(p.st, p.m.r, p.m.c));
    if (p.m.res === 'pop') {
      console.log(` ${i + 1}. ${col}(${p.m.r},${p.m.c})${DIR[p.m.d]} × (${p.m.br},${p.m.bc})`);
      return;
    }
    const [dr, dc] = DIRV[p.m.d];
    const beyond = at(p.st, p.m.tr + dr, p.m.tc + dc);
    const why = beyond === -1 ? '墙停' : beyond === 0 ? '边停' : '块停';
    console.log(` ${i + 1}. ${col}(${p.m.r},${p.m.c})${DIR[p.m.d]} → (${p.m.tr},${p.m.tc}) ${why}`);
  });
}

show('原盘', BASE);
for (let r = 1; r <= 5; r++) {
  for (let c = 1; c <= 5; c++) {
    if (BASE[r][c] !== '#') continue;
    const rows2 = BASE.map((row, i) => (i === r ? row.slice(0, c) + '.' + row.slice(c + 1) : row));
    show(`拿掉 (${r},${c})`, rows2);
  }
}
