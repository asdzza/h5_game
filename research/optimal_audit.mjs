// 关卡审计（轻量版）：不穷举全部最优解，而是回答三个可验证的问题：
//   1) A* 给出的 par 是否为真正最短（A* 本身保证；这里复核 limit - par）
//   2) 开局有哪些首步能"保持最优"（1 + 剩余最优 == par）——用来判断关卡是"唯一解"还是"多解"
//   3) 禁止某一关键步后，最优步数会不会变长 / 直接无解——用来证明教学点不可跳过
import { parse, neighbors, isGoal, countBlocks, genA, applyA } from './engine.mjs';
import { LEVELS } from './levels_seed.mjs';

const INF = Infinity;

class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(n) { const a = this.a; a.push(n); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a; const top = a[0]; const last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l].f < a[m].f) m = l; if (r < a.length && a[r].f < a[m].f) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
}

function solver(start, ruleset, opts = {}, cap = 300000) {
  const target = opts.targetColor ?? null;
  const banned = opts.banned ?? (() => false);
  const goal = (st) => target != null
    ? ![...st.c].includes(target)
    : isGoal(st, ruleset);
  const h = (st) => {
    if (target != null) { let n = 0; for (const v of st.c) if (v === target) n++; return n / 2; }
    return ruleset === 'A' ? countBlocks(st) / 2 : countBlocks(st) - new Set([...st.c].filter(v => v > 0)).size;
  };
  const key = (st) => st.c.join(',');
  const g = new Map(), open = new Heap();
  const k0 = key(start);
  g.set(k0, 0);
  open.push({ st: start, g: 0, f: h(start), k: k0 });
  let expanded = 0;
  while (open.size) {
    const cur = open.pop();
    if (cur.g > (g.get(cur.k) ?? INF)) continue;
    if (goal(cur.st)) return { len: cur.g, expanded };
    if (++expanded > cap) return { len: null, expanded, truncated: true };
    for (const { move, state } of neighbors(cur.st, ruleset)) {
      if (banned(move, cur.st)) continue;
      const nk = key(state), ng = cur.g + 1;
      if (ng < (g.get(nk) ?? INF)) { g.set(nk, ng); open.push({ st: state, g: ng, f: ng + h(state), k: nk }); }
    }
  }
  return { len: null, expanded };
}

const fmt = (m) => m.res === 'pop'
  ? `POP (${m.r},${m.c})${m.d} x (${m.br},${m.bc})`
  : `SLD (${m.r},${m.c})${m.d} -> (${m.tr},${m.tc})`;

function audit(lv) {
  const st = parse(lv.rows);
  const opts = lv.goal === 'color' ? { targetColor: lv.targetColor } : {};
  const base = solver(st, 'A', opts);
  const par = base.len;
  const moves = genA(st);
  const keep = [];
  for (const m of moves) {
    const after = applyA(st, m);
    const r = solver(after, 'A', opts);
    if (r.len != null && 1 + r.len === par) keep.push(m);
  }
  return { st, par, limit: par + lv.slack, moves, keep, blocks: countBlocks(st) };
}

console.log('=== A 关卡审计：首步最优性 ===');
const results = [];
for (const lv of LEVELS) {
  const a = audit(lv);
  results.push({ lv, ...a });
  console.log(`\n#${lv.id} ${lv.name} | par=${a.par} limit=${a.limit} blocks=${a.blocks} | 合法首步=${a.moves.length} 保持最优的首步=${a.keep.length}`);
  for (const m of a.keep) console.log('    ' + fmt(m));
}

// 关键步禁用测试：禁用某一具体走法后，par 是否变长/无解
console.log('\n=== 关键步禁用测试 ===');
const banned = {
  3: { r: 5, c: 4, d: 'U', why: '教学点：把 A 停到 R4C4（墙替你刹车）' },
  6: { r: 1, c: 2, d: 'D', why: '把 A 停到 R3C2，再横送到 R3C5' },
  22: { r: 1, c: 2, d: 'L', why: '清色关：先把 B 挪开而不是消掉' },
  27: { r: 4, c: 4, d: 'R', why: '清色关：把 D 挪走给红块让路' },
};
for (const [id, b] of Object.entries(banned)) {
  const lv = LEVELS.find(l => l.id === +id);
  const opts = lv.goal === 'color' ? { targetColor: lv.targetColor } : {};
  const before = solver(parse(lv.rows), 'A', opts).len;
  const after = solver(parse(lv.rows), 'A', { ...opts, banned: (m) => m.r === b.r && m.c === b.c && m.d === b.d }).len;
  console.log(`#${id} ${lv.name}: 禁用 (${b.r},${b.c})${b.d} → par ${before} ${after === null ? '→ 无解' : `→ ${after}`}  （${b.why}）`);
}

console.log('\n=== 结构性对照 ===');
const branch = results.reduce((s, r) => s + r.moves.length, 0) / results.length;
const pops = results.reduce((s, r) => s + r.moves.filter(m => m.res === 'pop').length, 0) / results.length;
console.log(`13 关平均合法首步=${branch.toFixed(1)}，其中直接消除=${pops.toFixed(1)}（${(pops / branch * 100).toFixed(1)}%）`);
console.log(`13 关平均"保持最优的首步"=${(results.reduce((s, r) => s + r.keep.length, 0) / results.length).toFixed(1)}`);