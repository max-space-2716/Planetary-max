import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { canonicalJson, createLineageReceipt, sha256Hex, type LineageRun } from '../lineage';

const run: LineageRun = {
  kind: 'scenario', nodeId: 'unenrolled-local', timestamp: '2026-01-02T03:04:05.000Z',
  intent: { base: 2, height: 3 },
  ir: { model: 'exponential' },
  result: { value: 8 },
};
const independentDigest = (text: string) => createHash('sha256').update(text).digest('hex');

describe('local lineage receipts', () => {
  it('normalizes line endings and Unicode without depending on input key order', async () => {
    const expected = '{"a":"é\\nexample","z":[3,null]}';
    expect(canonicalJson({ z: [3, null], a: 'e\u0301\r\nexample' })).toBe(expected);
    expect(await sha256Hex({ a: 'é\nexample', z: [3, null] })).toBe(independentDigest(expected));
  });

  it('exports a reproducible chain and changing the intent changes all three digests', async () => {
    const receipt = await createLineageReceipt(run);
    const changed = await createLineageReceipt({ ...run, intent: { base: 3, height: 3 } });
    expect(receipt.preimages.ir.intent_hash_sha256).toBe(receipt.intent_hash_sha256);
    expect(receipt.preimages.result.ir_hash_sha256).toBe(receipt.ir_hash_sha256);
    for (const stage of ['intent', 'ir', 'result'] as const) {
      expect(receipt[`${stage}_hash_sha256`]).toBe(independentDigest(canonicalJson(receipt.preimages[stage])));
      expect(receipt[`${stage}_hash_sha256`]).not.toBe(changed[`${stage}_hash_sha256`]);
    }
  });

  it('does not fabricate a digest without Web Crypto', async () => {
    vi.stubGlobal('crypto', undefined);
    try { await expect(sha256Hex('example')).rejects.toThrow('Web Crypto unavailable'); }
    finally { vi.unstubAllGlobals(); }
  });
});
