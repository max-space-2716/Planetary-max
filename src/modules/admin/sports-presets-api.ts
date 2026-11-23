import { sanitizeSportsFeedOptions, SPORTS_FEED_OPTIONS_UPDATED, type SportsFeedOption } from './sports-feed-options';

export const SHARED_SPORTS_PRESETS_UPDATED = 'max-space:shared-sports-presets-updated';
// Browser-local choices already use max_space_sports_feed_options_v1; keep them intact.
export const SHARED_SPORTS_PRESETS_CACHE_KEY = 'max_space_sports_shared_presets_cache_v1';
const endpoint = '/api/sports/presets';

function cache(items: SportsFeedOption[]) {
  try { localStorage.setItem(SHARED_SPORTS_PRESETS_CACHE_KEY, JSON.stringify(items)); } catch { /* Storage is optional. */ }
}
function readCache(): SportsFeedOption[] | null {
  try {
    const raw = localStorage.getItem(SHARED_SPORTS_PRESETS_CACHE_KEY);
    const parsed: unknown = raw === null ? null : JSON.parse(raw);
    return Array.isArray(parsed) ? sanitizeSportsFeedOptions(parsed) : null;
  } catch { return null; }
}

async function parseResponse(response: Response): Promise<SportsFeedOption[]> {
  const data: unknown = await response.json();
  if (!response.ok || !data || typeof data !== 'object' || !('ok' in data) || data.ok !== true || !('items' in data) || !Array.isArray(data.items)) {
    throw new Error('Shared feed choices are unavailable.');
  }
  return sanitizeSportsFeedOptions(data.items);
}

/** Strict read for the editor: never allow a stale cache to become a replacement write. */
export async function loadSharedSportsPresets(signal?: AbortSignal): Promise<SportsFeedOption[]> {
  const items = await parseResponse(await fetch(endpoint, { cache: 'no-store', signal }));
  signal?.throwIfAborted();
  cache(items);
  return items;
}

export async function loadSharedSportsPresetsWithFallback(signal?: AbortSignal): Promise<{ items: SportsFeedOption[]; source: 'network' | 'cache' | 'unavailable' }> {
  try { return { items: await loadSharedSportsPresets(signal), source: 'network' }; }
  catch (error) {
    if (signal?.aborted) throw error;
    const items = readCache();
    return items === null ? { items: [], source: 'unavailable' } : { items, source: 'cache' };
  }
}

export async function fetchGlobalSportsPresets(): Promise<SportsFeedOption[]> {
  return (await loadSharedSportsPresetsWithFallback()).items;
}

export async function publishGlobalSportsPresetsFromCommand(items: SportsFeedOption[]): Promise<{ ok: boolean; items: SportsFeedOption[]; note: string }> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }),
    });
  } catch {
    return { ok: false, items: [], note: 'MAX-REALITY: Could not reach the sports preset service.' };
  }
  if (!response.ok) return { ok: false, items: [], note: `MAX-REALITY: Failed to publish presets (${response.status}). Confirm Command operator session is active.` };
  let saved: SportsFeedOption[];
  try { saved = await parseResponse(response); }
  catch { return { ok: false, items: [], note: 'MAX-REALITY: The sports preset service returned an invalid response.' }; }
  cache(saved);
  if (typeof window !== 'undefined') {
    const event = Object.assign(new CustomEvent(SPORTS_FEED_OPTIONS_UPDATED, { detail: saved }), { sharedSportsPresets: true });
    window.dispatchEvent(event);
    window.dispatchEvent(new CustomEvent(SHARED_SPORTS_PRESETS_UPDATED, { detail: saved }));
  }
  return { ok: true, items: saved, note: `MAX-REALITY: Published ${saved.length} shared feed option(s).` };
}

export async function saveSharedSportsPresets(items: SportsFeedOption[]): Promise<SportsFeedOption[]> {
  const result = await publishGlobalSportsPresetsFromCommand(items);
  if (!result.ok) throw new Error(result.note);
  return result.items;
}
