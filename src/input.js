import { DIRS, isFixed, moveFrom } from './game.js';

// 手指按下时天然会抖 6–12 px；阈值太低会把“想点一下看看”当成落子。
const THRESHOLD = 20;
// 拖出去后再拖回起点附近松手 = 取消（触屏滑动解谜的通行约定）
const CANCEL_RADIUS = 12;

/**
 * 拖拽输入状态机。
 * api: {
 *   getLayout(), getState(), isBlocked(),
 *   onDrag({r,c,dir,move}|null), onCommit({r,c,dir}), onCancel()
 * }
 */
export function attachInput(canvas, api) {
  let drag = null;

  const cellAt = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    const { x, y, cell, w, h } = api.getLayout();
    const c = Math.floor((clientX - rect.left - x) / cell);
    const r = Math.floor((clientY - rect.top - y) / cell);
    if (r < 0 || c < 0 || r >= h || c >= w) return null;
    return { r, c };
  };

  const dirFrom = (dx, dy) => {
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'R' : 'L';
    return dy >= 0 ? 'D' : 'U';
  };

  // 鼠标悬停：桌面端评委用鼠标，先让“这块能拖”看得出来，
  // 再决定要不要按下去。触屏没有 hover，不会走到这里。
  const hoverAt = (e) => {
    if (e.pointerType !== 'mouse' || drag) return;
    if (!api.onHover) return;
    const hit = cellAt(e.clientX, e.clientY);
    if (!hit) {
      api.onHover(null);
      return;
    }
    const st = api.getState();
    if (st.c[hit.r * st.w + hit.c] <= 0) {
      api.onHover(null);
      return;
    }
    api.onHover({ r: hit.r, c: hit.c, fixed: isFixed(st, hit.r, hit.c) });
  };

  canvas.addEventListener('pointermove', hoverAt);
  canvas.addEventListener('pointerleave', () => {
    if (api.onHover) api.onHover(null);
  });
  canvas.addEventListener('pointerdown', () => {
    if (api.onHover) api.onHover(null);
  });

  const update = (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const dist = Math.hypot(dx, dy);
    if (!drag.dir && dist < THRESHOLD) return;

    // 已经拉出方向、但又拖回起点附近：清掉预览，松手时按取消处理
    if (drag.dir && dist <= CANCEL_RADIUS) {
      drag.dir = null;
      drag.move = null;
      drag.backToStart = true;
      api.onDrag(null);
      return;
    }

    drag.backToStart = false;
    const dir = dirFrom(dx, dy);
    if (dir !== drag.dir) {
      drag.dir = dir;
      drag.move = moveFrom(api.getState(), drag.r, drag.c, dir);
    }
    api.onDrag({ r: drag.r, c: drag.c, dir: drag.dir, move: drag.move });
  };

  const finish = (commit) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (commit && d.dir && !d.backToStart) api.onCommit({ r: d.r, c: d.c, dir: d.dir });
    else api.onCancel();
  };

  // 记录按下的手指数：第二根手指落下说明是缩放 / 平移手势，立刻取消拖块
  const pointers = new Set();

  canvas.addEventListener('pointerdown', (e) => {
    pointers.add(e.pointerId);
    if (pointers.size > 1) {
      if (drag) finish(false);
      return;
    }
    if (api.isBlocked() || drag) return;
    const hit = cellAt(e.clientX, e.clientY);
    if (!hit) return;
    const st = api.getState();
    if (st.c[hit.r * st.w + hit.c] <= 0) return;
    // 锚块不进入拖拽状态，直接给“钉住”的反馈
    if (isFixed(st, hit.r, hit.c)) {
      e.preventDefault();
      if (api.onPinned) api.onPinned({ r: hit.r, c: hit.c });
      return;
    }
    e.preventDefault();
    drag = {
      r: hit.r,
      c: hit.c,
      startX: e.clientX,
      startY: e.clientY,
      dir: null,
      move: null,
      id: e.pointerId,
    };
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    e.preventDefault();
    update(e);
  });

  canvas.addEventListener('pointerup', (e) => {
    pointers.delete(e.pointerId);
    if (!drag || e.pointerId !== drag.id) return;
    e.preventDefault();
    // 即使没有收到 pointermove，也要按“离起点的距离”判断是否取消
    const dist = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
    finish(dist > CANCEL_RADIUS);
  });

  canvas.addEventListener('pointercancel', (e) => {
    pointers.delete(e.pointerId);
    if (!drag || e.pointerId !== drag.id) return;
    finish(false);
  });

  // 拖出画布时取消，避免“松手在别处”误触
  window.addEventListener('blur', () => {
    pointers.clear();
    finish(false);
  });

  // 在画布外松手也要清掉指针记录，否则下一次单指会被误判成多指
  window.addEventListener('pointerup', (e) => pointers.delete(e.pointerId));
  window.addEventListener('pointercancel', (e) => pointers.delete(e.pointerId));
}

const KEY_DIR = {
  ArrowUp: 'U',
  ArrowDown: 'D',
  ArrowLeft: 'L',
  ArrowRight: 'R',
};

/**
 * 键盘输入：方向键在方块之间做空间导航，空格拿起，拿起后方向键直接走。
 * 规则层不用改，全部走 moveFrom / commit。
 * api: {
 *   getState(), isBlocked(),
 *   onSelect(sel|null, picked), onCommit({r,c,dir}), onInvalid({r,c,dir})
 * }
 */
export function attachKeyboard(canvas, api) {
  let sel = null;
  let picked = false;

  const blockAt = (r, c) => {
    const st = api.getState();
    return st.c[r * st.w + c] > 0;
  };

  const allBlocks = () => {
    const st = api.getState();
    const out = [];
    for (let r = 0; r < st.h; r++) {
      for (let c = 0; c < st.w; c++) if (st.c[r * st.w + c] > 0) out.push({ r, c });
    }
    return out;
  };

  const nearestTo = (r, c) => {
    let best = null;
    let bestD = Infinity;
    for (const b of allBlocks()) {
      const d = Math.abs(b.r - r) + Math.abs(b.c - c);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  };

  // 朝某个方向找下一块：优先同方向最近的；前方没有就绕到另一端
  const nearestIn = (from, dir) => {
    const [dr, dc] = DIRS[dir];
    const list = allBlocks().filter((b) => b.r !== from.r || b.c !== from.c);
    if (!list.length) return null;
    const proj = (b) => (b.r - from.r) * dr + (b.c - from.c) * dc;
    const perp = (b) => Math.abs((b.r - from.r) * dc - (b.c - from.c) * dr);
    const ahead = list.filter((b) => proj(b) > 0);
    const pool = ahead.length ? ahead : list;
    let best = null;
    let bestScore = Infinity;
    for (const b of pool) {
      const score = (ahead.length ? proj(b) : -proj(b)) * 10 + perp(b);
      if (score < bestScore) {
        bestScore = score;
        best = b;
      }
    }
    return best;
  };

  const emit = (quiet = false) => api.onSelect(sel, picked, quiet);

  canvas.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const dir = KEY_DIR[e.key];

    if (e.key === 'Escape') {
      if (!picked) return;
      e.preventDefault();
      picked = false;
      emit();
      return;
    }
    if (!dir && e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (api.isBlocked()) return;

    if (!sel || !blockAt(sel.r, sel.c)) {
      // 第一次按键：从棋盘中心附近挑一块
      const st = api.getState();
      sel = nearestTo(Math.floor(st.h / 2), Math.floor(st.w / 2));
      picked = false;
      if (!sel) return;
    }

    if (!dir) {
      // 空格 / 回车：拿起 / 放下
      picked = !picked;
      emit();
      return;
    }

    if (!picked) {
      const next = nearestIn(sel, dir);
      if (next) sel = next;
      emit();
      return;
    }

    // 已拿起：方向键就是走这一步
    const m = moveFrom(api.getState(), sel.r, sel.c, dir);
    if (!m) {
      api.onInvalid({ r: sel.r, c: sel.c, dir });
      return;
    }
    api.onCommit({ r: sel.r, c: sel.c, dir });
    picked = false;
    // 走完把选中框跟到方块的新位置；如果是消除，就选最近的一块
    const st = api.getState();
    sel =
      m.res === 'move' && st.c[m.tr * st.w + m.tc] > 0
        ? { r: m.tr, c: m.tc }
        : nearestTo(m.r, m.c);
    // 这一步的结果已经由 commit 播报过了，这里只挪框、不抢播报
    emit(true);
  });

  // 鼠标 / 触屏接管时收起键盘选中框，避免两套高亮同时出现
  canvas.addEventListener('pointerdown', () => {
    if (!sel && !picked) return;
    sel = null;
    picked = false;
    emit();
  });

  canvas.addEventListener('blur', () => {
    if (!sel && !picked) return;
    sel = null;
    picked = false;
    emit();
  });
}