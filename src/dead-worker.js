/**
 * 死局判定的后台线程。
 * 主线程把当前棋盘快照发过来，算完再回一条消息；
 * 搜索重的时候也不会卡住拖拽 / 动画 / 输入。
 */

import { canStillWin } from './solver.js';

self.onmessage = (e) => {
  const { id, w, h, c, fixed, lastColor, level, budget } = e.data || {};
  if (!id || !w || !h || !c || !level) return;
  const state = {
    w,
    h,
    c: Int8Array.from(c),
    fixed: fixed ? Uint8Array.from(fixed) : undefined,
    lastColor: lastColor || 0,
  };
  const result = canStillWin(state, level, budget);
  self.postMessage({ id, win: result.win, complete: result.complete, nodes: result.nodes });
};