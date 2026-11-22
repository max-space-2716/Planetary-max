import React, { useCallback, useEffect, useRef, useState } from 'react';
import Ic_MeshVisualizer from './Ic_MeshVisualizer';
import BeeMaxControlDeck, { type RegistryNode } from './BeeMaxControlDeck';
import AdminAccess, { useAdministrator } from './AdminAccess';
import PublicCommandCenter from './PublicCommandCenter';
import SubstrateModel from './SubstrateModel';
import MaxRoutingStudio from './MaxRoutingStudio';
import BeeMaxAssistant from './BeeMaxAssistant';
import PublishingPanel from './PublishingPanel';
import FullscreenButton from '../../core/FullscreenButton';
import SovereignCommandTerminal from './SovereignCommandTerminal';
import './admin.css';

import type { RoutingTarget, TargetStatus } from '../../shared/max-routing';
import { defaultViewport, type ViewportState, ledgerNote, scenarioSnapshot, transportNote, workspacePanels, type RoutingState, type WorkspacePanel, type WorkspaceSnapshot } from './workspace-state';

const nav = [
  { id: 'beemax' as const, label: 'BEEMAX AI', icon: '✳' },
  ...Object.entries(workspacePanels).map(([id, { label, icon }]) => ({ id: id as WorkspacePanel, label, icon })),
];
type Destination = 'beemax' | WorkspacePanel;
export default function PortalOS1Console() { return <AdminAccess><ConsoleAccess/></AdminAccess>; }
function ConsoleAccess() { return useAdministrator() ? <ConsoleDashboard/> : <PublicCommandCenter/>; }
function ConsoleDashboard() {
  const [registry, setRegistry] = useState<{ nodes: RegistryNode[] | null; error: string }>({ nodes: null, error: '' });
  const registryRequest = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    registryRequest.current?.abort();
    const controller = new AbortController();
    registryRequest.current = controller;
    try {
      const res = await fetch('/api/admin/nodes', { signal: controller.signal });
      const data = await res.json() as { nodes?: RegistryNode[]; error?: string };
      if (!res.ok || !Array.isArray(data.nodes)) throw new Error(data.error || 'Registry unavailable');
      if (!controller.signal.aborted) setRegistry({ nodes: data.nodes, error: '' });
    } catch (e) {
      if (!controller.signal.aborted) setRegistry(previous => ({ ...previous, error: e instanceof Error ? e.message : 'Registry unavailable' }));
    }
  }, []);
  useEffect(() => {
    void refresh();
    return () => registryRequest.current?.abort();
  }, [refresh]);

  const [targets, setTargets] = useState<RoutingState>({});
  const [viewport, setViewport] = useState<ViewportState>(defaultViewport);
  const [activeRoute, setActiveRoute] = useState<RoutingTarget | null>(null);
  const [statusError, setStatusError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch('/api/admin/max-routing/status', { signal: controller.signal });
        if (!response.ok) throw new Error();
        const data = await response.json() as { targets: Array<{ target: RoutingTarget; status: TargetStatus }> };
        if (!controller.signal.aborted) setTargets(previous => ({ ...Object.fromEntries(data.targets.map(({ target, status }) => [target, status])), ...previous }));
      } catch {
        if (!controller.signal.aborted) setStatusError('Could not load target configuration.');
      }
    })();
    return () => controller.abort();
  }, []);

  const [active, setActive] = useState<WorkspacePanel>('overview');
  const [selection, setSelection] = useState<string | null>(null);
  const [base, setBase] = useState(2);
  const [height, setHeight] = useState(3);
  const nodes = registry.nodes ?? [];
  const selectedNode = nodes.find(node => node.node_id === selection) ?? nodes[0];
  const selectedNodeId = selectedNode?.node_id ?? null;
  const receiptNodeId = (selectedNode?.status === 'ACTIVE' ? selectedNode : nodes.find(node => node.status === 'ACTIVE'))?.node_id ?? 'unenrolled-local';
  const scenario = scenarioSnapshot(base, height);
  const pendingRouting = statusError ? 'unknown' : 'checking';
  const snapshot: WorkspaceSnapshot = {
    panel: active,
    registry: {
      status: registry.error ? (registry.nodes ? 'stale' : 'unavailable') : registry.nodes ? 'available' : 'loading',
      enrolled: registry.nodes?.length ?? null,
      activeTrust: registry.nodes?.filter(node => node.status === 'ACTIVE').length ?? null,
      selectedNodeId,
    },
    routing: {
      max_llm: targets.max_llm ?? pendingRouting,
      neural: targets.neural ?? pendingRouting,
      solver: targets.solver ?? pendingRouting,
    },
    scenario,
    ledger: ledgerNote,
    transport: transportNote,
    viewport,
    activeRoute,
  };

  useEffect(()=>{const previousTitle=document.title; document.title='PORTAL-OS1 — Command Center'; return ()=>{document.title=previousTitle;};},[]);
  const navigate = (id: Destination) => {
    if (id !== 'beemax') setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };
  const trackPanel = (target: EventTarget) => {
    if (!(target instanceof Element)) return;
    const id = target.closest('.panel[id]')?.id;
    if (id && Object.hasOwn(workspacePanels, id)) setActive(id as WorkspacePanel);
  };
  return <div className="console-shell" id="overview">
    <aside className="console-sidebar"><a href="#overview" className="console-brand" onClick={e=>{e.preventDefault();navigate('overview');}}><span className="brand-glyph">✳</span><span>PORTAL<span className="brand-accent">OS</span><small>THE SOVEREIGN NETWORK</small></span></a>
      <div className="sidebar-section">WORKSPACE <span>01</span></div><nav aria-label="Console navigation" className="console-nav">{nav.map(item=><a key={item.id} href={`#${item.id}`} onClick={e=>{e.preventDefault();navigate(item.id);}} className={active===item.id?'active':''} aria-current={active===item.id?'location':undefined}><span className="nav-icon">{item.icon}</span>{item.label}{active===item.id&&<span className="active-marker">›</span>}</a>)}</nav>
      <div className="sidebar-section system-label">SYSTEM</div><a className="sidebar-link" href="/"><span className="nav-icon">↗</span> Return to spaces</a>
      <div className="sidebar-bottom"><div className="side-orb">✳</div><div><strong>PORTAL-OS1</strong><small>Spatial command center</small></div><span>⋮</span></div>
    </aside>
    <main className="console-main"><header className="console-topbar"><div className="breadcrumb"><a className="mobile-back" href="/">← SPACES</a><span>WORKSPACE</span><b>/</b><strong>{workspacePanels[active].label.toUpperCase()}</strong></div><div className="top-actions"><span className="top-clock">◷ &nbsp; <ConsoleClock/></span><span className="top-separator"/><span className="environment"><i className="status-dot amber"/> OPERATOR ACCESS</span><FullscreenButton/><span className="avatar">M</span></div></header>
      <nav className="console-mobile-nav" aria-label="Mobile command navigation">{nav.map(item=><button key={item.label} aria-pressed={active===item.id} onClick={()=>navigate(item.id)}>{item.label}</button>)}</nav><div className="console-content"><div className="page-heading"><div><div className="eyebrow"><span className="tiny-spark">✳</span> THE SOVEREIGN NETWORK <span className="eyebrow-line"/> COMMAND CENTER</div><h1>Welcome to the <em>nexus.</em></h1><p>Your spatial command center for the MAX ecosystem.</p></div><div className="heading-meta"><span>YOUR UNIVERSE, AT A GLANCE</span><strong>PORTAL-OS <i>✳</i> 01</strong></div></div>
        <div className="overview-strip"><div className="overview-title"><span className="overview-symbol">✧</span><div><small>NETWORK OVERVIEW</small><strong>One network. Infinite possibilities.</strong></div></div><div className="overview-divider"/><div className="overview-metric"><small>ICV MESH</small><strong><i className="status-dot violet"/> Registered identities</strong></div><div className="overview-metric"><small>REGISTRY</small><strong><i className="status-dot amber"/> {registry.error?'Unavailable':registry.nodes?`${nodes.length} nodes`:'Loading…'}</strong></div><div className="overview-metric"><small>ENVIRONMENT</small><strong>Worker <span>↗</span></strong></div></div>
        <div className="section-heading"><div><span className="section-index">01 / CONTROL SURFACE</span><h2>Your network, in focus<span>.</span></h2></div><p>Explore the systems that bring your universe together.</p></div>
        <div className="dashboard-grid" onFocus={event => trackPanel(event.target)} onClick={event => trackPanel(event.target)}><BeeMaxAssistant snapshot={snapshot} nodeId={receiptNodeId}/><MaxRoutingStudio targets={targets} setTargets={setTargets} statusError={statusError} nodeId={receiptNodeId} setActiveRoute={setActiveRoute}/><section className="panel mesh-panel" id="mesh"><div className="panel-header"><div className="panel-title"><span className="panel-icon violet-icon">⌘</span><div><h3>ICV Mesh Visualizer</h3><p>MAX-MIND intelligence network</p></div></div><span className="panel-badge"><i className="status-dot violet"/> NODE MAP</span></div><Ic_MeshVisualizer nodes={nodes} selectedNodeId={selectedNodeId} onSelect={setSelection}/></section>
          <section className="panel registry-panel" id="registry"><div className="panel-header"><div className="panel-title"><span className="panel-icon gold-icon">⬡</span><div><h3>BEE-MAX Control Deck</h3><p>Registry &amp; telemetry monitor</p></div></div><span className="panel-menu">···</span></div><BeeMaxControlDeck nodes={nodes} error={registry.error} refresh={refresh}/></section>
          <section className="panel terminal-panel" id="terminal"><div className="panel-header"><div className="panel-title"><span className="panel-icon green-icon">›_</span><div><h3>Sovereign Command Terminal</h3><p>Direct interface to your ecosystem</p></div></div><span className="panel-badge terminal-badge">● &nbsp; CONSOLE READY</span></div><SovereignCommandTerminal /></section>
          <section className="panel protocol-panel"><div className="protocol-top"><span className="protocol-icon">✳</span><span>THE PORTAL PRINCIPLE</span><span>↗</span></div><div className="protocol-art"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="orbit orbit-three"/><span>✳</span></div><div className="protocol-copy"><span>BUILT FOR WHAT'S NEXT</span><h3>Your universe.<br/><em>Your rules.</em></h3><p>A sovereign space to connect, create, and command.</p></div></section>
        <SubstrateModel controls={{ scenario, setBase, setHeight, snapshot, activeRoute, nodeId: receiptNodeId, setViewport }}/><PublishingPanel nodeId={receiptNodeId}/></div><footer className="console-footer"><span>✳ &nbsp; PORTAL-OS1 <b> / </b> THE SOVEREIGN NETWORK</span><span>DESIGNED FOR THE UNIVERSE YOU'RE BUILDING &nbsp; ✧</span></footer>
      </div>
    </main>
  </div>;
}

function ConsoleClock() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setTime(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <>{time.toLocaleTimeString('en-GB', { timeZone: 'UTC' })} UTC</>;
}
