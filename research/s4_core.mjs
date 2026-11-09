// S4 盘面分析内核：供 s4_check / s4_search / s4_batchcheck 共用。
import { parse, genA, applyA, at, countBlocks } from './engine.mjs';
import { aStar } from './solver_fast.mjs';

const DIRV = { U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1] };

export function analyze(rows, { goal = 'clear', target = null, limit = null, cap = 2000000, st0 = null, r0 = null } = {}) {
  const H = rows.length;
  const W = rows[0].length;
  const targetCh = target ? String.fromCharCode(64 + target) : null;
  const solve = (st) => aStar(st, 'A', cap, target ? { targetColor: target } : {});
  st0 = st0 || parse(rows);
  r0 = r0 || solve(st0);
  if (!r0) {
    return { ok: false, reason: `无解或超过节点上限（${cap}）`, rows, H, W };
  }

  const stopKind = (before, m) => {
    if (m.res === 'pop') return 'pop';
    const [dr, dc] = DIRV[m.d];
    const v = at(before, m.tr + dr, m.tc + dc);
    if (v === -1) {
      const inner = m.tr > 0 && m.tr < H - 1 && m.tc > 0 && m.tc < W - 1;
      return inner ? 'wall' : 'edge';
    }
    return 'block';
  };
  const colName = (st, r, c) => {
    const v = at(st, r, c);
    return v > 0 ? `${String.fromCharCode(64 + v)}(${r},${c})` : '?';
  };
  const pathText = r0.path.map((p, i) => {
    const m = p.move;
    const who = colName(p.before, m.r, m.c);
    const tail = m.res === 'pop' ? `×(${m.br},${m.bc})` : `→(${m.tr},${m.tc}) ${stopKind(p.before, m)}`;
    return `${i + 1}. ${who}${m.d} ${tail}`;
  });

  const firsts = genA(st0);
  const firstResults = firsts.map((m) => {
    const r = solve(applyA(st0, m));
    return { m, total: r ? 1 + r.len : Infinity };
  });
  const finite = firstResults.filter((x) => x.total !== Infinity);
  const best = firstResults.filter((x) => x.total === r0.len).length;
  const worst = finite.length ? Math.max(...finite.map((x) => x.total)) : Infinity;
  const overLimit = limit == null ? 0 : firstResults.filter((x) => x.total > limit).length;
  const openPops = firsts.filter((m) => m.res === 'pop').length;

  const pressure = [];
  let st = st0;
  for (let i = 0; i < r0.path.length; i++) {
    const pops = genA(st).filter((m) => m.res === 'pop');
    if (pops.length >= 2) {
      const remain = r0.path.length - i;
      const totals = pops.map((m) => {
        const r = solve(applyA(st, m));
        return 1 + (r ? r.len : Infinity);
      });
      const punished = totals.filter((t) => t > remain).length;
      if (punished >= 1) pressure.push({ step: i + 1, pops: pops.length, punished, remain, totals });
    }
    st = applyA(st, r0.path[i].move);
  }

  const colors = [...new Set(rows.join('').replace(/[^A-E]/g, ''))].sort();
  const loads = {};
  for (const ch of colors) {
    if (targetCh && ch === targetCh) continue;
    const r = solve(parse(rows.map((row) => row.replaceAll(ch, '.'))));
    loads[ch] = r ? r.len : Infinity;
  }

  const walls = [];
  for (let r = 1; r < H - 1; r++) {
    for (let c = 1; c < W - 1; c++) if (rows[r][c] === '#') walls.push([r, c]);
  }
  const removeCell = (rs, r, c) => rs.map((row, i) => (i === r ? row.slice(0, c) + '.' + row.slice(c + 1) : row));
  const perWall = walls.map(([r, c]) => {
    const p = solve(parse(removeCell(rows, r, c)));
    return { cell: `(${r},${c})`, par: p ? p.len : Infinity };
  });
  let noWalls = rows;
  for (const [r, c] of walls) noWalls = removeCell(noWalls, r, c);
  const noWallsResult = solve(parse(noWalls));
  const noWallsPar = noWallsResult ? noWallsResult.len : Infinity;

  const stops = { wall: 0, block: 0, edge: 0, pop: 0 };
  for (const p of r0.path) stops[stopKind(p.before, p.move)]++;

  return {
    ok: true,
    rows, H, W, goal, target, targetCh, limit,
    par: r0.len,
    path: r0.path,
    pathText,
    firsts, firstResults,
    firstCount: firsts.length,
    best,
    worst,
    overLimit,
    openPops,
    pressure,
    colors,
    loads,
    walls,
    perWall,
    noWallsPar,
    stops,
    blocks: countBlocks(st0),
  };
}

/** A–H 判定；par / limit 由调用方给出（搜索时通常用目标值）。 */
export function gateChecks(a, { par = a.par, limit = a.limit } = {}) {
  if (!a.ok) return [[ '可解', false, a.reason ]];
  const checks = [];
  checks.push(['par 命中', a.par === par, `实际 ${a.par} / 声明 ${par}`]);
  if (limit != null) checks.push(['上限留容错', limit > par, `limit ${limit} / par ${par}`]);
  checks.push(['首步全部可通关', a.overLimit === 0 && a.firstResults.every((x) => x.total !== Infinity), `超上限 ${a.overLimit} / 首步 ${a.firstCount}`]);
  checks.push(['保持 par 的首步 2–8 个', a.best >= 2 && a.best <= 8, `保持 ${a.best}`]);
  checks.push(['至少一个首步被惩罚', a.worst > a.par, `最差 ${a.worst === Infinity ? 'X' : a.worst}`]);
  checks.push(['整组墙承重', a.noWallsPar < a.par, `拆整组后 ${a.noWallsPar === Infinity ? 'X' : a.noWallsPar}`]);
  const badLoads = Object.entries(a.loads).filter(([, p]) => p === a.par);
  checks.push(['非目标色全部承重', badLoads.length === 0, badLoads.length ? `无变化 ${badLoads.map(([c]) => c).join(',')}` : '全部改变']);
  checks.push(['至少一个顺序耦合点', a.pressure.length >= 1, `${a.pressure.length} 个`]);
  return checks;
}