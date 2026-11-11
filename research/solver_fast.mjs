import { neighbors, isGoal, key, countBlocks, colorsPresent, berthsLeft, key as K } from './engine.mjs';

class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(node) {
    const a = this.a; a.push(node);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]]; i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      while (true) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
}

export function heuristic(st, ruleset) {
  if (ruleset === 'A') return countBlocks(st) / 2 + berthsLeft(st);
  return countBlocks(st) - colorsPresent(st).size;
}

/** A*：返回 {len, path, expanded} 或 null（超限/无解）
 *  opts.targetColor: 只清除该颜色（清色关）；否则清场
 */
export function aStar(start, ruleset, cap = 120000, opts = {}) {
  const target = opts.targetColor ?? null;
  const goalFn = (st) => {
    if (berthsLeft(st) > 0) return false;
    if (target != null) {
      for (let i = 0; i < st.c.length; i++) if (st.c[i] === target) return false;
      return true;
    }
    return isGoal(st, ruleset);
  };
  const h = (st) => {
    if (target != null) {
      let n = 0;
      for (let i = 0; i < st.c.length; i++) if (st.c[i] === target) n++;
      return n / 2 + berthsLeft(st);
    }
    return heuristic(st, ruleset);
  };
  const h0 = h(start);
  const open = new Heap();
  const g = new Map();
  const parent = new Map();
  const k0 = K(start);
  g.set(k0, 0);
  parent.set(k0, null);
  open.push({ k: k0, st: start, g: 0, f: h0 });
  let expanded = 0;
  while (open.size) {
    const cur = open.pop();
    if (cur.g > (g.get(cur.k) ?? Infinity)) continue;
    if (goalFn(cur.st)) {
      const path = [];
      let k = cur.k;
      while (parent.get(k)) {
        const p = parent.get(k);
        path.push({ move: p.move, before: p.before, after: p.after });
        k = p.k;
      }
      return { len: cur.g, path: path.reverse(), expanded };
    }
    if (++expanded > cap) return null;
    const nb = neighbors(cur.st, ruleset);
    // 优先展开能直接消除的走法，加速找到最优解
    if (ruleset === 'A') nb.sort((a, b) => (b.move.res === 'pop' ? 1 : 0) - (a.move.res === 'pop' ? 1 : 0));
    for (const { move, state } of nb) {
      const nk = K(state);
      const ng = cur.g + 1;
      if (ng < (g.get(nk) ?? Infinity)) {
        g.set(nk, ng);
        parent.set(nk, { k: cur.k, move, before: cur.st, after: state });
        open.push({ k: nk, st: state, g: ng, f: ng + h(state) });
      }
    }
  }
  return null;
}