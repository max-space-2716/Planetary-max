export interface JurreauismCanvasConfig {
  seedLabel: string;
  signature: 'MaxJ';
  layer: 'Layer 13';
  umbrella: 'OUR umbrella';
  nodeTag: string;
}

/** Draw a still image in the shared viewport's CSS coordinate space. */
export function renderJurreauismCanvas(canvas: HTMLCanvasElement, config: JurreauismCanvasConfig): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { width: w, height: h } = canvas.getBoundingClientRect();
  if (w <= 0 || h <= 0) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(w * ratio));
  canvas.height = Math.max(1, Math.round(h * ratio));
  ctx.setTransform(canvas.width / w, 0, 0, canvas.height / h, 0, 0);

  const cx = w / 2;
  const cy = h / 2;
  // Reserve space above and below the lattice for readable HUD text.
  const radius = Math.min(Math.min(w, h) * 0.34, Math.max(0, (h - 132) / 2));
  ctx.fillStyle = '#06080f';
  ctx.fillRect(0, 0, w, h);

  const step = Math.max(24, Math.floor(Math.min(w, h) / 14));
  ctx.strokeStyle = 'rgba(96, 165, 250, 0.10)';
  ctx.lineWidth = 1;
  for (let x = cx % step; x < w; x += step) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = cy % step; y < h; y += step) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  for (let i = 1; i <= 13; i++) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius * i / 13, 0, Math.PI * 2);
    ctx.strokeStyle = i === 13 ? 'rgba(250, 204, 21, 0.85)' : `rgba(56, 189, 248, ${0.14 + (i / 13) * 0.32})`;
    ctx.lineWidth = i === 13 ? 1.8 : 1;
    ctx.stroke();
  }

  const points = Array.from({ length: 13 }, (_, k) => {
    const angle = k * 2 * Math.PI / 13 - Math.PI / 2;
    return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
  });
  ctx.strokeStyle = 'rgba(244, 244, 245, 0.28)';
  ctx.lineWidth = 1;
  points.forEach((point, index) => {
    const next = points[(index + 5) % points.length];
    ctx.beginPath(); ctx.moveTo(point.x, point.y); ctx.lineTo(next.x, next.y); ctx.stroke();
  });

  // Keep the seal and transport on separate lines on narrow screens.
  ctx.fillStyle = '#facc15';
  ctx.font = '600 12px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText('MAX-ART // JURREAUISM CANVAS', 16, 24, Math.max(1, w - 32));
  ctx.fillStyle = 'rgba(226, 232, 240, 0.85)';
  ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(`${config.layer} | ${config.umbrella} | ${config.seedLabel}`, 16, 42, Math.max(1, w - 32));
  ctx.fillText(`Node: ${config.nodeTag}`, 16, 58, Math.max(1, w - 32));
  ctx.fillText('Cloudflare HTTPS active', 16, h - 43, Math.max(1, w - 32));
  ctx.fillText('P-STEP/1.0 & MAX-TELECOM planned', 16, h - 29, Math.max(1, w - 32));
  ctx.fillStyle = '#facc15';
  ctx.font = '700 14px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(`SEAL: ${config.signature}`, 16, h - 12, Math.max(1, w - 32));
}
