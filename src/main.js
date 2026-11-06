import {
  parse,
  moveFrom,
  applyMove,
  isGoal,
  moveDistance,
  at,
  DIRS,
} from './game.js';
import { LEVELS, TOTAL_LEVELS } from './levels.js';
import { computeLayout, draw } from './render.js';
import { attachInput } from './input.js';
import { createAudio } from './audio.js';

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const stage = document.getElementById('stage');
const elLevel = document.getElementById('level-label');
const elName = document.getElementById('level-name');
const elMoves = document.getElementById('moves');
const elHint = document.getElementById('hint');
const elWin = document.getElementById('win');
const elWinText = document.getElementById('win-text');
const elWinSub = document.getElementById('win-sub');
const elStars = document.getElementById('stars');
const elFail = document.getElementById('fail');
const elIntro = document.getElementById('intro');
const elLevels = document.getElementById('levels');
const elLevelGrid = document.getElementById('level-grid');
const elLevelSummary = document.getElementById('level-summary');
const btnIntroOk = document.getElementById('intro-ok');
const btnHelp = document.getElementById('help');
const btnSound = document.getElementById('sound');
const btnLevels = document.getElementById('levels-btn');
const btnLevelsClose = document.getElementById('levels-close');
const btnUndo = document.getElementById('undo');
const btnRestart = document.getElementById('restart');
const btnNext = document.getElementById('next');
const btnAgain = document.getElementById('again');
const btnFailUndo = document.getElementById('fail-undo');
const btnFailRestart = document.getElementById('fail-restart');

const audio = createAudio();
const INTRO_KEY = 'zgz.seenIntro.v2';
const SAVE_KEY = 'zgz.save.v2';
const DPR = Math.min(window.devicePixelRatio || 1, 2);

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
let idleTimer = 0;
let pops = 0;
let nudged = false;

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
      elHint.textContent = level.teach;
    }, revertAfter);
  }
}

function updateHud() {
  elMoves.textContent = `${moves} / ${level.limit}`;
  elMoves.classList.toggle('warn', moves >= level.limit - 1);
}

function updateUndo() {
  btnUndo.disabled = history.length === 0;
}

function showNudge() {
  if (nudged || won || failed || !level.nudge) return;
  nudged = true;
  setHint(level.nudge);
}

// 卡住时给一句更具体的提示：15 秒无操作，或连续 3 步都没消掉任何东西。
function scheduleNudge() {
  clearTimeout(idleTimer);
  idleTimer = 0;
  if (!level.nudge || nudged) return;
  idleTimer = setTimeout(showNudge, 15000);
}

function renderStars(n) {
  const spans = elStars.querySelectorAll('span');
  spans.forEach((s, i) => s.classList.toggle('on', i < n));
}

function starsFor(lv, n) {
  if (n == null) return 0;
  if (n <= lv.par) return 3;
  if (n <= lv.par + 2) return 2;
  return 1;
}

function showWin() {
  won = true;
  drag = null;
  clearTimeout(idleTimer);
  idleTimer = 0;
  const stars = starsFor(level, moves);
  renderStars(stars);
  elWinText.textContent = `用 ${moves} 步${level.goal === 'color' ? '清掉红色' : '清空'}`;

  const best = save.best[level.id];
  if (best == null || moves < best) save.best[level.id] = moves;
  const bestNow = save.best[level.id];

  const parLine =
    moves <= level.par
      ? `正好是 ${level.par} 步的最优解。`
      : `最少 ${level.par} 步，多用了 ${moves - level.par} 步。`;
  elWinSub.textContent =
    bestNow < moves ? `${parLine} 你的最好成绩：${bestNow} 步。` : parLine;

  btnNext.textContent = levelIndex === LEVELS.length - 1 ? '选关' : '下一关';
  elWin.classList.remove('hidden');
  setHint(`还剩 ${Math.max(0, level.limit - moves)} 步，不过已经不需要了。`);
  audio.play('win');
  persist();
}

function showFail() {
  failed = true;
  drag = null;
  clearTimeout(idleTimer);
  idleTimer = 0;
  elFail.classList.remove('hidden');
  setHint('步数用完了。撤销一步可以接着走，步数会退回来。');
  audio.play('fail');
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

function renderLevelGrid() {
  elLevelGrid.textContent = '';
  let total = 0;
  for (let i = 1; i <= TOTAL_LEVELS; i++) {
    const lv = LEVELS[i - 1];
    const best = lv ? save.best[lv.id] : undefined;
    const stars = lv ? starsFor(lv, best) : 0;
    if (lv) total += stars;
    const unlocked = !!lv && isLevelUnlocked(i - 1);
    const isCurrent = !!lv && lv.id === level.id;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `level-cell${unlocked ? '' : ' locked'}${isCurrent ? ' current' : ''}`;
    btn.disabled = !unlocked;
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
      btn.addEventListener('click', () => selectLevel(i - 1));
    }

    elLevelGrid.appendChild(btn);
  }

  const b = document.createElement('b');
  b.textContent = String(total);
  elLevelSummary.textContent = '';
  elLevelSummary.append('已获得 ', b, ` 颗星 · 已开放 ${LEVELS.length} / ${TOTAL_LEVELS} 关`);
}

function openLevels() {
  renderLevelGrid();
  elLevels.classList.remove('hidden');
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

function resize() {
  const rect = stage.getBoundingClientRect();
  const cssW = Math.max(1, Math.floor(rect.width));
  const cssH = Math.max(1, Math.floor(rect.height));
  canvas.width = Math.floor(cssW * DPR);
  canvas.height = Math.floor(cssH * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  layout = computeLayout(cssW, cssH, state.w, state.h);
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
  nudged = false;
  cancelAnim();
  clearTimeout(idleTimer);
  idleTimer = 0;
  drag = null;
  won = false;
  failed = false;
  elWin.classList.add('hidden');
  elFail.classList.add('hidden');
  elLevels.classList.add('hidden');
  elLevel.textContent = `第 ${level.id} 关`;
  elName.textContent = level.name;
  document.title = `${level.name} · 撞个正着`;
  setHint(level.teach);
  updateHud();
  updateUndo();
  resize();
  persist();
  scheduleNudge();
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
    scheduleNudge();
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
  setHint(level.teach);
  audio.play(m.res === 'pop' ? 'pop' : 'slide');
  if (pops === 0 && moves >= 3) showNudge();
  else scheduleNudge();

  const dist = moveDistance(m);
  if (m.res === 'pop') {
    const travel = Math.min(160, Math.max(0, (dist - 1) * 55));
    playAnim({
      kind: 'pop',
      m,
      before,
      color,
      t0: performance.now(),
      travel,
      dur: travel + 200,
    });
  } else {
    playAnim({
      kind: 'slide',
      m,
      before,
      t0: performance.now(),
      dur: Math.min(260, Math.max(90, dist * 55)),
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
    if (won || failed) return;
    if (isGoal(state, level)) {
      showWin();
      return;
    }
    if (moves >= level.limit) showFail();
  }, next.dur + 16);
}

function undo() {
  if (won || anim || !history.length) return;
  const prev = history.pop();
  state = prev.state;
  moves = prev.moves;
  pops = prev.pops;
  if (failed) {
    failed = false;
    elFail.classList.add('hidden');
  }
  setHint(level.teach);
  updateHud();
  updateUndo();
  audio.play('ui');
  scheduleNudge();
}

function tick(now) {
  draw(ctx, layout, state, { drag, anim, now });
  requestAnimationFrame(tick);
}

attachInput(canvas, {
  getLayout: () => layout,
  getState: () => state,
  isBlocked: () => !!anim || won || failed,
  onDrag: (d) => {
    drag = d;
  },
  onCancel: () => {
    drag = null;
  },
  onCommit: (g) => {
    drag = null;
    commit(g);
  },
});

btnUndo.addEventListener('click', undo);
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
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!elLevels.classList.contains('hidden')) {
    closeLevels();
    return;
  }
  if (!elIntro.classList.contains('hidden')) closeIntro();
});
// 首次交互解锁 AudioContext（浏览器自动播放策略）
window.addEventListener('pointerdown', () => audio.unlock(), { once: true });

syncSound();
loadLevel(levelIndex);
if (!introSeen()) openIntro();

const ro = new ResizeObserver(resize);
ro.observe(stage);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));

resize();
requestAnimationFrame(tick);

// 开发期调试钩子（不影响玩法；正式提交前可移除）
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
  openLevels,
  closeLevels,
  renderLevelGrid,
  isLevelUnlocked,
  save,
  // 手动渲染一帧：用于不可见窗口（rAF 被冻结）时截图/取色排查
  redraw(now = performance.now()) {
    draw(ctx, layout, state, { drag, anim, now });
  },
};