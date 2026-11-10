import { COLORS } from './game.js';

const PALETTE = [
  { base: '#ef4444', light: '#fb7185', dark: '#b91c1c' },
  { base: '#3b82f6', light: '#60a5fa', dark: '#1d4ed8' },
  { base: '#22c55e', light: '#4ade80', dark: '#15803d' },
  { base: '#f59e0b', light: '#fbbf24', dark: '#b45309' },
  { base: '#a855f7', light: '#c084fc', dark: '#7e22ce' },
];

// 棋盘底板配色：方块主色始终不变，这里只控制台面与墙体
const BOARD_THEME = {
  dark: {
    backFill: 'rgba(255,255,255,.035)',
    backLine: 'rgba(255,255,255,.07)',
    cellFill: 'rgba(255,255,255,.025)',
    frame: ['#3b4a61', '#263244', '#17202e'],
    frameLight: 'rgba(226,232,240,.16)',
    frameShadow: 'rgba(0,0,0,.55)',
    frameShine: 'rgba(255,255,255,.10)',
    wall: ['#8494aa', '#5c6c82', '#334155'],
    wallShadow: 'rgba(0,0,0,.45)',
    wallStripe: 'rgba(15,23,42,.30)',
    wallEdge: 'rgba(226,232,240,.50)',
    wallTop: 'rgba(255,255,255,.28)',
    blockShadow: 'rgba(0,0,0,.45)',
    arrow: 'rgba(255,255,255,.5)',
    dash: 'rgba(255,255,255,.45)',
    target: 'rgba(255,255,255,.75)',
    targetAlt: 'rgba(255,255,255,.5)',
    ring: '#ffffff',
  },
  light: {
    backFill: 'rgba(15,23,42,.035)',
    backLine: 'rgba(15,23,42,.09)',
    cellFill: 'rgba(15,23,42,.04)',
    frame: ['#c7d3e2', '#aab9cb', '#8c9db2'],
    frameLight: 'rgba(255,255,255,.75)',
    frameShadow: 'rgba(15,23,42,.28)',
    frameShine: 'rgba(255,255,255,.55)',
    wall: ['#a3b1c2', '#8494a8', '#65758a'],
    wallShadow: 'rgba(15,23,42,.22)',
    wallStripe: 'rgba(15,23,42,.16)',
    wallEdge: 'rgba(15,23,42,.34)',
    wallTop: 'rgba(255,255,255,.55)',
    blockShadow: 'rgba(15,23,42,.28)',
    arrow: 'rgba(15,23,42,.5)',
    dash: 'rgba(15,23,42,.42)',
    target: 'rgba(15,23,42,.75)',
    targetAlt: 'rgba(15,23,42,.45)',
    ring: '#0f172a',
  },
};

const easeOut = (t) => 1 - (1 - t) * (1 - t);
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const DIR_VEC = { U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1] };

export function computeLayout(cssW, cssH, w, h) {
  const margin = Math.min(cssW, cssH) * 0.05;
  const cell = Math.floor(
    Math.min((cssW - margin * 2) / w, (cssH - margin * 2) / h),
  );
  const bw = cell * w;
  const bh = cell * h;
  return {
    x: Math.round((cssW - bw) / 2),
    y: Math.round((cssH - bh) / 2),
    cell,
    w,
    h,
    cssW,
    cssH,
  };
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  roundRectPath(ctx, x, y, w, h, r);
}

// 棋盘外圈：一整块深色石框，而不是 24 个暗淡的小方块
function drawWallFrame(ctx, bx, by, cell, w, h, t) {
  const outerR = cell * 0.28;
  const innerR = cell * 0.14;
  const ix = bx + cell;
  const iy = by + cell;
  const iw = (w - 2) * cell;
  const ih = (h - 2) * cell;

  ctx.save();
  ctx.beginPath();
  roundRectPath(ctx, bx, by, cell * w, cell * h, outerR);
  roundRectPath(ctx, ix, iy, iw, ih, innerR);
  const g = ctx.createLinearGradient(bx, by, bx, by + cell * h);
  g.addColorStop(0, t.frame[0]);
  g.addColorStop(0.55, t.frame[1]);
  g.addColorStop(1, t.frame[2]);
  ctx.fillStyle = g;
  ctx.fill('evenodd');

  // 外沿高光 + 内沿阴影，让边框像一块有厚度的石头
  ctx.strokeStyle = t.frameLight;
  ctx.lineWidth = Math.max(1, cell * 0.02);
  ctx.beginPath();
  roundRectPath(ctx, bx + 1, by + 1, cell * w - 2, cell * h - 2, outerR);
  ctx.stroke();

  ctx.strokeStyle = t.frameShadow;
  ctx.lineWidth = Math.max(1, cell * 0.04);
  ctx.beginPath();
  roundRectPath(ctx, ix, iy, iw, ih, innerR);
  ctx.stroke();

  // 顶部一道极淡的反光，避免整块边框死黑
  const shine = ctx.createLinearGradient(bx, by, bx, by + cell * 1.6);
  shine.addColorStop(0, t.frameShine);
  shine.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = shine;
  ctx.beginPath();
  roundRectPath(ctx, bx, by, cell * w, cell * 1.6, outerR);
  ctx.fill();
  ctx.restore();
}

// 内墙：亮一档的石块 + 斜纹，和空地支路一眼分开
function drawWallTile(ctx, px, py, cell, t) {
  const inset = cell * 0.055;
  const size = cell - inset * 2;
  const x = px + inset;
  const y = py + inset;
  const r = cell * 0.16;

  ctx.save();
  ctx.shadowColor = t.wallShadow;
  ctx.shadowBlur = cell * 0.1;
  ctx.shadowOffsetY = cell * 0.045;

  const g = ctx.createLinearGradient(x, y, x, y + size);
  g.addColorStop(0, t.wall[0]);
  g.addColorStop(0.42, t.wall[1]);
  g.addColorStop(1, t.wall[2]);
  ctx.fillStyle = g;
  roundRect(ctx, x, y, size, size, r);
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // 斜向石纹：只画在内墙，外框保持整块
  ctx.save();
  roundRect(ctx, x, y, size, size, r);
  ctx.clip();
  ctx.strokeStyle = t.wallStripe;
  ctx.lineWidth = Math.max(1, cell * 0.035);
  for (let d = -size; d < size * 2; d += cell * 0.26) {
    ctx.beginPath();
    ctx.moveTo(x + d, y);
    ctx.lineTo(x + d - size, y + size);
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = t.wallEdge;
  ctx.lineWidth = Math.max(1, cell * 0.024);
  roundRect(ctx, x, y, size, size, r);
  ctx.stroke();

  ctx.strokeStyle = t.wallTop;
  ctx.lineWidth = Math.max(1, cell * 0.018);
  ctx.beginPath();
  ctx.moveTo(x + r, y + cell * 0.055);
  ctx.lineTo(x + size - r, y + cell * 0.055);
  ctx.stroke();
  ctx.restore();
}

function hasFullWallRing(state) {
  const { w, h, c } = state;
  for (let x = 0; x < w; x++) {
    if (c[x] !== -1 || c[(h - 1) * w + x] !== -1) return false;
  }
  for (let y = 0; y < h; y++) {
    if (c[y * w] !== -1 || c[y * w + w - 1] !== -1) return false;
  }
  return true;
}

// 色弱辅助：只改“边缘线型”，方块主色保持不变。
// 红=实线 / 蓝=虚线 / 绿=点线 / 黄=点划线 / 紫=双环。
const EDGE_STROKE = [
  'rgba(255,255,255,.62)',
  'rgba(255,255,255,.62)',
  'rgba(255,255,255,.62)',
  'rgba(60,32,0,.55)',
  'rgba(255,255,255,.62)',
];

function drawEdgePattern(ctx, x, y, w, h, r, cell, colorIndex) {
  const idx = ((colorIndex - 1) % 5 + 5) % 5;
  const ix = x + w * 0.13;
  const iy = y + h * 0.13;
  const iw = w * 0.74;
  const ih = h * 0.74;
  const ir = Math.max(1, r * 0.68);
  const line = Math.max(1, cell * 0.026);

  ctx.save();
  ctx.strokeStyle = EDGE_STROKE[idx];
  ctx.lineWidth = line;
  ctx.lineCap = 'round';
  if (idx === 0) {
    ctx.setLineDash([]);
    roundRect(ctx, ix, iy, iw, ih, ir);
    ctx.stroke();
  } else if (idx === 1) {
    ctx.setLineDash([cell * 0.1, cell * 0.065]);
    roundRect(ctx, ix, iy, iw, ih, ir);
    ctx.stroke();
  } else if (idx === 2) {
    ctx.setLineDash([cell * 0.018, cell * 0.072]);
    roundRect(ctx, ix, iy, iw, ih, ir);
    ctx.stroke();
  } else if (idx === 3) {
    ctx.setLineDash([cell * 0.11, cell * 0.06, cell * 0.018, cell * 0.06]);
    roundRect(ctx, ix, iy, iw, ih, ir);
    ctx.stroke();
  } else {
    ctx.setLineDash([]);
    roundRect(ctx, ix, iy, iw, ih, ir);
    ctx.stroke();
    const inset = cell * 0.055;
    roundRect(ctx, ix + inset, iy + inset, iw - inset * 2, ih - inset * 2, Math.max(1, ir - inset * 0.6));
    ctx.stroke();
  }
  ctx.restore();
}

function drawBlock(ctx, px, py, cell, colorIndex, opts = {}, t = BOARD_THEME.dark) {
  const { scale = 1, alpha = 1, lift = 0, sx = 1, sy = 1 } = opts;
  const inset = cell * 0.075;
  const base = (cell - inset * 2) * scale;
  const sizeX = base * sx;
  const sizeY = base * sy;
  const x = px + (cell - sizeX) / 2;
  const y = py + (cell - sizeY) / 2 - lift * cell;
  const pal = PALETTE[(colorIndex - 1) % PALETTE.length];
  const radius = Math.min(cell * 0.24 * scale * Math.min(sx, sy), sizeX / 2, sizeY / 2);
  const minSize = Math.min(sizeX, sizeY);

  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.shadowColor = t.blockShadow;
  ctx.shadowBlur = cell * 0.18;
  ctx.shadowOffsetY = cell * 0.07;

  const g = ctx.createLinearGradient(x, y, x, y + sizeY);
  g.addColorStop(0, pal.light);
  g.addColorStop(0.45, pal.base);
  g.addColorStop(1, pal.dark);
  ctx.fillStyle = g;
  roundRect(ctx, x, y, sizeX, sizeY, radius);
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // 顶部高光
  ctx.strokeStyle = 'rgba(255,255,255,.35)';
  ctx.lineWidth = Math.max(1, cell * 0.02);
  roundRect(
    ctx,
    x + sizeX * 0.08,
    y + sizeY * 0.08,
    sizeX * 0.84,
    sizeY * 0.84,
    Math.max(1, radius * 0.8),
  );
  ctx.stroke();

  // 左上角柔光：统一造型，只靠颜色区分方块
  const shine = ctx.createRadialGradient(
    x + sizeX * 0.3,
    y + sizeY * 0.26,
    0,
    x + sizeX * 0.3,
    y + sizeY * 0.26,
    minSize * 0.5,
  );
  shine.addColorStop(0, 'rgba(255,255,255,.28)');
  shine.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = shine;
  roundRect(ctx, x, y, sizeX, sizeY, radius);
  ctx.fill();

  // 每种颜色一种边缘线型，色弱玩家不用只靠色相分辨
  if (minSize > cell * 0.35) {
    drawEdgePattern(ctx, x, y, sizeX, sizeY, radius, cell, colorIndex);
  }

  ctx.restore();
}

function cellKey(r, c) {
  return r + ',' + c;
}

function drawArrow(ctx, x0, y0, x1, y1, cell, t, color) {
  const ang = Math.atan2(y1 - y0, x1 - x0);
  const head = cell * 0.24;
  ctx.save();
  ctx.strokeStyle = color || t.arrow;
  ctx.fillStyle = color || t.arrow;
  ctx.lineWidth = Math.max(2, cell * 0.065);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1 - Math.cos(ang) * head * 0.6, y1 - Math.sin(ang) * head * 0.6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - Math.cos(ang - 0.5) * head, y1 - Math.sin(ang - 0.5) * head);
  ctx.lineTo(x1 - Math.cos(ang + 0.5) * head, y1 - Math.sin(ang + 0.5) * head);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function draw(ctx, layout, state, fx = {}) {
  const { x: bx, y: by, cell, w, h, cssW, cssH } = layout;
  const now = fx.now ?? 0;
  const { anim, drag } = fx;
  const t = BOARD_THEME[fx.theme] || BOARD_THEME.dark;
  const reduceMotion = !!fx.reduceMotion;

  ctx.clearRect(0, 0, cssW, cssH);

  // 消除命中时的轻震（reduced-motion 下关闭）
  let shakeX = 0;
  let shakeY = 0;
  if (anim && anim.kind === 'pop' && !reduceMotion) {
    const elapsed = now - anim.t0;
    const impactAt = (anim.hitstop || 0) + (anim.travel || 0);
    if (elapsed >= impactAt && elapsed < impactAt + 180) {
      const p = 1 - (elapsed - impactAt) / 180;
      shakeX = Math.sin(elapsed * 1.1) * cell * 0.08 * p;
      shakeY = Math.cos(elapsed * 1.5) * cell * 0.06 * p;
    }
  }

  ctx.save();
  if (shakeX || shakeY) ctx.translate(shakeX, shakeY);

  // 背板
  const pad = cell * 0.18;
  ctx.save();
  ctx.fillStyle = t.backFill;
  ctx.strokeStyle = t.backLine;
  ctx.lineWidth = 1;
  roundRect(ctx, bx - pad, by - pad, cell * w + pad * 2, cell * h + pad * 2, cell * 0.36);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  const skip = new Set();
  let animP = 1;

  if (anim) {
    const elapsed = now - anim.t0;
    if (anim.kind === 'slide') {
      const travelDur = anim.travelDur || anim.dur;
      animP = easeOut(clamp01(elapsed / travelDur));
      skip.add(cellKey(anim.m.tr, anim.m.tc));
    } else if (anim.kind === 'pop') {
      const travel = anim.travel || 0;
      const hitstop = anim.hitstop || 0;
      animP = easeOut(clamp01(travel ? (elapsed - hitstop) / travel : 1));
      // state 里两块都已消失，无需跳过
    } else if (anim.kind === 'bounce') {
      skip.add(cellKey(anim.r, anim.c));
    }
  }

  // 格子与墙
  const ring = hasFullWallRing(state);
  if (ring) drawWallFrame(ctx, bx, by, cell, w, h, t);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const v = state.c[r * w + c];
      const px = bx + c * cell;
      const py = by + r * cell;
      if (v === -1) {
        if (ring && (r === 0 || c === 0 || r === h - 1 || c === w - 1)) continue;
        drawWallTile(ctx, px, py, cell, t);
      } else {
        ctx.fillStyle = t.cellFill;
        roundRect(ctx, px + cell * 0.08, py + cell * 0.08, cell * 0.84, cell * 0.84, cell * 0.12);
        ctx.fill();
      }
    }
  }

  // 静止方块
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const v = state.c[r * w + c];
      if (v <= 0) continue;
      if (skip.has(cellKey(r, c))) continue;
      const px = bx + c * cell;
      const py = by + r * cell;
      const isDragged = drag && drag.r === r && drag.c === c;
      drawBlock(
        ctx,
        px,
        py,
        cell,
        v,
        isDragged ? { scale: 1.07, lift: 0.02 } : {},
        t,
      );
    }
  }

  // 滑动 + 停靠挤压
  if (anim && anim.kind === 'slide') {
    const { m } = anim;
    const elapsed = now - anim.t0;
    const travelDur = anim.travelDur || anim.dur;
    const x0 = bx + m.c * cell;
    const y0 = by + m.r * cell;
    const x1 = bx + m.tc * cell;
    const y1 = by + m.tr * cell;
    const px = x0 + (x1 - x0) * animP;
    const py = y0 + (y1 - y0) * animP;
    const color = anim.before.c[m.r * anim.before.w + m.c];
    const pal = PALETTE[(color - 1) % PALETTE.length];

    // 到位后 150ms 的挤压回弹：横向滑动压扁、纵向滑动压窄
    const settle = clamp01((elapsed - travelDur) / 150);
    let sx = 1;
    let sy = 1;
    if (settle > 0 && !reduceMotion) {
      const k = Math.sin(settle * Math.PI) * Math.exp(-settle * 2.1);
      const strength = (anim.impact === 'block' ? 0.16 : 0.12) * k;
      if (m.d === 'L' || m.d === 'R') {
        sx = 1 + strength;
        sy = 1 - strength * 0.85;
      } else {
        sy = 1 + strength;
        sx = 1 - strength * 0.85;
      }
    }

    drawBlock(
      ctx,
      px,
      py,
      cell,
      color,
      { scale: 1 + Math.sin(animP * Math.PI) * 0.03, sx, sy },
      t,
    );

    // 停靠位置的一圈弱冲击环，让“刹住”看得见
    if (settle > 0) {
      ctx.save();
      ctx.globalAlpha = (1 - settle) * 0.4;
      ctx.strokeStyle = anim.impact === 'block' ? pal.light : t.ring;
      ctx.lineWidth = Math.max(1, cell * 0.035);
      ctx.beginPath();
      ctx.arc(
        x1 + cell / 2,
        y1 + cell / 2,
        cell * (0.28 + settle * 0.22),
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      ctx.restore();
    }
  }

  // 消除：60ms 顿帧 → 冲刺 → 放大消失 + 粒子 + 轻震
  if (anim && anim.kind === 'pop') {
    const { m, before } = anim;
    const elapsed = now - anim.t0;
    const travel = anim.travel || 0;
    const hitstop = anim.hitstop || 0;
    const color = before.c[m.r * before.w + m.c];
    const pal = PALETTE[(color - 1) % PALETTE.length];
    const dr = Math.sign(m.br - m.r);
    const dc = Math.sign(m.bc - m.c);
    const endR = m.br - dr;
    const endC = m.bc - dc;
    const x0 = bx + m.c * cell;
    const y0 = by + m.r * cell;
    const x1 = bx + endC * cell;
    const y1 = by + endR * cell;
    const impactAt = hitstop + travel;
    const travelP = travel ? easeOut(clamp01((elapsed - hitstop) / travel)) : 1;
    const popP = clamp01((elapsed - impactAt) / 200);
    const ease = 1 - Math.pow(1 - popP, 3);
    const hitP = clamp01(elapsed / Math.max(1, hitstop));
    const preScale = 1 + 0.09 * hitP;
    const fade = elapsed < impactAt ? 1 : 1 - ease;

    drawBlock(
      ctx,
      x0 + (x1 - x0) * travelP,
      y0 + (y1 - y0) * travelP,
      cell,
      color,
      {
        scale: preScale + Math.sin(Math.min(1, travelP) * Math.PI) * 0.05,
        alpha: fade,
      },
      t,
    );
    drawBlock(
      ctx,
      bx + m.bc * cell,
      by + m.br * cell,
      cell,
      color,
      {
        scale: preScale + ease * 0.25,
        alpha: fade,
      },
      t,
    );

    if (elapsed >= impactAt) {
      const cxp = bx + m.bc * cell + cell / 2;
      const cyp = by + m.br * cell + cell / 2;

      // 冲击环
      ctx.save();
      ctx.globalAlpha = (1 - ease) * 0.6;
      ctx.strokeStyle = pal.light;
      ctx.lineWidth = Math.max(1, cell * 0.04);
      ctx.beginPath();
      ctx.arc(cxp, cyp, cell * (0.2 + ease * 0.6), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // 8 个碎片粒子（程序化，不依赖随机数）
      ctx.save();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.32;
        const r = cell * (0.12 + ease * 0.68);
        const px = cxp + Math.cos(a) * r;
        const py = cyp + Math.sin(a) * r;
        ctx.globalAlpha = (1 - ease) * 0.85;
        ctx.fillStyle = i % 2 ? pal.light : pal.base;
        ctx.beginPath();
        ctx.arc(px, py, Math.max(1, cell * 0.055 * (1 - ease * 0.55)), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // 回弹（非法操作）
  if (anim && anim.kind === 'bounce') {
    const p = clamp01((now - anim.t0) / anim.dur);
    const k = Math.sin(p * Math.PI);
    const [dr, dc] = DIR_VEC[anim.dir];
    const color = state.c[anim.r * w + anim.c];
    const alongX = dc !== 0;
    const squash = 0.14 * k;
    drawBlock(
      ctx,
      bx + anim.c * cell + dc * cell * 0.09 * k,
      by + anim.r * cell + dr * cell * 0.09 * k,
      cell,
      color,
      {
        sx: alongX ? 1 - squash : 1 + squash * 0.45,
        sy: alongX ? 1 + squash * 0.45 : 1 - squash,
      },
      t,
    );
  }

  // 拖拽预览：落点虚影 + 路径箭头 + 被撞目标描边
  if (drag && drag.dir) {
    const sourceColor = state.c[drag.r * w + drag.c];
    const pal = PALETTE[((sourceColor - 1) % PALETTE.length + PALETTE.length) % PALETTE.length];
    const px = bx + drag.c * cell;
    const py = by + drag.r * cell;
    const cx = px + cell / 2;
    const cy = py + cell / 2;
    const [dr, dc] = DIR_VEC[drag.dir];
    const m = drag.move;

    // 被拖起的方块本身描一圈同色边
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = pal.light;
    ctx.lineWidth = Math.max(1.5, cell * 0.03);
    roundRect(ctx, px + cell * 0.06, py + cell * 0.06, cell * 0.88, cell * 0.88, cell * 0.22);
    ctx.stroke();
    ctx.restore();

    if (m) {
      let tx;
      let ty;
      if (m.res === 'move') {
        tx = bx + m.tc * cell + cell / 2;
        ty = by + m.tr * cell + cell / 2;
      } else {
        tx = bx + (m.bc - dc) * cell + cell / 2;
        ty = by + (m.br - dr) * cell + cell / 2;
      }

      // 路径虚线
      ctx.save();
      ctx.globalAlpha = 0.42;
      ctx.strokeStyle = pal.light;
      ctx.setLineDash([cell * 0.08, cell * 0.07]);
      ctx.lineWidth = Math.max(1.5, cell * 0.025);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.restore();

      if (m.res === 'move') {
        // 落点虚影：半透明方块直接画在目标格
        drawBlock(ctx, bx + m.tc * cell, by + m.tr * cell, cell, sourceColor, { alpha: 0.24, scale: 0.96 }, t);

        // 目标格虚线框
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.setLineDash([cell * 0.09, cell * 0.06]);
        ctx.strokeStyle = pal.light;
        ctx.lineWidth = Math.max(1.5, cell * 0.032);
        roundRect(ctx, bx + m.tc * cell + cell * 0.08, by + m.tr * cell + cell * 0.08, cell * 0.84, cell * 0.84, cell * 0.2);
        ctx.stroke();
        ctx.restore();

        // 被撞目标：异色块描边 / 墙画一道厚边
        const hitR = m.tr + dr;
        const hitC = m.tc + dc;
        const hit = hitR >= 0 && hitC >= 0 && hitR < h && hitC < w ? state.c[hitR * w + hitC] : -1;
        if (hit > 0) {
          ctx.save();
          ctx.globalAlpha = 0.9;
          ctx.strokeStyle = pal.light;
          ctx.lineWidth = Math.max(2, cell * 0.045);
          roundRect(ctx, bx + hitC * cell + cell * 0.06, by + hitR * cell + cell * 0.06, cell * 0.88, cell * 0.88, cell * 0.22);
          ctx.stroke();
          ctx.restore();
        } else {
          ctx.save();
          ctx.strokeStyle = pal.light;
          ctx.globalAlpha = 0.9;
          ctx.lineWidth = Math.max(2.5, cell * 0.075);
          ctx.lineCap = 'round';
          ctx.beginPath();
          if (dc === 1) {
            ctx.moveTo(bx + (m.tc + 1) * cell, by + m.tr * cell + cell * 0.2);
            ctx.lineTo(bx + (m.tc + 1) * cell, by + m.tr * cell + cell * 0.8);
          } else if (dc === -1) {
            ctx.moveTo(bx + m.tc * cell, by + m.tr * cell + cell * 0.2);
            ctx.lineTo(bx + m.tc * cell, by + m.tr * cell + cell * 0.8);
          } else if (dr === 1) {
            ctx.moveTo(bx + m.tc * cell + cell * 0.2, by + (m.tr + 1) * cell);
            ctx.lineTo(bx + m.tc * cell + cell * 0.8, by + (m.tr + 1) * cell);
          } else {
            ctx.moveTo(bx + m.tc * cell + cell * 0.2, by + m.tr * cell);
            ctx.lineTo(bx + m.tc * cell + cell * 0.8, by + m.tr * cell);
          }
          ctx.stroke();
          ctx.restore();
        }
      } else {
        // 同色相撞：虚影停在同伴旁边，同伴画环 + 十字
        const partnerX = bx + m.bc * cell + cell / 2;
        const partnerY = by + m.br * cell + cell / 2;
        drawBlock(ctx, bx + (m.bc - dc) * cell, by + (m.br - dr) * cell, cell, sourceColor, { alpha: 0.26, scale: 0.94 }, t);

        ctx.save();
        ctx.strokeStyle = pal.light;
        ctx.lineWidth = Math.max(2, cell * 0.05);
        ctx.beginPath();
        ctx.arc(partnerX, partnerY, cell * 0.4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.8;
        ctx.lineWidth = Math.max(1.5, cell * 0.035);
        ctx.beginPath();
        ctx.moveTo(partnerX - cell * 0.13, partnerY);
        ctx.lineTo(partnerX + cell * 0.13, partnerY);
        ctx.moveTo(partnerX, partnerY - cell * 0.13);
        ctx.lineTo(partnerX, partnerY + cell * 0.13);
        ctx.stroke();
        ctx.restore();
      }

      // 方向箭头（用方块颜色，比灰白箭头醒目）
      const ang = Math.atan2(ty - cy, tx - cx);
      const gap = cell * 0.42;
      ctx.save();
      ctx.globalAlpha = 0.95;
      drawArrow(
        ctx,
        cx + Math.cos(ang) * cell * 0.18,
        cy + Math.sin(ang) * cell * 0.18,
        tx - Math.cos(ang) * gap,
        ty - Math.sin(ang) * gap,
        cell,
        t,
        pal.light,
      );
      ctx.restore();
    } else {
      // 方向非法（会被挡住）：只给一个短箭头
      const len = cell * 0.72;
      ctx.save();
      ctx.globalAlpha = 0.6;
      drawArrow(
        ctx,
        cx + dc * cell * 0.18,
        cy + dr * cell * 0.18,
        cx + dc * (cell * 0.18 + len),
        cy + dr * (cell * 0.18 + len),
        cell,
        t,
        pal.light,
      );
      ctx.restore();
    }
  }

  ctx.restore();
}

export { PALETTE, COLORS };