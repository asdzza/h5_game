// 统计：par4 双墙停骨架里，拿掉任一格墙后 par 不再等于 4 的有多少
import { parse, legalMoves, applyMove, isGoal } from '../src/game.js';
import { readFileSync } from 'node:fs';

const LAYOUTS = {
  '横双(3,2)(3,3)': [[3, 2], [3, 3]],
  '竖双(2,3)(3,3)': [[2, 3], [3, 3]],
  '中心+上(1,3)(3,3)': [[1, 3], [3, 3]],
  '中心+下(3,3)(5,3)': [[3, 3], [5, 3]],
  '中心+左(3,1)(3,3)': [[3, 1], [3, 3]],
  '中心+右(3,3)(3,5)': [[3, 3], [3, 5]],
  '对角(2,2)(4,4)': [[2, 2], [4, 4]],
  '反对角(2,4)(4,2)': [[2, 4], [4, 2]],
  'L角(2,2)(2,3)': [[2, 2], [2, 3]],
  '反L角(4,2)(4,3)': [[4, 2], [4, 3]],
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

function withoutWall(rows, wr, wc) {
  return rows.map((row, r) => (r === wr ? row.slice(0, wc) + '.' + row.slice(wc + 1) : row));
}

const only = process.env.L8_LAYOUT || null;
for (const [name, WALLS] of Object.entries(LAYOUTS)) {
  if (only && name !== only) continue;
  const cache = `research/l8_gold4_${Buffer.from(name).toString('hex').slice(0, 12)}.json`;
  let sk;
  try {
    sk = JSON.parse(readFileSync(cache, 'utf8'));
  } catch {
    continue;
  }
  let dep = 0;
  const sample = [];
  for (const rows of sk) {
    const lv = { rows, goal: 'clear', targetColor: null };
    const p1 = parWithin(parse(withoutWall(rows, WALLS[0][0], WALLS[0][1])), { rows: withoutWall(rows, WALLS[0][0], WALLS[0][1]), goal: 'clear', targetColor: null }, 6);
    const p2 = parWithin(parse(withoutWall(rows, WALLS[1][0], WALLS[1][1])), { rows: withoutWall(rows, WALLS[1][0], WALLS[1][1]), goal: 'clear', targetColor: null }, 6);
    if (p1 !== 4 && p2 !== 4) {
      dep++;
      if (sample.length < 3) sample.push({ rows, p1, p2 });
    }
  }
  console.log(`${name}: 骨架 ${sk.length} 个，两格墙都承重 ${dep} 个`);
  for (const s of sample) console.log('   ' + s.rows.join(' / ') + `  [${s.p1}/${s.p2}]`);
}