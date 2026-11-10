// 规则模拟与求解内核（仅用于设计验证，不是游戏本体）
// A = 碰碰消（单块滑动+同色对撞消除）
// B = 同色齐动（整色同步滑动+合并）
// C = 重力轮盘（相邻同色消除+重力旋转）

export const DIRS = {
  U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1],
};
export const DIR_KEYS = ['U', 'D', 'L', 'R'];

// rows: 数组，'#'=墙/虚空, '.'=空, 'A'..'E'=颜色, 'a'..'e'=同色锚块（不可拖，可被同色撞掉）
export function parse(rows) {
  const h = rows.length;
  const w = Math.max(...rows.map(r => r.length));
  const c = new Int8Array(w * h);
  const fixed = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[r][x] ?? '#';
      const i = r * w + x;
      if (ch === '#') c[i] = -1;
      else if (ch === '.') c[i] = 0;
      else if (ch >= 'a' && ch <= 'e') {
        c[i] = ch.charCodeAt(0) - 96;
        fixed[i] = 1;
      } else c[i] = ch.charCodeAt(0) - 64;
    }
  }
  return { w, h, c, fixed };
}

export function clone(st) {
  return { w: st.w, h: st.h, c: Int8Array.from(st.c), fixed: st.fixed };
}

export function isFixed(st, r, x) {
  if (r < 0 || x < 0 || r >= st.h || x >= st.w) return false;
  return !!(st.fixed && st.fixed[r * st.w + x]);
}

export function key(st) {
  let s = '';
  for (let i = 0; i < st.c.length; i++) s += String.fromCharCode(st.c[i] + 33);
  // 锚块位置必须进 key：锚块被撞掉后，同色普通块可以滑进原格，只看颜色会撞状态
  if (st.fixed) {
    for (let i = 0; i < st.fixed.length; i++) if (st.fixed[i]) s += `|${i}`;
  }
  return s;
}

export function at(st, r, x) {
  if (r < 0 || x < 0 || r >= st.h || x >= st.w) return -1;
  return st.c[r * st.w + x];
}

export function countBlocks(st) {
  let n = 0;
  for (let i = 0; i < st.c.length; i++) if (st.c[i] > 0) n++;
  return n;
}

export function colorsPresent(st) {
  const s = new Set();
  for (let i = 0; i < st.c.length; i++) if (st.c[i] > 0) s.add(st.c[i]);
  return s;
}

export function toRows(st) {
  const out = [];
  for (let r = 0; r < st.h; r++) {
    let line = '';
    for (let x = 0; x < st.w; x++) {
      const i = r * st.w + x;
      const v = st.c[i];
      line += v === -1 ? '#' : v === 0 ? '.' : isFixed(st, r, x)
        ? String.fromCharCode(96 + v)
        : String.fromCharCode(64 + v);
    }
    out.push(line);
  }
  return out;
}

// ---------- 方案A：单块滑动 ----------
// 返回 legal moves: {r,c,d,res:'pop'|'move', br,bc, tr,tc}
export function genA(st) {
  const moves = [];
  for (let r = 0; r < st.h; r++) {
    for (let x = 0; x < st.w; x++) {
      const col = st.c[r * st.w + x];
      if (col <= 0) continue;
      if (isFixed(st, r, x)) continue;
      for (const d of DIR_KEYS) {
        const [dr, dx] = DIRS[d];
        let cr = r + dr, cx = x + dx, lr = r, lx = x;
        let res = null, br = -1, bx = -1;
        while (true) {
          const v = at(st, cr, cx);
          if (v === -1) { res = 'move'; break; }
          if (v === 0) { lr = cr; lx = cx; cr += dr; cx += dx; continue; }
          if (v === col) { res = 'pop'; br = cr; bx = cx; }
          else { res = 'move'; }
          break;
        }
        if (res === 'pop') moves.push({ r, c: x, d, res, br, bc: bx });
        else if (lr !== r || lx !== x) moves.push({ r, c: x, d, res: 'move', tr: lr, tc: lx });
      }
    }
  }
  return moves;
}

export function applyA(st, m) {
  const ns = clone(st);
  if (m.res === 'pop') {
    const ai = m.r * st.w + m.c;
    const bi = m.br * st.w + m.bc;
    ns.c[ai] = 0;
    ns.c[bi] = 0;
    if (st.fixed && (st.fixed[ai] || st.fixed[bi])) {
      ns.fixed = Uint8Array.from(st.fixed);
      ns.fixed[ai] = 0;
      ns.fixed[bi] = 0;
    }
  } else {
    ns.c[m.r * st.w + m.c] = 0;
    ns.c[m.tr * st.w + m.tc] = st.c[m.r * st.w + m.c];
  }
  return ns;
}

export function goalA(st) { return countBlocks(st) === 0; }

// ---------- 方案B：整色同步滑动 ----------
export function genB(st) {
  const moves = [];
  const cols = [...colorsPresent(st)].sort((a, b) => a - b);
  for (const col of cols) {
    for (const d of DIR_KEYS) {
      const ns = applyB(st, col, d);
      if (ns && key(ns) !== key(st)) moves.push({ color: col, d });
    }
  }
  return moves;
}

export function applyB(st, col, d) {
  const ns = clone(st);
  const [dr, dx] = DIRS[d];
  const cells = [];
  for (let r = 0; r < st.h; r++)
    for (let x = 0; x < st.w; x++)
      if (st.c[r * st.w + x] === col) cells.push([r, x]);
  // 头块先进：投影方向上最靠前的先动
  const proj = ([r, x]) => (d === 'R' ? x : d === 'L' ? -x : d === 'D' ? r : -r);
  cells.sort((a, b) => proj(b) - proj(a));

  for (const [r, x] of cells) {
    if (ns.c[r * st.w + x] !== col) continue;
    let cr = r + dr, cx = x + dx, lr = r, lx = x;
    let merge = false;
    while (true) {
      const v = at(ns, cr, cx);
      if (v === -1) break;
      if (v === 0) { lr = cr; lx = cx; cr += dr; cx += dx; continue; }
      if (v === col) merge = true;
      break;
    }
    if (merge) {
      ns.c[r * st.w + x] = 0;          // 后块并入前块，数量-1
    } else if (lr !== r || lx !== x) {
      ns.c[lr * st.w + lx] = col;
      ns.c[r * st.w + x] = 0;
    }
  }
  return ns;
}

export function goalB(st) {
  const cols = colorsPresent(st);
  for (const col of cols) {
    let n = 0;
    for (let i = 0; i < st.c.length; i++) if (st.c[i] === col) n++;
    if (n > 1) return false;
  }
  return true;
}

// ---------- 通用求解/度量 ----------
export function neighbors(st, ruleset) {
  if (ruleset === 'A') {
    return genA(st).map(m => ({ move: m, state: applyA(st, m) }));
  }
  return genB(st).map(m => ({ move: m, state: applyB(st, m.color, m.d) }));
}

export function isGoal(st, ruleset) {
  return ruleset === 'A' ? goalA(st) : goalB(st);
}

/**
 * 全可达图分析：可解性、最短步数、可达状态数、不可解状态数、开局分支数
 */
export function analyze(start, ruleset, cap = 250000) {
  const goal = isGoal(start, ruleset);
  const k0 = key(start);
  const states = new Map();          // key -> {st, depth, id}
  const edges = [];                  // [fromId, toId]
  const movesOf = new Map();
  const order = [k0];
  states.set(k0, { st: start, depth: 0, id: 0 });
  const queue = [k0];
  let truncated = false;

  while (queue.length) {
    const k = queue.shift();
    const node = states.get(k);
    const nb = neighbors(node.st, ruleset);
    movesOf.set(k, nb.map(n => n.move));
    for (const { move, state } of nb) {
      const nk = key(state);
      let tgt = states.get(nk);
      if (!tgt) {
        if (states.size >= cap) { truncated = true; continue; }
        tgt = { st: state, depth: node.depth + 1, id: states.size };
        states.set(nk, tgt);
        queue.push(nk);
      }
      edges.push([node.id, tgt.id]);
    }
    if (truncated) break;
  }

  // 反向 BFS：求每个状态到“目标”的最短距离（win = 可解）
  const goalIds = [];
  for (const [, v] of states) if (isGoal(v.st, ruleset)) goalIds.push(v.id);
  const radj = Array.from({ length: states.size }, () => []);
  for (const [a, b] of edges) radj[b].push(a);
  const dist = new Int32Array(states.size).fill(-1);
  const q2 = [...goalIds];
  for (const id of q2) dist[id] = 0;
  while (q2.length) {
    const id = q2.shift();
    for (const p of radj[id]) if (dist[p] === -1) { dist[p] = dist[id] + 1; q2.push(p); }
  }

  const startNode = states.get(k0);
  const startWin = dist[startNode.id] !== -1 || goal;
  const minMoves = goal ? 0 : (dist[startNode.id] === -1 ? null : dist[startNode.id]);

  let unwinnable = 0, deadEnd = 0, noPop = 0, popStates = 0, processed = 0;
  for (const [k, v] of states) {
    if (!movesOf.has(k)) continue;   // 截断时未展开的状态不计入统计
    processed++;
    if (!isGoal(v.st, ruleset)) {
      if (dist[v.id] === -1) unwinnable++;
      const mv = movesOf.get(k) || [];
      if (mv.length === 0) deadEnd++;
      if (ruleset === 'A') {
        if (mv.some(m => m.res === 'pop')) popStates++; else noPop++;
      }
    }
  }

  // 最优首步个数（=1 表示开局被逼唯一解，过高表示无差别）
  let optFirst = 0;
  if (startWin && !goal) {
    const nb = neighbors(start, ruleset);
    for (const { state } of nb) {
      const nk = key(state);
      const t = states.get(nk);
      if (isGoal(state, ruleset)) { if (minMoves === 1) optFirst++; }
      else if (t && dist[t.id] === minMoves - 1) optFirst++;
    }
  }

  const branch0 = neighbors(start, ruleset).length;
  const pops0 = ruleset === 'A' ? genA(start).filter(m => m.res === 'pop').length : null;

  return {
    solvable: !!startWin && !truncated,
    truncated,
    minMoves,
    states: states.size,
    unwinnable,
    deadEnd,
    noPop,
    popStates,
    branch0,
    pops0,
    optFirst,
  };
}

// 最短解路径（返回 [ {move, before, after} ] ）
export function solvePath(start, ruleset, cap = 250000) {
  const k0 = key(start);
  if (isGoal(start, ruleset)) return [];
  const prev = new Map([[k0, null]]);
  const queue = [k0];
  const stMap = new Map([[k0, start]]);
  while (queue.length) {
    const k = queue.shift();
    const st = stMap.get(k);
    const nb = neighbors(st, ruleset);
    for (const { move, state } of nb) {
      const nk = key(state);
      if (prev.has(nk)) continue;
      prev.set(nk, { k, move, before: st, after: state });
      if (isGoal(state, ruleset)) {
        const path = [];
        let cur = nk;
        while (prev.get(cur)) {
          const p = prev.get(cur);
          path.push({ move: p.move, before: p.before, after: p.after });
          cur = p.k;
        }
        return path.reverse();
      }
      stMap.set(nk, state);
      queue.push(nk);
      if (prev.size > cap) return null;
    }
  }
  return null;
}

// 固定策略模拟
export function playGreedy(start, ruleset, maxSteps = 120) {
  let st = start;
  for (let step = 0; step < maxSteps; step++) {
    if (isGoal(st, ruleset)) return { win: true, steps: step };
    const nb = neighbors(st, ruleset);
    if (!nb.length) return { win: false, steps: step, reason: 'stuck' };
    let pick;
    if (ruleset === 'A') {
      const pops = nb.filter(n => n.move.res === 'pop');
      pick = (pops.length ? pops : nb)[0];
    } else {
      pick = nb[0];
    }
    st = pick.state;
  }
  return { win: isGoal(st, ruleset), steps: maxSteps, reason: 'cap' };
}

export function playRandom(start, ruleset, trials = 200, maxSteps = 120, rnd = Math.random) {
  let wins = 0;
  for (let t = 0; t < trials; t++) {
    let st = start;
    for (let step = 0; step < maxSteps; step++) {
      if (isGoal(st, ruleset)) { wins++; break; }
      const nb = neighbors(st, ruleset);
      if (!nb.length) break;
      st = nb[Math.floor(rnd() * nb.length)].state;
    }
  }
  return wins / trials;
}