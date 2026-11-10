import { moveFrom } from './game.js';

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

  canvas.addEventListener('pointerdown', (e) => {
    if (api.isBlocked() || drag) return;
    const hit = cellAt(e.clientX, e.clientY);
    if (!hit) return;
    const st = api.getState();
    if (st.c[hit.r * st.w + hit.c] <= 0) return;
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
    if (!drag || e.pointerId !== drag.id) return;
    e.preventDefault();
    // 即使没有收到 pointermove，也要按“离起点的距离”判断是否取消
    const dist = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
    finish(dist > CANCEL_RADIUS);
  });

  canvas.addEventListener('pointercancel', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    finish(false);
  });

  // 拖出画布时取消，避免“松手在别处”误触
  window.addEventListener('blur', () => finish(false));
}