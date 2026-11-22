import React, { useEffect, useRef, useState } from 'react';
import { routingTargets, type RoutingTarget, type TargetStatus } from '../../shared/max-routing';

type Result = { target?: RoutingTarget; status?: TargetStatus; message?: string; error?: string; provider?: string };
const labels: Record<TargetStatus, string> = {
  configured: 'Configured · awaiting a request',
  unconfigured: 'Not configured',
  unavailable: 'Unavailable',
  connected: 'Response received',
  rate_limited: 'Rate limited',
};

export default function MaxRoutingStudio() {
  const [targets, setTargets] = useState<Partial<Record<RoutingTarget, TargetStatus>>>({});
  const [statusError, setStatusError] = useState('');
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>();
  const [probe, setProbe] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch('/api/admin/max-routing/status', { signal: controller.signal });
        if (!response.ok) throw new Error();
        const data = await response.json() as { targets: Array<{ target: RoutingTarget; status: TargetStatus }> };
        setTargets(previous => ({ ...Object.fromEntries(data.targets.map(({ target, status }) => [target, status])), ...previous }));
      } catch {
        if (!controller.signal.aborted) setStatusError('Could not load target configuration.');
      }
    })();
    return () => { controller.abort(); request.current?.abort(); };
  }, []);

  async function run(verify: boolean) {
    if (busy || (!verify && !prompt.trim())) return;
    setBusy(true); setResult(undefined); setProbe(verify);
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await fetch(verify ? '/api/admin/beemax/chat' : '/api/admin/max-routing/run', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(verify
          ? { messages: [{ role: 'user', content: 'Reply with a short greeting to verify BEEMAX inference.' }] }
          : { prompt: prompt.trim() }),
      });
      const data = await response.json() as Result;
      if (data.target && data.status) {
        const { target, status } = data;
        setTargets(previous => ({ ...previous, [target]: status }));
      }
      setResult(response.ok ? data : { ...data, error: data.error || 'Request failed.' });
    } catch {
      if (!controller.signal.aborted) setResult({ error: 'Could not reach the Worker.' });
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel beemax-panel" id="routing-studio">
    <header className="panel-header"><div><h3>MAX Architecture · Routing studio</h3><p>Classify a prompt and send it to the selected service.</p></div></header>
    <div className="beemax-body">
      {statusError && <p role="alert">{statusError}</p>}
      <ul>{(Object.keys(routingTargets) as RoutingTarget[]).map(target =>
        <li key={target}><strong>{routingTargets[target]}:</strong> {targets[target] ? labels[targets[target]] : statusError ? 'Unknown' : 'Checking…'}</li>
      )}</ul>
      <form onSubmit={event => { event.preventDefault(); void run(false); }}>
        <label htmlFor="max-routing-prompt">Routing prompt</label>
        <textarea id="max-routing-prompt" value={prompt} onChange={event => setPrompt(event.target.value)} maxLength={6000} rows={3} required disabled={busy}/>
        <p>Try a writing request, an embedding request, or an equation. Use <code>llm:</code>, <code>neural:</code>, or <code>solver:</code> to select a target.</p>
        <button disabled={busy || !prompt.trim()}>Classify and run</button>
      </form>
      <button type="button" disabled={busy} onClick={() => void run(true)}>Verify BEEMAX inference</button>
      <div aria-live="polite">
        {busy && <p role="status">{probe ? 'Calling the BEEMAX assistant…' : 'Waiting for the selected service…'}</p>}
        {result?.target && <p>Selected target: <strong>{routingTargets[result.target]}</strong></p>}
        {result?.error && <p role="alert">{result.error}</p>}
        {!result?.error && result?.message && <>
          {probe && <p>BEEMAX inference responded via {result.provider}.</p>}
          <p style={{ whiteSpace: 'pre-wrap' }}>{result.message}</p>
        </>}
      </div>
    </div>
  </section>;
}
