import { afterEach, describe, expect, it, vi } from 'vitest';
import { SPORTS_FEED_OPTIONS_UPDATED, SPORTS_FEED_STORAGE_KEY } from '../sports-feed-options';
import { fetchGlobalSportsPresets, loadSharedSportsPresets, loadSharedSportsPresetsWithFallback, publishGlobalSportsPresetsFromCommand, saveSharedSportsPresets, SHARED_SPORTS_PRESETS_CACHE_KEY, SHARED_SPORTS_PRESETS_UPDATED } from '../sports-presets-api';

afterEach(() => vi.unstubAllGlobals());

function storage() {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { setItem: (key: string, value: string) => values.set(key, value), getItem: (key: string) => values.get(key) ?? null });
  return values;
}

describe('shared sports preset client', () => {
  it('reads and publishes choices while retaining separate browser-local choices', async () => {
    const values = storage();
    values.set(SPORTS_FEED_STORAGE_KEY, 'local choices');
    const item = { id: 'a', label: 'Fixture', url: 'https://example.test/feed' };
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ ok: true, items: [item] })));
    const dispatchEvent = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('window', { dispatchEvent });
    expect(await loadSharedSportsPresets()).toEqual([item]);
    expect(await saveSharedSportsPresets([item])).toEqual([item]);
    expect(fetchSpy.mock.calls[1][1]).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(values.get(SPORTS_FEED_STORAGE_KEY)).toBe('local choices');
    expect(JSON.parse(values.get(SHARED_SPORTS_PRESETS_CACHE_KEY)!)).toEqual([item]);
    expect(dispatchEvent.mock.calls[0][0]).toMatchObject({ type: SPORTS_FEED_OPTIONS_UPDATED, detail: [item], sharedSportsPresets: true });
    expect(dispatchEvent.mock.calls[1][0]).toMatchObject({ type: SHARED_SPORTS_PRESETS_UPDATED, detail: [item] });
  });

  it('falls back to a validated cache and replaces it when an empty list is fetched', async () => {
    const values = storage();
    const item = { id: 'a', label: 'Fixture', url: 'https://example.test/feed' };
    values.set(SHARED_SPORTS_PRESETS_CACHE_KEY, JSON.stringify([item, { url: 'http://bad.test/' }]));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, items: [] }))));
    expect(await loadSharedSportsPresetsWithFallback()).toEqual({ items: [item], source: 'cache' });
    expect(await fetchGlobalSportsPresets()).toEqual([item]);
    expect(await fetchGlobalSportsPresets()).toEqual([]);
    expect(values.get(SHARED_SPORTS_PRESETS_CACHE_KEY)).toBe('[]');
  });

  it('reports failed publishes without changing the cache or broadcasting', async () => {
    const values = storage();
    values.set(SHARED_SPORTS_PRESETS_CACHE_KEY, '[]');
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: 'denied' }), { status: 401 })).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(new Response('{}')));
    expect(await publishGlobalSportsPresetsFromCommand([])).toMatchObject({ ok: false, items: [], note: expect.stringContaining('401') });
    await expect(saveSharedSportsPresets([])).rejects.toThrow('Could not reach');
    await expect(loadSharedSportsPresets()).rejects.toThrow('unavailable');
    expect(values.get(SHARED_SPORTS_PRESETS_CACHE_KEY)).toBe('[]');
    expect(dispatchEvent).not.toHaveBeenCalled();
  });

  it('returns unavailable when storage cannot be read, and does not use cache after cancellation', async () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await loadSharedSportsPresetsWithFallback()).toEqual({ items: [], source: 'unavailable' });
    const controller = new AbortController(); controller.abort();
    await expect(loadSharedSportsPresetsWithFallback(controller.signal)).rejects.toThrow();
  });
});
