/**
 * 死局判定：从当前局面出发，看「剩余步数内是否还可能达成目标」。
 *
 * 只被 dead-worker.js 引用，跑在 Worker 里，主线程不 import 它——
 * 这样 40k 级别的搜索不会卡住拖拽和动画。
 *
 * 结论是「精确」的：返回 win:false 且 complete:true 时，
 * 剩余步数内确实赢不了（可以据此给玩家一个弱提示）。
 * 节点数 / 时间超预算时 complete:false，调用方当作「不知道」。
 */

import { applyMove, countBlocks, isGoal, legalMoves } from './game.js';

const COLOR_SLOTS = 5;

/**
 * 局面编码：同色块互换位置视为同一局面，减少重复展开。
 * 锚块必须从同色块里单独拎出来——它不能动，和"同色的普通块"不是同一局面。
 */
function canonical(st) {
  const anchors = [];
  const pos = [[], [], [], [], []];
  for (let i = 0; i < st.c.length; i++) {
    const v = st.c[i];
    if (v <= 0) continue;
    if (st.fixed && st.fixed[i]) anchors.push(i);
    else pos[v - 1].push(i);
  }
  let key = `f:${anchors.join(',')};`;
  for (let k = 0; k < COLOR_SLOTS; k++) {
    const list = pos[k];
    if (!list.length) continue;
    key += `${k}:${list.join(',')};`;
  }
  return key;
}

/** 还至少要走几步才能达成目标：每次消除只清一对 */
function popsNeeded(st, level) {
  if (level.goal === 'color') {
    let n = 0;
    for (let i = 0; i < st.c.length; i++) if (st.c[i] === level.targetColor) n++;
    return n % 2 ? Infinity : n / 2;
  }
  const n = countBlocks(st);
  return n % 2 ? Infinity : n / 2;
}

function nowMs() {
  return typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now();
}

/**
 * @param {{w:number,h:number,c:Int8Array}} start
 * @param {{goal:string,targetColor?:number}} level
 * @param {number} budget 还能走几步
 * @param {{maxNodes?:number,maxMs?:number}} [opts]
 * @returns {{win:boolean, complete:boolean, nodes:number}}
 */
export function canStillWin(start, level, budget, opts = {}) {
  const maxNodes = opts.maxNodes ?? 150000;
  const maxMs = opts.maxMs ?? 400;
  const t0 = nowMs();
  const seen = new Map();
  let nodes = 0;
  let aborted = false;

  const dfs = (st, depth) => {
    if (isGoal(st, level)) return true;
    if (depth >= budget) return false;
    const need = popsNeeded(st, level);
    if (!Number.isFinite(need) || depth + need > budget) return false;
    const k = canonical(st);
    const prev = seen.get(k);
    if (prev !== undefined && prev <= depth) return false;
    seen.set(k, depth);
    if (++nodes > maxNodes) {
      aborted = true;
      return false;
    }
    if ((nodes & 63) === 0 && nowMs() - t0 > maxMs) {
      aborted = true;
      return false;
    }

    const moves = legalMoves(st);
    // 先试消除：有解时会很快撞到答案，平均耗时更低
    for (let i = 0; i < moves.length; i++) {
      if (moves[i].res !== 'pop') continue;
      if (dfs(applyMove(st, moves[i]), depth + 1)) return true;
      if (aborted) return false;
    }
    for (let i = 0; i < moves.length; i++) {
      if (moves[i].res === 'pop') continue;
      if (dfs(applyMove(st, moves[i]), depth + 1)) return true;
      if (aborted) return false;
    }
    return false;
  };

  const win = dfs(start, 0);
  return { win, complete: win || !aborted, nodes };
}