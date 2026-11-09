import {
  parse,
  moveFrom,
  applyMove,
  isGoal,
  moveDistance,
  legalMoves,
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
const elStars = document.getElementById('stars');
const elFail = document.getElementById('fail');
const elIntro = document.getElementById('intro');
const elLevels = document.getElementById('levels');
const elLevelGrid = document.getElementById('level-grid');
const elLevelSummary = document.getElementById('level-summary');
const elSolution = document.getElementById('solution');
const elSolutionTitle = document.getElementById('solution-title');
const elSolutionNote = document.getElementById('solution-note');
const elSolutionList = document.getElementById('solution-list');
const btnIntroOk = document.getElementById('intro-ok');
const btnHelp = document.getElementById('help');
const btnSound = document.getElementById('sound');
const btnTheme = document.getElementById('theme');
const btnLevels = document.getElementById('levels-btn');
const btnLevelsClose = document.getElementById('levels-close');
const btnUndo = document.getElementById('undo');
const btnHint = document.getElementById('hint-btn');
const btnSolution = document.getElementById('solution-btn');
const btnSolutionClose = document.getElementById('solution-close');
const btnRestart = document.getElementById('restart');
const btnNext = document.getElementById('next');
const btnAgain = document.getElementById('again');
const btnFailUndo = document.getElementById('fail-undo');
const btnFailRestart = document.getElementById('fail-restart');

const audio = createAudio();
const INTRO_KEY = 'zgz.seenIntro.v2';
const SAVE_KEY = 'zgz.save.v2';
const THEME_KEY = 'zgz.theme';
const DPR = Math.min(window.devicePixelRatio || 1, 2);
const COLOR_NAMES = ['红', '蓝', '绿', '黄', '紫'];
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
let pops = 0;

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

function updateGoal() {
  if (level.goal === 'color') {
    const name = COLOR_NAMES[level.targetColor - 1] || '目标';
    const color = PALETTE[level.targetColor - 1]?.base || '#ef4444';
    elGoal.classList.add('is-color');
    elGoal.style.setProperty('--goal-color', color);
    elGoalText.textContent = `目标：只清${name}块`;
    elGoal.setAttribute('aria-label', `本关目标：只消除${name}色方块`);
  } else {
    elGoal.classList.remove('is-color');
    elGoal.style.removeProperty('--goal-color');
    elGoalText.textContent = '目标：清空全场';
    elGoal.setAttribute('aria-label', '本关目标：清空全场');
  }
}

function updateUndo() {
  btnUndo.disabled = history.length === 0;
}

function showHint() {
  if (won || failed) return;
  audio.play('ui');
  const name = COLOR_NAMES[level.targetColor - 1] || '目标';
  const popsNow = legalMoves(state).filter((m) => m.res === 'pop').length;
  const goalLine =
    level.goal === 'color'
      ? `本关只清${name}块；其他颜色即使能消，也先想一想是不是还要留着当刹车。`
      : '本关要清空全场，先想清楚哪一对该留到后面。';
  let tip;
  if (popsNow >= 2) {
    tip = `现在有 ${popsNow} 对能直接消，先比较消掉哪一对会拆掉后面的停车位。`;
  } else if (popsNow === 1) {
    tip = '现在只有一对能直接消；先看它消掉后，剩下的同色块还能不能停到墙边或异色块旁边。';
  } else {
    tip = '现在没有现成的同色对；先借墙或异色块，把一个方块停到同伴旁边。';
  }
  setHint(`${goalLine} ${tip}`, 9000);
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
  elSolutionNote.textContent = moves
    ? '这份走法从开局起算；你已经走过步，建议先点「重开」再照着走。'
    : '这份走法从开局起算，按顺序拖动即可。';
  elSolutionList.replaceChildren(
    ...solutionSteps().map((text) => {
      const li = document.createElement('li');
      li.textContent = text;
      return li;
    }),
  );
  elSolution.classList.remove('hidden');
  audio.play('ui');
}

function closeSolution() {
  elSolution.classList.add('hidden');
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
  const stars = starsFor(level, moves);
  renderStars(stars);
  const goalWord =
    level.goal === 'color'
      ? `清掉${COLOR_NAMES[level.targetColor - 1] || '目标'}块`
      : '清空';
  elWinKicker.textContent = goalWord;
  elWinText.textContent = `用 ${moves} 步${goalWord}`;

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
  cancelAnim();
  drag = null;
  won = false;
  failed = false;
  elWin.classList.add('hidden');
  elFail.classList.add('hidden');
  elLevels.classList.add('hidden');
  closeSolution();
  elLevel.textContent = `第 ${level.id} 关`;
  elName.textContent = level.name;
  updateGoal();
  document.title = `${level.name} · 撞个正着`;
  setHint(level.teach);
  updateHud();
  updateUndo();
  btnSolution.disabled = !level.nudge;
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
  setHint(level.teach);
  audio.play(m.res === 'pop' ? 'pop' : 'slide');

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
}

function tick(now) {
  draw(ctx, layout, state, { drag, anim, now, theme });
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
btnHint.addEventListener('click', showHint);
btnSolution.addEventListener('click', openSolution);
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
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
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
  get theme() {
    return theme;
  },
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
  openLevels,
  closeLevels,
  renderLevelGrid,
  isLevelUnlocked,
  save,
  // 手动渲染一帧：用于不可见窗口（rAF 被冻结）时截图/取色排查
  redraw(now = performance.now()) {
    draw(ctx, layout, state, { drag, anim, now, theme });
  },
};