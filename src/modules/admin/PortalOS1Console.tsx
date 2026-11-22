import React, { useEffect, useState } from 'react';
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

const nav = [
  {icon:'✳',label:'BEEMAX AI',href:'#beemax'}, {icon:'⇢',label:'Routing studio',href:'#routing-studio'}, {icon:'◈',label:'MAX-SPACE lab',href:'#substrate'},
  {icon:'◫', label:'Overview', href:'#overview'}, {icon:'⌘', label:'ICV Mesh', href:'#mesh'},
  {icon:'⬡', label:'BEE-MAX Registry', href:'#registry'}, {icon:'⌁', label:'Command Terminal', href:'#terminal'}, {icon:'✳',label:'Publishing desk',href:'#publishing'},
];
export default function PortalOS1Console() { return <AdminAccess><ConsoleAccess/></AdminAccess>; }
function ConsoleAccess() { return useAdministrator() ? <ConsoleDashboard/> : <PublicCommandCenter/>; }
function ConsoleDashboard() {
  const [nodes,setNodes]=useState<RegistryNode[]>([]); const [registryError,setRegistryError]=useState('');
  const refresh=async()=>{try{const res=await fetch('/api/admin/nodes');const data=await res.json() as {nodes:RegistryNode[];error?:string};if(!res.ok)throw new Error(data.error);setNodes(data.nodes);setRegistryError('');}catch(e){setRegistryError(e instanceof Error?e.message:'Registry unavailable');}};
  useEffect(()=>{void refresh();},[]);
  const [active,setActive]=useState('Overview'); const [time,setTime]=useState(new Date());
  useEffect(()=>{const previousTitle=document.title; document.title='PORTAL-OS1 — Command Center'; return ()=>{document.title=previousTitle;};},[]);
  useEffect(()=>{const timer=window.setInterval(()=>setTime(new Date()),1000);return()=>window.clearInterval(timer);},[]);
  const navigate=(event:React.MouseEvent<HTMLAnchorElement>,label:string,id:string)=>{event.preventDefault();setActive(label);document.getElementById(id)?.scrollIntoView({behavior:'smooth'});};
  return <div className="console-shell" id="overview">
    <aside className="console-sidebar"><a href="#overview" className="console-brand" onClick={e=>navigate(e,'Overview','overview')}><span className="brand-glyph">✳</span><span>PORTAL<span className="brand-accent">OS</span><small>THE SOVEREIGN NETWORK</small></span></a>
      <div className="sidebar-section">WORKSPACE <span>01</span></div><nav aria-label="Console navigation" className="console-nav">{nav.map(item=><a key={item.label} href={item.href} onClick={e=>navigate(e,item.label,item.href.slice(1))} className={active===item.label?'active':''}><span className="nav-icon">{item.icon}</span>{item.label}{active===item.label&&<span className="active-marker">›</span>}</a>)}</nav>
      <div className="sidebar-section system-label">SYSTEM</div><a className="sidebar-link" href="/"><span className="nav-icon">↗</span> Return to spaces</a>
      <div className="sidebar-bottom"><div className="side-orb">✳</div><div><strong>PORTAL-OS1</strong><small>Spatial command center</small></div><span>⋮</span></div>
    </aside>
    <main className="console-main"><header className="console-topbar"><div className="breadcrumb"><a className="mobile-back" href="/">← SPACES</a><span>WORKSPACE</span><b>/</b><strong>{active.toUpperCase()}</strong></div><div className="top-actions"><span className="top-clock">◷ &nbsp; {time.toLocaleTimeString('en-GB',{timeZone:'UTC'})} UTC</span><span className="top-separator"/><span className="environment"><i className="status-dot amber"/> OPERATOR ACCESS</span><FullscreenButton/><span className="avatar">M</span></div></header>
      <nav className="console-mobile-nav" aria-label="Mobile command navigation">{nav.map(item=><button key={item.label} aria-pressed={active===item.label} onClick={()=>{setActive(item.label);document.getElementById(item.href.slice(1))?.scrollIntoView({behavior:'smooth'});}}>{item.label}</button>)}</nav><div className="console-content"><div className="page-heading"><div><div className="eyebrow"><span className="tiny-spark">✳</span> THE SOVEREIGN NETWORK <span className="eyebrow-line"/> COMMAND CENTER</div><h1>Welcome to the <em>nexus.</em></h1><p>Your spatial command center for the MAX ecosystem.</p></div><div className="heading-meta"><span>YOUR UNIVERSE, AT A GLANCE</span><strong>PORTAL-OS <i>✳</i> 01</strong></div></div>
        <div className="overview-strip"><div className="overview-title"><span className="overview-symbol">✧</span><div><small>NETWORK OVERVIEW</small><strong>One network. Infinite possibilities.</strong></div></div><div className="overview-divider"/><div className="overview-metric"><small>ICV MESH</small><strong><i className="status-dot violet"/> Registered identities</strong></div><div className="overview-metric"><small>REGISTRY</small><strong><i className="status-dot amber"/> {registryError?'Unavailable':`${nodes.length} nodes`}</strong></div><div className="overview-metric"><small>ENVIRONMENT</small><strong>Worker <span>↗</span></strong></div></div>
        <div className="section-heading"><div><span className="section-index">01 / CONTROL SURFACE</span><h2>Your network, in focus<span>.</span></h2></div><p>Explore the systems that bring your universe together.</p></div>
        <div className="dashboard-grid"><BeeMaxAssistant/><MaxRoutingStudio/><section className="panel mesh-panel" id="mesh"><div className="panel-header"><div className="panel-title"><span className="panel-icon violet-icon">⌘</span><div><h3>ICV Mesh Visualizer</h3><p>MAX-MIND intelligence network</p></div></div><span className="panel-badge"><i className="status-dot violet"/> NODE MAP</span></div><Ic_MeshVisualizer nodes={nodes}/></section>
          <section className="panel registry-panel" id="registry"><div className="panel-header"><div className="panel-title"><span className="panel-icon gold-icon">⬡</span><div><h3>BEE-MAX Control Deck</h3><p>Registry &amp; telemetry monitor</p></div></div><span className="panel-menu">···</span></div><BeeMaxControlDeck nodes={nodes} error={registryError} refresh={refresh}/></section>
          <section className="panel terminal-panel" id="terminal"><div className="panel-header"><div className="panel-title"><span className="panel-icon green-icon">›_</span><div><h3>Sovereign Command Terminal</h3><p>Direct interface to your ecosystem</p></div></div><span className="panel-badge terminal-badge">● &nbsp; CONSOLE READY</span></div><SovereignCommandTerminal /></section>
          <section className="panel protocol-panel"><div className="protocol-top"><span className="protocol-icon">✳</span><span>THE PORTAL PRINCIPLE</span><span>↗</span></div><div className="protocol-art"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="orbit orbit-three"/><span>✳</span></div><div className="protocol-copy"><span>BUILT FOR WHAT'S NEXT</span><h3>Your universe.<br/><em>Your rules.</em></h3><p>A sovereign space to connect, create, and command.</p></div></section>
        <SubstrateModel/><PublishingPanel/></div><footer className="console-footer"><span>✳ &nbsp; PORTAL-OS1 <b> / </b> THE SOVEREIGN NETWORK</span><span>DESIGNED FOR THE UNIVERSE YOU'RE BUILDING &nbsp; ✧</span></footer>
      </div>
    </main>
  </div>;
}
