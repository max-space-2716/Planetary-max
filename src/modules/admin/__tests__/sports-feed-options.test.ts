import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSportsFeedOptions, saveSportsFeedOptions, saveSportsFeedOptionsFromCommand, SPORTS_FEED_OPTIONS_UPDATED, SPORTS_FEED_STORAGE_KEY, sportsFeedOptionsFromEvent } from '../sports-feed-options';

afterEach(() => vi.unstubAllGlobals());

describe('browser sports feed options', () => {
  it('sanitizes and persists options, then emits the sanitized list', () => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', { setItem: (key: string, value: string) => data.set(key, value), getItem: (key: string) => data.get(key) ?? null });
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    const saved = saveSportsFeedOptionsFromCommand([
      { id: ' a ', label: '  Primary ', url: ' https://example.test/live ' },
      { id: '', label: ' ', url: 'https://example.test/embed' },
      { id: 'bad', label: 'Bad', url: 'http://example.test/a' },
      { id: 'bad2', label: 'Credentials', url: 'https://user:pass@example.test/a' },
    ]);
    expect(saved).toEqual([{ id: 'a', label: 'Primary', url: 'https://example.test/live' }, { id: 'feed-2', label: 'Sports Feed', url: 'https://example.test/embed' }]);
    expect(loadSportsFeedOptions()).toEqual(saved);
    const event = dispatchEvent.mock.calls[0][0] as CustomEvent;
    expect(event.type).toBe(SPORTS_FEED_OPTIONS_UPDATED);
    expect(event.detail).toEqual(saved);
  });

  it('handles corrupt and untrusted storage without exposing invalid sources', () => {
    const getItem = vi.fn().mockReturnValueOnce('not JSON').mockReturnValueOnce(JSON.stringify([
      null, { url: 'javascript:alert(1)' }, { id: 'x', label: 'Good', url: 'https://example.test/a' },
      { id: 'x', label: 3, url: 'https://example.test/b' },
    ]));
    vi.stubGlobal('localStorage', { getItem });
    expect(loadSportsFeedOptions()).toEqual([]);
    expect(loadSportsFeedOptions()).toEqual([{ id: 'x', label: 'Good', url: 'https://example.test/a' }, { id: 'feed-2', label: 'Sports Feed', url: 'https://example.test/b' }]);
    expect(getItem).toHaveBeenCalledWith(SPORTS_FEED_STORAGE_KEY);
    expect(sportsFeedOptionsFromEvent(new CustomEvent(SPORTS_FEED_OPTIONS_UPDATED, { detail: [{ url: 'http://example.test/' }, 42] }))).toEqual([]);
  });

  it('reports storage failure but still emits changes for the current page', () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('denied'); }, getItem: () => { throw new Error('denied'); } });
    const result = saveSportsFeedOptions([{ id: 'a', label: 'Feed', url: 'https://example.test/' }]);
    expect(result.persisted).toBe(false);
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual(result.options);
    expect(loadSportsFeedOptions()).toEqual([]);
  });
});
