import React, { useEffect, useRef } from 'react';

import type { RegistryNode } from './BeeMaxControlDeck';
export default function Ic_MeshVisualizer({ nodes, selectedNodeId, onSelect }: { nodes: RegistryNode[]; selectedNodeId: string | null; onSelect: (id: string) => void }) {
  const meshNodes = nodes.map((n,i)=>({id:n.node_id,name:n.node_id,role:n.status,x:.5+Math.cos(i/Math.max(nodes.length,1)*Math.PI*2)*.3,y:.46+Math.sin(i/Math.max(nodes.length,1)*Math.PI*2)*.29,color:n.status==='ACTIVE'?'#c5a3ff':'#777777'}));
  const edges: number[][] = [];
  const canvas = useRef<HTMLCanvasElement>(null);
  const selected = meshNodes.findIndex(node => node.id === selectedNodeId);
  const selectedNode = meshNodes[selected];
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const draw = () => {
      const rect = element.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      element.width = rect.width * ratio; element.height = rect.height * ratio;
      const ctx = element.getContext('2d'); if (!ctx) return;
      ctx.scale(ratio, ratio);
      const w = rect.width, h = rect.height;
      ctx.clearRect(0, 0, w, h);
      // A quiet star field gives the graph depth without implying live activity.
      for (let i = 0; i < 80; i++) {
        const x = ((i * 83 + 17) % 997) / 997 * w, y = ((i * 139 + 53) % 991) / 991 * h;
        ctx.fillStyle = i % 7 === 0 ? '#7779ac66' : '#7779ac2c'; ctx.fillRect(x, y, i % 7 === 0 ? 1.5 : 1, i % 7 === 0 ? 1.5 : 1);
      }
      edges.forEach(([a,b]) => {
        ctx.beginPath(); ctx.moveTo(meshNodes[a].x*w, meshNodes[a].y*h); ctx.lineTo(meshNodes[b].x*w, meshNodes[b].y*h);
        ctx.strokeStyle = a === selected || b === selected ? '#ab91f788' : '#655b9b48'; ctx.lineWidth = 1; ctx.stroke();
      });
      meshNodes.forEach((node, i) => {
        const x=node.x*w, y=node.y*h, radius=i === 0 ? 24 : 17;
        const glow=ctx.createRadialGradient(x,y,0,x,y,radius*3.3); glow.addColorStop(0, `${node.color}44`); glow.addColorStop(1, `${node.color}00`);
        ctx.fillStyle=glow; ctx.beginPath(); ctx.arc(x,y,radius*3.3,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle = i === selected ? node.color : `${node.color}77`; ctx.lineWidth = i === selected ? 1.5 : 1;
        ctx.beginPath(); ctx.arc(x,y,radius+6,0,Math.PI*2); ctx.stroke();
        ctx.fillStyle='#111329'; ctx.beginPath(); ctx.arc(x,y,radius,0,Math.PI*2); ctx.fill(); ctx.strokeStyle=`${node.color}bb`; ctx.stroke();
        ctx.fillStyle=node.color; ctx.font=`${i === 0 ? 17 : 13}px sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(i === 0 ? '✳' : '✦',x,y);
        ctx.fillStyle='#c9c9db'; ctx.font='10px sans-serif'; ctx.fillText(node.name, x, y+radius+20);
      });
    };
    const observer = new ResizeObserver(draw); observer.observe(element); draw(); return () => observer.disconnect();
  }, [selected,nodes]);
  const choose = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width, y = (event.clientY - rect.top) / rect.height;
    const index = meshNodes.findIndex(node => Math.hypot((node.x-x)*rect.width,(node.y-y)*rect.height) < 35);
    if (index >= 0) onSelect(meshNodes[index].id);
  };
  return <div className="mesh-body">
    <div className="mesh-stage"><div className="mesh-corner top-left"/><div className="mesh-corner top-right"/><div className="mesh-corner bottom-left"/><div className="mesh-corner bottom-right"/>
      <div className="mesh-overlay"><span><i className="status-dot violet"/> NODE IDENTITY MAP</span><span>REGISTERED IDENTITIES</span></div>
      <canvas ref={canvas} onClick={choose} aria-label="Registered node map. Select a node using the buttons below." />
      <div className="mesh-bottom"><span>✥ &nbsp; CONNECTIONS NOT REPORTED</span><span>{nodes.length ? selected + 1 : 0} / {nodes.length}</span></div>
    </div>
    <div className="mesh-footer"><div><span className="mini-label">SELECTED NODE</span><strong><span className="node-indicator" style={{background:selectedNode?.color || '#777777'}} />{selectedNode?.name || 'No nodes enrolled'}</strong><small>{selectedNode?.id || '—'} · {selectedNode?.role || 'Awaiting registry data'}</small></div><div className="node-picker" aria-label="Select mesh node">{meshNodes.map((node,i)=><button key={node.id} type="button" aria-label={node.name} aria-pressed={selected === i} onClick={()=>onSelect(node.id)} style={{'--node-color':node.color} as React.CSSProperties}/>)}</div></div>
  </div>;
}
