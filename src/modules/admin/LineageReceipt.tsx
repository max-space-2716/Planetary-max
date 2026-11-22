import React, { useEffect, useState } from 'react';
import { createLineageReceipt, type LineageRun } from './lineage';

type Receipt = Awaited<ReturnType<typeof createLineageReceipt>>;

export default function LineageReceipt({ run }: { run?: LineageRun }) {
  if (!run) return null;
  // A new run gets a fresh receipt and copy status even if the stages are identical.
  return <ReceiptView key={run.timestamp} run={run}/>;
}

function ReceiptView({ run }: { run: LineageRun }) {
  const [resolved, setResolved] = useState<{ run: LineageRun; receipt: Receipt | null }>();
  const [copy, setCopy] = useState('');
  useEffect(() => {
    let current = true;
    void createLineageReceipt(run).then(
      receipt => { if (current) setResolved({ run, receipt }); },
      () => { if (current) setResolved({ run, receipt: null }); },
    );
    return () => { current = false; };
  }, [run]);

  const receipt = resolved?.run === run ? resolved.receipt : undefined;
  if (receipt === undefined) return <p role="status">Computing lineage receipt…</p>;
  if (receipt === null) return <p role="status">SHA-256 receipt unavailable. This browser could not complete a Web Crypto digest.</p>;
  const json = JSON.stringify(receipt, null, 2);
  return <section className="lineage-receipt" aria-label="SHA-256 lineage receipt">
    <header><strong>SHA-256 lineage</strong><span className="panel-badge">Local Receipt</span></header>
    <p>{receipt.sovereign_mark} · {receipt.root} · {receipt.umbrella}<br/>
      {receipt.profile} · Node: {receipt.node_id} · <time dateTime={receipt.timestamp}>{receipt.timestamp}</time></p>
    <ol>{(['intent', 'ir', 'result'] as const).map(stage =>
      <li key={stage}><strong>{stage === 'ir' ? 'IR' : stage}</strong> <code>{receipt[`${stage}_hash_sha256`]}</code></li>)}</ol>
    <p className="quiet">External minting unverified. This local record does not sign, mint, or count as a verified D1 settlement or order in planetary-max-db.</p>
    <button type="button" onClick={async () => {
      try { await navigator.clipboard.writeText(json); setCopy('Receipt copied.'); }
      catch { setCopy('Clipboard unavailable. Select the receipt JSON below to copy it manually.'); }
    }}>Copy Receipt</button>
    <span role="status"> {copy}</span>
    <details><summary>Receipt JSON and hash inputs</summary>
      <p>Copying includes the text and data used to generate the hashes. Hash each preimage as UTF-8 compact JSON with object keys sorted by UTF-16 code unit, array order preserved, and text values normalized to NFC with LF line endings.</p>
      <textarea readOnly value={json} aria-label="Receipt JSON" rows={6} onFocus={event => event.target.select()}/>
    </details>
  </section>;
}
