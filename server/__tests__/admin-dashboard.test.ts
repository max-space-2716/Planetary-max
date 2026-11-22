import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { sign } from 'hono/jwt';
import app from '../planetary-max';
import { AdminSessionDO, ADMIN_SESSION_TTL_MS } from '../admin-session';

const password = 'synthetic dashboard password';
const jwtSecret = 'synthetic-independent-signing-key-32-bytes';
function dashboardEnv() {
  const env: any = { ADMIN_PASSWORD: password, ADMIN_LOGIN_LIMITER: { limit: async () => ({ success: true }) } };
  const objects = new Map<string, AdminSessionDO>();
  const records = new Map<string, Map<string, unknown>>();
  env.ADMIN_SESSIONS = {
    idFromName: (name: string) => name,
    get: (id: string) => {
      if (!objects.has(id)) {
        const data = new Map<string, unknown>(); records.set(id, data);
        const storage = {
          get: async (key: string) => data.get(key),
          put: async (key: string, value: unknown) => { data.set(key, value); },
          delete: async (key: string) => data.delete(key),
          setAlarm: async (_time: number) => {}, deleteAlarm: async () => {},
        };
        objects.set(id, new AdminSessionDO({ storage }, env));
      }
      return { fetch: (url: string, init: RequestInit) => objects.get(id)!.fetch(new Request(url, init)) };
    },
  };
  return { env, records, objects };
}
function login(env: any, input: string) {
  return app.request('https://max.test/api/admin/login', { method: 'POST', headers: { Origin: 'https://max.test', 'Content-Type': 'application/json' }, body: JSON.stringify({ password: input }) }, env);
}
function session(env: any, cookie: string) {
  return app.request('https://max.test/api/admin/session', { headers: { Cookie: cookie } }, env);
}
async function loggedInCookie(env: any) {
  const response = await login(env, password);
  expect(response.status).toBe(200);
  const cookie = response.headers.get('set-cookie')!;
  expect(cookie).toMatch(/HttpOnly/i); expect(cookie).toMatch(/Secure/i); expect(cookie).toMatch(/SameSite=Strict/i);
  expect(await response.json()).toEqual({ success: true });
  return cookie.split(';')[0];
}
afterEach(() => { vi.useRealTimers(); });

describe('Dashboard administrator password', () => {
  it('reports the active credential mode without disclosing values and identifies invalid hash setup', async () => {
    const { env } = dashboardEnv();
    env.ADMIN_PASSWORD_HASH = createHash('sha256').update('legacy private password').digest('hex'); env.JWT_SECRET = jwtSecret;
    const config = async () => (await app.request('https://max.test/api/admin/login/config', {}, env)).json() as Promise<any>;
    const dashboard = await config(); expect(dashboard).toMatchObject({configured:true,mode:'dashboard_password'}); expect(dashboard.guidance).toContain('takes precedence');
    expect(JSON.stringify(dashboard)).not.toContain(password); expect(JSON.stringify(dashboard)).not.toContain(env.ADMIN_PASSWORD_HASH);
    delete env.ADMIN_PASSWORD; expect(await config()).toMatchObject({configured:true,mode:'legacy_hash'});
    env.ADMIN_PASSWORD_HASH = 'a plaintext password entered into the wrong setting';
    expect(await config()).toMatchObject({configured:false,mode:'legacy_hash'}); expect((await login(env, 'irrelevant')).status).toBe(503);
  });
  it('accepts ADMIN_PASSWORD alone, checks the exact password and revokes on logout', async () => {
    const { env, records } = dashboardEnv();
    expect((await login(env, 'wrong')).status).toBe(401);
    const cookie = await loggedInCookie(env);
    expect((await session(env, cookie)).status).toBe(200);
    expect(JSON.stringify([...records.values()].map(value => [...value]))).not.toContain(password);
    expect((await app.request('https://max.test/api/admin/logout', { method: 'POST', headers: { Cookie: cookie, Origin: 'https://other.test' } }, env)).status).toBe(403);
    const logout = await app.request('https://max.test/api/admin/logout', { method: 'POST', headers: { Cookie: cookie, Origin: 'https://max.test' } }, env);
    expect(logout.status).toBe(200); expect(logout.headers.get('set-cookie')).toMatch(/Max-Age=0/i);
    expect((await session(env, cookie)).status).toBe(401);
  });
  it('requires a verified Durable Object session for private HUD access', async () => {
    const { env } = dashboardEnv();
    const protectedCheck = (bindings: any, cookie = '') => app.request(
      'https://max.test/api/admin/session?mode=durable&portal_auth=1', { headers: { Cookie: cookie } }, bindings,
    );
    expect((await protectedCheck(env)).status).toBe(401);
    const cookie = await loggedInCookie(env);
    expect((await protectedCheck(env, cookie)).status).toBe(200);
    expect((await protectedCheck({ ...env, ADMIN_SESSIONS: undefined }, cookie)).status).toBe(503);
    const legacy = await sign({ role: 'admin', exp: Math.floor(Date.now() / 1000) + 3600 }, jwtSecret, 'HS256');
    expect((await protectedCheck({ JWT_SECRET: jwtSecret }, `max_admin=${legacy}`)).status).toBe(403);
  });
  it('expires sessions and invalidates them when the Dashboard password changes', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const { env } = dashboardEnv();
    const first = await loggedInCookie(env);
    env.ADMIN_PASSWORD = 'a different dashboard password';
    expect((await session(env, first)).status).toBe(401);
    env.ADMIN_PASSWORD = password;
    expect((await session(env, first)).status).toBe(401);
    const second = await loggedInCookie(env);
    vi.advanceTimersByTime(ADMIN_SESSION_TTL_MS);
    expect((await session(env, second)).status).toBe(401);
  });
  it('fails closed when the session binding fails and protects internal object routes', async () => {
    const { env } = dashboardEnv();
    delete env.ADMIN_SESSIONS;
    expect((await login(env, password)).status).toBe(503);
    expect((await app.request('https://max.test/api/admin-session/create', { method: 'POST' }, env)).status).toBe(404);
    env.ADMIN_SESSIONS = { idFromName: () => { throw new Error('unavailable'); } };
    expect((await login(env, password)).status).toBe(503);
  });
  it('fails closed if the password changes between verification and session creation', async () => {
    const { env } = dashboardEnv();
    const original = env.ADMIN_SESSIONS.get;
    env.ADMIN_SESSIONS.get = (id: string) => {
      const stub = original(id);
      return { fetch: (url: string, init: RequestInit) => { env.ADMIN_PASSWORD = 'rotated password'; return stub.fetch(url, init); } };
    };
    expect((await login(env, password)).status).toBe(503);
  });
  it('prefers the Dashboard password over older secrets and rejects legacy sessions in that mode', async () => {
    const { env } = dashboardEnv();
    env.ADMIN_PASSWORD_HASH = createHash('sha256').update('old password').digest('hex'); env.JWT_SECRET = jwtSecret;
    expect((await login(env, 'old password')).status).toBe(401);
    const legacy = await sign({ role: 'admin', exp: Math.floor(Date.now() / 1000) + 3600 }, jwtSecret, 'HS256');
    expect((await session(env, `max_admin=${legacy}`)).status).toBe(401);
    expect((await login(env, password)).status).toBe(200);
  });
  it('retains legacy hash and independent JWT authentication when ADMIN_PASSWORD is absent', async () => {
    const env: any = { ADMIN_PASSWORD_HASH: createHash('sha256').update(password).digest('hex'), JWT_SECRET: jwtSecret, ADMIN_LOGIN_LIMITER: { limit: async () => ({ success: true }) } };
    const response = await login(env, password); expect(response.status).toBe(200);
    expect((await session(env, response.headers.get('set-cookie')!.split(';')[0])).status).toBe(200);
    delete env.JWT_SECRET;
    expect((await login(env, password)).status).toBe(503);
  });
});
