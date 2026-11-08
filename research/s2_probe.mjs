// S2 关卡体检：par / 最优路径 / 首步表 / 墙依赖 / 死局
//
// 用法：node research/s2_probe.mjs [名称]
// 盘面写在 BOARDS 里；名称省略则全部体检。
import { parse, legalMoves, applyMove, isGoal, at } from '../src/game.js';

const BOARDS = {
  'seed9 十字墙': {
    rows: [
      '#######',
      '#C#B..#',
      '#A.A..#',
      '#D#...#',
      '#B...C#',
      '#..D..#',
      '#######',
    ],
    goal: 'clear',
    targetColor: null,
    limit: 10,
  },
};

const key = (s) => {
  let out = '';
  for (let i = 0; i < s.c.length; i++) {
    const v = s.c[i];
    if (v > 0) out += String.fromCharCode(i + 33) + String.fromCharCode(v + 48);
  }
  return out;
};

function parWithin(start, level, cap, nodeCap = 4000000) {
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

const DIRV = { U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1] };
const DIR = { U: '上', D: '下', L: '左', R: '右' };
const isInnerWall = (rows, r, c) => r > 0 && c > 0 && r < rows.length - 1 && c < rows[0].length - 1 && rows[r][c] === '#';

function stepText(path, rows) {
  return path.map((p, i) => {
    const col = String.fromCharCode(64 + at(p.st, p.m.r, p.m.c));
    if (p.m.res === 'pop') return `${i + 1}.${col}(${p.m.r},${p.m.c})${DIR[p.m.d]}×(${p.m.br},${p.m.bc})`;
    const [dr, dc] = DIRV[p.m.d];
    const beyond = at(p.st, p.m.tr + dr, p.m.tc + dc);
    const why = beyond === -1 ? '墙停' : beyond === 0 ? '边停' : '块停';
    return `${i + 1}.${col}(${p.m.r},${p.m.c})${DIR[p.m.d]}→(${p.m.tr},${p.m.tc})${why}`;
  });
}

function withoutWall(rows, wr, wc) {
  return rows.map((row, r) => (r === wr ? row.slice(0, wc) + '.' + row.slice(wc + 1) : row));
}

function scanDead(start, lv, cap) {
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
    if (seen.size > 4000000) return { dead, states: seen.size, capped: true };
  }
  return { dead, states: seen.size, capped: false };
}

const only = process.argv[2] || null;
for (const [name, def] of Object.entries(BOARDS)) {
  if (only && name !== only && def.id !== only) continue;
  const { rows, goal, targetColor, limit } = def;
  const lv = { rows, goal, targetColor };
  const st0 = parse(rows);
  const par = parWithin(st0, lv, limit, 6000000);
  let blocks = 0;
  const colorCount = new Map();
  for (const v of st0.c) if (v > 0) { blocks++; colorCount.set(v, (colorCount.get(v) || 0) + 1); }
  console.log(`\n=== ${name} | ${blocks} 块 / ${colorCount.size} 色 | par ${par} / 上限 ${limit} ===`);
  rows.forEach((r) => console.log('  ' + r));

  if (par < 0) { console.log('  （超节点上限）'); continue; }
  if (!Number.isFinite(par)) { console.log('  （无解）'); continue; }

  const path = solvePath(st0, lv, limit);
  if (path) console.log('  最优路径: ' + stepText(path, rows).join(' → '));

  const firsts = legalMoves(st0);
  const totals = firsts.map((m) => {
    const d = parWithin(applyMove(st0, m), lv, limit);
    return { m, total: Number.isFinite(d) && d >= 0 ? 1 + d : Infinity };
  });
  const opt = totals.filter((x) => x.total === par);
  console.log(`  首步 ${firsts.length}（保持 ${opt.length}）  开局可消 ${firsts.filter((m) => m.res === 'pop').length}`);
  console.log('  ' + totals.map((x) => `${x.m.r},${x.m.c}${x.m.d}${x.m.res === 'pop' ? '*' : ''}:${x.total === Infinity ? '>上限' : x.total}`).join(' '));
  const over = totals.filter((x) => x.total > limit);
  console.log(`  超过上限的首步: ${over.length}`);

  const walls = [];
  for (let r = 1; r < rows.length - 1; r++)
    for (let c = 1; c < rows[0].length - 1; c++)
      if (rows[r][c] === '#') walls.push([r, c]);
  console.log(`  内墙 ${walls.length} 格`);
  for (const [wr, wc] of walls) {
    const r2 = withoutWall(rows, wr, wc);
    const p2 = parWithin(parse(r2), { ...lv, rows: r2 }, limit + 4);
    console.log(`    拿掉 (${wr},${wc}) → par ${p2}`);
  }

  const dead = scanDead(st0, lv, limit);
  console.log(`  死局 ${dead.dead} / ${dead.states} 个局面${dead.capped ? '（超上限，未扫完）' : ''}`);
}