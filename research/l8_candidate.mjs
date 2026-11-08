// 第 8 关候选盘面体检：par / 最优路径 / 首步表 / 墙依赖
import { parse, legalMoves, applyMove, isGoal, at, countBlocks } from '../src/game.js';

const ROWS = [
  '#######',
  '#..BC.#',
  '#.#C..#',
  '#...A.#',
  '#.B.#.#',
  '#.A...#',
  '#######',
];

const lv = { goal: 'clear', targetColor: null, rows: ROWS };
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

const st = parse(ROWS);
const par = parWithin(st, lv, 15);
console.log('blocks =', countBlocks(st), ' par =', par);

const DIR = { U: '上', D: '下', L: '左', R: '右' };
const DIRV = { U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1] };

const path = solvePath(st, lv, par);
console.log('\n最优路径');
path.forEach((p, i) => {
  const col = String.fromCharCode(64 + at(p.st, p.m.r, p.m.c));
  if (p.m.res === 'pop') {
    console.log(` ${i + 1}. ${col}(${p.m.r},${p.m.c})${DIR[p.m.d]} × (${p.m.br},${p.m.bc})`);
    return;
  }
  const [dr, dc] = DIRV[p.m.d];
  const beyond = at(p.st, p.m.tr + dr, p.m.tc + dc);
  const why =
    at(p.st, p.m.tr + dr, p.m.tc + dc) === -1
      ? '墙停'
      : beyond === 0
        ? '边停'
        : '块停';
  console.log(
    ` ${i + 1}. ${col}(${p.m.r},${p.m.c})${DIR[p.m.d]} → (${p.m.tr},${p.m.tc}) [${why}]`,
  );
});

console.log('\n首步表');
const firsts = legalMoves(st);
const totals = firsts.map((m) => ({
  m,
  total: 1 + parWithin(applyMove(st, m), lv, 20),
}));
for (const x of totals) {
  const tag = x.m.res === 'pop' ? ' POP' : '';
  console.log(
    ` ${x.m.r},${x.m.c}${x.m.d}${tag}: ${Number.isFinite(x.total) ? x.total : '∞'}`,
  );
}
console.log(
  ' 开局可消:',
  firsts.filter((m) => m.res === 'pop').length,
  ' 最优首步:',
  totals.filter((x) => x.total === par).length,
);

console.log('\n墙依赖');
for (let r = 1; r <= 5; r++) {
  for (let c = 1; c <= 5; c++) {
    if (at(st, r, c) !== -1) continue;
    const rows2 = ROWS.map((row, i) =>
      i === r ? row.slice(0, c) + '.' + row.slice(c + 1) : row,
    );
    const p2 = parWithin(parse(rows2), { ...lv, rows: rows2 }, 20);
    console.log(` 拿掉 (${r},${c}) → par ${p2}`);
  }
}

// 首步全扫：每个首步之后在上限内是否都能通关
const bad = totals.filter((x) => !Number.isFinite(x.total) || x.total > 9);
console.log('\n超过 9 步的首步:', bad.length);