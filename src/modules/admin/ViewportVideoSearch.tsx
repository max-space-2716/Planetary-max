import React, { useEffect, useRef, useState } from 'react';
import LineageReceipt from './LineageReceipt';
import type { LineageRun } from './lineage';
import { searchAndLoadViewportVideo, type VideoSearchOutcome } from './video-search';
import type { WorkspaceSnapshot } from './workspace-state';

export default function ViewportVideoSearch({ snapshot, nodeId, endpoint, select }: {
  snapshot: WorkspaceSnapshot;
  nodeId: string;
  endpoint?: string;
  select: (url: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<VideoSearchOutcome>();
  const [run, setRun] = useState<LineageRun>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); }, []);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    const input = query.trim();
    if (!input || busy) return;
    const controller = new AbortController();
    request.current = controller;
    const timestamp = new Date().toISOString();
    const view = snapshot.viewport?.mode === 'MAX Renderings' ? 'MAX-SPORTS' : 'Live Video';
    setBusy(true); setError(''); setResult(undefined); setRun(undefined);
    try {
      const outcome = await searchAndLoadViewportVideo({ query: input, searchEndpointUrl: endpoint, signal: controller.signal });
      controller.signal.throwIfAborted();
      setResult(outcome);
      setRun({
        kind: 'video_search', nodeId, timestamp,
        intent: { action: 'video_search', query: input },
        ir: { action: 'video_search', query: input, route: outcome.mode, view,
          routing: { llm: snapshot.routing.max_llm, neural: snapshot.routing.neural, solver: snapshot.routing.solver },
          selectedNodeId: snapshot.registry.selectedNodeId },
        result: { ok: outcome.ok, mode: outcome.mode, query: outcome.query, statusNote: outcome.statusNote,
          items: outcome.items.map(item => ({ id: item.id, title: item.title, srcUrl: item.srcUrl,
            sourceLabel: item.sourceLabel ?? null, durationLabel: item.durationLabel ?? null })) },
      });
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Video search is unavailable.');
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return <section className="viewport-video-search" aria-label="Search videos">
    <form className="spatial-video-form" onSubmit={event => void search(event)}>
      <label>Search videos<input value={query} onChange={event => setQuery(event.target.value)} maxLength={500} required placeholder="Search for a video" disabled={busy}/></label>
      <button disabled={busy || !query.trim()}>{busy ? 'Searching…' : 'Search videos'}</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {result && <div aria-live="polite">
      <p>{result.statusNote}</p>
      {result.items.length > 0 && <>
        <ul>{result.items.map((item, index) => <li key={`${item.id}-${index}`}>
          <span><strong>{item.title}</strong>{item.sourceLabel && <> · {item.sourceLabel}</>}{item.durationLabel && <> · {item.durationLabel}</>}</span>
          <button type="button" onClick={() => select(item.srcUrl)}>Load video</button>
        </li>)}</ul>
        <p className="spatial-hint">The copied receipt includes result URLs. Playback begins when you press Play.</p>
      </>}
    </div>}
    <LineageReceipt run={run}/>
  </section>;
}
