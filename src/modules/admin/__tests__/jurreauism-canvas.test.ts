import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderJurreauismCanvas, type JurreauismCanvasConfig } from '../jurreauism-canvas';

const config: JurreauismCanvasConfig = {
  seedLabel: 'DAT-JURREAUISM-v1', signature: 'MaxJ', layer: 'Layer 13', umbrella: 'OUR umbrella', nodeTag: 'node-a',
};

afterEach(() => vi.unstubAllGlobals());

describe('Jurreauism Canvas', () => {
  it('uses the canvas dimensions for its 13 concentric rings and seal', () => {
    const context = {
      fillRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
      stroke: vi.fn(), arc: vi.fn(), fillText: vi.fn(), setTransform: vi.fn(),
    };
    const canvas = {
      width: 0, height: 0, getContext: vi.fn().mockReturnValue(context),
      getBoundingClientRect: () => ({ width: 600, height: 300 }),
    } as unknown as HTMLCanvasElement;
    vi.stubGlobal('window', { devicePixelRatio: 2 });
    renderJurreauismCanvas(canvas, config);
    expect([canvas.width, canvas.height]).toEqual([1200, 600]);
    expect(context.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    expect(context.arc).toHaveBeenCalledTimes(13);
    const outerRing = context.arc.mock.calls.at(-1);
    expect(outerRing?.slice(0, 2)).toEqual([300, 150]);
    expect(outerRing?.[2]).toBeCloseTo(84);
    expect(outerRing?.slice(3)).toEqual([0, Math.PI * 2]);
    expect(context.fillText).toHaveBeenCalledWith('SEAL: MaxJ', 16, 288, 568);
    expect(context.fillText).toHaveBeenCalledWith('Node: node-a', 16, 58, 568);
  });

  it('handles an unavailable context or a hidden viewport', () => {
    const missing = { getContext: () => null } as unknown as HTMLCanvasElement;
    expect(() => renderJurreauismCanvas(missing, config)).not.toThrow();
    const context = { setTransform: vi.fn() };
    const hidden = {
      getContext: () => context, getBoundingClientRect: () => ({ width: 0, height: 0 }),
    } as unknown as HTMLCanvasElement;
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    renderJurreauismCanvas(hidden, config);
    expect(context.setTransform).not.toHaveBeenCalled();
  });
});
