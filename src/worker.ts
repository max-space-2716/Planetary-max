import { DurableObject } from 'cloudflare:workers';
import app, { AdminSessionDO, BEEMAXSecureNodeRegistryDO, NodeRegistryDO } from '../server/planetary-max';

import { feedSources, readConfiguredFeeds, type FeedBindings } from '../server/configured-feeds';

interface Env extends FeedBindings {
  ASSETS: Fetcher;
  DB: D1Database;
  KV_BINDING?: KVNamespace;
  TENANT_BEEMAX_DO: DurableObjectNamespace<TenantBeemaxDO>;
  BASE_CHAIN_ID?: string;
  BASE_USDC_ADDRESS?: string;
  OPERATOR_NAMESPACE?: string;
  RELEASE_ANCHOR_ID?: string;
}

const BASE_CHAIN_ID = 8453;
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const RELEASE_ID = '3c8ee1c4-79b8-4bfd-be18-430679f452f2';
const fallback = {
  sports: [
    { item_id: 'sp_01', title: 'MAX-SPORTS Telemetry Room #01', status: 'live_telemetry', summary: 'Edge match room tracking pace, momentum index, and non-custodial market state.', meta: 'Room: SP-01 | Reinvest Tag: MAX-SPORTS' },
    { item_id: 'sp_02', title: 'MAX-SPORTS Prediction Pool #02', status: 'open_observation', summary: 'Pre-settlement prediction market with ledger status tracked in D1/DO.', meta: 'Pool: SP-02 | Status: Untouched / Deferred Settlement' },
  ],
  chess: [
    { item_id: 'ch_01', title: 'MAX Chess 3D Arena — Distortion Lab', status: 'active_match', summary: 'Asymmetric opening evaluation and clock-pressure telemetry stream.', meta: 'Arena: MC-001 | Reinvest Tag: MAX-CHESS' },
    { item_id: 'ch_02', title: 'MAX Chess 3D Arena — Endgame Study', status: 'queued', summary: 'Position evaluation and structural asymmetry review room.', meta: 'Study: EG-04 | Wallet-Free Spectator & Analysis' },
  ],
  max_math: [{ item_id: 'mm_01', title: 'MAX MATH — Eigen-Perturbation & Projection', status: 'feed_ready', summary: 'Linear projection and subspace stability notes.', formula: 'f(x) = P x + ε Δx, ||P² − P|| = 0' }],
  max_physics: [{ item_id: 'mp_01', title: 'MAX PHYSICS — Wave Dispersion & Field Flux', status: 'feed_ready', summary: 'Dispersion relation and flux conservation notes.', formula: 'ω(k) = c√(k² + m²), ∇·J + ∂ρ/∂t = 0' }],
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
async function internetFeeds(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const scope = (url.searchParams.get('scope') || 'ALL').trim().slice(0, 80);
  const cacheKey = `internet_feeds:${scope.toLowerCase()}`;
  if (env.KV_BINDING) {
    try { const cached = await env.KV_BINDING.get(cacheKey, 'json'); if (cached) return json({ ok: true, cached: true, ...(cached as object) }); } catch { /* Cache is an optimization, not a dependency. */ }
  }
  const { items: remote } = await readConfiguredFeeds(feedSources(env));
  const items = remote.filter(item => scope === 'ALL' || (item.scope || '').toLowerCase() === scope.toLowerCase());
  const payload = { scope, count: items.length, items, wallet_required: false, updated_at: new Date().toISOString(), source: items.length ? 'configured_feeds' : 'local_seed_fallback', ...(!items.length ? fallback : {}) };
  if (env.KV_BINDING) { try { await env.KV_BINDING.put(cacheKey, JSON.stringify(payload), { expirationTtl: 180 }); } catch { /* Continue without cache. */ } }
  return json({ ok: true, cached: false, ...payload });
}

function forbiddenNamespace(raw: string, configured?: string): boolean {
  const value = raw.trim().toLowerCase();
  return !value || value === 'operator' || value === 'operator_namespace' || value.includes('operator_namespace') || Boolean(configured && value === configured.trim().toLowerCase());
}
function tenantId(input: string): string | null {
  const value = input.trim();
  return /^[a-zA-Z0-9_-]{2,64}$/.test(value) && !forbiddenNamespace(value) ? value : null;
}

export class TenantBeemaxDO extends DurableObject<Env> {
  private ensureSchema() {
    this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS tenant_ledger (
      entry_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      bucket TEXT NOT NULL CHECK (bucket IN ('credit','escrow','treasury','reinvest')),
      amount_usdc TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending','locked','settled','untouched')),
      reinvest_target TEXT NOT NULL DEFAULT 'MAX-ECOSYSTEM', ref_id TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    ); CREATE INDEX IF NOT EXISTS idx_tenant_ledger_bucket ON tenant_ledger (tenant_id,bucket,status);`);
  }
  async fetch(request: Request): Promise<Response> {
    this.ensureSchema();
    const url = new URL(request.url);
    const id = request.headers.get('x-tenant-id') || '';
    if (!tenantId(id)) return json({ ok: false, error: 'Invalid tenant.' }, 403);
    if (url.pathname === '/state' && request.method === 'GET') {
      const rows = this.ctx.storage.sql.exec('SELECT entry_id,bucket,amount_usdc,status,reinvest_target,ref_id,updated_at FROM tenant_ledger WHERE tenant_id=? ORDER BY updated_at DESC LIMIT 100', id).toArray();
      return json({ ok: true, tenant_id: id, chain_id: BASE_CHAIN_ID, usdc_address: BASE_USDC, entries: rows, financial_note: 'Ledger entries are bookkeeping records, not verified transfers or balances.' });
    }
    if (url.pathname !== '/ledger' || request.method !== 'POST') return json({ ok: false, error: 'Not found' }, 404);
    let body: Record<string, unknown>;
    try { body = await request.json() as Record<string, unknown>; } catch { return json({ ok: false, error: 'Send a JSON ledger entry.' }, 400); }
    const buckets = ['credit', 'escrow', 'treasury', 'reinvest'];
    const statuses = ['pending', 'locked', 'settled', 'untouched'];
    const amount = typeof body.amount_usdc === 'string' ? body.amount_usdc : '';
    const bucket = typeof body.bucket === 'string' ? body.bucket : '';
    const status = typeof body.status === 'string' ? body.status : 'untouched';
    const target = typeof body.reinvest_target === 'string' ? body.reinvest_target.slice(0, 80) : 'MAX-ECOSYSTEM';
    if (!buckets.includes(bucket) || !statuses.includes(status) || !/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/.test(amount)) return json({ ok: false, error: 'Invalid bucket, status, or USDC amount.' }, 400);
    const entryId = typeof body.entry_id === 'string' && /^[a-zA-Z0-9_-]{2,80}$/.test(body.entry_id) ? body.entry_id : `led_${crypto.randomUUID()}`;
    const refId = typeof body.ref_id === 'string' ? body.ref_id.slice(0, 120) : null;
    try {
      this.ctx.storage.sql.exec(`INSERT INTO tenant_ledger (entry_id,tenant_id,bucket,amount_usdc,status,reinvest_target,ref_id) VALUES (?,?,?,?,?,?,?) ON CONFLICT(entry_id) DO UPDATE SET bucket=excluded.bucket,amount_usdc=excluded.amount_usdc,status=excluded.status,reinvest_target=excluded.reinvest_target,ref_id=excluded.ref_id,updated_at=datetime('now')`, entryId, id, bucket, amount, status, target, refId);
      return json({ ok: true, tenant_id: id, entry_id: entryId, bucket, amount_usdc: amount, status, reinvest_target: target, financial_note: 'Bookkeeping only; no payment was verified or moved.' });
    } catch { return json({ ok: false, error: 'Ledger entry could not be saved.' }, 400); }
  }
}

export { AdminSessionDO, BEEMAXSecureNodeRegistryDO, NodeRegistryDO };
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const chainId = Number(env.BASE_CHAIN_ID || BASE_CHAIN_ID);
    const usdc = env.BASE_USDC_ADDRESS || BASE_USDC;
    if (url.pathname === '/' && request.method === 'GET') return json({ service: 'MAX-INTERNET Gateway', portal: 'BEEMAX-PORTAL-OS1', public_access: 'free', wallet_mode: 'opt-in', chain_id: chainId, usdc_address: usdc, release_anchor: { release_id: env.RELEASE_ANCHOR_ID || RELEASE_ID, title: 'The Crown of Return', price_usdc: '30.00', editions: 500, cover_asset: '/assets/crown-cover.png' }, storage_stack: ['Cloudflare Workers', 'D1', 'KV', 'Durable Objects (SQLite)'], excluded_rails: ['R2', 'Stripe', 'Bitcoin'], write_performed: false });
    if (url.pathname === '/assets/crown-cover.png') {
      const response = await env.ASSETS.fetch(request);
      if (!response.ok) return new Response('Cover PNG not found', { status: 404 });
      const headers = new Headers(response.headers); headers.set('Content-Type', 'image/png'); headers.set('X-Content-Type-Options', 'nosniff');
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }
    if (url.pathname === '/api/gateway/health' && request.method === 'GET') return json({ ok: true, gateway: 'MAX-INTERNET', chain_id: chainId, usdc_address: usdc, wallet_mode: 'opt-in', isolation_enforced: true });
    if (url.pathname === '/api/portal/feeds' && request.method === 'GET') return json({ ok: true, ...fallback, source: 'local_seed_fallback' });
    if (url.pathname === '/api/internet-feeds' && request.method === 'GET') return internetFeeds(request, env);

    const namespace = url.searchParams.get('namespace') || request.headers.get('x-target-namespace') || '';
    if (namespace && forbiddenNamespace(namespace, env.OPERATOR_NAMESPACE)) return json({ ok: false, error: 'Forbidden: OPERATOR_NAMESPACE cannot be accessed through tenant router.' }, 403);
    const match = url.pathname.match(/^\/api\/tenant\/([^/]+)\/(state|ledger)$/);
    if (match) {
      let decoded = '';
      try { decoded = decodeURIComponent(match[1]); } catch { return json({ ok: false, error: 'Invalid tenant ID.' }, 403); }
      const id = tenantId(decoded);
      if (!id) return json({ ok: false, error: 'Invalid tenant ID.' }, 403);
      if (request.method === 'POST' && request.headers.get('origin') && request.headers.get('origin') !== url.origin) return json({ ok: false, error: 'Cross-origin writes are not allowed.' }, 403);
      const stub = env.TENANT_BEEMAX_DO.get(env.TENANT_BEEMAX_DO.idFromName(`tenant:${id}`));
      const headers = new Headers(request.headers); headers.set('x-tenant-id', id); headers.delete('x-target-namespace');
      const path = match[2] === 'state' ? '/state' : '/ledger';
      return stub.fetch(new Request(`https://tenant-beemax.internal${path}`, { method: request.method, headers, body: request.method === 'POST' ? await request.text() : undefined }));
    }
    return app.fetch(request, env, ctx);
  },
};
