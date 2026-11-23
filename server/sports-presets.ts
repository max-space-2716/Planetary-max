export interface SportsFeedOption { id: string; label: string; url: string }
const KV_KEY = 'sports:presets:v1';
const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

function cleanItems(value: unknown): SportsFeedOption[] {
  if (!Array.isArray(value)) return [];
  const items: SportsFeedOption[] = [];
  const ids = new Set<string>();
  for (const entry of value.slice(0, 12)) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;
    if (typeof item.url !== 'string' || item.url.trim().length > 2048) continue;
    let parsed: URL;
    try { parsed = new URL(item.url.trim()); } catch { continue; }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.href.length > 2048) continue;
    let id = typeof item.id === 'string' ? item.id.trim().slice(0, 100) : '';
    if (!id || ids.has(id)) {
      let n = items.length + 1;
      while (ids.has(`feed-${n}`)) n++;
      id = `feed-${n}`;
    }
    ids.add(id);
    const label = typeof item.label === 'string' ? item.label.trim().slice(0, 200) || 'Sports Feed' : 'Sports Feed';
    items.push({ id, label, url: parsed.href });
  }
  return items;
}

export async function handleSportsPresetsRequest(
  request: Request,
  env: { KV_BINDING?: KVNamespace },
  isAdminAuthorized: (req: Request) => Promise<boolean>,
): Promise<Response> {
  const response = (body: unknown, status = 200, extra?: HeadersInit) => Response.json(body, { status, headers: { ...headers, ...extra } });
  if (request.method !== 'GET' && request.method !== 'POST') return response({ ok: false, error: 'Method not allowed' }, 405, { Allow: 'GET, POST' });
  if (request.method === 'POST' && !await isAdminAuthorized(request)) return response({ ok: false, error: 'Command operator session required.' }, 401);
  if (!env.KV_BINDING) return response({ ok: false, error: 'Sports feed storage is unavailable.' }, 503);
  if (request.method === 'GET') {
    try {
      const items = cleanItems(await env.KV_BINDING.get(KV_KEY, 'json'));
      return response({ ok: true, transport: 'Cloudflare HTTPS', plannedTransport: ['P-STEP/1.0', 'MAX-TELECOM'], status: items.length ? 'wired' : 'unwired_honest', items });
    } catch { return response({ ok: false, error: 'Sports feed storage is unavailable.' }, 503); }
  }
  let body: unknown;
  try { body = await request.json(); } catch { return response({ ok: false, error: 'Expected a JSON object with an items array.' }, 400); }
  if (!body || typeof body !== 'object' || !('items' in body) || !Array.isArray(body.items)) return response({ ok: false, error: 'Expected a JSON object with an items array.' }, 400);
  const items = cleanItems(body.items);
  try {
    await env.KV_BINDING.put(KV_KEY, JSON.stringify(items));
    return response({ ok: true, count: items.length, items });
  } catch { return response({ ok: false, error: 'Sports feed choices could not be saved.' }, 503); }
}
