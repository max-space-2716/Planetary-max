import React, { useEffect, useRef, useState } from 'react';
import { researchCommand } from '../../shared/max-routing';
import LineageReceipt from './LineageReceipt';
import { lookupHudSnapshot, parseWebLookupIntent, runWebLookupFlow } from './web-lookup';
import type { LineageRun } from './lineage';
import { contextualConversation, routingPrefixes, workspacePanels, type ChatMessage, type WorkspaceSnapshot } from './workspace-state';

export default function BeeMaxAssistant({ snapshot, nodeId, searchEndpointUrl }: { snapshot: WorkspaceSnapshot; nodeId: string; searchEndpointUrl?: string | null }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]); const [draft, setDraft] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [lineage, setLineage] = useState<LineageRun>();
  const [researchResult, setResearchResult] = useState('');
  const [configured, setConfigured] = useState<boolean | null>(null); const abort = useRef<AbortController | null>(null); const end = useRef<HTMLDivElement>(null);
  useEffect(() => { const controller = new AbortController(); fetch('/api/admin/beemax/config', { signal: controller.signal }).then(async r => { if (!r.ok) throw new Error(); const d = await r.json() as { configured: boolean }; setConfigured(d.configured); }).catch(() => { if (!controller.signal.aborted) setConfigured(false); }); return () => { controller.abort(); abort.current?.abort(); }; }, []);
  useEffect(() => { if (messages.length) end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [messages, busy]);
  async function send(event: React.FormEvent) {
    event.preventDefault(); if (!draft.trim() || busy) return;
    if (researchCommand.test(draft.trim())) {
      setBusy(true); setError(''); setResearchResult('');
      const controller = new AbortController(); abort.current = controller;
      try {
        const response = await fetch('/api/admin/beemax/chat', {
          method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [{ role: 'user', content: draft.trim() }] }),
        });
        const data = await response.json() as { message?: string; error?: string };
        if (!response.ok || !data.message) throw new Error(data.error || 'Research feeds are unavailable.');
        setResearchResult(data.message); setDraft('');
      } catch (e) {
        setError(controller.signal.aborted ? 'Research stopped.' : e instanceof Error ? e.message : 'Research feeds are unavailable.');
      } finally { setBusy(false); }
      return;
    }
    const intent = draft.trim();
    const hudSnapshot = lookupHudSnapshot(snapshot);
    // The parser also supports direct queries for a search-specific caller. Command chat
    // invokes it only for explicit web requests, keeping ordinary prompts in BEEMAX.
    if (parseWebLookupIntent(intent, hudSnapshot, false)) {
      const pending: ChatMessage[] = [...messages, { role: 'user', content: intent }];
      const text = draft;
      setDraft(''); setError(''); setLineage(undefined); setMessages(pending); setBusy(true);
      const controller = new AbortController(); abort.current = controller;
      try {
        const lookup = await runWebLookupFlow({ prompt: intent, hudSnapshot, searchEndpointUrl, nodeTag: nodeId, signal: controller.signal });
        if (!lookup) throw new Error('Web lookup could not be prepared.');
        controller.signal.throwIfAborted();
        const answer = [lookup.summary, ...(lookup.sources.length ? ['Sources:', ...lookup.sources] : [])].join('\n');
        setMessages([...pending, { role: 'assistant', content: answer }]);
        setLineage({
          kind: 'web_lookup', nodeId: lookup.lineage.resultDigestInputs.nodeTag,
          timestamp: lookup.lineage.resultDigestInputs.utcTimestamp,
          intent: { prompt: lookup.lineage.intent },
          ir: { action: lookup.lineage.ir.action, rawPrompt: lookup.lineage.ir.rawPrompt, query: lookup.query,
            mode: lookup.mode, hudSnapshot: {
              activePage: hudSnapshot.activePage, activeView: hudSnapshot.activeView,
              nodeId: hudSnapshot.nodeId ?? null,
              routingStatus: { llm: hudSnapshot.routingStatus?.llm ?? null, neural: hudSnapshot.routingStatus?.neural ?? null, solver: hudSnapshot.routingStatus?.solver ?? null },
              transport: { active: hudSnapshot.transport.active, planned: hudSnapshot.transport.planned },
            } },
          result: { ok: lookup.ok, mode: lookup.mode, query: lookup.query, summary: lookup.summary, sources: lookup.sources },
        });
      } catch (e) {
        setMessages(messages); setDraft(text);
        setError(controller.signal.aborted ? 'Web lookup stopped. Your message is ready to edit or send again.' : e instanceof Error ? e.message : 'Web lookup is unavailable.');
      } finally { setBusy(false); }
      return;
    }
    const pending: ChatMessage[] = [...messages, { role: 'user', content: intent }];
    const history = contextualConversation(pending, snapshot);
    // Record only this turn's envelope; earlier private messages are not copied into its receipt.
    const currentEnvelope = history.slice(-1)[0]?.content === intent
      ? history.slice(-2).map(message => message.content)
      : history.slice(-1).map(message => message.content);
    const timestamp = new Date().toISOString();
    const text = draft;
    setDraft(''); setMessages(pending); setError(''); setBusy(true);
    const controller = new AbortController(); abort.current = controller;
    try {
      const response = await fetch('/api/admin/beemax/chat', {
        method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      });
      const data = await response.json() as { message?: string; error?: string };
      if (!response.ok || typeof data.message !== 'string' || !data.message) throw new Error(data.error || 'No response received.');
      controller.signal.throwIfAborted();
      setMessages([...pending, { role: 'assistant', content: data.message }]);
      setLineage({
        kind: 'chat', nodeId, timestamp,
        intent: { action: 'ask-beemax', prompt: intent },
        ir: { kind: 'Client orchestration envelope', current_turn: currentEnvelope },
        result: { reply: data.message },
      });
    } catch (e) {
      setMessages(messages); setDraft(text);
      setError(controller.signal.aborted ? 'Response stopped. Your message is ready to edit or send again.' : e instanceof Error ? e.message : 'BEEMAX is unavailable.');
    } finally { setBusy(false); }
  }
  return <section className="panel beemax-panel" id="beemax"><header className="panel-header"><div className="panel-title"><span className="panel-icon gold-icon">✳</span><div><h3>BEEMAX</h3><p>Your AI companion · Cloudflare Workers AI</p></div></div><button disabled={busy || (!messages.length && !researchResult)} onClick={() => { setMessages([]); setError(''); setResearchResult(''); setLineage(undefined); }}>New conversation</button></header><div className="beemax-body"><WorkspaceContext snapshot={snapshot} prepare={prompt => setDraft(prompt)} canPrepare={!busy && !draft.trim()}/>{configured === false && <p role="status">BEEMAX needs Workers AI configured on the deployed Worker. Your conversation will be available when the service is connected.</p>}<div className="beemax-messages" role="log" aria-label="BEEMAX conversation" aria-live="polite">{!messages.length && <div className="beemax-welcome"><span>✳</span><h2>What shall we create?</h2><p>Develop a release, write an artist statement, plan a launch, or explore your MAX ecosystem.</p><div>{['Help me plan a MAX Media release.', 'Write a brief for an immersive art exhibition.', 'What can BEEMAX help me with?'].map(prompt => <button key={prompt} onClick={() => setDraft(prompt)}>{prompt}</button>)}</div></div>}{messages.map((m, i) => <article className={`beemax-message ${m.role}`} key={i}><strong>{m.role === 'user' ? 'You' : 'BEEMAX'}</strong><p style={{ whiteSpace: 'pre-wrap' }}>{m.content}</p></article>)}{busy && <p role="status">BEEMAX is thinking…</p>}<div ref={end}/></div>{researchResult && <div aria-live="polite"><strong>Configured research feeds</strong><p style={{ whiteSpace: 'pre-wrap' }}>{researchResult}</p></div>}{error && <p role="alert">{error}</p>}<form onSubmit={send}><label htmlFor="beemax-prompt">Message BEEMAX</label><textarea id="beemax-prompt" value={draft} onChange={e => setDraft(e.target.value)} maxLength={6000} rows={3} required placeholder="Ask, imagine, or plan…" disabled={busy}/><div><small>Use “check the web” for a web lookup; use /research to browse configured feeds. AI responses can be mistaken.</small>{busy ? <button type="button" onClick={() => abort.current?.abort()}>Stop response</button> : <button disabled={!draft.trim() || (configured !== true && !researchCommand.test(draft.trim()) && !parseWebLookupIntent(draft.trim(), lookupHudSnapshot(snapshot), false))}>Send message ↗</button>}</div></form><LineageReceipt run={lineage}/></div></section>;
}

function WorkspaceContext({ snapshot, prepare, canPrepare }: {
  snapshot: WorkspaceSnapshot;
  prepare: (prompt: string) => void;
  canPrepare: boolean;
}) {
  const { panel, registry, routing, scenario } = snapshot;
  const module = workspacePanels[panel];
  return <section className="beemax-context" aria-label="HUD context">
    <div><strong>HUD context · {module.label}</strong>
      <button type="button" disabled={!canPrepare} onClick={() => {
        prepare(module.prompt);
        document.getElementById('beemax-prompt')?.focus();
      }}>Draft a question about {module.label}</button>
    </div>
    <p><strong>MAX-FORCE</strong> · next executable step &nbsp; <strong>MAX-REALITY</strong> · check what is wired</p>
    {snapshot.viewport && <p>Viewport: {snapshot.viewport.mode}{snapshot.viewport.rendering ? ` · ${snapshot.viewport.rendering}` : ''}</p>}
    <div className="beemax-context-status">
      {registry.enrolled === null
        ? <span>Registry {registry.status}</span>
        : <span>Registry / Mesh: {registry.enrolled} enrolled · {registry.activeTrust} active trust{registry.status === 'stale' ? ' · last loaded' : ''}</span>}
      {registry.selectedNodeId && <span>Selected node: {registry.selectedNodeId}</span>}
      {Object.entries(routingPrefixes).map(([target, prefix]) =>
        <span key={target}>{prefix} {routing[target as keyof typeof routing].replace('_', ' ')}</span>)}
    </div>
    {panel === 'substrate' && <p>Scenario: base {scenario.base}, height {scenario.height}. {snapshot.transport} {snapshot.ledger}</p>}
  </section>;
}
