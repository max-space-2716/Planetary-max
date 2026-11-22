import React, { useState } from 'react';
import LineageReceipt from './LineageReceipt';
import type { LineageRun } from './lineage';

export default function PublishingLineage({ nodeId }: { nodeId: string }) {
  const [run, setRun] = useState<LineageRun>();
  return <details>
    <summary>Record local publishing provenance</summary>
    <p>Use a title or reference and the existing SHA-256 digest of an asset. This creates a local receipt without publishing or verifying the asset.</p>
    <form onSubmit={event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const reference = String(data.get('reference')).trim();
      const assetDigest = String(data.get('digest')).toLowerCase();
      if (!reference || !/^[a-f0-9]{64}$/.test(assetDigest)) return;
      setRun({
        kind: 'publishing', nodeId, timestamp: new Date().toISOString(),
        intent: { action: 'record-local-provenance', reference },
        ir: { reference, submitted_asset_sha256: assetDigest },
        result: { recorded_locally: true, asset_verified: false, published: false },
      });
    }}>
      <label>Publishing reference<input name="reference" maxLength={200} required pattern=".*\S.*"/></label>
      <label>Existing asset SHA-256<input name="digest" required pattern="[a-fA-F0-9]{64}" maxLength={64}/></label>
      <button>Record provenance</button>
    </form>
    <LineageReceipt run={run}/>
  </details>;
}
