// 临时脚本：第 5 关「红色两对」盘面搜索（打分版）
// 规格：5x5 内场、4 红 + 1 蓝 + 1 绿 + 1 内墙（6 块 / 3 色）、只清红、par 4、上限 6
// 关键事实：同色在同一线上必然双消，所以「红给红当刹车」在规则上不存在。
// 第 5 关真正的取舍是「哪两块配成一对」+「把蓝/绿推到哪个位置当刹车」。
import { parse, legalMoves, applyMove, isGoal, at } from '../src/game.js';

const DIRS = { U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1] };
const TARGET = 1;
const MAX_NODES = 400000;

function key(st) {
  let s = '';
  for (let i = 0; i < st.c.length; i++) {
    const v = st.c[i];
    if (v > 0) s += String.fromCharCode(48 + i + v * 40);
  }
  return s;
}

function bfsDepth(start, lv, cap, banned) {
  if (isGoal(start, lv)) return 0;
  const seen = new Set([key(start)]);
  let frontier = [start];
  for (let depth = 1; depth <= cap; depth++) {
    const next = [];
    for (const st of frontier) {
      for (const m of legalMoves(st)) {
        if (banned && banned(m, st)) continue;
        const ns = applyMove(st, m);
        if (isGoal(ns, lv)) return depth;
        const k = key(ns);
        if (seen.has(k)) continue;
        seen.add(k);
        next.push(ns);
        if (seen.size > MAX_NODES) return Infinity;
      }
    }
    if (!next.length) break;
    frontier = next;
  }
  return Infinity;
}

function fullAnalyze(lv) {
  const start = parse(lv.rows);
  const index = new Map([[key(start), 0]]);
  const states = [start];
  const adj = [];
  let head = 0;
  while (head < states.length) {
    const st = states[head];
    for (const m of legalMoves(st)) {
      const ns = applyMove(st, m);
      const k = key(ns);
      if (!index.has(k)) {
        index.set(k, states.length);
        states.push(ns);
      }
      adj.push([head, index.get(k)]);
      if (states.length > 1500000) return null;
    }
    head++;
  }
  const rev = Array.from({ length: states.length }, () => []);
  for (const [a, b] of adj) rev[b].push(a);
  const dist = new Int32Array(states.length).fill(-1);
  const dq = [];
  let dh = 0;
  for (let i = 0; i < states.length; i++) {
    if (isGoal(states[i], lv)) {
      dist[i] = 0;
      dq.push(i);
    }
  }
  while (dh < dq.length) {
    const i = dq[dh++];
    for (const p of rev[i]) if (dist[p] < 0) {
      dist[p] = dist[i] + 1;
      dq.push(p);
    }
  }
  let deadEnds = 0;
  for (let i = 0; i < states.length; i++) {
    if (dist[i] < 0) continue;
    if (!isGoal(states[i], lv) && legalMoves(states[i]).length === 0) deadEnds++;
  }
  const path = [];
  let cur = 0;
  while (dist[cur] > 0) {
    const st = states[cur];
    let nxt = -1;
    for (const m of legalMoves(st)) {
      const to = index.get(key(applyMove(st, m)));
      if (dist[to] === dist[cur] - 1) {
        path.push({ m, st });
        nxt = to;
        break;
      }
    }
    if (nxt < 0) break;
    cur = nxt;
  }
  return { par: dist[0], states: states.length, deadEnds, path };
}

function brakeColor(st, m) {
  if (m.res === 'pop') return at(st, m.br, m.bc);
  const [dr, dc] = DIRS[m.d];
  return at(st, m.tr + dr, m.tc + dc);
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const N = 5;
const all = [];
for (let r = 1; r <= N; r++) for (let c = 1; c <= N; c++) all.push([r, c]);

function build(reds, blues, greens, walls) {
  const g = Array.from({ length: N + 2 }, () => Array(N + 2).fill('.'));
  for (let i = 0; i < N + 2; i++) {
    g[0][i] = '#';
    g[N + 1][i] = '#';
    g[i][0] = '#';
    g[i][N + 1] = '#';
  }
  for (const [r, c] of walls) g[r][c] = '#';
  for (const [r, c] of greens) g[r][c] = 'C';
  for (const [r, c] of blues) g[r][c] = 'B';
  for (const [r, c] of reds) g[r][c] = 'A';
  return g.map((row) => row.join(''));
}

const cfg = {
  tries: Number(process.argv[2] || 1500),
  seed: Number(process.argv[3] || 91),
  maxStates: Number(process.argv[4] || 900000),
};

const rand = rng(cfg.seed);
const funnel = { boards: 0, par4: 0, withOpt: 0, analyzed: 0 };
const candidates = [];

for (let t = 0; t < cfg.tries; t++) {
  const cells = shuffle(all.slice(), rand);
  const rows = build(cells.slice(0, 4), cells.slice(4, 5), cells.slice(5, 6), cells.slice(6, 7));
  const lv = { rows, goal: 'color', targetColor: TARGET };
  funnel.boards++;

  const st0 = parse(rows);
  if (bfsDepth(st0, lv, 4, null) !== 4) continue;
  funnel.par4++;

  const firsts = legalMoves(st0).map((m) => ({
    m,
    d: 1 + bfsDepth(applyMove(st0, m), lv, 3, null),
  }));
  const opt = firsts.filter((x) => x.d === 4);
  if (!opt.length) continue;
  funnel.withOpt++;

  const startPoppable = firsts.filter((x) => x.m.res === 'pop').length;
  const punished = firsts.filter((x) => x.d >= 5).length;

  const path = [];
  {
    let st = st0;
    let remain = 4;
    while (remain > 0) {
      let picked = null;
      for (const m of legalMoves(st)) {
        const ns = applyMove(st, m);
        if (1 + bfsDepth(ns, lv, remain - 1, null) === remain) {
          picked = { m, st };
          break;
        }
      }
      if (!picked) break;
      path.push(picked);
      st = applyMove(st, picked.m);
      remain--;
    }
  }

  const used = new Set();
  for (const p of path) {
    const c0 = at(p.st, p.m.r, p.m.c);
    if (c0 === 2 || c0 === 3) used.add(c0);
    const bc0 = brakeColor(p.st, p.m);
    if (bc0 === 2 || bc0 === 3) used.add(bc0);
  }

  const banned = bfsDepth(st0, lv, 8, (m, s) => {
    if (m.res === 'pop') return false;
    if (at(s, m.r, m.c) === 2 || at(s, m.r, m.c) === 3) return true;
    const bc = brakeColor(s, m);
    return bc === 2 || bc === 3;
  });
  const delta = banned === Infinity ? 99 : banned - 4;

  const score =
    (opt.length === 1 ? 4 : 0) +
    (startPoppable === 0 ? 3 : 0) +
    Math.min(punished, 6) +
    (used.size === 2 ? 2 : 0) +
    (delta >= 2 ? 2 : 0);

  candidates.push({
    rows,
    lv,
    firsts,
    opt,
    startPoppable,
    punished,
    path,
    used: used.size,
    banned,
    delta,
    score,
  });
}

console.log('cfg', cfg);
console.log('funnel', funnel, 'candidates', candidates.length);

candidates.sort((a, b) => b.score - a.score || a.opt.length - b.opt.length);
const found = candidates.slice(0, 10);
console.log('top candidates', found.length);

for (const f of found) {
  console.log(
    `\n=== score ${f.score} | 首步最优 ${f.opt.length} | 开局可消 ${f.startPoppable} | 掉星首步 ${f.punished} | 禁碰杂色后 ${f.banned === Infinity ? '无解' : f.banned} | 用到杂色 ${f.used} ===`,
  );
  f.rows.forEach((r) => console.log('  ' + r));
  console.log('  opt:  ' + f.opt.map((x) => `${x.m.r},${x.m.c}${x.m.d}`).join(' | '));
  console.log('  path: ' + f.path.map((p) => {
    const col = at(p.st, p.m.r, p.m.c);
    const bc = brakeColor(p.st, p.m);
    const tag = p.m.res === 'pop' ? '*' : bc === TARGET ? '[红停]' : bc === 2 ? '[蓝停]' : bc === 3 ? '[绿停]' : bc === -1 ? '[墙]' : '';
    return `${col === 1 ? 'A' : col === 2 ? 'B' : 'C'}${p.m.r},${p.m.c}${p.m.d}${tag}`;
  }).join(' -> '));
}
if (found.length) console.log('\nJSON ' + JSON.stringify(found.map((f) => f.rows)));