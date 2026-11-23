import { registerMaxRouting } from './max-routing';
import { Hono } from 'hono';
import { verifyBaseTransfer } from './base-settlement';
import { registerPaymentReviews } from './payment-reviews';
import { registerDigitalCheckout } from './digital-checkout';
import { registerEcosystem, type EcosystemBindings } from './digital-catalog';
import { z } from 'zod';
import { sign, verify } from 'hono/jwt';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Context, Next } from 'hono';
import { verifyMessage } from 'viem';
import { bodyLimit } from 'hono/body-limit';
import { verifyNodeSignature } from './middleware';
import { checkoutMessage } from '../src/shared/checkoutMessage';
import { ADMIN_SESSION_TTL_MS, sha256Hex } from './admin-session';
import { handleSportsPresetsRequest } from './sports-presets';

import type { Bindings } from './types';

type AppBindings = Bindings & EcosystemBindings & {
  ADMIN_LOGIN_LIMITER: RateLimit;
  RPC_URL?: string;
  USDC_CONTRACT?: string;
  TREASURY_WALLET?: string;
  ADMIN_PASSWORD?: string;
  ADMIN_PASSWORD_HASH?: string;
  ADMIN_SESSIONS: DurableObjectNamespace;
  KV_BINDING?: KVNamespace;
  JWT_SECRET?: string;
  RESEND_API_KEY?: string;
  PUBLIC_APP_URL?: string;
};
type JwtVariables = { jwtPayload: { role?: string; exp?: number; iat?: number } };
const app = new Hono<{ Bindings: AppBindings; Variables: JwtVariables }>();
app.use('/api/*', bodyLimit({ maxSize: 60_000, onError: c => c.json({error:'Request body too large'},413) }));
app.use('/v1/*', bodyLimit({ maxSize: 60_000, onError: c => c.json({error:'Request body too large'},413) }));
const leagues = ['NFL', 'NBA', 'MLB', 'SOCCER', 'MMA'] as const;

const ArtworkSchema = z.object({
  creator: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  medium: z.string().trim().min(1).max(100),
  dimensions: z.string().trim().max(100).default(''),
  price_cents: z.number().int().min(1).max(100_000_000),
  image_url: z.string().url().max(2048),
  fulfillment_uri: z.string().max(2048).refine(v => !v || /^(https:\/\/|ipfs:\/\/)/.test(v), 'Use an HTTPS or IPFS collector URL').default(''),
  provenance_hash: z.string().trim().regex(/^(?:0x)?[\da-fA-F]{64}$/, 'Expected a SHA-256 hex digest'),
});
const ChessSchema = z.object({
  gameId: z.string().trim().min(3).max(64),
  whitePlayer: z.string().trim().min(1).max(100),
  blackPlayer: z.string().trim().min(1).max(100),
  openingTag: z.string().trim().max(100).default(''),
  pgnData: z.string().trim().min(3).max(50_000),
});
const SportsSchema = z.object({
  eventId: z.string().trim().min(3).max(64),
  league: z.enum(leagues),
  matchup: z.string().trim().min(1).max(200),
  oracleConsensus: z.object({
    predictedWinner: z.string().trim().min(1).max(100),
    confidenceScore: z.number().finite().min(0).max(100),
    dataSourcesCount: z.number().int().min(1).max(1000),
  }).strict(),
});

function sameOriginWrite(c: { req: { header(name: string): string | undefined; url: string } }) {
  const origin = c.req.header('Origin');
  return Boolean(origin && origin === new URL(c.req.url).origin);
}
async function readJson(c: { req: { header(name: string): string | undefined; json(): Promise<unknown> } }) {
  const contentLength = Number(c.req.header('Content-Length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > 60_000) throw new Error('Request body too large');
  const body = await c.req.json();
  if (new TextEncoder().encode(JSON.stringify(body)).byteLength > 60_000) throw new Error('Request body too large');
  return body;
}
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}
function getJwtSecret(env: AppBindings) { return env.JWT_SECRET && new TextEncoder().encode(env.JWT_SECRET).length >= 32 ? env.JWT_SECRET : ''; }
async function verifyPassword(input: string, expected: string): Promise<boolean> {
  if (!/^[\da-f]{64}$/i.test(expected)) return false;
  const actual = await sha256Hex(input);
  let mismatch = 0;
  for (let i = 0; i < actual.length; i++) mismatch |= actual.charCodeAt(i) ^ expected.toLowerCase().charCodeAt(i);
  return mismatch === 0;
}
function dashboardPassword(env: AppBindings): string | undefined {
  return typeof env.ADMIN_PASSWORD === 'string' && env.ADMIN_PASSWORD.length > 0 ? env.ADMIN_PASSWORD : undefined;
}
async function sessionRequest(env: AppBindings, token: string, action: 'create' | 'verify' | 'revoke', fingerprint?: string): Promise<Response> {
  if (!env.ADMIN_SESSIONS || !/^as1_[0-9a-f]{64}$/.test(token)) return new Response(null, { status: 503 });
  const id = env.ADMIN_SESSIONS.idFromName(await sha256Hex(token));
  return env.ADMIN_SESSIONS.get(id).fetch(`https://admin-session.internal/${action}`, { method: 'POST', body: action === 'create' ? JSON.stringify({ fingerprint }) : undefined });
}

// Administrative writes require an authenticated operator, even on the same origin.
async function requireAdmin(c: Context<{ Bindings: AppBindings; Variables: JwtVariables }>, next: Next) {
  const token = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '') || getCookie(c, 'max_admin');
  if (!token) return c.json({ error: 'Administrator sign-in required' }, 401);
  if (dashboardPassword(c.env)) {
    if (!/^as1_[0-9a-f]{64}$/.test(token)) return c.json({ error: 'Administrator session expired' }, 401);
    try {
      const result = await sessionRequest(c.env, token, 'verify');
      if (result.status === 401) return c.json({ error: 'Administrator session expired' }, 401);
      if (!result.ok) return c.json({ error: 'Administrator sessions are unavailable' }, 503);
      c.set('jwtPayload', { role: 'admin' });
    } catch { return c.json({ error: 'Administrator sessions are unavailable' }, 503); }
  } else {
    const secret = getJwtSecret(c.env);
    if (!secret) return c.json({ error: 'Admin authentication is not configured' }, 503);
    try {
      const payload = await verify(token, secret, 'HS256');
      if (payload.role !== 'admin' || typeof payload.exp !== 'number' || payload.exp <= Date.now() / 1000) return c.json({ error: 'Forbidden' }, 403);
      c.set('jwtPayload', payload);
    } catch { return c.json({ error: 'Administrator session expired' }, 401); }
  }
  if (!['GET', 'HEAD'].includes(c.req.method) && !sameOriginWrite(c)) return c.json({ error: 'A same-origin request is required.' }, 403);
  return next();
}
app.use('/api/*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  return next();
});
app.use('/api/artworks', (c, next) => c.req.method === 'POST' ? requireAdmin(c, next) : next());
app.use('/v1/dat/chess', (c, next) => c.req.method === 'POST' ? requireAdmin(c, next) : next());
app.use('/v1/dat/sports', (c, next) => c.req.method === 'POST' ? requireAdmin(c, next) : next());
app.use('/api/sports/presets', (c, next) => c.req.method === 'POST' ? requireAdmin(c, next) : next());
app.all('/api/sports/presets', c => handleSportsPresetsRequest(c.req.raw, c.env, async () => true));
app.post('/api/beemax/heartbeat', verifyNodeSignature, async (c) => {
  let input;
  try { input = z.object({ mesh_region: z.string().trim().min(1).max(100) }).strict().parse(await readJson(c)); }
  catch { return c.json({ error: 'A mesh_region of up to 100 characters is required.' }, 400); }
  try {
    const now = Date.now();
    await c.env.DB.prepare(`INSERT INTO node_telemetry (node_id, status, mesh_region, last_heartbeat)
      VALUES (?, 'ACTIVE', ?, ?) ON CONFLICT(node_id) DO UPDATE SET status = 'ACTIVE', mesh_region = excluded.mesh_region, last_heartbeat = excluded.last_heartbeat`).bind(c.req.header('X-Max-Node-Id'), input.mesh_region, now).run();
    return c.json({ success: true, last_heartbeat: now });
  } catch { return c.json({ error: 'Heartbeat could not be stored.' }, 503); }
});
app.get('/api/status', async (c) => {
  try {
    const counts = await c.env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM artworks WHERE is_demo = 0) AS artworks,
      (SELECT COUNT(*) FROM chess_games) AS games,
      (SELECT COUNT(*) FROM sports_telemetry) AS sports`).first();
    return c.json({ ready: true, database: 'connected', counts, checkout: Boolean(c.env.RPC_URL && c.env.USDC_CONTRACT && c.env.TREASURY_WALLET), timestamp: new Date().toISOString() });
  } catch { return c.json({ ready: false, database: 'unavailable', error: 'Database requires configuration or migrations.' }, 503); }
});

// Public gallery catalog. Never expose fulfillment locations, purchase tokens, or collector information.
app.get('/api/artworks', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT a.id, a.artist_id, a.title, u.username AS artist_name,
              ap.bio, ap.portfolio_url, a.medium, a.dimensions, a.price_cents,
              a.image_url, a.status, a.metadata_hash AS provenance_hash
       FROM artworks a JOIN users u ON u.id = a.artist_id
       LEFT JOIN artist_profiles ap ON ap.user_id = a.artist_id
       WHERE a.is_demo = 0 ORDER BY a.created_at DESC LIMIT 100`
    ).all();
    return c.json({ artworks: results ?? [] });
  } catch (error) {
    console.error('Unable to read artwork catalog:', error);
    return c.json({ error: 'Artwork catalog is unavailable. Apply the D1 migrations.' }, 503);
  }
});

// Create a listing (same-origin only; creator must already exist).
app.post('/api/artworks', async (c) => {
  if (!sameOriginWrite(c)) return c.json({ success: false, error: 'A same-origin request is required.' }, 403);
  let parsed;
  try { parsed = ArtworkSchema.safeParse(await readJson(c)); } catch (error) {
    return c.json({ success: false, error: error instanceof Error ? error.message : 'Invalid JSON body.' }, 400);
  }
  if (!parsed.success) return c.json({ success: false, error: 'Invalid artwork data.', details: parsed.error.flatten() }, 400);
  const input = parsed.data;
  try {
    const creator = await c.env.DB.prepare('SELECT id FROM users WHERE id = ? OR username = ? LIMIT 1').bind(input.creator, input.creator).first<{ id: string }>();
    if (!creator) return c.json({ success: false, error: 'Creator account was not found. Use an existing artist account username or ID.' }, 400);
    const id = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO artworks (id, artist_id, title, medium, dimensions, price_cents, currency, image_url, status, metadata_hash, fulfillment_uri)
       VALUES (?, ?, ?, ?, ?, ?, 'USD', ?, 'available', ?, ?)`
    ).bind(id, creator.id, input.title, input.medium, input.dimensions, input.price_cents, input.image_url, input.provenance_hash.replace(/^0x/i, '').toLowerCase(), input.fulfillment_uri || null).run();
    return c.json({ success: true, message: 'Artwork listed.', artwork: { id, artist_id: creator.id, title: input.title } }, 201);
  } catch (error) {
    console.error('Unable to save artwork:', error);
    return c.json({ success: false, error: 'Artwork could not be saved to D1.' }, 503);
  }
});

// Token-protected collector asset delivery.
app.get('/api/artworks/:id/unlock', async (c) => {
  const token = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '') || c.req.query('token');
  if (!token || token.length > 200) return c.json({ error: 'Missing fulfillment access token' }, 401);
  try {
    const item = await c.env.DB.prepare(
      `SELECT id, title, fulfillment_uri, metadata_hash, buyer_email FROM artworks
       WHERE id = ? AND status = 'sold' AND access_token = ? LIMIT 1`
    ).bind(c.req.param('id'), token).first<{ id: string; title: string; fulfillment_uri: string | null; metadata_hash: string | null; buyer_email: string | null }>();
    if (!item) return c.json({ error: 'Invalid token or unauthorized asset access' }, 403);
    if (!item.fulfillment_uri) return c.json({ error: 'The collector asset is not configured.' }, 503);
    const gatewayUrl = item.fulfillment_uri.startsWith('ipfs://')
      ? `https://cloudflare-ipfs.com/ipfs/${item.fulfillment_uri.slice('ipfs://'.length)}`
      : item.fulfillment_uri;
    return c.json({ id: item.id, title: item.title, fulfillment_uri: item.fulfillment_uri, gateway_url: gatewayUrl, ipfs_sha256: item.metadata_hash, collector: item.buyer_email });
  } catch (error) {
    console.error('Unable to validate collector vault token:', error);
    return c.json({ error: 'Database error during vault validation' }, 500);
  }
});

// Verify USDC settlement against the configured Base RPC receipt. Never trust a client-supplied amount or sender.
app.get('/api/checkout/config', (c) => c.json({ enabled: Boolean(c.env.RPC_URL && c.env.USDC_CONTRACT && c.env.TREASURY_WALLET), chainId: 8453, treasury: c.env.TREASURY_WALLET || null, contract: c.env.USDC_CONTRACT || null }));
app.post('/api/checkout/verify-usdc', async (c) => {
  if (!sameOriginWrite(c)) return c.json({ error: 'A same-origin request is required.' }, 403);
  let body;
  try {
    body = z.object({ artworkId: z.string().min(1).max(100), txHash: z.string().regex(/^0x[\da-fA-F]{64}$/), buyerAddress: z.string().regex(/^0x[\da-fA-F]{40}$/), buyerEmail: z.string().trim().email().max(254).optional(), signature: z.string().regex(/^0x[\da-fA-F]{130}$/) }).parse(await readJson(c));
  } catch { return c.json({ error: 'A valid artwork, transaction hash, paying wallet and wallet signature are required.' }, 400); }
  const { artworkId, txHash, buyerAddress, buyerEmail: email, signature } = body;
  try {
    const valid = await verifyMessage({ address: buyerAddress as `0x${string}`, message: checkoutMessage(new URL(c.req.url).origin, artworkId, txHash, buyerAddress), signature: signature as `0x${string}` });
    if (!valid) return c.json({ error: 'The signature does not match the paying wallet.' }, 403);
  } catch { return c.json({ error: 'Wallet signature verification failed.' }, 403); }
  const { RPC_URL, USDC_CONTRACT, TREASURY_WALLET } = c.env;
  if (!RPC_URL || !USDC_CONTRACT || !TREASURY_WALLET || !/^0x[\da-fA-F]{40}$/.test(USDC_CONTRACT) || !/^0x[\da-fA-F]{40}$/.test(TREASURY_WALLET)) {
    console.error('USDC checkout is missing valid Base RPC/contract/treasury configuration');
    return c.json({ error: 'USDC checkout is not configured' }, 503);
  }

  try {
    const existing = await c.env.DB.prepare(`SELECT a.access_token FROM transactions t JOIN artworks a ON a.id = t.artwork_id
      WHERE t.artwork_id = ? AND t.tx_reference = ? AND t.buyer_wallet = ? AND a.status = 'sold' LIMIT 1`).bind(artworkId, txHash.toLowerCase(), buyerAddress.toLowerCase()).first<{access_token:string}>();
    if (existing?.access_token) return c.json({ status: 'confirmed', accessToken: existing.access_token, unlockUrl: `/vault/${encodeURIComponent(artworkId)}?token=${encodeURIComponent(existing.access_token)}` });
    const artwork = await c.env.DB.prepare(
      `SELECT id, title, price_cents FROM artworks WHERE id = ? AND status = 'available' AND is_demo = 0 AND fulfillment_uri IS NOT NULL LIMIT 1`
    ).bind(artworkId).first<{ id: string; title: string; price_cents: number }>();
    if (!artwork) return c.json({ error: 'Artwork not found or already sold' }, 404);

    const verification = await verifyBaseTransfer({ RPC_URL, USDC_CONTRACT, TREASURY_WALLET }, txHash, buyerAddress, artwork.price_cents);
    if ('status' in verification) return c.json(verification.body, verification.status);
    const verifiedSender = verification.sender;

    const txReference = txHash.toLowerCase();
    const accessToken = crypto.randomUUID();
    const resolvedEmail = email || verifiedSender.toLowerCase();
    // D1 batch runs atomically. The conditional INSERT only succeeds after this request wins the available->sold update.
    await c.env.DB.batch([
      c.env.DB.prepare(
        `UPDATE artworks SET status = 'sold', buyer_email = ?, access_token = ?
         WHERE id = ? AND status = 'available'`
      ).bind(resolvedEmail, accessToken, artworkId),
      c.env.DB.prepare(
        `INSERT INTO transactions (artwork_id, buyer_email, tx_reference, created_at, buyer_wallet)
         SELECT ?, ?, ?, ?, ? WHERE EXISTS (
           SELECT 1 FROM artworks WHERE id = ? AND status = 'sold' AND access_token = ?
         )`
      ).bind(artworkId, resolvedEmail, txReference, Date.now(), verifiedSender.toLowerCase(), artworkId, accessToken),
    ]);
    const recorded = await c.env.DB.prepare("SELECT t.id FROM transactions t JOIN artworks a ON a.id=t.artwork_id WHERE a.id=? AND a.access_token=? AND a.status='sold' AND t.tx_reference=? AND t.buyer_wallet=?").bind(artworkId, accessToken, txReference, verifiedSender.toLowerCase()).first();
    if (!recorded) {
      return c.json({ error: 'Artwork was acquired simultaneously or this transaction was already redeemed' }, 409);
    }

    if (c.env.RESEND_API_KEY && email) {
      const appUrl = (c.env.PUBLIC_APP_URL || new URL(c.req.url).origin).replace(/\/$/, '');
      const safeTitle = escapeHtml(artwork.title);
      try {
        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.env.RESEND_API_KEY}` },
          body: JSON.stringify({
            from: 'Storefront <curator@yourdomain.com>', to: [email], subject: `Access Granted: ${artwork.title}`,
            html: `<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:20px;color:#111"><h2>Acquisition Confirmed</h2><p>Your USDC transaction for <strong>${safeTitle}</strong> has been verified on Base.</p><p><a href="${appUrl}/vault/${encodeURIComponent(artworkId)}?token=${encodeURIComponent(accessToken)}">Open Collector Vault</a></p><p>Transaction Reference: ${txReference}</p></div>`,
          }),
        });
        if (!emailResponse.ok) console.error('Resend rejected checkout receipt:', emailResponse.status);
      } catch (error) { console.error('Failed to dispatch checkout receipt:', error); }
    }
    return c.json({ status: 'confirmed', accessToken, unlockUrl: `/vault/${encodeURIComponent(artworkId)}?token=${encodeURIComponent(accessToken)}` });
  } catch (error) {
    console.error('USDC verification failed:', error);
    return c.json({ error: 'USDC verification failed' }, 500);
  }
});

// MAX Chess and MAX Sports domain records.
app.get('/v1/dat/chess/list', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT game_id, white_player, black_player, opening_tag, pgn_data, status, updated_at FROM chess_games ORDER BY updated_at DESC LIMIT 50').all();
    return c.json({ success: true, games: results ?? [] });
  } catch (error) {
    console.error('Unable to read chess records:', error);
    return c.json({ success: false, error: 'Chess records are unavailable. Apply the D1 migrations.' }, 503);
  }
});
app.post('/v1/dat/chess', async (c) => {
  if (!sameOriginWrite(c)) return c.json({ success: false, error: 'A same-origin request is required.' }, 403);
  let parsed;
  try { parsed = ChessSchema.safeParse(await readJson(c)); } catch (error) {
    return c.json({ success: false, error: error instanceof Error ? error.message : 'Invalid JSON body.' }, 400);
  }
  if (!parsed.success) return c.json({ success: false, error: 'Invalid chess record.', details: parsed.error.flatten() }, 400);
  const game = parsed.data;
  try {
    await c.env.DB.prepare(`INSERT INTO chess_games (game_id, white_player, black_player, opening_tag, pgn_data, status) VALUES (?, ?, ?, ?, ?, 'active')`).bind(game.gameId, game.whitePlayer, game.blackPlayer, game.openingTag, game.pgnData).run();
    return c.json({ success: true, game_id: game.gameId }, 201);
  } catch (error) {
    console.error('Unable to save chess record:', error);
    return c.json({ success: false, error: 'Chess record could not be saved. The game ID may already exist.' }, 409);
  }
});
app.get('/v1/dat/sports/list', async (c) => {
  try {
    const { results } = await c.env.DB.prepare('SELECT event_id, league, matchup, oracle_consensus_json, updated_at FROM sports_telemetry ORDER BY updated_at DESC LIMIT 50').all<{ event_id: string; league: string; matchup: string; oracle_consensus_json: string; updated_at: string }>();
    const telemetry = (results ?? []).map((row) => {
      let oracle_consensus: unknown = {};
      try { oracle_consensus = JSON.parse(row.oracle_consensus_json); } catch { /* Ignore malformed legacy rows. */ }
      return { event_id: row.event_id, league: row.league, matchup: row.matchup, oracle_consensus, updated_at: row.updated_at };
    });
    return c.json({ success: true, telemetry });
  } catch (error) {
    console.error('Unable to read sports telemetry:', error);
    return c.json({ success: false, error: 'Sports telemetry is unavailable. Apply the D1 migrations.' }, 503);
  }
});
app.post('/v1/dat/sports', async (c) => {
  if (!sameOriginWrite(c)) return c.json({ success: false, error: 'A same-origin request is required.' }, 403);
  let parsed;
  try { parsed = SportsSchema.safeParse(await readJson(c)); } catch (error) {
    return c.json({ success: false, error: error instanceof Error ? error.message : 'Invalid JSON body.' }, 400);
  }
  if (!parsed.success) return c.json({ success: false, error: 'Invalid sports telemetry.', details: parsed.error.flatten() }, 400);
  const item = parsed.data;
  try {
    await c.env.DB.prepare('INSERT INTO sports_telemetry (event_id, league, matchup, oracle_consensus_json) VALUES (?, ?, ?, ?)').bind(item.eventId, item.league, item.matchup, JSON.stringify(item.oracleConsensus)).run();
    return c.json({ success: true, event_id: item.eventId }, 201);
  } catch (error) {
    console.error('Unable to save sports telemetry:', error);
    return c.json({ success: false, error: 'Sports telemetry could not be saved. The event ID may already exist.' }, 409);
  }
});

// Public configuration names help operators distinguish Dashboard passwords
// from legacy hashes without exposing secret values or password fingerprints.
app.get('/api/admin/login/config', c => {
  const password = dashboardPassword(c.env);
  const mode = password ? 'dashboard_password' : c.env.ADMIN_PASSWORD_HASH ? 'legacy_hash' : 'unconfigured';
  const configured = Boolean(c.env.ADMIN_LOGIN_LIMITER && (password ? password.length <= 1024 && c.env.ADMIN_SESSIONS : /^[\da-f]{64}$/i.test(c.env.ADMIN_PASSWORD_HASH || '') && getJwtSecret(c.env)));
  return c.json({ configured, mode, guidance: password ? 'Enter the password stored in ADMIN_PASSWORD on this Worker. It takes precedence over ADMIN_PASSWORD_HASH.' : 'Enter the original password, not its SHA-256 hash. Legacy mode requires ADMIN_PASSWORD_HASH and an independent JWT_SECRET. You can instead configure ADMIN_PASSWORD with ADMIN_SESSIONS.' });
});

// JWT-protected administrator access and sales ledger.
app.post('/api/admin/login', async (c) => {
  if (!sameOriginWrite(c)) return c.json({ error: 'A same-origin request is required.' }, 403);
  if (!c.env.ADMIN_LOGIN_LIMITER) return c.json({ error: 'Login protection is not configured' }, 503);
  try {
    const limit = await c.env.ADMIN_LOGIN_LIMITER.limit({ key: c.req.header('CF-Connecting-IP') || 'local' });
    if (!limit.success) { c.header('Retry-After', '60'); return c.json({ error: 'Too many sign-in attempts. Try again in a minute.' }, 429); }
  } catch { return c.json({ error: 'Login protection is unavailable' }, 503); }
  const configuredPassword = dashboardPassword(c.env);
  const signingSecret = getJwtSecret(c.env);
  if (configuredPassword ? configuredPassword.length > 1024 || !c.env.ADMIN_SESSIONS : !/^[\da-f]{64}$/i.test(c.env.ADMIN_PASSWORD_HASH || '') || !signingSecret) {
    return c.json({ error: 'Admin authentication is not configured' }, 503);
  }
  try {
    const body = z.object({ password: z.string().min(1).max(1024) }).parse(await readJson(c));
    const expected = configuredPassword ? await sha256Hex(configuredPassword) : c.env.ADMIN_PASSWORD_HASH!;
    if (!(await verifyPassword(body.password, expected))) return c.json({ error: 'Invalid admin credentials' }, 401);
    let token: string;
    if (configuredPassword) {
      token = `as1_${Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('')}`;
      try {
        const session = await sessionRequest(c.env, token, 'create', expected);
        if (!session.ok) return c.json({ error: 'Administrator sessions are unavailable' }, 503);
      } catch { return c.json({ error: 'Administrator sessions are unavailable' }, 503); }
    } else {
      const now = Math.floor(Date.now() / 1000);
      token = await sign({ role: 'admin', iat: now, exp: now + ADMIN_SESSION_TTL_MS / 1000 }, signingSecret, 'HS256');
    }
    setCookie(c, 'max_admin', token, { httpOnly: true, secure: new URL(c.req.url).protocol === 'https:', sameSite: 'Strict', path: '/', maxAge: ADMIN_SESSION_TTL_MS / 1000 });
    return c.json({ success: true });
  } catch { return c.json({ error: 'Login process failed' }, 400); }
});
app.use('/api/admin/*', requireAdmin);
app.get('/api/admin/session', (c) => {
  if (c.req.query('mode') === 'durable' && !dashboardPassword(c.env)) {
    return c.json({ error: 'This view requires a Durable Object operator session.' }, 403);
  }
  return c.json({ authenticated: true });
});
app.post('/api/admin/logout', async (c) => {
  if (dashboardPassword(c.env)) {
    const token = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '') || getCookie(c, 'max_admin');
    try {
      const result = await sessionRequest(c.env, token!, 'revoke');
      if (!result.ok) return c.json({ error: 'Administrator sessions are unavailable' }, 503);
    } catch { return c.json({ error: 'Administrator sessions are unavailable' }, 503); }
  }
  deleteCookie(c, 'max_admin', { path: '/' });
  return c.json({ success: true });
});
app.get('/api/admin/nodes', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`SELECT n.node_id, n.status, n.created_at, n.updated_at,
      t.mesh_region, t.last_heartbeat FROM trusted_nodes n LEFT JOIN node_telemetry t ON t.node_id = n.node_id
      ORDER BY n.created_at DESC LIMIT 200`).all();
    return c.json({ nodes: results ?? [] });
  } catch { return c.json({ error: 'Node registry is unavailable. Apply the database migrations.' }, 503); }
});
app.post('/api/admin/nodes', async (c) => {
  let input;
  try {
    input = z.object({ node_id: z.string().regex(/^[\w.:-]{1,100}$/), public_key_b64: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).parse(await readJson(c));
    const key = Uint8Array.from(atob(input.public_key_b64.replace(/-/g, '+').replace(/_/g, '/') + '='), char => char.charCodeAt(0));
    if (key.length !== 32) throw new Error();
    await crypto.subtle.importKey('raw', key, 'Ed25519', false, ['verify']);
  } catch { return c.json({ error: 'Enter a node ID and raw 32-byte Ed25519 public key in base64url format.' }, 400); }
  try {
    const now = Date.now();
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO trusted_nodes (node_id, public_key_b64, status, created_at, updated_at) VALUES (?, ?, 'ACTIVE', ?, ?)").bind(input.node_id, input.public_key_b64, now, now),
      c.env.DB.prepare("INSERT INTO beemax_ledger_events (id, entity_type, entity_id, action) VALUES (?, 'node', ?, 'ENROLLED')").bind(crypto.randomUUID(), input.node_id),
    ]);
    return c.json({ success: true }, 201);
  } catch { return c.json({ error: 'Node could not be enrolled. The ID may already exist.' }, 409); }
});
app.post('/api/admin/nodes/:id/revoke', async (c) => {
  try {
    const result = await c.env.DB.batch([
      c.env.DB.prepare("UPDATE trusted_nodes SET status = 'REVOKED', updated_at = ? WHERE node_id = ?").bind(Date.now(), c.req.param('id')),
      c.env.DB.prepare("INSERT INTO beemax_ledger_events (id, entity_type, entity_id, action) SELECT ?, 'node', node_id, 'REVOKED' FROM trusted_nodes WHERE node_id = ?").bind(crypto.randomUUID(), c.req.param('id')),
    ]);
    return result[0].meta.changes === 1 ? c.json({ success: true }) : c.json({ error: 'Node not found' }, 404);
  } catch { return c.json({ error: 'Revocation could not be saved.' }, 503); }
});
app.post('/api/admin/artists', async (c) => {
  let data;
  try { data = z.object({ username: z.string().trim().min(1).max(100), bio: z.string().trim().max(2000).default('') }).parse(await readJson(c)); }
  catch { return c.json({ error: 'Enter an artist name and biography of up to 2000 characters.' }, 400); }
  try {
    const id = crypto.randomUUID();
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO users (id, username, password_hash, role, status) VALUES (?, ?, '!catalog-profile-no-login!', 'user', 'active')").bind(id, data.username),
      c.env.DB.prepare('INSERT INTO artist_profiles (user_id, bio, verified_status) VALUES (?, ?, 0)').bind(id, data.bio),
    ]);
    return c.json({ success: true, id }, 201);
  } catch { return c.json({ error: 'Artist could not be created. The name may already exist.' }, 409); }
});
app.get('/api/admin/ledger', async (c) => {
  if (c.get('jwtPayload')?.role !== 'admin') return c.json({ error: 'Forbidden' }, 403);
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT t.id, t.artwork_id, a.title, a.price_cents, t.buyer_email, t.tx_reference, t.created_at
       FROM transactions t JOIN artworks a ON t.artwork_id = a.id ORDER BY t.created_at DESC LIMIT 50`
    ).all();
    return c.json({ transactions: results ?? [] });
  } catch (error) {
    console.error('Failed to retrieve checkout ledger:', error);
    return c.json({ error: 'Failed to retrieve ledger' }, 503);
  }
});

registerEcosystem(app, requireAdmin);
registerMaxRouting(app, requireAdmin);
registerDigitalCheckout(app);
registerPaymentReviews(app, requireAdmin);

app.notFound((c) => {
  if (c.req.path.startsWith('/api/') || c.req.path.startsWith('/v1/')) return c.json({ error: 'Not found' }, 404);
  return c.env.ASSETS.fetch(c.req.raw);
});
app.onError((error, c) => {
  console.error('Request failed:', error);
  return c.json({ error: 'Internal server error' }, 500);
});

export { AdminSessionDO } from './admin-session';
export { NodeRegistryDO } from '../workers/beemax-core/src/registryDo';
export { BEEMAXSecureNodeRegistryDO } from '../workers/beemax-core/src/secureRegistryDo';
export default app;
