import {
  parse,
  moveFrom,
  isLastPairBlocked,
  applyMove,
  isGoal,
  moveDistance,
  legalMoves,
  countBlocks,
  at,
  isFixed,
  DIRS,
} from './game.js';
import { LEVELS, TOTAL_LEVELS } from './levels.js';
import { SOLUTIONS } from './solutions.js';
import { computeLayout, draw, PALETTE } from './render.js';
import { attachInput, attachKeyboard } from './input.js';
import { createAudio } from './audio.js';

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const elSrStatus = document.getElementById('sr-status');
const stage = document.getElementById('stage');
const elLevel = document.getElementById('level-label');
const elLevelTag = document.getElementById('level-tag');
const elName = document.getElementById('level-name');
const elGoal = document.getElementById('goal');
const elGoalText = document.getElementById('goal-text');
const elMoves = document.getElementById('moves');
const elMovesFill = document.getElementById('moves-fill');
const elMovesPar = document.getElementById('moves-par');
const elHint = document.getElementById('hint');
const elWin = document.getElementById('win');
const elWinKicker = document.getElementById('win-kicker');
const elWinText = document.getElementById('win-text');
const elWinSub = document.getElementById('win-sub');
const elWinCard = elWin.querySelector('.card');
const elStars = document.getElementById('stars');
const elFail = document.getElementById('fail');
const elIntro = document.getElementById('intro');
const elTitle = document.getElementById('title');
const elTitleProgress = document.getElementById('title-progress');
const elLevels = document.getElementById('levels');
const elLevelGrid = document.getElementById('level-grid');
const elLevelSummary = document.getElementById('level-summary');
const elSolution = document.getElementById('solution');
const elSolutionTitle = document.getElementById('solution-title');
const elSolutionNote = document.getElementById('solution-note');
const elSolutionList = document.getElementById('solution-list');
const btnTitleStart = document.getElementById('title-start');
const btnTitleLevels = document.getElementById('title-levels');
const elTitleDemo = document.getElementById('title-demo');
const btnIntroOk = document.getElementById('intro-ok');
const btnHelp = document.getElementById('help');
const btnSound = document.getElementById('sound');
const btnTheme = document.getElementById('theme');
const btnLevels = document.getElementById('levels-btn');
const btnLevelsClose = document.getElementById('levels-close');
const btnUndo = document.getElementById('undo');
const btnHint = document.getElementById('hint-btn');
const btnSolutionClose = document.getElementById('solution-close');
const btnRestart = document.getElementById('restart');
const btnNext = document.getElementById('next');
const btnAgain = document.getElementById('again');
const btnFailUndo = document.getElementById('fail-undo');
const btnFailRestart = document.getElementById('fail-restart');
const btnZoomOut = document.getElementById('zoom-out');
const btnZoomFit = document.getElementById('zoom-fit');
const btnZoomIn = document.getElementById('zoom-in');

const audio = createAudio();
const INTRO_KEY = 'zgz.seenIntro.v2';
const TITLE_KEY = 'zgz.seenTitle.v1';
const SAVE_KEY = 'zgz.save.v2';
const THEME_KEY = 'zgz.theme';
const ZOOM_KEY = 'zgz.zoom.v1';
const DPR = Math.min(window.devicePixelRatio || 1, 2);
const COLOR_NAMES = ['红', '蓝', '绿', '黄', '紫'];
const HITSTOP = 60;
const REDUCE_MOTION =
  window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
const STAGES = {
  1: { title: '阶段 1 · 学会停住', blurb: '拖一下，看它停在哪' },
  2: { title: '阶段 2 · 墙是刹车', blurb: '借墙和异色块搭出落点' },
  3: { title: '阶段 3 · 只清目标色', blurb: '别的颜色是墙，也是工具' },
  4: { title: '阶段 4 · 双刹车耦合', blurb: '一次停靠，同时给后面留路' },
  5: { title: '阶段 5 · 终局精算', blurb: '容错只有一两步' },
};
const metaTheme = document.querySelector('meta[name="theme-color"]');

// 首屏脚本已经把 data-theme 写进 <html>，这里只接管状态与按钮
let theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';

function readSave() {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

const save = readSave();
if (!save.best || typeof save.best !== 'object') save.best = {};
if (!save.stars || typeof save.stars !== 'object') save.stars = {};
// 旧版本把「用过提示」永久记在存档里（assisted / hintPenalty），
// 现在提示扣分只在本次尝试内有效，重开/再进关卡就能重新冲三星，旧的永久记录直接清掉。
delete save.assisted;
delete save.hintPenalty;

let levelIndex = Math.max(
  0,
  LEVELS.findIndex((l) => l.id === save.level),
);
let level = LEVELS[levelIndex];
let state = parse(level.rows);
let moves = 0;
let history = [];
let anim = null;
let animTimer = 0;
let drag = null;
let won = false;
let failed = false;
let layout = computeLayout(320, 320, state.w, state.h);
// 棋盘缩放：1 = 自适应（默认）。放大后棋盘会超出视口，用 pan 记住看哪一块。
const ZOOM_MIN = 0.8;
const ZOOM_MAX = 2;
const ZOOM_STEPS = [0.8, 1, 1.15, 1.3, 1.5, 1.75, 2];
let zoom = readZoom();
let panX = 0;
let panY = 0;
let zoomSaveTimer = 0;
let zoomHintShown = false;
let hintTimer = 0;
let winCountTimer = 0;
let pops = 0;
let pendingUndo = false;
// 本次尝试已经点到第几层提示（0 没点过 / 1 小提示 / 2 下一步 / 3 完整解法）
let hintStep = 0;
// 本次尝试已经被提示扣掉几颗星（0–2）；重开或重新进入关卡时归零
let hintUsed = 0;
let rafId = 0;
let currentCell = null;
// 键盘选中框：{ r, c, picked }，只在键盘操作时存在
let kbd = null;
let srFlip = false;

function persist() {
  save.level = level.id;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    /* 隐私模式忽略 */
  }
}

function setHint(text, revertAfter = 0, tone = '') {
  clearTimeout(hintTimer);
  hintTimer = 0;
  elHint.textContent = text;
  elHint.classList.toggle('is-warn', tone ? tone === 'warn' : deadNow);
  if (revertAfter) {
    hintTimer = setTimeout(() => {
      hintTimer = 0;
      elHint.textContent = baseHint();
    }, revertAfter);
  }
}

function baseHint() {
  const pen = penaltyLine();
  if (deadNow) {
    return `现在的局面可能已经清不完了——撤销一步，或者重开还有救。${pen ? ` ${pen}` : ''}`;
  }
  return `${level.teach}（${level.par} 步内 3★）${pen ? ` ${pen}` : ''}`;
}

// 读屏播报：live region 只在文本变化时发声，所以用零宽字符交替强制刷新
function announce(text) {
  if (!elSrStatus || !text) return;
  srFlip = !srFlip;
  elSrStatus.textContent = (srFlip ? '\u200b' : '') + text;
}

function updateHud() {
  elMoves.textContent = `${moves} / ${level.limit}`;
  elMoves.classList.toggle('warn', moves >= level.limit - 1);
  // 步数条：整条代表上限，填充代表已用，竖线标出三星线（par）
  const ratio = Math.min(1, moves / level.limit);
  elMovesFill.style.width = `${(ratio * 100).toFixed(1)}%`;
  elMovesFill.classList.toggle('over-par', moves > level.par);
  elMovesFill.classList.toggle('tight', moves >= level.limit - 1);
  elMovesPar.style.left = `${((level.par / level.limit) * 100).toFixed(1)}%`;
  elMoves.title = `已用 ${moves} 步 · 上限 ${level.limit} 步 · ${level.par} 步内得 3★`;
  elMoves.setAttribute(
    'aria-label',
    `已用 ${moves} 步，上限 ${level.limit} 步，${level.par} 步内可得三星`,
  );
  updateBoardA11y();
}

// canvas 没法被读屏直接读，所以把「目标 + 场上各色数量 + 步数」写进 aria-label
function updateBoardA11y() {
  const counts = [0, 0, 0, 0, 0];
  let pinned = 0;
  for (let i = 0; i < state.c.length; i++) {
    const v = state.c[i];
    if (v > 0) counts[v - 1]++;
    if (state.fixed && state.fixed[i]) pinned++;
  }
  const parts = [];
  counts.forEach((n, i) => {
    if (n) parts.push(`${COLOR_NAMES[i]}块 ${n} 个`);
  });
  const goal =
    level.goal === 'color' ? `只清${COLOR_NAMES[level.targetColor - 1]}块` : '清空全场';
  const countsText = parts.length ? parts.join('，') : '场上没有方块';
  const pinnedText = pinned ? `，其中 ${pinned} 个带钉子，拖不动，要用同色块撞掉` : '';
  const lastText = state.lastColor
    ? `，${COLOR_NAMES[state.lastColor - 1]}块是最后一对，必须等别的颜色都清完才能消`
    : '';
  canvas.setAttribute(
    'aria-label',
    `第 ${level.id} 关 ${level.name}${level.challenge ? '，挑战关' : ''}。目标${goal}。场上${countsText}${pinnedText}${lastText}。已用 ${moves} 步，上限 ${level.limit} 步，${level.par} 步内三星。方向键选块，空格拿起。`,
  );
}

function updateGoal() {
  if (level.goal === 'color') {
    const name = COLOR_NAMES[level.targetColor - 1] || '目标';
    const color = PALETTE[level.targetColor - 1]?.base || '#ef4444';
    elGoal.classList.add('is-color');
    elGoal.style.setProperty('--goal-color', color);
    elGoalText.textContent = `只清${name}块`;
    elGoal.setAttribute('aria-label', `本关目标：只消除${name}色方块`);
  } else {
    elGoal.classList.remove('is-color');
    elGoal.style.removeProperty('--goal-color');
    elGoalText.textContent = '清空全场';
    elGoal.setAttribute('aria-label', '本关目标：清空全场');
  }
}

function updateUndo() {
  btnUndo.disabled = history.length === 0;
}

function countColor(st, color) {
  let n = 0;
  for (let i = 0; i < st.c.length; i++) if (st.c[i] === color) n++;
  return n;
}

// ---- 提示阶梯 ----
// 第 1 次：只给方向性的小提示，免费。
// 第 2 次：给出「下一步」，扣 1★。
// 第 3 次：打开完整解法，再扣 1★。
// 扣分只对「本次尝试」生效（最多 2★）：重开或重新进入关卡都会回到 0，
// 所以用过提示也能靠重打把三星拿回来。
function addHintPenalty(n) {
  hintUsed = Math.min(2, hintUsed + n);
}

function penaltyLine() {
  const p = hintUsed;
  if (!p) return '';
  return `本次尝试已用提示扣 ${p}★，最高 ${3 - p}★。`;
}

// 阶梯按钮：文案与配色都跟着层级走，玩家能看出「再点一次会更贵」
function updateHintButton() {
  const p = hintUsed;
  const labels = ['提示', '再看提示', '看解法'];
  const paid = p ? `（本次已扣 ${p}★）` : '';
  btnHint.textContent = labels[Math.min(hintStep, 2)];
  // 只有「下一次点击要扣星」时才转琥珀色；重开后第一次仍免费
  btnHint.classList.toggle('escalated', hintStep >= 1);
  if (hintStep === 0) {
    btnHint.title = `提示：第一次只给方向性的小提示，不扣星${paid}`;
    btnHint.setAttribute('aria-label', `提示，第一次不扣星${paid}`);
  } else if (hintStep === 1) {
    btnHint.title = `再看提示：会指出下一步怎么走，扣 1 星${paid}`;
    btnHint.setAttribute('aria-label', `再看提示，会指出下一步，扣一星${paid}`);
  } else {
    btnHint.title = `看解法：完整走法，再扣 1 星${paid}`;
    btnHint.setAttribute('aria-label', `看完整解法，再扣一星${paid}`);
  }
}

function hintOverview() {
  const isColor = level.goal === 'color';
  const target = level.targetColor;
  const name = COLOR_NAMES[target - 1] || '目标';
  const pairsLeft = isColor
    ? Math.ceil(countColor(state, target) / 2)
    : Math.ceil(countBlocks(state) / 2);
  // 关键修复：目标色关卡只统计“目标色”的可消对，不能再把绿色也算进去
  const popsNow = legalMoves(state).filter((m) => {
    if (m.res !== 'pop') return false;
    return !isColor || at(state, m.r, m.c) === target;
  }).length;

  const goalLine = isColor
    ? `还要清 ${pairsLeft} 对${name}块`
    : `场上还剩 ${pairsLeft} 对`;
  let tip;
  if (popsNow >= 2) {
    tip = `现在有 ${popsNow} 对${isColor ? name : ''}能直接消——先想清楚消哪一对更不挡后面的路`;
  } else if (popsNow === 1) {
    tip = `现在只有 1 对${isColor ? name : ''}能直接消——消它之前先看：剩下那块还停得下来吗`;
  } else if (isColor) {
    tip = `没有现成的${name}对——先找一个能「停住」的位置（墙、边界、异色块），把一块送到同伴旁边`;
  } else {
    tip = '没有现成的同色对——先找一个能「停住」的位置（墙、边界、异色块），把一块送到同伴旁边';
  }
  return `${goalLine}；${tip}。`;
}

// 第 1 层：只给方向，不给坐标
function showHintTier1() {
  setHint(`${hintOverview()}再点一次「再看提示」会指出下一步（扣 1★）。`, 12000);
}

// 第 2 层：给出下一步的具体走法（仍然只一步）
function showHintTier2() {
  const first = solutionSteps()[0];
  const prefix = moves
    ? `这份提示从开局起算，你已经走了 ${moves} 步，建议先「重开」再照做。`
    : '';
  if (!first) {
    setHint(`${hintOverview()}${prefix}`, 12000);
    return;
  }
  setHint(
    `下一步：${first}。${prefix}再点一次「看解法」会列出完整走法（再扣 1★）。`,
    14000,
  );
}

function solutionSteps() {
  return (level.nudge || '')
    .split('；')
    .map((s) => s.trim().replace(/。$/, ''))
    .filter(Boolean);
}

function openSolution() {
  if (!level.nudge) return;
  elSolutionTitle.textContent = `第 ${level.id} 关 · ${level.name}`;
  elSolutionNote.textContent = `${
    moves
      ? `这份走法从开局起算；你已经走了 ${moves} 步，建议先点「重开」再照着走。`
      : '这份走法从开局起算，按顺序拖动即可。'
  }${penaltyLine() || '这份走法是本关的完整答案。'}`;
  elSolutionList.replaceChildren(
    ...solutionSteps().map((text) => {
      const li = document.createElement('li');
      li.textContent = text;
      return li;
    }),
  );
  elSolution.classList.remove('hidden');
  btnSolutionClose.focus({ preventScroll: true });
  audio.play('ui');
}

function closeSolution({ restoreFocus = true } = {}) {
  elSolution.classList.add('hidden');
  if (restoreFocus) btnHint.focus({ preventScroll: true });
}

function requestHint() {
  if (won || failed) return;
  const steps = solutionSteps();
  audio.play('ui');
  if (hintStep === 0) {
    hintStep = 1;
    showHintTier1();
  } else if (hintStep === 1) {
    // 数据里没有预置解法时退回第 1 层，绝不能白扣星
    if (!steps.length) {
      setHint(`${hintOverview()}本关没有预置解法，先按这个方向试。`, 12000);
    } else {
      hintStep = 2;
      addHintPenalty(1);
      showHintTier2();
    }
  } else if (!steps.length) {
    setHint('本关没有预置解法，先按提示的方向自己试。', 8000);
  } else if (hintStep === 2) {
    hintStep = 3;
    addHintPenalty(1);
    openSolution();
  } else {
    openSolution();
  }
  updateHintButton();
}

function renderStars(n) {
  const spans = elStars.querySelectorAll('span');
  spans.forEach((s, i) => s.classList.toggle('on', i < n));
}

// 2★ 线取“允许容错”的中段：par + max(1, round(slack/2))。
// 这样 limit=par+2 的关卡终于能拿到 1★，同时不改变任何关卡数据。
function twoStarLine(lv) {
  return lv.par + Math.max(1, Math.round((lv.limit - lv.par) / 2));
}

function starsFor(lv, n, penalty = 0) {
  if (n == null) return 0;
  let stars = 3;
  if (n > lv.par) stars = n <= twoStarLine(lv) ? 2 : 1;
  return Math.max(1, stars - penalty);
}

function storedStars(lv) {
  const saved = save.stars[lv.id];
  if (typeof saved === 'number') return Math.min(3, Math.max(0, saved));
  const best = save.best[lv.id];
  if (best == null) return 0;
  return starsFor(lv, best, 0);
}

// 结算仪式：步数从 0 跳到实际值，给「省了几步」一点存在感
function countUpWinMoves(target, goalWord) {
  clearTimeout(winCountTimer);
  winCountTimer = 0;
  if (REDUCE_MOTION || target <= 0) {
    elWinText.textContent = `用 ${target} 步${goalWord}`;
    return;
  }
  let n = 0;
  elWinText.textContent = `用 0 步${goalWord}`;
  // 先停 180 ms，确保 3 步以内的短关也能看见跳动
  const step = () => {
    n++;
    elWinText.textContent = `用 ${n} 步${goalWord}`;
    if (n < target) winCountTimer = setTimeout(step, 60);
    else winCountTimer = 0;
  };
  winCountTimer = setTimeout(step, 180);
}

function showWin() {
  won = true;
  drag = null;
  // 上一轮如果停在回放里，先把结算卡恢复成正常样子
  stopReplay({ focusBack: false });
  setWinChrome(true);
  const penalty = hintUsed;
  const stars = starsFor(level, moves, penalty);
  renderStars(stars);

  const goalWord =
    level.goal === 'color'
      ? `清掉${COLOR_NAMES[level.targetColor - 1] || '目标'}块`
      : '清空';
  const nextLevel = LEVELS[levelIndex + 1];
  const stageEnd = !nextLevel || nextLevel.stage !== level.stage;
  const stage = STAGES[level.stage];
  const stageEndNow = stageEnd && !!stage;
  const stageName = stage ? stage.title.split('·').pop().trim() : '';
  elWinKicker.textContent = stageEndNow ? `阶段 ${level.stage} 完成` : goalWord;
  elWinCard.classList.toggle('stage-end', stageEndNow);
  if (stageEndNow) {
    clearTimeout(winCountTimer);
    winCountTimer = 0;
    elWinText.textContent = stageName;
  } else {
    countUpWinMoves(moves, goalWord);
  }

  const best = save.best[level.id];
  if (best == null || moves < best) save.best[level.id] = moves;
  const bestNow = save.best[level.id];
  save.stars[level.id] = Math.max(save.stars[level.id] || 0, stars);

  const parLine =
    moves <= level.par
      ? `正好是 ${level.par} 步的最优解。`
      : `最少 ${level.par} 步，多用了 ${moves - level.par} 步。`;
  const lines = [parLine];
  if (bestNow < moves) lines.push(`你的最好成绩：${bestNow} 步。`);
  if (penalty > 0) lines.push(`本次用了提示，扣 ${penalty}★；重开重打可以把星拿回来。`);
  if (stageEndNow) lines.push(`${stage.blurb}。`);
  elWinSub.textContent = lines.join(' ');

  btnNext.textContent = levelIndex === LEVELS.length - 1 ? '选关' : '下一关';
  elWin.classList.remove('hidden');
  btnNext.focus({ preventScroll: true });
  resetDeadCheck();
  setHint(`还剩 ${Math.max(0, level.limit - moves)} 步，不过已经不需要了。`);
  audio.play('win');
  persist();
}

function showFail() {
  failed = true;
  drag = null;
  resetDeadCheck();
  elFail.classList.remove('hidden');
  btnFailUndo.focus({ preventScroll: true });
  setHint('步数用完了。撤销一步可以接着走，步数会退回来。');
  audio.play('fail');
}

// ---- 最优解回放（结算页内的小棋盘，独立于主棋盘：不碰步数 / 历史 / 存档 / 星级） ----
// 走法由 research/gen_paths.mjs 生成、src/solutions.js 提供；test_rules 会逐关回放校验。
const elReplay = document.getElementById('replay');
const elReplayBoard = document.getElementById('replay-board');
const elReplayStatus = document.getElementById('replay-status');
const btnReplay = document.getElementById('replay-btn');
const btnReplayStop = document.getElementById('replay-stop');
const replayCtx = elReplayBoard.getContext('2d');
const DIR_NAMES = { U: '上', D: '下', L: '左', R: '右' };

const replay = { on: false, path: [], idx: 0, st: null, layout: null, anim: null, timer: 0, raf: 0 };

function parseSolutionPath(str) {
  if (!str) return [];
  return str
    .trim()
    .split(/\s+/)
    .map((tok) => {
      const m = /^(\d+),(\d+)([UDLR])$/.exec(tok);
      return m ? { r: Number(m[1]) - 1, c: Number(m[2]) - 1, d: m[3] } : null;
    })
    .filter(Boolean);
}

function setWinChrome(show) {
  for (const el of [elStars, elWinText, elWinSub, btnNext, btnAgain, btnReplay]) {
    if (el) el.hidden = !show;
  }
}

function replayDraw(now) {
  if (!replay.on || !replay.layout) return;
  draw(replayCtx, replay.layout, replay.st, {
    anim: replay.anim,
    now,
    theme,
    reduceMotion: true,
  });
}

function requestReplayDraw() {
  if (!replay.on || replay.raf) return;
  replay.raf = requestAnimationFrame(replayTick);
}

function replayTick(now) {
  replay.raf = 0;
  if (!replay.on) return;
  if (replay.anim && now - replay.anim.t0 >= replay.anim.dur) replay.anim = null;
  replayDraw(now);
  if (replay.anim) requestReplayDraw();
}

function replayResize() {
  if (!replay.on) return;
  const rect = elReplayBoard.getBoundingClientRect();
  const cssW = Math.max(1, Math.floor(rect.width));
  const cssH = Math.max(1, Math.floor(rect.height));
  if (cssW < 2 || cssH < 2) return; // 卡片还没显示出来，等下一帧或 resize 再来
  elReplayBoard.width = Math.floor(cssW * DPR);
  elReplayBoard.height = Math.floor(cssH * DPR);
  replayCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
  replay.layout = computeLayout(cssW, cssH, replay.st.w, replay.st.h);
  replay.anim = null;
  replayDraw(performance.now());
}

function startReplay() {
  if (!won) return;
  const path = parseSolutionPath(SOLUTIONS[level.id]);
  if (!path.length) {
    setHint('这一关暂时没有回放数据。', 2400);
    return;
  }
  replay.path = path;
  replay.idx = 0;
  replay.st = parse(level.rows);
  replay.on = true;
  replay.anim = null;
  // 结算卡让位给回放：星星、标题、按钮先收起来，避免卡片高度来回跳
  setWinChrome(false);
  elReplay.hidden = false;
  elReplayStatus.textContent = `最优解 · 共 ${path.length} 步`;
  btnReplayStop.textContent = '停止回放';
  replayResize();
  btnReplayStop.focus({ preventScroll: true });
  announce(`开始回放最优解，共 ${path.length} 步。`);
  audio.play('ui');
  replay.timer = setTimeout(replayStep, 620);
}

function replayStep() {
  replay.timer = 0;
  if (!replay.on) return;
  if (!replay.layout) replayResize();
  if (replay.idx >= replay.path.length) {
    replayDone();
    return;
  }
  const mv = replay.path[replay.idx];
  const before = replay.st;
  const m = moveFrom(before, mv.r, mv.c, mv.d);
  if (!m) {
    replayDone('这一步在当前局面走不通，先看别的吧。');
    return;
  }
  replay.st = applyMove(before, m);
  replay.idx++;
  const color = before.c[mv.r * before.w + mv.c];
  const dist = moveDistance(m);
  let wait;
  if (m.res === 'pop') {
    const travel = Math.min(160, Math.max(0, (dist - 1) * 55));
    replay.anim = {
      kind: 'pop',
      m,
      before,
      color,
      t0: performance.now(),
      hitstop: 0,
      travel,
      dur: travel + 216,
    };
    wait = travel + 216;
  } else {
    const travelDur = Math.min(260, Math.max(90, dist * 55));
    replay.anim = {
      kind: 'slide',
      m,
      before,
      impact: 'wall',
      t0: performance.now(),
      travelDur,
      dur: travelDur + 120,
    };
    wait = travelDur + 120;
  }
  elReplayStatus.textContent =
    m.res === 'pop'
      ? `第 ${replay.idx}/${replay.path.length} 步 · ${COLOR_NAMES[color - 1]}块消掉一对`
      : `第 ${replay.idx}/${replay.path.length} 步 · ${COLOR_NAMES[color - 1]}块向${DIR_NAMES[mv.d]}`;
  requestReplayDraw();
  replay.timer = setTimeout(replayStep, Math.max(560, wait + 220));
}

function replayDone(note) {
  clearTimeout(replay.timer);
  replay.timer = 0;
  replay.anim = null;
  requestReplayDraw();
  elReplayStatus.textContent =
    note || `回放结束：${replay.path.length} 步，正好是最少步数。`;
  btnReplayStop.textContent = '回到结算';
  announce(elReplayStatus.textContent);
}

function stopReplay({ focusBack = true } = {}) {
  clearTimeout(replay.timer);
  replay.timer = 0;
  if (replay.raf) cancelAnimationFrame(replay.raf);
  replay.raf = 0;
  const wasOn = replay.on;
  replay.on = false;
  replay.anim = null;
  elReplay.hidden = true;
  btnReplayStop.textContent = '停止回放';
  setWinChrome(true);
  if (wasOn && focusBack) btnReplay.focus({ preventScroll: true });
}

// ---- 死局弱提示 ----
// GDD 原本选择「局面清不完也什么都不说」，但对休闲玩家太残酷：
// 「没救」往往是好几步之前造成的，玩家会带着「我还有机会」走完剩下的步数。
// 这里把当前局面丢给后台 Worker 精确验算（剩余步数内是否还能赢），
// 确认赢不了才给一句弱提示——不判负、不打断，撤销或重开都能救。
let deadWorker = null;
let deadBroken = false;
let deadJob = 0;
let deadBusy = false;
let deadQueued = null;
let deadNow = false;

function resetDeadCheck() {
  deadJob++;
  deadBusy = false;
  deadQueued = null;
  deadNow = false;
}

function onDeadReply(ev) {
  deadBusy = false;
  const d = ev.data;
  if (deadQueued && deadWorker) {
    const next = deadQueued;
    deadQueued = null;
    deadBusy = true;
    try {
      deadWorker.postMessage(next);
    } catch {
      deadBusy = false;
    }
  }
  if (!d || d.id !== deadJob || d.win || !d.complete) return;
  if (deadNow || won || failed) return;
  deadNow = true;
  setHint(baseHint(), 0, 'warn');
  announce('这个局面可能已经清不完了，撤销一步或重开还有救。');
}

function ensureDeadWorker() {
  if (deadWorker || deadBroken) return deadWorker;
  if (typeof Worker === 'undefined') {
    deadBroken = true;
    return null;
  }
  try {
    deadWorker = new Worker(new URL('./dead-worker.js', import.meta.url), { type: 'module' });
    deadWorker.onmessage = onDeadReply;
    deadWorker.onerror = () => {
      deadBroken = true;
      deadWorker = null;
      deadBusy = false;
      deadQueued = null;
    };
  } catch {
    deadBroken = true;
    deadWorker = null;
  }
  return deadWorker;
}

function maybeCheckDead() {
  if (deadNow || deadBroken || won || failed) return;
  // 只在前两步之后查：第 1 步就走死的概率低，而且省掉开局的一次搜索
  if (moves < 2) return;
  const budget = level.limit - moves;
  if (budget <= 0) return;
  const w = ensureDeadWorker();
  if (!w) return;
  const job = {
    id: ++deadJob,
    w: state.w,
    h: state.h,
    c: Array.from(state.c),
    fixed: state.fixed ? Array.from(state.fixed) : null,
    lastColor: state.lastColor || 0,
    level: { goal: level.goal, targetColor: level.targetColor },
    budget,
  };
  if (deadBusy) {
    deadQueued = job;
    return;
  }
  deadBusy = true;
  try {
    w.postMessage(job);
  } catch {
    deadBusy = false;
  }
}

function titleSeen() {
  try {
    return localStorage.getItem(TITLE_KEY) === '1';
  } catch {
    return false;
  }
}

function updateTitleProgress() {
  const total = LEVELS.reduce((sum, lv) => sum + storedStars(lv), 0);
  const unlocked = LEVELS.filter((_, i) => isLevelUnlocked(i)).length;
  elTitleProgress.textContent = `已获得 ${total} ★ · 已开放 ${unlocked} / ${LEVELS.length} 关`;
  const hasProgress = levelIndex > 0 || save.best[level.id] != null;
  btnTitleStart.textContent = hasProgress ? `继续第 ${level.id} 关` : '开始游戏';
}

// ---- 标题页小演示：3.4 s 循环，演示「相撞一起消失」和「撞墙停住」 ----
const DEMO_LOOP = 3400;
let demoRaf = 0;
let demoT0 = 0;

function demoRoundRect(c, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

function demoBlock(c, x, y, size, color, scaleX = 1, scaleY = 1, alpha = 1) {
  const w = size * scaleX;
  const h = size * scaleY;
  const dx = x + (size - w) / 2;
  const dy = y + (size - h) / 2;
  if (w < 0.5 || h < 0.5 || alpha <= 0) return;
  c.save();
  c.globalAlpha = alpha;
  demoRoundRect(c, dx, dy, w, h, size * 0.22);
  c.fillStyle = color;
  c.fill();
  c.globalAlpha = alpha * 0.3;
  demoRoundRect(
    c,
    dx + w * 0.16,
    dy + h * 0.12,
    Math.max(1, w * 0.68),
    Math.max(1, h * 0.2),
    size * 0.1,
  );
  c.fillStyle = '#ffffff';
  c.fill();
  c.restore();
}

function drawTitleDemo(now) {
  if (!elTitleDemo) return;
  const c = elTitleDemo.getContext('2d');
  if (!c) return;
  const rect = elTitleDemo.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = Math.max(1, Math.round(rect.width * dpr));
  const ch = Math.max(1, Math.round(rect.height * dpr));
  if (elTitleDemo.width !== cw || elTitleDemo.height !== ch) {
    elTitleDemo.width = cw;
    elTitleDemo.height = ch;
  }
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const W = rect.width;
  const H = rect.height;
  c.clearRect(0, 0, W, H);
  if (W < 8 || H < 8) return;

  const cell = Math.max(20, Math.min(30, H * 0.31));
  const padX = 14;
  const topY = Math.round(H * 0.13);
  const botY = Math.round(H - H * 0.13 - cell);
  // 减少动态时停在「已相撞 / 已停住」的静态画面
  const t = REDUCE_MOTION ? 950 : (now - demoT0) % DEMO_LOOP;
  const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
  const clamp01 = (v) => Math.min(1, Math.max(0, v));

  // 上排：两块红相撞，一起消失
  {
    const bx = W - padX - cell;
    const ax0 = padX;
    const ax1 = bx - cell;
    const p = clamp01(t / 950);
    const ax = ax0 + (ax1 - ax0) * ease(p);
    const pop = REDUCE_MOTION ? 0 : clamp01((t - 950) / 320);
    const shrink = pop > 0 ? Math.max(0, 1 - pop) : 1;
    const alpha = pop > 0 ? 1 - pop : 1;
    if (t < 1270 || REDUCE_MOTION) {
      demoBlock(c, REDUCE_MOTION ? ax1 : ax, topY, cell, '#ef4444', 1 + pop * 0.12, 1 + pop * 0.12, alpha);
      if (pop === 0) demoBlock(c, bx, topY, cell, '#ef4444');
      else demoBlock(c, bx, topY, cell, '#ef4444', shrink, shrink, alpha);
      if (pop > 0) {
        c.save();
        c.globalAlpha = (1 - pop) * 0.7;
        c.strokeStyle = '#f87171';
        c.lineWidth = Math.max(1, cell * 0.08);
        c.beginPath();
        c.arc(ax1 + cell / 2, topY + cell / 2, cell * (0.5 + pop * 0.9), 0, Math.PI * 2);
        c.stroke();
        c.restore();
      }
    }
  }

  // 下排：蓝块滑到墙前停住，轻轻压扁
  {
    const wallW = Math.max(4, cell * 0.2);
    const wallX = W - padX - wallW;
    const x0 = padX;
    const x1 = wallX - cell;
    const p = clamp01((t - 1700) / 950);
    const x = x0 + (x1 - x0) * ease(p);
    const squash = clamp01((t - 2650) / 260);
    const k = Math.sin(squash * Math.PI) * 0.08 * (1 - squash);
    c.save();
    c.globalAlpha = 0.45;
    demoRoundRect(c, wallX, botY - 2, wallW, cell + 4, wallW / 2);
    c.fillStyle = '#94a3b8';
    c.fill();
    c.restore();
    demoBlock(c, REDUCE_MOTION ? x1 : x, botY, cell, '#3b82f6', 1 + k, 1 - k);
  }
}

function startTitleDemo() {
  if (!elTitleDemo) return;
  cancelAnimationFrame(demoRaf);
  demoT0 = performance.now();
  if (REDUCE_MOTION) {
    demoRaf = 0;
    drawTitleDemo(demoT0);
    return;
  }
  const loop = (now) => {
    if (elTitle.classList.contains('hidden')) {
      demoRaf = 0;
      return;
    }
    drawTitleDemo(now);
    demoRaf = requestAnimationFrame(loop);
  };
  demoRaf = requestAnimationFrame(loop);
}

function stopTitleDemo() {
  cancelAnimationFrame(demoRaf);
  demoRaf = 0;
}

function openTitle() {
  updateTitleProgress();
  elTitle.classList.remove('hidden');
  startTitleDemo();
  btnTitleStart.focus({ preventScroll: true });
}

function closeTitle({ showIntro = false } = {}) {
  elTitle.classList.add('hidden');
  stopTitleDemo();
  try {
    localStorage.setItem(TITLE_KEY, '1');
    // 标题页已经讲了规则，首次进入不再叠一层玩法弹窗
    localStorage.setItem(INTRO_KEY, '1');
  } catch {
    /* ignore */
  }
  audio.play('ui');
  if (showIntro) openIntro();
  else canvas.focus({ preventScroll: true });
}

function introSeen() {
  try {
    return localStorage.getItem(INTRO_KEY) === '1';
  } catch {
    return false;
  }
}

function openIntro() {
  elIntro.classList.remove('hidden');
  btnIntroOk.focus({ preventScroll: true });
}

function closeIntro() {
  elIntro.classList.add('hidden');
  try {
    localStorage.setItem(INTRO_KEY, '1');
  } catch {
    /* ignore */
  }
  audio.play('ui');
  canvas.focus({ preventScroll: true });
}

function isLevelUnlocked(index) {
  const lv = LEVELS[index];
  if (!lv) return false;
  if (index === 0) return true;
  if (lv.id === level.id) return true;
  if (save.best[lv.id] != null) return true;
  const prev = LEVELS[index - 1];
  return !!prev && save.best[prev.id] != null;
}

function scrollCurrentIntoView() {
  if (!currentCell) return;
  const grid = elLevelGrid;
  const gr = grid.getBoundingClientRect();
  const cr = currentCell.getBoundingClientRect();
  const target = grid.scrollTop + (cr.top - gr.top) - (gr.height - cr.height) / 2;
  grid.scrollTop = Math.max(0, target);
}

function renderLevelGrid() {
  elLevelGrid.textContent = '';
  currentCell = null;
  let total = 0;
  let unlockedCount = 0;
  let lastStage = 0;

  for (let i = 1; i <= TOTAL_LEVELS; i++) {
    const lv = LEVELS[i - 1];

    // 用数据里现成的 stage 把 50 个数字变成 5 个阶段
    if (lv && lv.stage !== lastStage) {
      lastStage = lv.stage;
      const meta = STAGES[lv.stage] || { title: `阶段 ${lv.stage}`, blurb: '' };
      const head = document.createElement('div');
      head.className = 'stage-head';
      const title = document.createElement('strong');
      title.textContent = meta.title;
      const blurb = document.createElement('span');
      blurb.textContent = meta.blurb;
      head.append(title, blurb);
      elLevelGrid.appendChild(head);
    }

    const best = lv ? save.best[lv.id] : undefined;
    const stars = lv ? storedStars(lv) : 0;
    if (lv) total += stars;
    const unlocked = !!lv && isLevelUnlocked(i - 1);
    if (unlocked) unlockedCount++;
    const isCurrent = !!lv && lv.id === level.id;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `level-cell${unlocked ? '' : ' locked'}${isCurrent ? ' current' : ''}${
      lv && lv.challenge ? ' is-challenge' : ''
    }`;
    btn.disabled = !unlocked;
    if (isCurrent) currentCell = btn;
    if (lv) {
      const stateText =
        best != null ? `最好 ${best} 步，${stars} 星` : '未通关';
      const tagText = lv.challenge ? '，挑战关' : '';
      btn.setAttribute(
        'aria-label',
        `第 ${lv.id} 关 ${lv.name}，${stateText}${tagText}${unlocked ? '' : '，未解锁'}`,
      );
      btn.title = unlocked
        ? `第 ${lv.id} 关 · ${lv.name}${tagText}`
        : `第 ${lv.id} 关 · 未解锁`;
    } else {
      btn.setAttribute('aria-label', `第 ${i} 关，开发中`);
      btn.title = '开发中';
    }

    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = String(i);
    btn.appendChild(num);

    if (lv && lv.challenge) {
      const flag = document.createElement('span');
      flag.className = 'chal';
      flag.textContent = '⚑';
      flag.setAttribute('aria-hidden', 'true');
      btn.appendChild(flag);
    }

    if (!unlocked) {
      const lock = document.createElement('span');
      lock.className = 'lock';
      lock.textContent = '🔒';
      lock.setAttribute('aria-hidden', 'true');
      btn.appendChild(lock);
    } else {
      const starRow = document.createElement('span');
      starRow.className = 'mini-stars';
      starRow.setAttribute('aria-hidden', 'true');
      for (let s = 0; s < 3; s++) {
        const star = document.createElement('span');
        star.textContent = '★';
        if (s < stars) star.className = 'on';
        starRow.appendChild(star);
      }
      btn.appendChild(starRow);

      // 关卡名：玩家靠名字回忆“那关有个大缺口”
      if (lv) {
        const name = document.createElement('span');
        name.className = 'lname';
        name.textContent = lv.name;
        btn.appendChild(name);
      }
      btn.addEventListener('click', () => selectLevel(i - 1));
    }

    elLevelGrid.appendChild(btn);
  }

  const b = document.createElement('b');
  b.textContent = String(total);
  elLevelSummary.textContent = '';
  elLevelSummary.append(
    '已获得 ',
    b,
    ` 颗星 · 已开放 ${unlockedCount} / ${TOTAL_LEVELS} 关`,
  );
}

function openLevels() {
  renderLevelGrid();
  elLevels.classList.remove('hidden');
  requestAnimationFrame(scrollCurrentIntoView);
  btnLevelsClose.focus({ preventScroll: true });
}

function closeLevels() {
  elLevels.classList.add('hidden');
  btnLevels.focus({ preventScroll: true });
  audio.play('ui');
}

function selectLevel(index) {
  if (!isLevelUnlocked(index)) return;
  loadLevel(index);
  elLevels.classList.add('hidden');
  audio.play('ui');
  canvas.focus({ preventScroll: true });
}

function syncSound() {
  const muted = audio.isMuted();
  btnSound.textContent = muted ? '🔇' : '🔊';
  btnSound.setAttribute('aria-label', muted ? '开启音效' : '关闭音效');
  btnSound.setAttribute('aria-pressed', String(!muted));
}

function syncTheme({ persist = false, sound = false } = {}) {
  const light = theme === 'light';
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
  if (metaTheme) metaTheme.setAttribute('content', light ? '#f2f6fc' : '#0b1020');
  btnTheme.textContent = light ? '☀' : '☾';
  const label = light ? '切换到夜间模式' : '切换到日间模式';
  btnTheme.setAttribute('aria-label', label);
  btnTheme.title = label;
  btnTheme.setAttribute('aria-pressed', String(light));
  if (persist) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* 隐私模式忽略 */
    }
  }
  if (sound) audio.play('ui');
  requestDraw();
  if (replay.on) requestReplayDraw();
}

function toggleTheme() {
  theme = theme === 'light' ? 'dark' : 'light';
  syncTheme({ persist: true, sound: true });
}

// ---- 棋盘缩放（1 = 自适应；放大后拖空白处平移） ----
function readZoom() {
  try {
    const v = Number(localStorage.getItem(ZOOM_KEY));
    if (Number.isFinite(v) && v >= ZOOM_MIN && v <= ZOOM_MAX) return v;
  } catch {
    /* 隐私模式 */
  }
  return 1;
}

// 在「自适应尺寸」基础上乘 zoom，并把平移量夹在合理范围：
// 放大后无论怎么拖，至少有一半视口压着棋盘，不会把它拖丢。
function computeBoardLayout(cssW, cssH) {
  const base = computeLayout(cssW, cssH, state.w, state.h);
  if (Math.abs(zoom - 1) < 0.001) {
    panX = 0;
    panY = 0;
    return base;
  }
  const cell = Math.max(10, Math.round(base.cell * zoom));
  const bw = cell * state.w;
  const bh = cell * state.h;
  const centerX = Math.round((cssW - bw) / 2);
  const centerY = Math.round((cssH - bh) / 2);
  let x = centerX;
  let y = centerY;
  if (bw > cssW) {
    const keep = cssW * 0.5;
    x = Math.min(cssW - keep, Math.max(keep - bw, centerX + Math.round(panX)));
    panX = x - centerX;
  } else {
    panX = 0;
  }
  if (bh > cssH) {
    const keep = cssH * 0.5;
    y = Math.min(cssH - keep, Math.max(keep - bh, centerY + Math.round(panY)));
    panY = y - centerY;
  } else {
    panY = 0;
  }
  return { x, y, cell, w: state.w, h: state.h, cssW, cssH };
}

function saveZoomSoon() {
  clearTimeout(zoomSaveTimer);
  zoomSaveTimer = setTimeout(() => {
    zoomSaveTimer = 0;
    try {
      localStorage.setItem(ZOOM_KEY, String(Number(zoom.toFixed(3))));
    } catch {
      /* 隐私模式忽略 */
    }
  }, 260);
}

function updateZoomUi() {
  const pct = Math.round(zoom * 100);
  const atFit = Math.abs(zoom - 1) < 0.001;
  btnZoomFit.textContent = `${pct}%`;
  btnZoomFit.setAttribute(
    'aria-label',
    atFit
      ? '当前棋盘是自适应大小'
      : `当前棋盘缩放 ${pct}%，点一下恢复自适应大小`,
  );
  btnZoomFit.title = atFit ? '当前是自适应大小' : '恢复自适应大小';
  btnZoomOut.disabled = zoom <= ZOOM_MIN + 0.001;
  btnZoomIn.disabled = zoom >= ZOOM_MAX - 0.001;
}

// anchor 是画布坐标：缩放时让这个点下的棋盘内容尽量不动（滚轮/双指用）
function applyZoom(next, anchor) {
  const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
  if (Math.abs(clamped - zoom) < 0.001) return false;
  const cssW = layout.cssW || 320;
  const cssH = layout.cssH || 320;
  const base = computeLayout(cssW, cssH, state.w, state.h);
  const ax = anchor ? anchor.x : cssW / 2;
  const ay = anchor ? anchor.y : cssH / 2;
  const oldCell = Math.max(1, layout.cell);
  const u = (ax - layout.x) / oldCell;
  const v = (ay - layout.y) / oldCell;
  zoom = clamped;
  const cell = Math.max(10, Math.round(base.cell * zoom));
  panX = ax - u * cell - Math.round((cssW - cell * state.w) / 2);
  panY = ay - v * cell - Math.round((cssH - cell * state.h) / 2);
  layout = computeBoardLayout(cssW, cssH);
  updateZoomUi();
  saveZoomSoon();
  requestDraw();
  return true;
}

function stepZoom(delta) {
  const next =
    delta > 0
      ? ZOOM_STEPS.find((z) => z > zoom + 0.001) ?? ZOOM_MAX
      : [...ZOOM_STEPS].reverse().find((z) => z < zoom - 0.001) ?? ZOOM_MIN;
  if (!applyZoom(next, null)) return;
  audio.play('ui');
  announce(`棋盘 ${Math.round(zoom * 100)}%`);
  if (zoom > 1 && !zoomHintShown) {
    zoomHintShown = true;
    setHint('放大后，拖动棋盘空白处可以移动视野；点中间百分比回到自适应。', 2800);
  }
}

function resetZoom() {
  if (!applyZoom(1, null)) return;
  audio.play('ui');
  announce('棋盘已恢复自适应大小。');
  setHint(baseHint());
}

function resize() {
  const rect = stage.getBoundingClientRect();
  const cssW = Math.max(1, Math.floor(rect.width));
  const cssH = Math.max(1, Math.floor(rect.height));
  canvas.width = Math.floor(cssW * DPR);
  canvas.height = Math.floor(cssH * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  layout = computeBoardLayout(cssW, cssH);
  updateZoomUi();
  requestDraw();
  if (replay.on) replayResize();
}

function cancelAnim() {
  clearTimeout(animTimer);
  animTimer = 0;
  anim = null;
}

function loadLevel(index) {
  levelIndex = (index + LEVELS.length) % LEVELS.length;
  level = LEVELS[levelIndex];
  state = parse(level.rows);
  moves = 0;
  history = [];
  pops = 0;
  pendingUndo = false;
  hintStep = 0;
  hintUsed = 0;
  clearTimeout(winCountTimer);
  winCountTimer = 0;
  resetDeadCheck();
  cancelAnim();
  stopReplay({ focusBack: false });
  drag = null;
  kbd = null;
  panX = 0;
  panY = 0;
  won = false;
  failed = false;
  elWin.classList.add('hidden');
  elFail.classList.add('hidden');
  elLevels.classList.add('hidden');
  elTitle.classList.add('hidden');
  closeSolution({ restoreFocus: false });
  elLevel.textContent = `第 ${level.id} 关`;
  elName.textContent = level.name;
  if (elLevelTag) elLevelTag.hidden = !level.challenge;
  updateGoal();
  document.title = `${level.challenge ? '⚑ ' : ''}${level.name} · 撞个正着`;
  // 挑战关进关先播一句“会更费脑”，6.5 秒后回到本关的 teach；普通关直接显示 teach
  setHint(
    level.challenge && level.caution ? `⚑ 挑战关 · ${level.caution}` : baseHint(),
    level.challenge ? 6500 : 0,
  );
  if (level.challenge && level.caution) announce(`挑战关。${level.caution}`);
  updateHud();
  updateUndo();
  updateHintButton();
  resize();
  persist();
}

function invalidHint(r, c, dir) {
  const self = at(state, r, c);
  if (isFixed(state, r, c)) {
    return '这块被钉死了，拖不动——用同色块撞它才能拆掉。';
  }
  if (isLastPairBlocked(state, r, c, dir)) {
    return '这是最后一对——先把别的颜色清完，它才能消。';
  }
  const [dr, dc] = DIRS[dir];
  const next = at(state, r + dr, c + dc);
  if (next > 0 && next !== self) {
    return '异色方块挡住去路，推不动——换个方向，或者先把它弄走。';
  }
  if (next === -1) return '前面是墙或边界，换个方向。';
  return '这个方向滑不动，换个方向试试。';
}

// 锚块拖不动：给“钉住”的反馈，而不是普通的“被挡住”
function pinnedFeedback(r, c) {
  if (anim || won || failed) return;
  setHint('这块被钉死了，拖不动——用同色块撞它才能拆掉。', 2800, 'warn');
  audio.play('bounce');
  playAnim({ kind: 'shake', r, c, t0: performance.now(), dur: 280 });
  announce('这块被钉死了，拖不动。用同色块撞它才能拆掉。');
}

function commit({ r, c, dir }) {
  if (anim || won || failed) return;
  const m = moveFrom(state, r, c, dir);
  if (!m) {
    if (isFixed(state, r, c)) {
      pinnedFeedback(r, c);
      return;
    }
    setHint(invalidHint(r, c, dir), 2200);
    audio.play('bounce');
    playAnim({ kind: 'bounce', r, c, dir, t0: performance.now(), dur: 220 });
    return;
  }

  const before = state;
  const color = before.c[r * before.w + c];
  const poppedAnchor =
    m.res === 'pop' &&
    !!before.fixed &&
    (before.fixed[m.r * before.w + m.c] === 1 || before.fixed[m.br * before.w + m.bc] === 1);
  history.push({ state, moves, pops, m, color });
  if (history.length > 300) history.shift();

  state = applyMove(state, m);
  moves++;
  if (m.res === 'pop') pops++;
  updateHud();
  updateUndo();
  setHint(baseHint());

  // 读屏播报这一步的结果（鼠标 / 键盘都走这里）
  if (m.res === 'pop') {
    const pairsLeft =
      level.goal === 'color'
        ? Math.ceil(countColor(state, level.targetColor) / 2)
        : Math.ceil(countBlocks(state) / 2);
    announce(
      poppedAnchor
        ? `钉子被${COLOR_NAMES[color - 1]}块撞掉了${pairsLeft ? `，还剩 ${pairsLeft} 对` : ''}。`
        : `两块${COLOR_NAMES[color - 1]}块撞在一起消失了${pairsLeft ? `，还剩 ${pairsLeft} 对` : ''}。`,
    );
  } else {
    announce(
      `${COLOR_NAMES[color - 1]}块滑到第 ${m.tr + 1} 行第 ${m.tc + 1} 列，用了 ${moves} 步。`,
    );
  }

  const dist = moveDistance(m);
  if (m.res === 'pop') {
    const travel = Math.min(160, Math.max(0, (dist - 1) * 55));
    playAnim({
      kind: 'pop',
      m,
      before,
      color,
      t0: performance.now(),
      hitstop: HITSTOP,
      travel,
      dur: HITSTOP + travel + 216,
    });
    audio.play('pop');
  } else {
    const [dr, dc] = DIRS[dir];
    const hit = at(before, m.tr + dr, m.tc + dc);
    const impact = hit > 0 ? 'block' : 'wall';
    const travelDur = Math.min(260, Math.max(90, dist * 55));
    playAnim({
      kind: 'slide',
      m,
      before,
      impact,
      t0: performance.now(),
      travelDur,
      dur: travelDur + 150,
    });
    audio.play('slide');
    // 落地时再给一声：撞墙闷、撞异色脆
    audio.play(impact === 'block' ? 'landBlock' : 'landWall', {
      delay: travelDur / 1000,
    });
  }
}

// 动画结束用计时器判定，而不是依赖 rAF：
// rAF 在后台标签页/不可见窗口会被节流甚至完全停摆，若用它收尾，输入会永久锁死。
function playAnim(next) {
  anim = next;
  clearTimeout(animTimer);
  animTimer = setTimeout(() => {
    animTimer = 0;
    anim = null;
    if (pendingUndo) {
      pendingUndo = false;
      requestDraw();
      if (!won && history.length) undo();
      return;
    }
    requestDraw();
    if (next.kind === 'rewind' || next.kind === 'shake') return;
    if (won || failed) return;
    if (isGoal(state, level)) {
      showWin();
      return;
    }
    if (moves >= level.limit) showFail();
    else maybeCheckDead();
  }, next.dur + 16);
}

function undo() {
  if (won) return;
  if (!history.length) return;
  // 动画期间点撤销：排队，等这一步演完立刻执行，绝不静默吞掉
  if (anim) {
    pendingUndo = true;
    setHint('撤销已排队，这一步结束后立即执行。', 1200);
    return;
  }
  pendingUndo = false;
  const prev = history.pop();
  state = prev.state;
  moves = prev.moves;
  pops = prev.pops;
  kbd = null;
  resetDeadCheck();
  if (failed) {
    failed = false;
    elFail.classList.add('hidden');
    canvas.focus({ preventScroll: true });
  }
  setHint(baseHint());
  updateHud();
  updateUndo();
  // 撤销不是瞬移：把刚才那一步倒着演 160ms（减少动态时仍然直接跳回）
  if (prev.m && !REDUCE_MOTION) {
    audio.play('rewind');
    playAnim({
      kind: 'rewind',
      m: prev.m,
      color: prev.color,
      t0: performance.now(),
      dur: 160,
    });
    requestDraw();
  } else {
    audio.play('ui');
    requestDraw();
  }
}

function requestDraw() {
  if (rafId) return;
  rafId = requestAnimationFrame(tick);
}

function tick(now) {
  rafId = 0;
  draw(ctx, layout, state, {
    drag,
    anim,
    now,
    theme,
    reduceMotion: REDUCE_MOTION,
    selected: kbd,
  });
  // 空闲时停止重绘：只有动画/拖拽期间才继续要下一帧
  if (anim || drag) requestDraw();
}

attachInput(canvas, {
  getLayout: () => layout,
  getState: () => state,
  isBlocked: () => !!anim || won || failed,
  onDrag: (d) => {
    drag = d;
    requestDraw();
  },
  onCancel: () => {
    drag = null;
    requestDraw();
  },
  onCommit: (g) => {
    drag = null;
    commit(g);
    requestDraw();
  },
  onPinned: (g) => {
    drag = null;
    pinnedFeedback(g.r, g.c);
    requestDraw();
  },
});

// ---- 缩放手势：滚轮 / 双指捏合 / 拖空白处平移（拖方块仍走 attachInput） ----
const gesture = { pts: new Map(), pan: null, pinch: null };

function pointCell(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const c = Math.floor((clientX - rect.left - layout.x) / layout.cell);
  const r = Math.floor((clientY - rect.top - layout.y) / layout.cell);
  if (r < 0 || c < 0 || r >= state.h || c >= state.w) return null;
  return { r, c };
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  const hit = pointCell(e.clientX, e.clientY);
  const onBlock = !!hit && state.c[hit.r * state.w + hit.c] > 0;
  gesture.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (gesture.pts.size === 1) {
    if (onBlock) return; // 方块上的按下交给拖块逻辑
    gesture.pan = { x0: e.clientX, y0: e.clientY, baseX: panX, baseY: panY, moved: false };
  } else if (gesture.pts.size === 2) {
    gesture.pan = null;
    const [a, b] = [...gesture.pts.values()];
    gesture.pinch = {
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      zoom,
    };
  } else {
    return;
  }
  // 抓住指针：拖到画布外再松手也能收到 pointerup，不会留下「幽灵手指」
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    /* 合成事件没有真实指针，忽略 */
  }
});

canvas.addEventListener('pointermove', (e) => {
  const p = gesture.pts.get(e.pointerId);
  if (!p) return;
  p.x = e.clientX;
  p.y = e.clientY;
  if (gesture.pinch && gesture.pts.size === 2) {
    const [a, b] = [...gesture.pts.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const rect = canvas.getBoundingClientRect();
    applyZoom(gesture.pinch.zoom * (dist / gesture.pinch.dist), {
      x: (a.x + b.x) / 2 - rect.left,
      y: (a.y + b.y) / 2 - rect.top,
    });
    return;
  }
  if (!gesture.pan) return;
  const dx = e.clientX - gesture.pan.x0;
  const dy = e.clientY - gesture.pan.y0;
  if (!gesture.pan.moved && Math.hypot(dx, dy) < 6) return;
  gesture.pan.moved = true;
  panX = gesture.pan.baseX + dx;
  panY = gesture.pan.baseY + dy;
  layout = computeBoardLayout(layout.cssW, layout.cssH);
  requestDraw();
});

function endGesture(e) {
  const wasZooming = !!gesture.pinch;
  const wasPanning = !!gesture.pan;
  gesture.pts.delete(e.pointerId);
  if (gesture.pts.size < 2) gesture.pinch = null;
  if (gesture.pts.size === 0) {
    gesture.pan = null;
    if (wasZooming || wasPanning) saveZoomSoon();
  }
}
// 监听 window：手指/鼠标在画布外松开也能收到，避免留下过期的指针
window.addEventListener('pointerup', endGesture);
window.addEventListener('pointercancel', endGesture);
window.addEventListener('blur', () => {
  gesture.pts.clear();
  gesture.pan = null;
  gesture.pinch = null;
});

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    applyZoom(zoom * Math.exp(-d * 0.0016), {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  },
  { passive: false },
);

// 键盘缩放：+ / - / 0（方向键仍由 attachKeyboard 处理）
canvas.addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.key === '+' || e.key === '=') {
    e.preventDefault();
    stepZoom(1);
  } else if (e.key === '-' || e.key === '_') {
    e.preventDefault();
    stepZoom(-1);
  } else if (e.key === '0') {
    e.preventDefault();
    resetZoom();
  }
});

// 键盘操作：方向键选块、空格拿起、拿起后方向键直接走、Esc 放下
attachKeyboard(canvas, {
  getState: () => state,
  isBlocked: () => !!anim || won || failed,
  onSelect: (sel, picked, quiet) => {
    kbd = sel ? { r: sel.r, c: sel.c, picked } : null;
    requestDraw();
    if (!sel || quiet) return;
    const v = at(state, sel.r, sel.c);
    const name = v > 0 ? COLOR_NAMES[v - 1] : '空';
    if (v > 0 && isFixed(state, sel.r, sel.c)) {
      announce(
        `选中${name}块（被钉住），第 ${sel.r + 1} 行第 ${sel.c + 1} 列。这块拖不动，要用同色块撞它。`,
      );
      return;
    }
    if (picked) {
      announce(
        `拿起${name}块，第 ${sel.r + 1} 行第 ${sel.c + 1} 列。按方向键滑出去，Esc 放下。`,
      );
    } else {
      announce(`选中${name}块，第 ${sel.r + 1} 行第 ${sel.c + 1} 列。空格拿起。`);
    }
  },
  onCommit: (g) => {
    commit(g);
    requestDraw();
  },
  onInvalid: (g) => {
    commit(g);
    if (!isFixed(state, g.r, g.c)) announce('这个方向走不动，换一个方向试试。');
    requestDraw();
  },
});

btnUndo.addEventListener('click', undo);
btnHint.addEventListener('click', requestHint);
btnSolutionClose.addEventListener('click', closeSolution);
elSolution.addEventListener('click', (e) => {
  if (e.target === elSolution) closeSolution();
});
btnRestart.addEventListener('click', () => {
  loadLevel(levelIndex);
  canvas.focus({ preventScroll: true });
});
btnNext.addEventListener('click', () => {
  if (levelIndex === LEVELS.length - 1) {
    audio.play('ui');
    openLevels();
  } else {
    loadLevel(levelIndex + 1);
    canvas.focus({ preventScroll: true });
  }
});
btnAgain.addEventListener('click', () => {
  loadLevel(levelIndex);
  canvas.focus({ preventScroll: true });
});
btnReplay.addEventListener('click', startReplay);
btnReplayStop.addEventListener('click', () => stopReplay());
btnZoomOut.addEventListener('click', () => stepZoom(-1));
btnZoomIn.addEventListener('click', () => stepZoom(1));
btnZoomFit.addEventListener('click', resetZoom);
btnFailUndo.addEventListener('click', undo);
btnFailRestart.addEventListener('click', () => {
  loadLevel(levelIndex);
  canvas.focus({ preventScroll: true });
});
btnIntroOk.addEventListener('click', closeIntro);
btnHelp.addEventListener('click', () => {
  audio.play('ui');
  openIntro();
});
btnLevels.addEventListener('click', () => {
  audio.play('ui');
  openLevels();
});
btnLevelsClose.addEventListener('click', closeLevels);
elLevels.addEventListener('click', (e) => {
  if (e.target === elLevels) closeLevels();
});
btnSound.addEventListener('click', () => {
  audio.toggle();
  syncSound();
  if (!audio.isMuted()) audio.play('ui');
});
btnTheme.addEventListener('click', toggleTheme);
btnTitleStart.addEventListener('click', () => closeTitle());
btnTitleLevels.addEventListener('click', () => {
  closeTitle();
  openLevels();
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (replay.on) {
    stopReplay();
    return;
  }
  if (!elTitle.classList.contains('hidden')) {
    closeTitle();
    return;
  }
  if (!elSolution.classList.contains('hidden')) {
    closeSolution();
    return;
  }
  if (!elLevels.classList.contains('hidden')) {
    closeLevels();
    return;
  }
  if (!elIntro.classList.contains('hidden')) closeIntro();
});
// 首次交互解锁 AudioContext（浏览器自动播放策略）
window.addEventListener('pointerdown', () => audio.unlock(), { once: true });

syncSound();
syncTheme();
loadLevel(levelIndex);
if (!titleSeen()) openTitle();
else if (!introSeen()) openIntro();

const ro = new ResizeObserver(resize);
ro.observe(stage);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) requestDraw();
});

resize();
requestDraw();

// 只在本地开发环境暴露调试钩子；生产（GitHub Pages）完全不定义
const isLocalHost =
  ['localhost', '127.0.0.1', '::1', '[::1]'].includes(location.hostname) ||
  location.protocol === 'file:';
if (isLocalHost) {
  window.__zgz = {
    get level() {
      return level;
    },
    get levelIndex() {
      return levelIndex;
    },
    levels: LEVELS,
    get state() {
      return state;
    },
    get fixed() {
      return state.fixed ? Array.from(state.fixed) : null;
    },
    get lastColor() {
      return state.lastColor || 0;
    },
    get layout() {
      return layout;
    },
    get moves() {
      return moves;
    },
    get history() {
      return history;
    },
    get won() {
      return won;
    },
    get failed() {
      return failed;
    },
    get anim() {
      return anim;
    },
    get drag() {
      return drag;
    },
    get pendingUndo() {
      return pendingUndo;
    },
    get hintStep() {
      return hintStep;
    },
    get hintPenalty() {
      return hintUsed;
    },
    get deadNow() {
      return deadNow;
    },
    get selection() {
      return kbd;
    },
    get theme() {
      return theme;
    },
    starsFor,
    twoStarLine,
    storedStars,
    requestHint,
    toggleTheme,
    setTheme(next) {
      theme = next === 'light' ? 'light' : 'dark';
      syncTheme({ persist: true });
    },
    commit,
    undo,
    loadLevel,
    resize,
    reset() {
      loadLevel(levelIndex);
    },
    audio,
    openIntro,
    closeIntro,
    openTitle,
    closeTitle,
    openLevels,
    closeLevels,
    renderLevelGrid,
    isLevelUnlocked,
    save,
    get replay() {
      return replay;
    },
    get solutions() {
      return SOLUTIONS;
    },
    startReplay,
    stopReplay,
    get zoom() {
      return zoom;
    },
    get pan() {
      return { x: panX, y: panY };
    },
    stepZoom,
    resetZoom,
    // 手动渲染一帧：用于不可见窗口（rAF 被冻结）时截图/取色排查
    redraw(now = performance.now()) {
      draw(ctx, layout, state, {
        drag,
        anim,
        now,
        theme,
        reduceMotion: REDUCE_MOTION,
        selected: kbd,
      });
    },
  };
}