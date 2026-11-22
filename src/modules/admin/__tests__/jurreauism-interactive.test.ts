import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachJurreauismInteractiveCanvas, type JurreauismInteractiveConfig } from '../jurreauism-interactive';
import { mountMaxArtBrowserPage } from '../max-art-browser';

const config: JurreauismInteractiveConfig = {
  seedLabel: 'DAT-JURREAUISM-v1', signature: 'MaxJ', layer: 'Layer 13', umbrella: 'OUR umbrella',
  nodeTag: 'node-a', symmetryCount: 2, mirrorRadial: true, strokeColor: '#ff0000', lineWidth: 3,
};

function fixture() {
  let captured: number | null = null;
  const element = new EventTarget();
  const context = {
    fillRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
    stroke: vi.fn(), arc: vi.fn(), fillText: vi.fn(), setTransform: vi.fn(),
  };
  const canvas = Object.assign(element, {
    style: { touchAction: 'auto', cursor: 'grab' }, width: 0, height: 0,
    getContext: () => context,
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 400, height: 300 }),
    setPointerCapture: (id: number) => { captured = id; },
    hasPointerCapture: (id: number) => captured === id,
    releasePointerCapture: () => { captured = null; },
  }) as unknown as HTMLCanvasElement;
  class Observer { observe() {} disconnect() {} }
  vi.stubGlobal('ResizeObserver', Observer);
  const win = new EventTarget();
  vi.stubGlobal('window', Object.assign(win, {
    devicePixelRatio: 1, requestAnimationFrame: vi.fn(() => 1), cancelAnimationFrame: vi.fn(),
  }));
  const pointer = (type: string, x: number, y: number, id = 1) => {
    canvas.dispatchEvent(Object.assign(new Event(type), { pointerId: id, clientX: x, clientY: y, isPrimary: true, button: 0 }));
  };
  return { canvas, context, pointer, captured: () => captured };
}

afterEach(() => vi.unstubAllGlobals());

describe('interactive Jurreauism canvas', () => {
  it('keeps normalized points and each stroke’s symmetry settings, including after reattachment', () => {
    const { canvas, context, pointer } = fixture();
    const controller = attachJurreauismInteractiveCanvas(canvas, config);
    pointer('pointerdown', 310, 170);
    pointer('pointermove', 330, 190);
    pointer('pointerup', 350, 210);
    expect(controller.getStrokeCount()).toBe(1);
    const [first] = controller.getStrokes();
    expect(first.points).toEqual([{ x: 0.75, y: 0.5 }, { x: 0.8, y: 170 / 300 }, { x: 0.85, y: 190 / 300 }]);
    expect(first).toMatchObject({ symmetryCount: 2, mirrorRadial: true, color: '#ff0000', lineWidth: 3 });
    controller.setConfig({ symmetryCount: 50, mirrorRadial: false, strokeColor: '#00ff00' });
    expect(controller.getConfig().symmetryCount).toBe(24);
    pointer('pointerdown', 210, 170);
    pointer('pointerup', 210, 170);
    expect(controller.getStrokes()[0]).toMatchObject({ symmetryCount: 2, mirrorRadial: true, color: '#ff0000' });
    controller.redraw();
    expect(context.moveTo).toHaveBeenCalledWith(300, 150);
    expect(context.moveTo).toHaveBeenCalledWith(100, 150);
    const saved = controller.getStrokes();
    saved[0].points[0].x = 0;
    expect(controller.getStrokes()[0].points[0].x).toBe(0.75);
    const original = controller.getStrokes();
    controller.destroy();
    const reopened = attachJurreauismInteractiveCanvas(canvas, config, undefined, original);
    expect(reopened.getStrokes()).toEqual(original);
    reopened.destroy();
  });

  it('cancels active pointers, undoes and clears strokes, and releases resources', () => {
    const { canvas, pointer, captured } = fixture();
    const events = vi.fn();
    const controller = attachJurreauismInteractiveCanvas(canvas, config, events);
    pointer('pointerdown', 100, 100);
    expect(captured()).toBe(1);
    expect(controller.undo()).toBe(true);
    expect(captured()).toBeNull();
    pointer('pointerup', 130, 130);
    expect(controller.getStrokeCount()).toBe(0);
    pointer('pointerdown', 100, 100);
    pointer('pointercancel', 130, 130);
    expect(controller.getStrokeCount()).toBe(0);
    pointer('pointerdown', 100, 100);
    pointer('pointerup', 130, 130);
    controller.clearStrokes();
    expect(controller.getStrokeCount()).toBe(0);
    expect(controller.undo()).toBe(false);
    controller.destroy();
    expect(canvas.style.touchAction).toBe('auto');
    pointer('pointerdown', 100, 100);
    expect(captured()).toBeNull();
    expect(controller.getStrokeCount()).toBe(0);
    expect(events).toHaveBeenLastCalledWith({ strokeCount: 0, symmetryCount: 2, mirrorRadial: true });
  });
});


describe('MAX-ART mount handle', () => {
  it('starts disabled, preserves committed strokes, cancels an active stroke and restores styles', () => {
    const { canvas, pointer, captured } = fixture();
    const handle = mountMaxArtBrowserPage(canvas, { initialDrawEnabled: false });
    expect(canvas.style.touchAction).toBe('auto');
    expect(canvas.style.cursor).toBe('default');
    expect(handle.getConfig()).toMatchObject({
      nodeTag: 'max-space-max-art', symmetryCount: 13, mirrorRadial: true, strokeColor: '#38bdf8', lineWidth: 2.5,
    });
    pointer('pointerdown', 100, 100);
    pointer('pointerup', 130, 130);
    expect(handle.getStrokes()).toHaveLength(0);
    handle.setDrawEnabled(true);
    expect(canvas.style.touchAction).toBe('none');
    expect(canvas.style.cursor).toBe('crosshair');
    pointer('pointerdown', 100, 100);
    pointer('pointerup', 130, 130);
    pointer('pointerdown', 120, 120);
    expect(captured()).toBe(1);
    handle.setDrawEnabled(false);
    expect(captured()).toBeNull();
    pointer('pointerup', 160, 160);
    expect(handle.getStrokes()).toHaveLength(1);
    handle.destroy();
    expect(canvas.style.touchAction).toBe('auto');
    expect(canvas.style.cursor).toBe('grab');
    pointer('pointerdown', 100, 100);
    expect(captured()).toBeNull();
  });

  it('updates symmetry without losing the current mirror setting and supports undo and clear', () => {
    const { canvas, pointer } = fixture();
    const handle = mountMaxArtBrowserPage(canvas, { nodeTag: 'node-7', symmetryCount: 5, mirrorRadial: false });
    handle.setSymmetry(30);
    expect(handle.getConfig()).toMatchObject({ nodeTag: 'node-7', symmetryCount: 24, mirrorRadial: false });
    handle.setSymmetry(2, true);
    pointer('pointerdown', 100, 100);
    pointer('pointerup', 130, 130);
    expect(handle.getStrokes()[0]).toMatchObject({ symmetryCount: 2, mirrorRadial: true });
    expect(handle.undo()).toBe(true);
    pointer('pointerdown', 100, 100);
    pointer('pointerup', 130, 130);
    handle.clear();
    expect(handle.getStrokes()).toHaveLength(0);
    handle.destroy();
  });
});
