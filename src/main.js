import {
  parse,
  moveFrom,
  applyMove,
  isGoal,
  moveDistance,
  legalMoves,
  countBlocks,
  at,
  DIRS,
} from './game.js';
import { LEVELS, TOTAL_LEVELS } from './levels.js';
import { computeLayout, draw, PALETTE } from './render.js';
import { attachInput } from './input.js';
import { createAudio } from './audio.js';

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const stage = document.getElementById('stage');
const elLevel = document.getElementById('level-label');
const elName = document.getElementById('level-name');
const elGoal = document.getElementById('goal');
const elGoalText = document.getElementById('goal-text');
const elMoves = document.getElementById('moves');
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

const audio = createAudio();
const INTRO_KEY = 'zgz.seenIntro.v2';
const TITLE_KEY = 'zgz.seenTitle.v1';
const SAVE_KEY = 'zgz.save.v2';
const THEME_KEY = 'zgz.theme';
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

function persist() {
  save.level = level.id;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    /* 隐私模式忽略 */
  }
}

function setHint(text, revertAfter = 0) {
  clearTimeout(hintTimer);
  hintTimer = 0;
  elHint.textContent = text;
  if (revertAfter) {
    hintTimer = setTimeout(() => {
      hintTimer = 0;
      elHint.textContent = baseHint();
    }, revertAfter);
  }
}

function baseHint() {
  const pen = penaltyLine();
  return `${level.teach}（${level.par} 步内 3★）${pen ? ` ${pen}` : ''}`;
}

function updateHud() {
  elMoves.textContent = `${moves} / ${level.limit}`;
  elMoves.classList.toggle('warn', moves >= level.limit - 1);
  elMoves.title = `已用 ${moves} 步 · 上限 ${level.limit} 步 · ${level.par} 步内得 3★`;
  elMoves.setAttribute(
    'aria-label',
    `已用 ${moves} 步，上限 ${level.limit} 步，${level.par} 步内可得三星`,
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
  setHint(`还剩 ${Math.max(0, level.limit - moves)} 步，不过已经不需要了。`);
  audio.play('win');
  persist();
}

function showFail() {
  failed = true;
  drag = null;
  elFail.classList.remove('hidden');
  btnFailUndo.focus({ preventScroll: true });
  setHint('步数用完了。撤销一步可以接着走，步数会退回来。');
  audio.play('fail');
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
    btn.className = `level-cell${unlocked ? '' : ' locked'}${isCurrent ? ' current' : ''}`;
    btn.disabled = !unlocked;
    if (isCurrent) currentCell = btn;
    if (lv) {
      const stateText =
        best != null ? `最好 ${best} 步，${stars} 星` : '未通关';
      btn.setAttribute(
        'aria-label',
        `第 ${lv.id} 关 ${lv.name}，${stateText}${unlocked ? '' : '，未解锁'}`,
      );
      btn.title = unlocked
        ? `第 ${lv.id} 关 · ${lv.name}`
        : `第 ${lv.id} 关 · 未解锁`;
    } else {
      btn.setAttribute('aria-label', `第 ${i} 关，开发中`);
      btn.title = '开发中';
    }

    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = String(i);
    btn.appendChild(num);

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
}

function toggleTheme() {
  theme = theme === 'light' ? 'dark' : 'light';
  syncTheme({ persist: true, sound: true });
}

function resize() {
  const rect = stage.getBoundingClientRect();
  const cssW = Math.max(1, Math.floor(rect.width));
  const cssH = Math.max(1, Math.floor(rect.height));
  canvas.width = Math.floor(cssW * DPR);
  canvas.height = Math.floor(cssH * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  layout = computeLayout(cssW, cssH, state.w, state.h);
  requestDraw();
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
  cancelAnim();
  drag = null;
  won = false;
  failed = false;
  elWin.classList.add('hidden');
  elFail.classList.add('hidden');
  elLevels.classList.add('hidden');
  elTitle.classList.add('hidden');
  closeSolution({ restoreFocus: false });
  elLevel.textContent = `第 ${level.id} 关`;
  elName.textContent = level.name;
  updateGoal();
  document.title = `${level.name} · 撞个正着`;
  setHint(baseHint());
  updateHud();
  updateUndo();
  updateHintButton();
  resize();
  persist();
}

function invalidHint(r, c, dir) {
  const self = at(state, r, c);
  const [dr, dc] = DIRS[dir];
  const next = at(state, r + dr, c + dc);
  if (next > 0 && next !== self) {
    return '异色方块挡住去路，推不动——换个方向，或者先把它弄走。';
  }
  if (next === -1) return '前面是墙或边界，换个方向。';
  return '这个方向滑不动，换个方向试试。';
}

function commit({ r, c, dir }) {
  if (anim || won || failed) return;
  const m = moveFrom(state, r, c, dir);
  if (!m) {
    setHint(invalidHint(r, c, dir), 2200);
    audio.play('bounce');
    playAnim({ kind: 'bounce', r, c, dir, t0: performance.now(), dur: 220 });
    return;
  }

  history.push({ state, moves, pops });
  if (history.length > 300) history.shift();

  const before = state;
  const color = before.c[r * before.w + c];
  state = applyMove(state, m);
  moves++;
  if (m.res === 'pop') pops++;
  updateHud();
  updateUndo();
  setHint(baseHint());

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
    if (won || failed) return;
    if (isGoal(state, level)) {
      showWin();
      return;
    }
    if (moves >= level.limit) showFail();
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
  if (failed) {
    failed = false;
    elFail.classList.add('hidden');
  }
  setHint(baseHint());
  updateHud();
  updateUndo();
  audio.play('ui');
  requestDraw();
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
});

btnUndo.addEventListener('click', undo);
btnHint.addEventListener('click', requestHint);
btnSolutionClose.addEventListener('click', closeSolution);
elSolution.addEventListener('click', (e) => {
  if (e.target === elSolution) closeSolution();
});
btnRestart.addEventListener('click', () => loadLevel(levelIndex));
btnNext.addEventListener('click', () => {
  if (levelIndex === LEVELS.length - 1) {
    audio.play('ui');
    openLevels();
  } else {
    loadLevel(levelIndex + 1);
  }
});
btnAgain.addEventListener('click', () => loadLevel(levelIndex));
btnFailUndo.addEventListener('click', undo);
btnFailRestart.addEventListener('click', () => loadLevel(levelIndex));
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
    // 手动渲染一帧：用于不可见窗口（rAF 被冻结）时截图/取色排查
    redraw(now = performance.now()) {
      draw(ctx, layout, state, { drag, anim, now, theme, reduceMotion: REDUCE_MOTION });
    },
  };
}