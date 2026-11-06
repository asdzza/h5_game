import { toRows, countBlocks, DIRS } from './engine.mjs';

// ---------- 方案C：配对消除 + 每次消除后重力旋转90° ----------
function genC(st) {
  const out = [];
  for (let r = 0; r < st.h; r++) for (let x = 0; x < st.w; x++) {
    const v = st.c[r * st.w + x];
    if (v <= 0) continue;
    for (const [dr, dx] of [[1, 0], [0, 1]]) {
      const r2 = r + dr, x2 = x + dx;
      if (r2 >= st.h || x2 >= st.w) continue;
      if (st.c[r2 * st.w + x2] === v) out.push({ a: [r, x], b: [r2, x2], color: v });
    }
  }
  return out;
}

function gravity(st, dir) {
  const ns = { w: st.w, h: st.h, c: Int8Array.from(st.c) };
  const [dr, dx] = DIRS[dir];
  if (dr !== 0) {
    for (let x = 0; x < st.w; x++) {
      const order = dr === 1 ? [...Array(st.h).keys()].reverse() : [...Array(st.h).keys()];
      const vals = order.map(r => ns.c[r * st.w + x]).filter(v => v > 0);
      order.forEach((r, i) => { ns.c[r * st.w + x] = i < vals.length ? vals[i] : 0; });
    }
  } else {
    for (let r = 0; r < st.h; r++) {
      const order = dx === 1 ? [...Array(st.w).keys()].reverse() : [...Array(st.w).keys()];
      const vals = order.map(x => ns.c[r * st.w + x]).filter(v => v > 0);
      order.forEach((x, i) => { ns.c[r * st.w + x] = i < vals.length ? vals[i] : 0; });
    }
  }
  return ns;
}

const ROT = { D: 'L', L: 'U', U: 'R', R: 'D' };
const applyC = (st, m, dir) => {
  const ns = { w: st.w, h: st.h, c: Int8Array.from(st.c) };
  ns.c[m.a[0] * st.w + m.a[1]] = 0;
  ns.c[m.b[0] * st.w + m.b[1]] = 0;
  return gravity(ns, ROT[dir]);
};
const goalC = st => countBlocks(st) === 0;

function board(n, colors) {
  const cells = [];
  const per = (n * n) / colors;
  if (!Number.isInteger(per) || per % 2) throw new Error('need even per color');
  for (let c = 1; c <= colors; c++) for (let i = 0; i < per; i++) cells.push(c);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return { w: n, h: n, c: new Int8Array(cells) };
}

function trial(n, colors, trials = 300) {
  let wins = 0, pairSum = 0, steps = 0, stuck = 0, rnd = Math.random;
  for (let t = 0; t < trials; t++) {
    let st = board(n, colors), dir = 'D', ok = true;
    for (let s = 0; s < 400; s++) {
      if (goalC(st)) break;
      const ms = genC(st);
      pairSum += ms.length; steps++;
      if (!ms.length) { stuck++; ok = false; break; }
      st = applyC(st, ms[Math.floor(rnd() * ms.length)], dir);
      dir = ROT[dir];
    }
    if (ok && goalC(st)) wins++;
  }
  return {
    avgPairs: pairSum / steps,
    winRate: wins / trials,
    stuckRate: stuck / trials,
  };
}

for (const [n, colors] of [[6, 3], [6, 6], [5, 2]]) {
  const r = trial(n, colors);
  console.log(`${n}x${n} ${colors}色  平均可选对数=${r.avgPairs.toFixed(2)}  随机通关率=${(r.winRate * 100).toFixed(1)}%  卡死率=${(r.stuckRate * 100).toFixed(1)}%`);
}

const demo = board(6, 3);
console.log('\n示例 6x6 三色盘面（每种12块）:');
console.log(toRows(demo).join('\n'));
console.log('首次可选对数 =', genC(demo).length);