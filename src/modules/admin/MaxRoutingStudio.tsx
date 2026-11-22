import React, { useEffect, useRef, useState } from 'react';
import { routingTargets, type RoutingTarget, type TargetStatus } from '../../shared/max-routing';

import LineageReceipt from './LineageReceipt';
import type { LineageRun } from './lineage';
import type { RoutingState } from './workspace-state';

type Result = { target?: RoutingTarget; status?: TargetStatus; message?: string; error?: string; provider?: string };
const labels: Record<TargetStatus, string> = {
  configured: 'Configured · awaiting a request',
  unconfigured: 'Not configured',
  unavailable: 'Unavailable',
  connected: 'Response received',
  rate_limited: 'Rate limited',
};

export default function MaxRoutingStudio({ targets, setTargets, statusError, nodeId, setActiveRoute }: {
  targets: RoutingState;
  setTargets: React.Dispatch<React.SetStateAction<RoutingState>>;
  statusError: string;
  nodeId: string;
  setActiveRoute: (target: RoutingTarget | null) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>();
  const [lineage, setLineage] = useState<LineageRun>();
  const [probe, setProbe] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function run(verify: boolean) {
    if (busy || (!verify && !prompt.trim())) return;
    const submitted = verify ? 'Reply with a short greeting to verify BEEMAX inference.' : prompt.trim();
    const prefix = submitted.match(/^(llm|neural|solver)\s*:/i)?.[1].toLowerCase();
    const requestedTarget = prefix === 'llm' ? 'max_llm' : prefix === 'neural' || prefix === 'solver' ? prefix : null;
    const endpoint = verify ? '/api/admin/beemax/chat' : '/api/admin/max-routing/run';
    const timestamp = new Date().toISOString();
    if (!verify) setActiveRoute(requestedTarget);
    setBusy(true); setResult(undefined); setLineage(undefined); setProbe(verify);
    const record = (data: Result, httpStatus: number | null) => setLineage({
      kind: 'routing', nodeId, timestamp,
      intent: { action: verify ? 'verify-beemax' : 'classify-and-run', prompt: submitted },
      ir: { kind: 'client routing envelope', endpoint, requested_target: requestedTarget, reported_target: data.target ?? null },
      result: { http_status: httpStatus, status: data.status ?? null, message: data.message ?? null, error: data.error ?? null, provider: data.provider ?? null },
    });
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(verify
          ? { messages: [{ role: 'user', content: submitted }] }
          : { prompt: submitted }),
      });
      const data = await response.json() as Result;
      if (controller.signal.aborted) return;
      if (!verify && data.target && Object.hasOwn(routingTargets, data.target)) setActiveRoute(data.target);
      if (data.target && data.status) {
        const { target, status } = data;
        setTargets(previous => ({ ...previous, [target]: status }));
      }
      const outcome = response.ok ? data : { ...data, error: data.error || 'Request failed.' };
      setResult(outcome);
      record(outcome, response.status);
    } catch {
      if (!controller.signal.aborted) {
        const outcome = { error: 'Could not read a response from the Worker.' };
        setResult(outcome);
        record(outcome, null);
      }
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
      <LineageReceipt run={lineage}/>
    </div>
  </section>;
}
