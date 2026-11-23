import { describe, expect, it, vi } from 'vitest';
import app from '../planetary-max';
import { AdminSessionDO } from '../admin-session';

function setup() {
  const values = new Map<string, string>();
  const kv = {
    get: vi.fn(async (key: string) => values.has(key) ? JSON.parse(values.get(key)!) : null),
    put: vi.fn(async (key: string, value: string) => { values.set(key, value); }),
  };
  const env: any = { KV_BINDING: kv, ADMIN_PASSWORD: 'synthetic-password', ADMIN_LOGIN_LIMITER: { limit: async () => ({ success: true }) } };
  const sessions = new Map<string, AdminSessionDO>();
  env.ADMIN_SESSIONS = {
    idFromName: (name: string) => name,
    get: (id: string) => {
      if (!sessions.has(id)) {
        const data = new Map<string, unknown>();
        sessions.set(id, new AdminSessionDO({ storage: {
          get: async (key: string) => data.get(key), put: async (key: string, value: unknown) => { data.set(key, value); },
          delete: async (key: string) => data.delete(key), setAlarm: async () => {}, deleteAlarm: async () => {},
        } }, env));
      }
      return { fetch: (url: string, init: RequestInit) => sessions.get(id)!.fetch(new Request(url, init)) };
    },
  };
  const req = (method = 'GET', body?: string, cookie?: string, origin = 'https://max.test') => app.request('https://max.test/api/sports/presets', {
    method, headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body,
  }, env);
  return { env, kv, values, req };
}

describe('shared sports presets', () => {
  it('allows public reads and only authenticated same-origin writes', async () => {
    const { env, kv, req } = setup();
    const initial = await req();
    expect(initial.headers.get('cache-control')).toBe('no-store');
    expect(await initial.json()).toMatchObject({ status: 'unwired_honest', items: [] });
    const input = JSON.stringify({ items: [
      { id: '', label: ' Test ', url: ' https://example.test/embed ' },
      { id: 'bad', label: 'Unsafe', url: 'http://example.test/' },
      { id: 'bad2', label: 'Credentials', url: 'https://user:pass@example.test/' }, null,
    ] });
    expect((await req('POST', input)).status).toBe(401);
    expect(kv.put).not.toHaveBeenCalled();
    const login = await app.request('https://max.test/api/admin/login', { method: 'POST', headers: { Origin: 'https://max.test', 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'synthetic-password' }) }, env);
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    expect((await req('POST', input, cookie, 'https://other.test')).status).toBe(403);
    const saved = await req('POST', input, cookie);
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ count: 1, items: [{ id: 'feed-1', label: 'Test', url: 'https://example.test/embed' }] });
    expect(await (await req()).json()).toMatchObject({ status: 'wired', items: [{ label: 'Test' }] });
    expect((await req('POST', '{', cookie)).status).toBe(400);
    expect((await req('POST', '{}', cookie)).status).toBe(400);
    expect(kv.put).toHaveBeenCalledOnce();
    const logout = await app.request('https://max.test/api/admin/logout', { method: 'POST', headers: { Cookie: cookie, Origin: 'https://max.test' } }, env);
    expect(logout.status).toBe(200);
    expect((await req('POST', input, cookie)).status).toBe(401);
  });
  it('limits choices and reports storage failure instead of reporting an empty feed', async () => {
    const { env, kv, req } = setup();
    const login = await app.request('https://max.test/api/admin/login', { method: 'POST', headers: { Origin: 'https://max.test', 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'synthetic-password' }) }, env);
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const items = Array.from({ length: 14 }, (_, i) => ({ id: `id-${i}`, label: `Feed ${i}`, url: `https://example.test/${i}` }));
    expect(await (await req('POST', JSON.stringify({ items }), cookie)).json()).toMatchObject({ count: 12 });
    kv.get.mockRejectedValueOnce(new Error('down'));
    expect((await req()).status).toBe(503);
    kv.put.mockRejectedValueOnce(new Error('down'));
    expect((await req('POST', JSON.stringify({ items: [] }), cookie)).status).toBe(503);
    const unsupported = await req('DELETE');
    expect(unsupported.status).toBe(405);
    expect(unsupported.headers.get('allow')).toBe('GET, POST');
  });
});
