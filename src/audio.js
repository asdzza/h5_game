/**
 * 极简音效：全部用 WebAudio 现场合成，不引入音频文件。
 * 浏览器要求先有用户手势才能出声，所以第一次 pointerdown 时 unlock()。
 */

const STORAGE_KEY = 'zgz.muted';

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;

  try {
    muted = localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    /* 隐私模式下 localStorage 可能不可用，忽略 */
  }

  function ensure() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) {
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.9;
        master.connect(ctx.destination);
      } catch {
        ctx = null;
        master = null;
        return null;
      }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function tone(freq, dur, opts = {}) {
    const { type = 'sine', gain = 0.06, to = 0, delay = 0 } = opts;
    if (muted) return;
    const c = ensure();
    if (!c || !master) return;
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const env = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(env);
    env.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  const SFX = {
    slide() {
      tone(520, 0.1, { type: 'triangle', gain: 0.05, to: 300 });
    },
    // 停靠：撞墙更闷，撞异色更脆，让“停住”也有回应
    landWall(opts = {}) {
      tone(150, 0.1, { type: 'sine', gain: 0.05, to: 96, delay: opts.delay || 0 });
    },
    landBlock(opts = {}) {
      const d = opts.delay || 0;
      tone(330, 0.075, { type: 'triangle', gain: 0.045, to: 220, delay: d });
      tone(660, 0.05, { type: 'sine', gain: 0.022, delay: d + 0.01 });
    },
    pop() {
      tone(620, 0.09, { type: 'triangle', gain: 0.07 });
      tone(940, 0.13, { type: 'sine', gain: 0.05, delay: 0.045 });
    },
    bounce() {
      tone(170, 0.09, { type: 'square', gain: 0.035, to: 110 });
    },
    fail() {
      tone(240, 0.16, { type: 'square', gain: 0.04, to: 150 });
      tone(170, 0.22, { type: 'triangle', gain: 0.045, to: 120, delay: 0.12 });
    },
    win() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        tone(f, 0.2, { type: 'triangle', gain: 0.055, delay: i * 0.085 });
      });
    },
    ui() {
      tone(740, 0.05, { type: 'sine', gain: 0.028 });
    },
  };

  return {
    play(name, opts) {
      const fn = SFX[name];
      if (fn) fn(opts);
    },
    unlock() {
      ensure();
    },
    isMuted() {
      return muted;
    },
    state() {
      return ctx ? ctx.state : 'none';
    },
    toggle() {
      muted = !muted;
      try {
        localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
      } catch {
        /* ignore */
      }
      return muted;
    },
  };
}