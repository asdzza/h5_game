import { moveFrom } from './game.js';

const THRESHOLD = 10;

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
    if (!drag.dir && Math.hypot(dx, dy) < THRESHOLD) return;

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
    if (commit && d.dir) api.onCommit({ r: d.r, c: d.c, dir: d.dir });
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
    finish(true);
  });

  canvas.addEventListener('pointercancel', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    finish(false);
  });

  // 拖出画布时取消，避免“松手在别处”误触
  window.addEventListener('blur', () => finish(false));
}