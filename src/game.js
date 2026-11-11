/**
 * 《撞个正着》规则内核
 * 纯函数、无 DOM，可直接在 Node 中 import 做关卡校验。
 * 与 research/engine.mjs 的 A 规则保持一致：
 *  - 命中墙 / 边界：停在最后一个空格
 *  - 命中异色：停在它旁边，不推动
 *  - 命中同色：两块一起消失
 *  - 0 位移且未消除：非法操作
 *  - 锚块（小写 a–e）：不能被拖动，但被同色撞到会一起消失
 *  - 泊位（小写 f–j，对应颜色 A–E）：空位上的彩色停车格；对应颜色停进去一次即算完成
 */

export const DIRS = { U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1] };
export const DIR_KEYS = ['U', 'D', 'L', 'R'];
export const COLORS = ['A', 'B', 'C', 'D', 'E'];

/**
 * rows: 字符画数组。'#' 墙 / '.' 空 / 'A'..'E' 颜色 / 'a'..'e' 同色锚块 /
 * 'f'..'j' 泊位（空位，颜色 A–E）。
 * '1'..'5' 也是颜色，但同时把这一色标成「最后一对」：这一色的最后一次消除
 * 必须是整盘最后一步。fixed 是静态掩码：锚块只在被同色撞掉时清除，
 * 其余时候整盘共享同一份。berths 是静态泊位表，filled 是每位一比特的完成掩码。
 */
export function parse(rows) {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const c = new Int8Array(w * h);
  const fixed = new Uint8Array(w * h);
  const berths = [];
  let lastColor = 0;
  for (let r = 0; r < h; r++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[r][x] ?? '#';
      const i = r * w + x;
      if (ch === '#') c[i] = -1;
      else if (ch === '.') c[i] = 0;
      else if (ch >= '1' && ch <= '5') {
        c[i] = ch.charCodeAt(0) - 48;
        lastColor = c[i];
      } else if (ch >= 'a' && ch <= 'e') {
        c[i] = ch.charCodeAt(0) - 96;
        fixed[i] = 1;
      } else if (ch >= 'f' && ch <= 'j') {
        c[i] = 0;
        berths.push({ i, color: ch.charCodeAt(0) - 101 });
      } else c[i] = ch.charCodeAt(0) - 64;
    }
  }
  return { w, h, c, fixed, lastColor, berths, filled: 0 };
}

export function clone(st) {
  return {
    w: st.w,
    h: st.h,
    c: Int8Array.from(st.c),
    fixed: st.fixed,
    lastColor: st.lastColor,
    berths: st.berths,
    filled: st.filled || 0,
  };
}

/** 还没停好的泊位数 */
export function berthsLeft(st) {
  if (!st.berths || !st.berths.length) return 0;
  let n = 0;
  for (let k = 0; k < st.berths.length; k++) {
    if (!((st.filled || 0) & (1 << k))) n++;
  }
  return n;
}

export function isFixed(st, r, c) {
  if (r < 0 || c < 0 || r >= st.h || c >= st.w) return false;
  return !!(st.fixed && st.fixed[r * st.w + c]);
}

export function at(st, r, c) {
  if (r < 0 || c < 0 || r >= st.h || c >= st.w) return -1;
  return st.c[r * st.w + c];
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

/** 沿方向推演这一手；不追加「最后一对」规则，返回原始走法 */
function traceMove(st, r, c, d) {
  const col = at(st, r, c);
  if (col <= 0) return null;
  if (isFixed(st, r, c)) return null;
  const [dr, dc] = DIRS[d];
  if (!dr && !dc) return null;

  let cr = r + dr;
  let cc = c + dc;
  let lr = r;
  let lc = c;

  for (;;) {
    const v = at(st, cr, cc);
    if (v === -1) {
      if (lr === r && lc === c) return null;
      return { r, c, d, res: 'move', tr: lr, tc: lc };
    }
    if (v === 0) {
      lr = cr;
      lc = cc;
      cr += dr;
      cc += dc;
      continue;
    }
    if (v === col) return { r, c, d, res: 'pop', br: cr, bc: cc };
    if (lr === r && lc === c) return null;
    return { r, c, d, res: 'move', tr: lr, tc: lc };
  }
}

/**
 * 「最后一对」规则：lastColor 的最后一块（对）只能在整盘只剩它时消。
 * 这一色还有 4 块时可以先消一对；只剩 2 块时，若盘上还有别的颜色，这一撞不合法。
 */
function lastPairLocked(st, m) {
  if (!st.lastColor || m.res !== 'pop') return false;
  const col = st.c[m.r * st.w + m.c];
  if (col !== st.lastColor) return false;
  let n = 0;
  for (let i = 0; i < st.c.length; i++) if (st.c[i] === col) n++;
  return n === 2 && countBlocks(st) !== 2;
}

/** 求单个方块沿某方向的走法；不合法返回 null */
export function moveFrom(st, r, c, d) {
  const m = traceMove(st, r, c, d);
  if (!m) return null;
  return lastPairLocked(st, m) ? null : m;
}

/** 给输入反馈用：这一手是否被「最后一对」挡住（而不是被墙 / 异色挡住） */
export function isLastPairBlocked(st, r, c, d) {
  const m = traceMove(st, r, c, d);
  return m ? lastPairLocked(st, m) : false;
}

/** 当前局面全部合法走法 */
export function legalMoves(st) {
  const out = [];
  for (let r = 0; r < st.h; r++) {
    for (let c = 0; c < st.w; c++) {
      if (st.c[r * st.w + c] <= 0) continue;
      if (isFixed(st, r, c)) continue;
      for (const d of DIR_KEYS) {
        const m = moveFrom(st, r, c, d);
        if (m) out.push(m);
      }
    }
  }
  return out;
}

export function applyMove(st, m) {
  const ns = clone(st);
  if (m.res === 'pop') {
    const ai = m.r * st.w + m.c;
    const bi = m.br * st.w + m.bc;
    ns.c[ai] = 0;
    ns.c[bi] = 0;
    // 锚块被撞掉后就不再是锚块；fixed 是共享的静态掩码，只有这一种情况需要复制
    if (st.fixed && (st.fixed[ai] || st.fixed[bi])) {
      ns.fixed = Uint8Array.from(st.fixed);
      ns.fixed[ai] = 0;
      ns.fixed[bi] = 0;
    }
  } else {
    const color = st.c[m.r * st.w + m.c];
    ns.c[m.r * st.w + m.c] = 0;
    ns.c[m.tr * st.w + m.tc] = color;
    // 停进对应颜色的泊位：一次性打勾，之后方块离开也算完成
    if (ns.berths && ns.berths.length) {
      for (let k = 0; k < ns.berths.length; k++) {
        const b = ns.berths[k];
        if (b.color === color && b.i === m.tr * st.w + m.tc) {
          ns.filled = (ns.filled || 0) | (1 << k);
        }
      }
    }
  }
  return ns;
}

/** level: { goal: 'clear' | 'color', targetColor?: 1..5 } */
export function isGoal(st, level) {
  if (berthsLeft(st) > 0) return false;
  if (level.goal === 'color') {
    for (let i = 0; i < st.c.length; i++) if (st.c[i] === level.targetColor) return false;
    return true;
  }
  return countBlocks(st) === 0;
}

/** 给动画用：移动格数 */
export function moveDistance(m) {
  if (m.res === 'move') return Math.abs(m.tr - m.r) + Math.abs(m.tc - m.c);
  return Math.abs(m.br - m.r) + Math.abs(m.bc - m.c);
}