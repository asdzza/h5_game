// 快速探针：某个 4 块骨架在"有墙 / 拿掉每格墙"时的 par
import { parse, legalMoves, applyMove, isGoal } from '../src/game.js';

const BOARDS = {
  'l7 骨架': [
    '#######',
    '#.B.A.#',
    '#...B.#',
    '#.##.A#',
    '#.....#',
    '#.....#',
    '#######',
  ],
};

const key = (s) => {
  let out = '';
  for (let i = 0; i < s.c.length; i++) {
    const v = s.c[i];
    if (v > 0) out += String.fromCharCode(i + 33) + String.fromCharCode(v + 48);
  }
  return out;
};

function parWithin(start, level, cap, nodeCap = 3000000) {
  if (isGoal(start, level)) return 0;
  const seen = new Set([key(start)]);
  let frontier = [start];
  for (let d = 1; d <= cap; d++) {
    const next = [];
    for (const st of frontier) {
      for (const m of legalMoves(st)) {
        const ns = applyMove(st, m);
        if (isGoal(ns, level)) return d;
        const k = key(ns);
        if (seen.has(k)) continue;
        seen.add(k);
        next.push(ns);
        if (seen.size > nodeCap) return -1;
      }
    }
    if (!next.length) return Infinity;
    frontier = next;
  }
  return Infinity;
}

for (const [name, rows] of Object.entries(BOARDS)) {
  const lv = { rows, goal: 'clear', targetColor: null };
  console.log(name, 'par =', parWithin(parse(rows), lv, 9));
  for (let r = 1; r <= 5; r++) {
    for (let c = 1; c <= 5; c++) {
      if (rows[r][c] !== '#') continue;
      const rows2 = rows.map((row, i) => (i === r ? row.slice(0, c) + '.' + row.slice(c + 1) : row));
      const p2 = parWithin(parse(rows2), { ...lv, rows: rows2 }, 9);
      console.log(`  拿掉 (${r},${c}) → par ${p2}`);
    }
  }
}