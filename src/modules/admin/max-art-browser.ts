import {
  attachJurreauismInteractiveCanvas,
  type JurreauismInteractiveConfig,
  type StrokeLayer,
} from './jurreauism-canvas';

export interface MaxArtBrowserPageHandle {
  setDrawEnabled: (enabled: boolean) => void;
  setSymmetry: (symmetryCount: number, mirrorRadial?: boolean) => void;
  undo: () => boolean;
  clear: () => void;
  destroy: () => void;
  // The Command viewport keeps brush settings and local strokes across view changes.
  setConfig: (patch: Partial<JurreauismInteractiveConfig>) => void;
  getConfig: () => JurreauismInteractiveConfig;
  getStrokes: () => StrokeLayer[];
}

export function mountMaxArtBrowserPage(
  canvas: HTMLCanvasElement,
  options: {
    nodeTag?: string;
    initialDrawEnabled?: boolean;
    symmetryCount?: number;
    mirrorRadial?: boolean;
    strokeColor?: string;
    lineWidth?: number;
    initialStrokes?: StrokeLayer[];
    onStateChange?: (meta: { strokeCount: number; symmetryCount: number; mirrorRadial: boolean }) => void;
  } = {},
): MaxArtBrowserPageHandle {
  const config: JurreauismInteractiveConfig = {
    seedLabel: 'DAT-JURREAUISM-v1', signature: 'MaxJ', layer: 'Layer 13', umbrella: 'OUR umbrella',
    nodeTag: options.nodeTag || 'max-space-max-art',
    symmetryCount: options.symmetryCount ?? 13, mirrorRadial: options.mirrorRadial ?? true,
    strokeColor: options.strokeColor ?? '#38bdf8', lineWidth: options.lineWidth ?? 2.5,
  };
  const controller = attachJurreauismInteractiveCanvas(canvas, config, options.onStateChange, options.initialStrokes);
  controller.setDrawEnabled(options.initialDrawEnabled ?? true);

  return {
    setDrawEnabled: enabled => controller.setDrawEnabled(enabled),
    setSymmetry: (symmetryCount, mirrorRadial) => controller.setConfig({
      symmetryCount, ...(typeof mirrorRadial === 'boolean' ? { mirrorRadial } : {}),
    }),
    undo: () => controller.undo(),
    clear: () => controller.clearStrokes(),
    destroy: () => controller.destroy(),
    setConfig: patch => controller.setConfig(patch),
    getConfig: () => controller.getConfig(),
    getStrokes: () => controller.getStrokes(),
  };
}
