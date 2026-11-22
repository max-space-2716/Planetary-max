import { renderJurreauismCanvas, type JurreauismCanvasConfig } from './jurreauism-renderer';

export interface CanvasPoint { x: number; y: number }
export interface StrokeLayer {
  id: string;
  points: CanvasPoint[];
  color: string;
  lineWidth: number;
  symmetryCount: number;
  mirrorRadial: boolean;
}
export interface JurreauismInteractiveConfig extends JurreauismCanvasConfig {
  symmetryCount: number;
  mirrorRadial: boolean;
  strokeColor: string;
  lineWidth: number;
}
export interface InteractiveJurreauismController {
  setConfig: (patch: Partial<JurreauismInteractiveConfig>) => void;
  getConfig: () => JurreauismInteractiveConfig;
  setDrawEnabled: (enabled: boolean) => void;
  undo: () => boolean;
  clearStrokes: () => void;
  getStrokeCount: () => number;
  getStrokes: () => StrokeLayer[];
  redraw: () => void;
  destroy: () => void;
}

const maxStrokes = 64;
const maxPoints = 256;
let nextStrokeId = 0;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const copyStrokes = (strokes: StrokeLayer[]) => strokes.map(stroke => ({
  ...stroke, points: stroke.points.map(point => ({ ...point })),
}));
function validConfig(config: JurreauismInteractiveConfig): JurreauismInteractiveConfig {
  return {
    ...config,
    symmetryCount: Number.isFinite(config.symmetryCount) ? clamp(Math.floor(config.symmetryCount), 1, 24) : 13,
    lineWidth: Number.isFinite(config.lineWidth) ? clamp(config.lineWidth, 1, 24) : 2,
    strokeColor: /^#[\da-f]{6}$/i.test(config.strokeColor) ? config.strokeColor : '#facc15',
  };
}

export function attachJurreauismInteractiveCanvas(
  canvas: HTMLCanvasElement,
  initialConfig: JurreauismInteractiveConfig,
  onStateChange?: (meta: { strokeCount: number; symmetryCount: number; mirrorRadial: boolean }) => void,
  initialStrokes: StrokeLayer[] = [],
): InteractiveJurreauismController {
  let config = validConfig(initialConfig);
  let strokes = copyStrokes(initialStrokes).slice(0, maxStrokes);
  let active: StrokeLayer | null = null;
  let pointerId: number | null = null;
  let frame: number | null = null;
  let destroyed = false;
  let drawEnabled = true;
  const previousTouchAction = canvas.style.touchAction;
  const previousCursor = canvas.style.cursor;
  canvas.style.touchAction = 'none';
  canvas.style.cursor = 'crosshair';

  const notify = () => onStateChange?.({
    strokeCount: strokes.length + (active ? 1 : 0),
    symmetryCount: config.symmetryCount,
    mirrorRadial: config.mirrorRadial,
  });
  const pointAt = (event: PointerEvent): CanvasPoint => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1),
      y: clamp((event.clientY - rect.top) / Math.max(1, rect.height), 0, 1),
    };
  };
  const paintStroke = (ctx: CanvasRenderingContext2D, stroke: StrokeLayer, width: number, height: number) => {
    if (!stroke.points.length) return;
    const cx = width / 2, cy = height / 2;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let k = 0; k < stroke.symmetryCount; k++) {
      const angle = k * 2 * Math.PI / stroke.symmetryCount;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      for (const mirrored of stroke.mirrorRadial ? [false, true] : [false]) {
        ctx.beginPath();
        stroke.points.forEach((point, index) => {
          const dx = (point.x * width - cx) * (mirrored ? -1 : 1);
          const dy = point.y * height - cy;
          const x = cx + dx * cos - dy * sin;
          const y = cy + dx * sin + dy * cos;
          if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        // A tap is a round dot even without a move event.
        if (stroke.points.length === 1) {
          const point = stroke.points[0];
          const dx = (point.x * width - cx) * (mirrored ? -1 : 1), dy = point.y * height - cy;
          ctx.lineTo(cx + dx * cos - dy * sin, cy + dx * sin + dy * cos);
        }
        ctx.stroke();
      }
    }
  };
  const redraw = () => {
    if (destroyed) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    renderJurreauismCanvas(canvas, config);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    for (const stroke of strokes) paintStroke(ctx, stroke, rect.width, rect.height);
    if (active) paintStroke(ctx, active, rect.width, rect.height);
  };
  const schedule = () => {
    if (destroyed || frame !== null) return;
    frame = window.requestAnimationFrame(() => { frame = null; redraw(); });
  };
  const release = () => {
    const id = pointerId;
    pointerId = null;
    if (id !== null && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  };
  const cancelActive = () => { active = null; release(); };
  const down = (event: PointerEvent) => {
    if (!drawEnabled || pointerId !== null || strokes.length >= maxStrokes || !event.isPrimary || event.button !== 0) return;
    pointerId = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    active = {
      id: `stroke_${Date.now()}_${nextStrokeId++}`, points: [pointAt(event)], color: config.strokeColor,
      lineWidth: config.lineWidth, symmetryCount: config.symmetryCount, mirrorRadial: config.mirrorRadial,
    };
    schedule(); notify();
  };
  const move = (event: PointerEvent) => {
    if (!active || pointerId !== event.pointerId) return;
    const point = pointAt(event);
    if (active.points.length < maxPoints) active.points.push(point);
    else active.points[maxPoints - 1] = point;
    schedule();
  };
  const up = (event: PointerEvent) => {
    if (!active || pointerId !== event.pointerId) return;
    const point = pointAt(event);
    if (active.points.length < maxPoints) active.points.push(point);
    else active.points[maxPoints - 1] = point;
    strokes.push(active);
    active = null; release(); schedule(); notify();
  };
  const cancel = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return;
    cancelActive(); schedule(); notify();
  };
  const observer = new ResizeObserver(schedule);
  observer.observe(canvas);
  window.addEventListener('resize', schedule);
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', cancel);
  canvas.addEventListener('lostpointercapture', cancel);
  redraw(); notify();

  return {
    setConfig(patch) {
      if (destroyed) return;
      config = validConfig({ ...config, ...patch });
      schedule(); notify();
    },
    getConfig: () => ({ ...config }),
    setDrawEnabled(enabled) {
      if (destroyed || drawEnabled === enabled) return;
      drawEnabled = enabled;
      if (!enabled && active) {
        cancelActive();
        schedule();
        notify();
      }
      canvas.style.touchAction = enabled ? 'none' : previousTouchAction;
      canvas.style.cursor = enabled ? 'crosshair' : 'default';
    },
    undo() {
      if (destroyed) return false;
      if (active) cancelActive();
      else if (strokes.length) strokes.pop();
      else return false;
      schedule(); notify(); return true;
    },
    clearStrokes() {
      if (destroyed) return;
      cancelActive(); strokes = []; schedule(); notify();
    },
    getStrokeCount: () => strokes.length,
    getStrokes: () => copyStrokes(strokes),
    redraw,
    destroy() {
      if (destroyed) return;
      cancelActive();
      destroyed = true;
      if (frame !== null) window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', cancel);
      canvas.removeEventListener('lostpointercapture', cancel);
      canvas.style.touchAction = previousTouchAction;
      canvas.style.cursor = previousCursor;
    },
  };
}
