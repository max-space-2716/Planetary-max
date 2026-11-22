export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type LineageRun = {
  kind: 'routing' | 'scenario' | 'publishing' | 'chat' | 'view' | 'web_lookup';
  nodeId: string;
  timestamp: string;
  intent: Json;
  ir: Json;
  result: Json;
};

const normalize = (text: string) => text.replace(/\r\n?/g, '\n').normalize('NFC');

// Sort object keys by code unit, preserve array order, normalize text values.
export function canonicalJson(value: Json): string {
  if (typeof value === 'string') return JSON.stringify(normalize(value));
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export async function sha256Hex(payload: Json) {
  if (!globalThis.crypto?.subtle) throw new Error('Web Crypto unavailable');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(payload)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function createLineageReceipt(run: LineageRun) {
  const metadata = {
    schema: 'portal-os1-local-lineage-v1', status: 'Local Receipt / Unverified External Minting',
    kind: run.kind, timestamp: run.timestamp, node_id: run.nodeId,
    sovereign_mark: 'MaxJ', root: 'Layer 13 (Origin Canon)', umbrella: 'OUR umbrella', profile: 'DAT-JURREAUISM-v1',
  };
  const intent = { stage: 'intent', metadata, payload: run.intent };
  const intent_hash_sha256 = await sha256Hex(intent);
  const ir = { stage: 'ir', intent_hash_sha256, payload: run.ir };
  const ir_hash_sha256 = await sha256Hex(ir);
  const result = { stage: 'result', ir_hash_sha256, payload: run.result };
  return {
    ...metadata, intent_hash_sha256, ir_hash_sha256, result_hash_sha256: await sha256Hex(result),
    preimages: { intent, ir, result },
  };
}
