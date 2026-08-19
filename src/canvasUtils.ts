import type {
  CanvasBlendMode,
  CanvasLayer,
  CanvasPoint,
  CanvasStroke,
  CanvasSymmetryMode,
  CanvasTool,
} from './types';

export const DEFAULT_CANVAS_LAYERS: CanvasLayer[] = [
  { id: 1, name: 'Layer 1 (Background)', visible: true, locked: false, opacity: 1, blendMode: 'source-over' },
  { id: 2, name: 'Layer 2 (Inks & Lines)', visible: true, locked: false, opacity: 1, blendMode: 'source-over' },
  { id: 3, name: 'Layer 3 (Color & Shade)', visible: true, locked: false, opacity: 1, blendMode: 'source-over' },
  { id: 4, name: 'Layer 4 (FX & Bloom)', visible: true, locked: false, opacity: 1, blendMode: 'source-over' },
];

export type DrawableStroke = Pick<
  CanvasStroke,
  'tool' | 'color' | 'width' | 'points'
> & {
  layerId?: number;
  fillColor?: string;
  opacity?: number;
  blendMode?: CanvasBlendMode;
  symmetry?: CanvasSymmetryMode;
};

export interface BrushPresetInfo {
  id: CanvasTool;
  name: string;
  icon: string;
  category: 'ink' | 'sketch' | 'paint' | 'fx' | 'erase' | 'shapes';
  description: string;
  defaultWidth: number;
  defaultOpacity: number;
}

export const KRITA_BRUSH_PRESETS: BrushPresetInfo[] = [
  {
    id: 'pen',
    name: 'G-Pen Inker',
    icon: '✒️',
    category: 'ink',
    description: 'Crisp tapered inking pen with high pressure response.',
    defaultWidth: 4,
    defaultOpacity: 1,
  },
  {
    id: 'pencil',
    name: '2B Graphite & Charcoal',
    icon: '✏️',
    category: 'sketch',
    description: 'Textured paper-tooth graphite sketching pencil.',
    defaultWidth: 3,
    defaultOpacity: 0.85,
  },
  {
    id: 'airbrush',
    name: 'Soft Airbrush',
    icon: '💨',
    category: 'paint',
    description: 'Gaussian radial density falloff for smooth gradients and skin shading.',
    defaultWidth: 28,
    defaultOpacity: 0.45,
  },
  {
    id: 'watercolor',
    name: 'Wet Watercolor',
    icon: '💧',
    category: 'paint',
    description: 'Translucent pigment wash with soft edge bleed.',
    defaultWidth: 20,
    defaultOpacity: 0.6,
  },
  {
    id: 'neon',
    name: 'Luminous Neon Saber',
    icon: '🌟',
    category: 'fx',
    description: 'Radiant bloom glow with high-intensity white core.',
    defaultWidth: 10,
    defaultOpacity: 1,
  },
  {
    id: 'chalk',
    name: 'Rough Pastel Chalk',
    icon: '🖍️',
    category: 'sketch',
    description: 'Heavy dry-media tooth stippling and chalk texture.',
    defaultWidth: 12,
    defaultOpacity: 0.8,
  },
  {
    id: 'marker',
    name: 'Chisel Highlighter',
    icon: '🪚',
    category: 'ink',
    description: 'Angled chiseled translucent broad marker nib.',
    defaultWidth: 16,
    defaultOpacity: 0.55,
  },
  {
    id: 'pixel',
    name: '1px Pixel Art Pen',
    icon: '🟨',
    category: 'ink',
    description: 'Razor sharp grid-locked aliased pixel pen.',
    defaultWidth: 1,
    defaultOpacity: 1,
  },
  {
    id: 'eraser',
    name: 'Hard Vinyl Eraser',
    icon: '🧹',
    category: 'erase',
    description: 'Sharp cut vector eraser removing all pixel data.',
    defaultWidth: 14,
    defaultOpacity: 1,
  },
  {
    id: 'eraser_soft',
    name: 'Kneaded Soft Eraser',
    icon: '🧽',
    category: 'erase',
    description: 'Feathered radial eraser for gentle highlights and lift-offs.',
    defaultWidth: 24,
    defaultOpacity: 0.5,
  },
];

export const DEFAULT_CINEMA_SWATCHES = [
  '#f3d899', // Projection Gold
  '#ffd700', // Proscenium Gold
  '#ff9900', // Marquee Amber
  '#e23b3b', // Cinema Crimson
  '#b91c1c', // Velvet Red
  '#5b1023', // Burgundy Drape
  '#ff2d75', // Neon Magenta
  '#b55fe6', // Violet Glow
  '#00e5ff', // Technicolor Cyan
  '#2563eb', // Reel Cobalt
  '#39ff14', // Laser Lime
  '#ffffff', // Screen White
  '#9ca3af', // 35mm Silver
  '#6b7280', // Muted Slate
  '#1a1815', // Velvet Charcoal
  '#0d0305', // Auditorium Noir
];

export const CANVAS_PRESET_COLORS = [
  { label: 'Projection Gold', value: '#f3d899' },
  { label: 'Neon Cyan', value: '#00e5ff' },
  { label: 'Cinema Crimson', value: '#e23b3b' },
  { label: 'Laser Lime', value: '#39ff14' },
  { label: 'Electric Magenta', value: '#ff2d75' },
  { label: 'Amber Orange', value: '#ff9900' },
  { label: 'Violet Glow', value: '#b55fe6' },
  { label: 'Chalk White', value: '#ffffff' },
  { label: 'Velvet Charcoal', value: '#1a1815' },
  { label: 'Muted Slate', value: '#6b7280' },
  { label: 'Deep Ochre', value: '#9a6324' },
  { label: 'Cobalt Night', value: '#24458f' },
];

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let clean = hex.replace('#', '');
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  const int = parseInt(clean, 16);
  if (isNaN(int)) return { r: 243, g: 216, b: 153 };
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

export function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;

  if (max !== min) {
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), v: Math.round(v * 100) };
}

export function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  h = (h % 360) / 60;
  s = Math.max(0, Math.min(100, s)) / 100;
  v = Math.max(0, Math.min(100, v)) / 100;

  const i = Math.floor(h);
  const f = h - i;
  const p = v * (1 - s);
  const q = v * (1 - s * f);
  const t = v * (1 - s * (1 - f));

  let r = 0, g = 0, b = 0;
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

export function hsvToHex(h: number, s: number, v: number): string {
  const { r, g, b } = hsvToRgb(h, s, v);
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Transform points across symmetry axes
export function generateSymmetricPointSets(
  points: CanvasPoint[],
  symmetry: CanvasSymmetryMode = 'none',
): CanvasPoint[][] {
  if (!points.length || symmetry === 'none') return [points];

  const sets: CanvasPoint[][] = [points];

  if (symmetry === 'mirror-h' || symmetry === 'radial-4' || symmetry === 'radial-8') {
    sets.push(points.map((p) => ({ ...p, x: 1 - p.x })));
  }

  if (symmetry === 'mirror-v' || symmetry === 'radial-4' || symmetry === 'radial-8') {
    sets.push(points.map((p) => ({ ...p, y: 1 - p.y })));
  }

  if (symmetry === 'radial-4' || symmetry === 'radial-8') {
    sets.push(points.map((p) => ({ ...p, x: 1 - p.x, y: 1 - p.y })));
  }

  if (symmetry === 'radial-8') {
    sets.push(points.map((p) => ({ ...p, x: p.y, y: p.x })));
    sets.push(points.map((p) => ({ ...p, x: 1 - p.y, y: p.x })));
    sets.push(points.map((p) => ({ ...p, x: p.y, y: 1 - p.x })));
    sets.push(points.map((p) => ({ ...p, x: 1 - p.y, y: 1 - p.x })));
  }

  return sets;
}

// Stabilizer calculation
export function smoothPoints(raw: CanvasPoint[], mode: 'off' | 'basic' | 'weighted' | 'krita'): CanvasPoint[] {
  if (raw.length <= 2 || mode === 'off') return raw;

  if (mode === 'basic') {
    const smoothed: CanvasPoint[] = [raw[0]];
    for (let i = 1; i < raw.length - 1; i++) {
      const prev = raw[i - 1];
      const cur = raw[i];
      const next = raw[i + 1];
      smoothed.push({
        x: (prev.x + cur.x * 2 + next.x) / 4,
        y: (prev.y + cur.y * 2 + next.y) / 4,
        p: cur.p,
      });
    }
    smoothed.push(raw[raw.length - 1]);
    return smoothed;
  }

  if (mode === 'weighted' || mode === 'krita') {
    const weight = mode === 'krita' ? 0.35 : 0.6;
    const smoothed: CanvasPoint[] = [raw[0]];
    let current = { ...raw[0] };
    for (let i = 1; i < raw.length; i++) {
      const target = raw[i];
      current = {
        x: current.x + (target.x - current.x) * weight,
        y: current.y + (target.y - current.y) * weight,
        p: target.p,
      };
      smoothed.push(current);
    }
    return smoothed;
  }

  return raw;
}

/**
 * Main High-Precision Stroke Painting Routine supporting all 10 Krita brush engines and geometric tools.
 */
export function paintStroke(
  context: CanvasRenderingContext2D,
  stroke: DrawableStroke,
  width: number,
  height: number,
) {
  const basePoints = stroke.points;
  if (!basePoints.length) return;

  const pointSets = generateSymmetricPointSets(basePoints, stroke.symmetry || 'none');

  for (const points of pointSets) {
    renderSingleStrokePath(context, stroke, points, width, height);
  }
}

function renderSingleStrokePath(
  context: CanvasRenderingContext2D,
  stroke: DrawableStroke,
  points: CanvasPoint[],
  width: number,
  height: number,
) {
  const first = points[0];
  if (!first) return;

  context.save();

  // Opacity & Blend Mode
  const baseOpacity = stroke.opacity !== undefined ? stroke.opacity : 1;
  context.globalAlpha = Math.max(0, Math.min(1, baseOpacity));

  if (stroke.tool === 'eraser' || stroke.tool === 'eraser_soft') {
    context.globalCompositeOperation = 'destination-out';
  } else if (stroke.blendMode) {
    context.globalCompositeOperation = stroke.blendMode as GlobalCompositeOperation;
  } else {
    context.globalCompositeOperation = 'source-over';
  }

  const baseWidth = Math.max(1, stroke.width);

  // Geometric Tools
  if (stroke.tool === 'line') {
    const last = points[points.length - 1];
    context.strokeStyle = stroke.color;
    context.lineWidth = baseWidth;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(first.x * width, first.y * height);
    context.lineTo(last.x * width, last.y * height);
    context.stroke();
    context.restore();
    return;
  }

  if (stroke.tool === 'rectangle') {
    const last = points[points.length - 1];
    const x0 = Math.min(first.x, last.x) * width;
    const y0 = Math.min(first.y, last.y) * height;
    const w = Math.abs(last.x - first.x) * width;
    const h = Math.abs(last.y - first.y) * height;

    if (stroke.fillColor) {
      context.fillStyle = stroke.fillColor;
      context.fillRect(x0, y0, w, h);
    }
    context.strokeStyle = stroke.color;
    context.lineWidth = baseWidth;
    context.strokeRect(x0, y0, w, h);
    context.restore();
    return;
  }

  if (stroke.tool === 'ellipse') {
    const last = points[points.length - 1];
    const cx = ((first.x + last.x) / 2) * width;
    const cy = ((first.y + last.y) / 2) * height;
    const rx = (Math.abs(last.x - first.x) / 2) * width;
    const ry = (Math.abs(last.y - first.y) / 2) * height;

    context.beginPath();
    context.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
    if (stroke.fillColor) {
      context.fillStyle = stroke.fillColor;
      context.fill();
    }
    context.strokeStyle = stroke.color;
    context.lineWidth = baseWidth;
    context.stroke();
    context.restore();
    return;
  }

  if (stroke.tool === 'polygon') {
    context.beginPath();
    context.moveTo(first.x * width, first.y * height);
    for (const pt of points.slice(1)) {
      context.lineTo(pt.x * width, pt.y * height);
    }
    context.closePath();
    if (stroke.fillColor) {
      context.fillStyle = stroke.fillColor;
      context.fill();
    }
    context.strokeStyle = stroke.color;
    context.lineWidth = baseWidth;
    context.stroke();
    context.restore();
    return;
  }

  // Brush Engines
  switch (stroke.tool) {
    case 'pen': // G-Pen with pressure taper
      renderInkPen(context, points, stroke.color, baseWidth, width, height);
      break;

    case 'pencil': // Textured 2B graphite
      renderPencil(context, points, stroke.color, baseWidth, width, height);
      break;

    case 'airbrush': // Soft Gaussian radial gradient
      renderAirbrush(context, points, stroke.color, baseWidth, width, height);
      break;

    case 'watercolor': // Wet watercolor wash
      renderWatercolor(context, points, stroke.color, baseWidth, width, height);
      break;

    case 'neon': // Multi-pass glowing saber
      renderNeon(context, points, stroke.color, baseWidth, width, height);
      break;

    case 'chalk': // Rough chalk pastel tooth
      renderChalk(context, points, stroke.color, baseWidth, width, height);
      break;

    case 'marker': // Chisel highlighter
      renderMarker(context, points, stroke.color, baseWidth, width, height);
      break;

    case 'pixel': // 1px Pixel Art
      renderPixel(context, points, stroke.color, baseWidth, width, height);
      break;

    case 'eraser_soft': // Kneaded soft eraser
      renderSoftEraser(context, points, baseWidth, width, height);
      break;

    case 'eraser': // Standard hard vinyl eraser
    default:
      renderStandardStroke(context, points, stroke.color, baseWidth, width, height);
      break;
  }

  context.restore();
}

/**
 * ✒️ Ink Pen: Pressure-tapered anti-aliased G-Pen with quadratic curve interpolation
 */
function renderInkPen(
  ctx: CanvasRenderingContext2D,
  points: CanvasPoint[],
  color: string,
  baseWidth: number,
  width: number,
  height: number,
) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (points.length < 2) {
    const p = points[0];
    const press = p.p !== undefined ? p.p : 0.6;
    const r = Math.max(1, (baseWidth * (0.3 + 0.7 * press)) / 2);
    ctx.beginPath();
    ctx.arc(p.x * width, p.y * height, r, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const press = (p0.p !== undefined && p1.p !== undefined) ? (p0.p + p1.p) / 2 : 0.7;
    const currentWidth = Math.max(0.75, baseWidth * (0.25 + 0.75 * press));

    ctx.lineWidth = currentWidth;
    ctx.beginPath();
    ctx.moveTo(p0.x * width, p0.y * height);
    ctx.lineTo(p1.x * width, p1.y * height);
    ctx.stroke();
  }
}

/**
 * ✏️ Pencil: 2B Graphite texture with stippled tooth and jittered graphite particles
 */
function renderPencil(
  ctx: CanvasRenderingContext2D,
  points: CanvasPoint[],
  color: string,
  baseWidth: number,
  width: number,
  height: number,
) {
  const { r, g, b } = hexToRgb(color);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const dx = (p1.x - p0.x) * width;
    const dy = (p1.y - p0.y) * height;
    const distPx = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.floor(distPx / 1.5));
    const press = p0.p !== undefined ? p0.p : 0.7;

    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const cx = (p0.x * width) + dx * t;
      const cy = (p0.y * height) + dy * t;
      const radius = Math.max(1, (baseWidth * (0.4 + 0.6 * press)) / 2);

      // Core graphite stamp
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.15 * press + 0.1})`;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();

      // Grain jitter stipple
      const grainCount = Math.floor(baseWidth * 1.2);
      for (let gIdx = 0; gIdx < grainCount; gIdx++) {
        const angle = Math.random() * Math.PI * 2;
        const offset = Math.random() * radius * 1.1;
        const jx = cx + Math.cos(angle) * offset;
        const jy = cy + Math.sin(angle) * offset;
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.25 * Math.random() * press})`;
        ctx.fillRect(jx, jy, 1, 1);
      }
    }
  }
}

/**
 * 💨 Airbrush: Radial density Gaussian-style soft stamps
 */
function renderAirbrush(
  ctx: CanvasRenderingContext2D,
  points: CanvasPoint[],
  color: string,
  baseWidth: number,
  width: number,
  height: number,
) {
  const { r, g, b } = hexToRgb(color);

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const dx = (p1.x - p0.x) * width;
    const dy = (p1.y - p0.y) * height;
    const distPx = Math.hypot(dx, dy);
    const radius = Math.max(4, baseWidth * 1.2);
    const stepSize = Math.max(2, radius * 0.18);
    const steps = Math.max(1, Math.floor(distPx / stepSize));

    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const cx = (p0.x * width) + dx * t;
      const cy = (p0.y * height) + dy * t;
      const press = p0.p !== undefined ? p0.p : 0.6;
      const effectiveRadius = radius * (0.5 + 0.5 * press);

      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, effectiveRadius);
      gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${0.12 * press})`);
      gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${0.05 * press})`);
      gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, effectiveRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * 💧 Watercolor: Wet translucent pooling wash
 */
function renderWatercolor(
  ctx: CanvasRenderingContext2D,
  points: CanvasPoint[],
  color: string,
  baseWidth: number,
  width: number,
  height: number,
) {
  const { r, g, b } = hexToRgb(color);

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const dx = (p1.x - p0.x) * width;
    const dy = (p1.y - p0.y) * height;
    const distPx = Math.hypot(dx, dy);
    const radius = Math.max(3, baseWidth * 0.9);
    const steps = Math.max(1, Math.floor(distPx / (radius * 0.3)));

    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const cx = (p0.x * width) + dx * t;
      const cy = (p0.y * height) + dy * t;

      // Soft wash core
      const grad = ctx.createRadialGradient(cx, cy, radius * 0.4, cx, cy, radius);
      grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.08)`);
      grad.addColorStop(0.85, `rgba(${r}, ${g}, ${b}, 0.18)`);
      grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.02)`);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * 🌟 Neon Glow: Luminous outer bloom and bright core
 */
function renderNeon(
  ctx: CanvasRenderingContext2D,
  points: CanvasPoint[],
  color: string,
  baseWidth: number,
  width: number,
  height: number,
) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Pass 1: Outer glowing bloom
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = baseWidth * 2.2;
  ctx.strokeStyle = color;
  ctx.lineWidth = baseWidth * 1.5;
  ctx.globalAlpha = 0.7;

  ctx.beginPath();
  ctx.moveTo(points[0].x * width, points[0].y * height);
  for (const pt of points.slice(1)) {
    ctx.lineTo(pt.x * width, pt.y * height);
  }
  ctx.stroke();
  ctx.restore();

  // Pass 2: Hot white/bright core
  ctx.save();
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = baseWidth * 0.4;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1.5, baseWidth * 0.45);
  ctx.beginPath();
  ctx.moveTo(points[0].x * width, points[0].y * height);
  for (const pt of points.slice(1)) {
    ctx.lineTo(pt.x * width, pt.y * height);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * 🖍️ Chalk: Rough pastel dry-media tooth
 */
function renderChalk(
  ctx: CanvasRenderingContext2D,
  points: CanvasPoint[],
  color: string,
  baseWidth: number,
  width: number,
  height: number,
) {
  const { r, g, b } = hexToRgb(color);

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const dx = (p1.x - p0.x) * width;
    const dy = (p1.y - p0.y) * height;
    const distPx = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.floor(distPx / 2));
    const press = p0.p !== undefined ? p0.p : 0.75;

    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const cx = (p0.x * width) + dx * t;
      const cy = (p0.y * height) + dy * t;
      const radius = Math.max(2, (baseWidth * (0.4 + 0.6 * press)) / 2);

      const dabs = Math.floor(baseWidth * 1.5);
      for (let d = 0; d < dabs; d++) {
        if (Math.random() > 0.4) continue;
        const ox = (Math.random() - 0.5) * radius * 2;
        const oy = (Math.random() - 0.5) * radius * 2;
        const size = 1 + Math.random() * 2;
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.3 + 0.5 * Math.random() * press})`;
        ctx.fillRect(cx + ox, cy + oy, size, size);
      }
    }
  }
}

/**
 * 🪚 Chisel Marker: Broad angled translucent nib
 */
function renderMarker(
  ctx: CanvasRenderingContext2D,
  points: CanvasPoint[],
  color: string,
  baseWidth: number,
  width: number,
  height: number,
) {
  const { r, g, b } = hexToRgb(color);
  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.25)`;

  const angle = Math.PI / 4;
  const half = baseWidth / 2;
  const nx = Math.cos(angle) * half;
  const ny = Math.sin(angle) * half;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const x0 = p0.x * width;
    const y0 = p0.y * height;
    const x1 = p1.x * width;
    const y1 = p1.y * height;

    ctx.beginPath();
    ctx.moveTo(x0 - nx, y0 - ny);
    ctx.lineTo(x0 + nx, y0 + ny);
    ctx.lineTo(x1 + nx, y1 + ny);
    ctx.lineTo(x1 - nx, y1 - ny);
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * 🟨 Pixel Art: 1px Aliased Grid Pen
 */
function renderPixel(
  ctx: CanvasRenderingContext2D,
  points: CanvasPoint[],
  color: string,
  baseWidth: number,
  width: number,
  height: number,
) {
  ctx.fillStyle = color;
  const pxSize = Math.max(1, Math.round(baseWidth));

  for (let i = 0; i < points.length - 1; i++) {
    let x0 = Math.round(points[i].x * width);
    let y0 = Math.round(points[i].y * height);
    const x1 = Math.round(points[i + 1].x * width);
    const y1 = Math.round(points[i + 1].y * height);

    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (true) {
      ctx.fillRect(Math.floor(x0 / pxSize) * pxSize, Math.floor(y0 / pxSize) * pxSize, pxSize, pxSize);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        y0 += sy;
      }
    }
  }
}

/**
 * 🧽 Soft Kneaded Eraser
 */
function renderSoftEraser(
  ctx: CanvasRenderingContext2D,
  points: CanvasPoint[],
  baseWidth: number,
  width: number,
  height: number,
) {
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const dx = (p1.x - p0.x) * width;
    const dy = (p1.y - p0.y) * height;
    const distPx = Math.hypot(dx, dy);
    const radius = Math.max(6, baseWidth);
    const steps = Math.max(1, Math.floor(distPx / (radius * 0.25)));

    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const cx = (p0.x * width) + dx * t;
      const cy = (p0.y * height) + dy * t;

      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      grad.addColorStop(0, 'rgba(0, 0, 0, 0.45)');
      grad.addColorStop(0.6, 'rgba(0, 0, 0, 0.15)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * Standard solid vector stroke (Ink / Hard Eraser)
 */
function renderStandardStroke(
  ctx: CanvasRenderingContext2D,
  points: CanvasPoint[],
  color: string,
  baseWidth: number,
  width: number,
  height: number,
) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = baseWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(points[0].x * width, points[0].y * height);
  for (const pt of points.slice(1)) {
    ctx.lineTo(pt.x * width, pt.y * height);
  }
  ctx.stroke();

  if (points.length === 1 || (points[0].x === points[points.length - 1].x && points[0].y === points[points.length - 1].y)) {
    ctx.beginPath();
    ctx.arc(points[0].x * width, points[0].y * height, baseWidth / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Fast scanline 4-way flood fill on Canvas ImageData
 */
export function floodFillCanvas(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  fillColorHex: string,
  tolerance = 32,
) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  if (startX < 0 || startX >= width || startY < 0 || startY >= height) return;

  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  const targetIdx = (startY * width + startX) * 4;
  const targetR = data[targetIdx];
  const targetG = data[targetIdx + 1];
  const targetB = data[targetIdx + 2];
  const targetA = data[targetIdx + 3];

  const fillRgb = hexToRgb(fillColorHex);
  if (
    Math.abs(targetR - fillRgb.r) < 5 &&
    Math.abs(targetG - fillRgb.g) < 5 &&
    Math.abs(targetB - fillRgb.b) < 5 &&
    targetA === 255
  ) {
    return;
  }

  const matchColor = (idx: number) => {
    const dr = Math.abs(data[idx] - targetR);
    const dg = Math.abs(data[idx + 1] - targetG);
    const db = Math.abs(data[idx + 2] - targetB);
    const da = Math.abs(data[idx + 3] - targetA);
    return (dr + dg + db + da) / 4 <= tolerance;
  };

  const setFillColor = (idx: number) => {
    data[idx] = fillRgb.r;
    data[idx + 1] = fillRgb.g;
    data[idx + 2] = fillRgb.b;
    data[idx + 3] = 255;
  };

  const stack: [number, number][] = [[startX, startY]];
  const seen = new Uint8Array(width * height);

  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    let currentY = y;
    let idx = (currentY * width + x) * 4;

    while (currentY >= 0 && matchColor(idx) && !seen[currentY * width + x]) {
      currentY--;
      idx -= width * 4;
    }

    currentY++;
    idx += width * 4;

    let spanLeft = false;
    let spanRight = false;

    while (currentY < height && matchColor(idx) && !seen[currentY * width + x]) {
      seen[currentY * width + x] = 1;
      setFillColor(idx);

      if (x > 0) {
        const leftIdx = idx - 4;
        if (matchColor(leftIdx) && !seen[currentY * width + (x - 1)]) {
          if (!spanLeft) {
            stack.push([x - 1, currentY]);
            spanLeft = true;
          }
        } else if (spanLeft) {
          spanLeft = false;
        }
      }

      if (x < width - 1) {
        const rightIdx = idx + 4;
        if (matchColor(rightIdx) && !seen[currentY * width + (x + 1)]) {
          if (!spanRight) {
            stack.push([x + 1, currentY]);
            spanRight = true;
          }
        } else if (spanRight) {
          spanRight = false;
        }
      }

      currentY++;
      idx += width * 4;
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

export function formatRefillCountdown(nextRefillAt: number): string {
  const now = Date.now();
  const diff = Math.max(0, nextRefillAt - now);
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
