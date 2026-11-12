/**
 * 死局判定的后台线程。
 * 主线程把当前棋盘快照发过来，算完再回一条消息；
 * 搜索重的时候也不会卡住拖拽 / 动画 / 输入。
 *
 * 两种任务：
 *  - 默认：判当前局面在剩余步数内还能不能赢（死局弱提示）
 *  - type: 'diagnose'：失败后从最近一步往前找「最后还能赢的存档点」
 */

import { canStillWin } from './solver.js';

function toState(raw) {
  return {
    w: raw.w,
    h: raw.h,
    c: Int8Array.from(raw.c),
    fixed: raw.fixed ? Uint8Array.from(raw.fixed) : undefined,
    lastColor: raw.lastColor || 0,
    berths: Array.isArray(raw.berths) ? raw.berths.map(([i, color]) => ({ i, color })) : [],
    filled: raw.filled || 0,
  };
}

self.onmessage = (e) => {
  const data = e.data || {};

  // 失败诊断：states 按「第 0 步 → 最后一步」排列。
  // 从后往前试，第一个 still winnable 的快照就是「回到这一步还有救」。
  if (data.type === 'diagnose') {
    const states = Array.isArray(data.states) ? data.states : [];
    let index = -1;
    for (let i = states.length - 1; i >= 0; i--) {
      const s = states[i];
      if (!s || !s.c || !data.level) continue;
      const r = canStillWin(toState(s), data.level, s.budget, {
        maxNodes: 80000,
        maxMs: 220,
      });
      if (r.win) {
        index = i;
        break;
      }
    }
    self.postMessage({ type: 'diagnose', id: data.id, index });
    return;
  }

  const { id, w, h, c, fixed, lastColor, berths, filled, level, budget } = data;
  if (!id || !w || !h || !c || !level) return;
  const state = toState({ w, h, c, fixed, lastColor, berths, filled });
  const result = canStillWin(state, level, budget);
  self.postMessage({ id, win: result.win, complete: result.complete, nodes: result.nodes });
};