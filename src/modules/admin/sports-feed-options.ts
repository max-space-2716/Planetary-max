import { safeVideoUrl } from './video-search';

export interface SportsFeedOption {
  id: string;
  label: string;
  url: string;
}

export const SPORTS_FEED_STORAGE_KEY = 'max_space_sports_feed_options_v1';
export const SPORTS_FEED_OPTIONS_UPDATED = 'max-space:sports-presets-updated';

// Stored data is untrusted; validate it both on save and when reading it back.
export function sanitizeSportsFeedOptions(items: unknown): SportsFeedOption[] {
  if (!Array.isArray(items)) return [];
  const sanitized: SportsFeedOption[] = [];
  const ids = new Set<string>();
  for (const value of items) {
    if (!value || typeof value !== 'object') continue;
    const item = value as Record<string, unknown>;
    const url = typeof item.url === 'string' ? safeVideoUrl(item.url.trim()) : null;
    if (!url) continue;
    const label = typeof item.label === 'string' ? item.label.trim() || 'Sports Feed' : 'Sports Feed';
    let id = typeof item.id === 'string' ? item.id.trim() : '';
    if (!id || ids.has(id)) {
      let n = sanitized.length + 1;
      while (ids.has(`feed-${n}`)) n++;
      id = `feed-${n}`;
    }
    ids.add(id);
    sanitized.push({ id, label, url });
  }
  return sanitized;
}

export function saveSportsFeedOptions(options: SportsFeedOption[]): { options: SportsFeedOption[]; persisted: boolean } {
  const sanitized = sanitizeSportsFeedOptions(options);
  let persisted = false;
  try {
    localStorage.setItem(SPORTS_FEED_STORAGE_KEY, JSON.stringify(sanitized));
    persisted = true;
  } catch { /* Storage may be unavailable; still update the current page. */ }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SPORTS_FEED_OPTIONS_UPDATED, { detail: sanitized }));
  }
  return { options: sanitized, persisted };
}

export function saveSportsFeedOptionsFromCommand(options: SportsFeedOption[]): SportsFeedOption[] {
  return saveSportsFeedOptions(options).options;
}

export function loadSportsFeedOptions(): SportsFeedOption[] {
  try {
    const raw = localStorage.getItem(SPORTS_FEED_STORAGE_KEY);
    return raw ? sanitizeSportsFeedOptions(JSON.parse(raw)) : [];
  } catch { return []; }
}

export function sportsFeedOptionsFromEvent(event: Event): SportsFeedOption[] {
  return sanitizeSportsFeedOptions((event as CustomEvent<unknown>).detail);
}
