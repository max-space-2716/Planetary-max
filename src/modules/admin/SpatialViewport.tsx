import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RoutingTarget } from '../../shared/max-routing';
import LineageReceipt from './LineageReceipt';
import ViewportVideoSearch from './ViewportVideoSearch';
import SportsFeedPresets from './SportsFeedPresets';
import { clearViewportVideoElement, safeVideoUrl } from './video-search';
import { createOverviewViewportController } from './overview-viewport-controller';
import { sportsUrlKind } from './sports-url-bar';
import { mountMaxArtBrowserPage, type MaxArtBrowserPageHandle } from './max-art-browser';
import type { StrokeLayer } from './jurreauism-interactive';
import type { LineageRun } from './lineage';
import { renderingNames, routingPrefixes, scenarioModes, viewportModes, type ViewportState, type WorkspaceSnapshot } from './workspace-state';
import './spatial-viewport.css';

type FrameBox = { width: number; height: number; ratio: number };
const renderings = {
  'MAX-ART': { symbol: '◇', kind: 'GALLERY / COMPOSITION', href: '/#/art' },
  'MAX Chess / MAX-QGA': { symbol: '♞', kind: 'BOARD / POSITION', href: '/#/chess' },
  'MAX-SPORTS': { symbol: '⌁', kind: 'RESEARCH / MATCHUP', href: '/#/sports' },
};

export default function SpatialViewport({ snapshot, activeRoute, nodeId, setViewport }: {
  snapshot: WorkspaceSnapshot;
  activeRoute: RoutingTarget | null;
  nodeId: string;
  setViewport: (state: ViewportState) => void;
}) {
  const [source, setSource] = useState('');
  const [sourceKind, setSourceKind] = useState<'stream' | 'embed'>('stream');
  const [error, setError] = useState('');
  const [angle, setAngle] = useState(35);
  const [run, setRun] = useState<LineageRun>();
  const [symmetryCount, setSymmetryCount] = useState(13);
  const [drawEnabled, setDrawEnabled] = useState(true);
  const [mirrorRadial, setMirrorRadial] = useState(true);
  const [strokeColor, setStrokeColor] = useState('#38bdf8');
  const [lineWidth, setLineWidth] = useState(2.5);
  const [strokeCount, setStrokeCount] = useState(0);
  const [canvasUnavailable, setCanvasUnavailable] = useState(false);
  const artCanvas = useRef<HTMLCanvasElement>(null);
  const artController = useRef<MaxArtBrowserPageHandle | null>(null);
  const artStrokes = useRef<StrokeLayer[]>([]);
  const screen = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<FrameBox>({ width: 0, height: 0, ratio: 1 });
  const { registry, scenario, viewport } = snapshot;
  const mode = viewport?.mode ?? 'MAX-SIM';
  const rendering = viewport?.rendering ?? 'MAX-ART';
  const videoMode = mode === 'Live Video' || (mode === 'MAX Renderings' && rendering === 'MAX-SPORTS');
  const sportsMode = mode === 'MAX Renderings' && rendering === 'MAX-SPORTS';
  const renderingItem = renderings[rendering];
  const artMode = mode === 'MAX Renderings' && rendering === 'MAX-ART';
  const artNodeTag = registry.selectedNodeId ?? 'unenrolled-local';

  useEffect(() => {
    const element = screen.current;
    if (!element) return;
    const measure = () => {
      const { width, height } = element.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      setBox(previous => previous.width === width && previous.height === height && previous.ratio === ratio
        ? previous : { width, height, ratio });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener('resize', measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  useEffect(() => {
    const canvas = artCanvas.current;
    if (!artMode || !canvas) return;
    if (!canvas.getContext('2d')) { setCanvasUnavailable(true); return; }
    setCanvasUnavailable(false);
    const controller = mountMaxArtBrowserPage(canvas, {
      nodeTag: artNodeTag, initialDrawEnabled: drawEnabled, symmetryCount, mirrorRadial, strokeColor, lineWidth,
      initialStrokes: artStrokes.current,
      onStateChange: meta => {
        setStrokeCount(meta.strokeCount);
        if (artController.current) artStrokes.current = artController.current.getStrokes();
      },
    });
    artController.current = controller;
    return () => {
      artStrokes.current = controller.getStrokes();
      artController.current = null;
      controller.destroy();
    };
  // Configuration changes are applied below without replacing the controller.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artMode]);

  useEffect(() => {
    artController.current?.setConfig({ nodeTag: artNodeTag, symmetryCount, mirrorRadial, strokeColor, lineWidth });
  }, [artMode, artNodeTag, symmetryCount, mirrorRadial, strokeColor, lineWidth]);

  const changeView = (next: ViewportState['mode'], item: ViewportState['rendering'] = null) => {
    if (next === mode && item === viewport?.rendering) return;
    setSource('');
    setSourceKind('stream');
    setError('');
    setViewport({ mode: next, rendering: item, sourceSet: false });
  };

  return <section className="spatial-viewport" aria-label="MAX-SPACE spatial viewport">
    <header>
      <div><small>PAGE 1 / COMMAND · MAX-SPACE</small><h4>Viewport</h4></div>
      <div className="spatial-switch" role="group" aria-label="Viewport mode">
        {viewportModes.map(item => <button type="button" key={item} aria-pressed={mode === item}
          onClick={() => changeView(item, item === 'MAX Renderings' ? (mode === item ? rendering : 'MAX-ART') : null)}>{item}</button>)}
      </div>
    </header>
    {mode === 'MAX Renderings' && <div className="spatial-switch spatial-rendering-tabs" role="group" aria-label="Rendering selection">
      {renderingNames.map(item => <button type="button" key={item} aria-pressed={rendering === item} onClick={() => changeView(mode, item)}>{item}</button>)}
    </div>}
    <div className="spatial-frame">
      <div className={`spatial-screen${artMode ? ' spatial-screen-art' : ''}`} ref={screen}>
        {mode === 'MAX-SIM' && <SimulationCanvas scenario={scenario} box={box} angle={angle}/>}
        {sportsMode && <SportsFeed source={source} kind={sourceKind} reportError={setError}/>}
        {videoMode && !sportsMode && source && <VideoPlayer key={source} source={source} reportError={setError}/>}
        {videoMode && !source && <div className="spatial-placeholder">
          <span aria-hidden="true">{mode === 'Live Video' ? '▷' : renderingItem.symbol}</span>
          <strong>{mode === 'Live Video' ? 'Awaiting a video source' : 'MAX-SPORTS · Live video'}</strong>
          <small>{sportsMode ? 'No live sports feed URL is attached yet.' : 'No stream is configured.'}</small>
        </div>}
        {artMode && <>
          <canvas ref={artCanvas} role="img" aria-label={`Interactive MAX-ART Jurreauism Canvas: 13 concentric rings and a lattice, signed MaxJ. Node: ${artNodeTag}.`}/>
          {canvasUnavailable && <p className="spatial-art-error" role="status">Canvas rendering is unavailable in this browser.</p>}
        </>}
        {mode === 'MAX Renderings' && !videoMode && !artMode && <div className="spatial-placeholder">
          <span aria-hidden="true">{renderingItem.symbol}</span><small>{renderingItem.kind} · STATIC PREVIEW</small>
          <strong>{rendering}</strong><a href={renderingItem.href}>Open {rendering} ↗</a>
        </div>}
        <div className="spatial-markers" aria-hidden="true"><i/><i/><i/><i/></div>
      </div>
      <div className="spatial-telemetry">
        <strong>{mode}</strong><UtcClock/>
        <span>Route: {activeRoute ? routingPrefixes[activeRoute] : 'None selected'}</span>
        <span>Node: {registry.selectedNodeId ?? 'None selected'}</span>
        <span>Registry: {registry.enrolled === null ? registry.status : `${registry.enrolled} enrolled / ${registry.activeTrust} active trust${registry.status === 'stale' ? ' (last loaded)' : ''}`}</span>
      </div>
    </div>
    {artMode && <div className="spatial-stage">
      <p className="spatial-hint">Draw with a pointer. Turn drawing off to scroll over the canvas. Strokes stay while this page is open, up to 64 strokes and 256 points per stroke.</p>
      <div className="art-controls" aria-label="Jurreauism drawing controls">
        <button type="button" aria-pressed={drawEnabled} disabled={canvasUnavailable} onClick={() => {
          const next = !drawEnabled;
          artController.current?.setDrawEnabled(next);
          setDrawEnabled(next);
        }}>Draw mode: {drawEnabled ? 'on' : 'off'}</button>
        <label>Symmetry: {symmetryCount}<input type="range" min="1" max="24" value={symmetryCount} onChange={event => setSymmetryCount(Number(event.target.value))}/></label>
        <label><input type="checkbox" checked={mirrorRadial} onChange={event => setMirrorRadial(event.target.checked)}/> Mirror radial</label>
        <label>Stroke color<input type="color" value={strokeColor} onChange={event => setStrokeColor(event.target.value)}/></label>
        <label>Line width: {lineWidth}<input type="range" min="1" max="24" step="0.5" value={lineWidth} onChange={event => setLineWidth(Number(event.target.value))}/></label>
        <button type="button" disabled={!strokeCount} onClick={() => artController.current?.undo()}>Undo stroke</button>
        <button type="button" disabled={!strokeCount} onClick={() => artController.current?.clear()}>Clear strokes</button>
        <span role="status">Strokes: {strokeCount}{strokeCount >= 64 ? ' · limit reached' : ''}</span>
      </div>
      <p className="spatial-hint">Jurreauism Canvas · 13 rings and lattice · MaxJ · Layer 13 · OUR umbrella · DAT-JURREAUISM-v1 · Node: {artNodeTag}</p>
      <a className="spatial-art-link" href="/#/art">Open MAX-ART ↗</a>
    </div>}
    {mode === 'MAX-SIM' && <div className="spatial-stage">
      <div className="spatial-sim-meta"><strong>Base {scenario.base} × Height {scenario.height}</strong>
        <label>View angle <input type="range" min="-60" max="60" value={angle} onChange={event => setAngle(Number(event.target.value))}/></label>
      </div>
      <p className="spatial-hint">Models left to right: linear, exponential, double exponential, tetration. Heights are logarithmic; purple markers exceed the safe integer limit.</p>
    </div>}
    {videoMode && <div className="spatial-stage" key={mode}>
      <ViewportVideoSearch snapshot={snapshot} nodeId={nodeId}
        endpoint={import.meta.env.VITE_VIDEO_SEARCH_ENDPOINT}
        select={url => {
          setError(''); setSourceKind('stream'); setSource(url);
          setViewport({ mode, rendering: viewport?.rendering ?? null, sourceSet: true });
        }}/>
      <form className="spatial-video-form" onSubmit={event => {
        event.preventDefault();
        const raw = String(new FormData(event.currentTarget).get('source')).trim();
        if (sportsMode && !raw) {
          setSource(''); setError(''); setSourceKind('stream');
          setViewport({ mode, rendering: viewport?.rendering ?? null, sourceSet: false });
          return;
        }
        const url = safeVideoUrl(raw);
        if (!url) {
          if (sportsMode) { setSource(''); setViewport({ mode, rendering: viewport?.rendering ?? null, sourceSet: false }); }
          setError('Enter an HTTPS URL without embedded credentials.'); return;
        }
        setError(''); setSourceKind(sportsMode ? sportsUrlKind(url) : 'stream'); setSource(url);
        setViewport({ mode, rendering: viewport?.rendering ?? null, sourceSet: true });
      }}>
        <label>{sportsMode ? 'HTTPS sports URL' : 'Direct HTTPS video URL'}<input id={sportsMode ? 'max-sports-url-input' : undefined} name="source" type="text" inputMode="url" placeholder="https://example.com/preview.mp4" required={!sportsMode} maxLength={2048}/></label>
        <button id={sportsMode ? 'max-sports-load-btn' : undefined} type="submit">Set source</button>
        {(source || sportsMode) && <button id={sportsMode ? 'max-sports-clear-btn' : undefined} type="button" onClick={event => {
          if (sportsMode) event.currentTarget.form?.reset();
          setSource(''); setError('');
          setViewport({ mode, rendering: viewport?.rendering ?? null, sourceSet: false });
        }}>{sportsMode ? 'Clear feed' : 'Unload video'}</button>}
      </form>
      {sportsMode && <p id="max-sports-status" role="status" className="spatial-hint">{source ? `Feed URL attached (${sourceKind === 'embed' ? 'iframe; host framing rules apply' : 'direct video'}).` : 'unwired_honest: No live sports feed URL is attached yet.'}</p>}
      <p className="spatial-hint">{sportsMode && sourceKind === 'embed' && source ? 'Playback depends on the embed provider.' : 'Press Play to start. Playback depends on browser format support.'} Leaving this view unloads the player.</p>
      {error && <p role="alert">{error}</p>}
      {sportsMode && <SportsFeedPresets/>}
    </div>}
    <div className="spatial-stage spatial-record">
      <p className="spatial-transport">{snapshot.transport}</p>
      <button type="button" onClick={() => setRun({
        kind: 'view', nodeId, timestamp: new Date().toISOString(),
        intent: { action: 'record-command-view', mode, rendering: viewport?.rendering ?? null },
        ir: { renderer: mode === 'MAX-SIM' ? 'canvas-perspective' : artMode ? 'jurreauism-interactive-canvas-v1' : sportsMode && source && sourceKind === 'embed' ? 'iframe' : videoMode ? 'native-video' : 'static-preview',
          width_css_px: box.width, height_css_px: box.height, angle: mode === 'MAX-SIM' ? angle : null },
        result: { source_configured: Boolean(source), media_error: Boolean(error), registry, route: activeRoute,
          scenario: mode === 'MAX-SIM' ? scenario : null, ...(artMode ? { art: { seedLabel: 'DAT-JURREAUISM-v1', signature: 'MaxJ', layer: 'Layer 13', umbrella: 'OUR umbrella', nodeTag: artNodeTag, drawEnabled, symmetryCount, mirrorRadial, strokeColor, lineWidth,
            strokes: artStrokes.current.map(stroke => ({ ...stroke, points: stroke.points.map(point => ({ x: point.x, y: point.y })) })) } } : {}), transport: snapshot.transport },
      })}>Record viewport state</button>
      {run && <p className="spatial-hint">Receipt records the viewport at {run.timestamp}; later changes are not included.</p>}
      <LineageReceipt run={run}/>
    </div>
  </section>;
}

function SportsFeed({ source, kind, reportError }: { source: string; kind: 'stream' | 'embed'; reportError: (message: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!container.current) return;
    const controller = createOverviewViewportController(container.current);
    controller.activateSportsFeed(kind === 'embed' ? { embedUrl: source } : { streamUrl: source });
    if (kind === 'stream' && source) {
      const video = container.current.querySelector('video');
      if (video) void video.play().catch(() => {});
    }
    return () => { controller.switchAwayTo('idle'); };
  }, [source, kind]);
  return <div className="spatial-sports-feed" ref={container} onErrorCapture={() => {
    if (kind === 'stream') reportError('Video could not play. Check the URL and browser format support.');
  }}/>;
}

function VideoPlayer({ source, reportError }: { source: string; reportError: (message: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const player = video.current;
    if (!player) return;
    player.src = source;
    return () => {
      clearViewportVideoElement(player);
    };
  }, [source]);
  return <video ref={video} controls playsInline preload="none" aria-label="HTTPS video preview"
    onError={() => reportError('Video could not play. Check the URL and browser format support.')}/>;
}

function UtcClock() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const interval = window.setInterval(() => setTime(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);
  return <time dateTime={time.toISOString()}>{time.toISOString().slice(11, 19)} UTC</time>;
}

function SimulationCanvas({ scenario, box, angle }: { scenario: WorkspaceSnapshot['scenario']; box: FrameBox; angle: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const frame = canvas.current;
    if (!frame) return;
    const { width, height, ratio } = box;
    if (width < 1 || height < 1) return;
    frame.width = Math.round(width * ratio);
    frame.height = Math.round(height * ratio);
    const ctx = frame.getContext('2d');
    if (!ctx) return;
    ctx.scale(frame.width / width, frame.height / height);
    const yaw = angle * Math.PI / 180;
    const scale = Math.min(width / 12, height / 8);
    const turn = (x: number, z: number) => [x * Math.cos(yaw) - z * Math.sin(yaw), x * Math.sin(yaw) + z * Math.cos(yaw)];
    const project = (x: number, y: number, z: number): [number, number] => {
      const [across, depth] = turn(x, z);
      const perspective = 10 / (10 - depth);
      return [width / 2 + across * scale * perspective, height * .66 + (depth * .42 - y) * scale * perspective];
    };
    const path = (points: Array<[number, number, number]>) => {
      ctx.beginPath();
      points.forEach((point, index) => {
        const [x, y] = project(...point);
        if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
    };
    ctx.strokeStyle = '#214553';
    for (let i = -4; i <= 4; i++) {
      path([[i, 0, -3], [i, 0, 3]]); ctx.stroke();
      path([[-4, 0, i * .75], [4, 0, i * .75]]); ctx.stroke();
    }
    const faces: { points: Array<[number, number, number]>; fill: string; depth: number }[] = [];
    scenarioModes.forEach((model, index) => {
      const x = (index - 1.5) * 1.65;
      const value = scenario.results[model];
      const h = value === null ? .1 : Math.max(.16, Math.log10(1 + value) / 5);
      const a = x - .53, b = x + .53, c = -.54, d = .54;
      const palette = value === null ? ['#292332', '#393049', '#5a4666'] : ['#153c54', '#286881', '#64c3c3'];
      const face = (points: Array<[number, number, number]>, fill: string) => {
        faces.push({ points, fill, depth: points.reduce((sum, [px, y, z]) => sum + turn(px, z)[1] + y * .45, 0) / points.length });
      };
      face([[a,0,c],[b,0,c],[b,h,c],[a,h,c]], palette[0]);
      face([[a,0,d],[b,0,d],[b,h,d],[a,h,d]], palette[1]);
      face([[a,0,c],[a,0,d],[a,h,d],[a,h,c]], palette[0]);
      face([[b,0,c],[b,0,d],[b,h,d],[b,h,c]], palette[1]);
      face([[a,h,c],[b,h,c],[b,h,d],[a,h,d]], palette[2]);
    });
    ctx.strokeStyle = '#99dcd67c';
    for (const face of faces.sort((a, b) => a.depth - b.depth)) {
      path(face.points); ctx.closePath(); ctx.fillStyle = face.fill; ctx.fill(); ctx.stroke();
    }
  }, [angle, box, scenario]);
  return <canvas ref={canvas} aria-label="Perspective view of the four bounded growth scenarios" role="img"/>;
}

