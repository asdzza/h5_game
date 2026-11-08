// 第 8 关死局/可达局面统计（文档用）
import { parse, legalMoves, applyMove, isGoal } from '../src/game.js';
import { LEVELS } from '../src/levels.js';

const lv = LEVELS[7];
const key = (s) => {
  let out = '';
  for (let i = 0; i < s.c.length; i++) {
    const v = s.c[i];
    if (v > 0) out += String.fromCharCode(i + 33) + String.fromCharCode(v + 48);
  }
  return out;
};

const cap = lv.limit;
const start = parse(lv.rows);
const seen = new Set([key(start)]);
let frontier = [start];
let dead = 0;
for (let d = 1; d <= cap; d++) {
  const next = [];
  for (const st of frontier) {
    for (const m of legalMoves(st)) {
      const ns = applyMove(st, m);
      const k = key(ns);
      if (seen.has(k)) continue;
      seen.add(k);
      if (!isGoal(ns, lv) && legalMoves(ns).length === 0) dead++;
      next.push(ns);
    }
  }
  if (!next.length) break;
  frontier = next;
}
console.log(`第 ${lv.id} 关「${lv.name}」：${cap} 步内可达 ${seen.size} 个局面，死局 ${dead} 个。`);