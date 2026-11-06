import { COLORS } from './game.js';

const PALETTE = [
  { base: '#ef4444', light: '#fb7185', dark: '#b91c1c' },
  { base: '#3b82f6', light: '#60a5fa', dark: '#1d4ed8' },
  { base: '#22c55e', light: '#4ade80', dark: '#15803d' },
  { base: '#f59e0b', light: '#fbbf24', dark: '#b45309' },
  { base: '#a855f7', light: '#c084fc', dark: '#7e22ce' },
];

const easeOut = (t) => 1 - (1 - t) * (1 - t);
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

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

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawBlock(ctx, px, py, cell, colorIndex, opts = {}) {
  const { scale = 1, alpha = 1, lift = 0 } = opts;
  const inset = cell * 0.075;
  const size = (cell - inset * 2) * scale;
  const off = (cell - size) / 2;
  const x = px + off;
  const y = py + off - lift * cell;
  const pal = PALETTE[(colorIndex - 1) % PALETTE.length];
  const radius = cell * 0.24 * scale;

  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.shadowColor = 'rgba(0,0,0,.45)';
  ctx.shadowBlur = cell * 0.18;
  ctx.shadowOffsetY = cell * 0.07;

  const g = ctx.createLinearGradient(x, y, x, y + size);
  g.addColorStop(0, pal.light);
  g.addColorStop(0.45, pal.base);
  g.addColorStop(1, pal.dark);
  ctx.fillStyle = g;
  roundRect(ctx, x, y, size, size, radius);
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // 顶部高光
  ctx.strokeStyle = 'rgba(255,255,255,.35)';
  ctx.lineWidth = Math.max(1, cell * 0.02);
  roundRect(ctx, x + size * 0.08, y + size * 0.08, size * 0.84, size * 0.84, radius * 0.8);
  ctx.stroke();

  // 左上角柔光：统一造型，只靠颜色区分方块
  const shine = ctx.createRadialGradient(
    x + size * 0.3,
    y + size * 0.26,
    0,
    x + size * 0.3,
    y + size * 0.26,
    size * 0.5,
  );
  shine.addColorStop(0, 'rgba(255,255,255,.28)');
  shine.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = shine;
  roundRect(ctx, x, y, size, size, radius);
  ctx.fill();

  ctx.restore();
}

function cellKey(r, c) {
  return r + ',' + c;
}

function drawArrow(ctx, x0, y0, x1, y1, cell) {
  const ang = Math.atan2(y1 - y0, x1 - x0);
  const head = cell * 0.22;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,.5)';
  ctx.fillStyle = 'rgba(255,255,255,.5)';
  ctx.lineWidth = Math.max(2, cell * 0.06);
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

  ctx.clearRect(0, 0, cssW, cssH);

  // 背板
  const pad = cell * 0.18;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,.035)';
  ctx.strokeStyle = 'rgba(255,255,255,.07)';
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
      animP = easeOut(clamp01(elapsed / anim.dur));
      skip.add(cellKey(anim.m.tr, anim.m.tc));
    } else if (anim.kind === 'pop') {
      const travel = anim.travel || 0;
      animP = easeOut(clamp01(travel ? elapsed / travel : 1));
      // state 里两块都已消失，无需跳过
    } else if (anim.kind === 'bounce') {
      skip.add(cellKey(anim.r, anim.c));
    }
  }

  // 格子与墙
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const v = state.c[r * w + c];
      const px = bx + c * cell;
      const py = by + r * cell;
      if (v === -1) {
        ctx.save();
        ctx.fillStyle = 'rgba(148,163,184,.13)';
        roundRect(ctx, px + cell * 0.06, py + cell * 0.06, cell * 0.88, cell * 0.88, cell * 0.14);
        ctx.fill();
        ctx.strokeStyle = 'rgba(148,163,184,.18)';
        ctx.lineWidth = Math.max(1, cell * 0.015);
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.fillStyle = 'rgba(255,255,255,.025)';
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
      drawBlock(ctx, px, py, cell, v, { scale: isDragged ? 1.05 : 1 });
    }
  }

  // 滑动
  if (anim && anim.kind === 'slide') {
    const { m } = anim;
    const x0 = bx + m.c * cell;
    const y0 = by + m.r * cell;
    const x1 = bx + m.tc * cell;
    const y1 = by + m.tr * cell;
    const px = x0 + (x1 - x0) * animP;
    const py = y0 + (y1 - y0) * animP;
    const color = anim.before.c[m.r * anim.before.w + m.c];
    drawBlock(ctx, px, py, cell, color, { scale: 1 + Math.sin(animP * Math.PI) * 0.03 });
  }

  // 消除
  if (anim && anim.kind === 'pop') {
    const { m, before, travel } = anim;
    const elapsed = now - anim.t0;
    const color = before.c[m.r * before.w + m.c];
    const dr = Math.sign(m.br - m.r);
    const dc = Math.sign(m.bc - m.c);
    const endR = m.br - dr;
    const endC = m.bc - dc;
    const x0 = bx + m.c * cell;
    const y0 = by + m.r * cell;
    const x1 = bx + endC * cell;
    const y1 = by + endR * cell;
    const travelP = travel ? easeOut(clamp01(elapsed / travel)) : 1;
    const popP = clamp01((elapsed - travel) / 200);
    const ease = 1 - Math.pow(1 - popP, 3);

    drawBlock(ctx, x0 + (x1 - x0) * travelP, y0 + (y1 - y0) * travelP, cell, color, {
      scale: 1 + Math.sin(Math.min(1, travelP) * Math.PI) * 0.05,
      alpha: 1 - ease,
    });
    drawBlock(ctx, bx + m.bc * cell, by + m.br * cell, cell, color, {
      scale: 1 + ease * 0.22,
      alpha: 1 - ease,
    });

    // 冲击环
    ctx.save();
    ctx.globalAlpha = (1 - ease) * 0.5;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(1, cell * 0.035);
    ctx.beginPath();
    ctx.arc(bx + m.bc * cell + cell / 2, by + m.br * cell + cell / 2, cell * (0.2 + ease * 0.55), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 回弹（非法操作）
  if (anim && anim.kind === 'bounce') {
    const p = clamp01((now - anim.t0) / anim.dur);
    const k = Math.sin(p * Math.PI) * cell * 0.09;
    const [dr, dc] = { U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1] }[anim.dir];
    const color = state.c[anim.r * w + anim.c];
    drawBlock(ctx, bx + anim.c * cell + dc * k, by + anim.r * cell + dr * k, cell, color, {});
  }

  // 拖拽预览
  if (drag && drag.dir) {
    const px = bx + drag.c * cell;
    const py = by + drag.r * cell;
    const cx = px + cell / 2;
    const cy = py + cell / 2;
    const [dr, dc] = { U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1] }[drag.dir];

    // 目标指示
    if (drag.move) {
      if (drag.move.res === 'move') {
        const tx = bx + drag.move.tc * cell;
        const ty = by + drag.move.tr * cell;
        ctx.save();
        ctx.setLineDash([cell * 0.08, cell * 0.07]);
        ctx.strokeStyle = 'rgba(255,255,255,.45)';
        ctx.lineWidth = Math.max(1.5, cell * 0.03);
        roundRect(ctx, tx + cell * 0.09, ty + cell * 0.09, cell * 0.82, cell * 0.82, cell * 0.2);
        ctx.stroke();
        ctx.restore();
      } else {
        const tx = bx + drag.move.bc * cell + cell / 2;
        const ty = by + drag.move.br * cell + cell / 2;
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,.75)';
        ctx.lineWidth = Math.max(2, cell * 0.045);
        ctx.beginPath();
        ctx.arc(tx, ty, cell * 0.4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,.5)';
        ctx.beginPath();
        ctx.moveTo(tx - cell * 0.12, ty);
        ctx.lineTo(tx + cell * 0.12, ty);
        ctx.moveTo(tx, ty - cell * 0.12);
        ctx.lineTo(tx, ty + cell * 0.12);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 方向箭头
    const len = cell * 0.72;
    drawArrow(ctx, cx + dc * cell * 0.18, cy + dr * cell * 0.18, cx + dc * (cell * 0.18 + len), cy + dr * (cell * 0.18 + len), cell);
  }
}

export { PALETTE, COLORS };