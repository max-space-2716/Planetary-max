import React, { useEffect, useRef, useState } from 'react';
import { researchCommand } from '../../shared/max-routing';
type Message = { role: 'user' | 'assistant'; content: string };
export default function BeeMaxAssistant() {
  const [messages, setMessages] = useState<Message[]>([]); const [draft, setDraft] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
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
    const pending: Message[] = [...messages, { role: 'user', content: draft.trim() }];
    // Keep complete turns so the server always receives a conversation ending in a user message.
    const history = pending.slice(-19); const text = draft; setDraft(''); setMessages(pending); setError(''); setBusy(true);
    const controller = new AbortController(); abort.current = controller;
    try { const r = await fetch('/api/admin/beemax/chat', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history }) }); const d = await r.json() as { message?: string; error?: string }; if (!r.ok || !d.message) throw new Error(d.error || 'No response received.'); setMessages([...pending, { role: 'assistant', content: d.message }]); }
    catch (e) { setMessages(messages); setDraft(text); setError(controller.signal.aborted ? 'Response stopped. Your message is ready to edit or send again.' : e instanceof Error ? e.message : 'BEEMAX is unavailable.'); }
    finally { setBusy(false); }
  }
  return <section className="panel beemax-panel" id="beemax"><header className="panel-header"><div className="panel-title"><span className="panel-icon gold-icon">✳</span><div><h3>BEEMAX</h3><p>Your AI companion · Cloudflare Workers AI</p></div></div><button disabled={busy || (!messages.length && !researchResult)} onClick={() => { setMessages([]); setError(''); setResearchResult(''); }}>New conversation</button></header><div className="beemax-body">{configured === false && <p role="status">BEEMAX needs Workers AI configured on the deployed Worker. Your conversation will be available when the service is connected.</p>}<div className="beemax-messages" role="log" aria-label="BEEMAX conversation" aria-live="polite">{!messages.length && <div className="beemax-welcome"><span>✳</span><h2>What shall we create?</h2><p>Develop a release, write an artist statement, plan a launch, or explore your MAX ecosystem.</p><div>{['Help me plan a MAX Media release.', 'Write a brief for an immersive art exhibition.', 'What can BEEMAX help me with?'].map(prompt => <button key={prompt} onClick={() => setDraft(prompt)}>{prompt}</button>)}</div></div>}{messages.map((m, i) => <article className={`beemax-message ${m.role}`} key={i}><strong>{m.role === 'user' ? 'You' : 'BEEMAX'}</strong><p>{m.content}</p></article>)}{busy && <p role="status">BEEMAX is thinking…</p>}<div ref={end}/></div>{researchResult && <div aria-live="polite"><strong>Configured research feeds</strong><p style={{ whiteSpace: 'pre-wrap' }}>{researchResult}</p></div>}{error && <p role="alert">{error}</p>}<form onSubmit={send}><label htmlFor="beemax-prompt">Message BEEMAX</label><textarea id="beemax-prompt" value={draft} onChange={e => setDraft(e.target.value)} maxLength={6000} rows={3} required placeholder="Ask, imagine, or plan…" disabled={busy}/><div><small>Use /research or /research followed by a phrase to browse configured feeds. AI responses can be mistaken.</small>{busy ? <button type="button" onClick={() => abort.current?.abort()}>Stop response</button> : <button disabled={!draft.trim() || (configured !== true && !researchCommand.test(draft.trim()))}>Send message ↗</button>}</div></form></div></section>;
}
