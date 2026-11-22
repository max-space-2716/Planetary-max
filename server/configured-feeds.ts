import { readResponseText } from './bounded-response';

export interface FeedBindings {
  PRIVATE_WWW_FEED_URL?: string;
  PRIVATE_WWW_FEED_TOKEN?: string;
  PUBLIC_FEEDS_JSON?: string;
}

type Feed = { item_id?: string; id?: string; title: string; status?: string; summary: string; meta?: string; formula?: string; url?: string; source?: string; scope?: string };
function validFeedUrl(value: string): boolean {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}
function stripTags(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
function parseXml(xml: string, label: string, scope: string): Feed[] {
  const items: Feed[] = [];
  const blocks = /<(?:item|entry)\b[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi;
  let match: RegExpExecArray | null;
  while (items.length < 15 && (match = blocks.exec(xml))) {
    const block = match[1];
    const title = block.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    const summary = block.match(/<(?:description|summary|content:encoded|content)\b[^>]*>([\s\S]*?)<\/(?:description|summary|content:encoded|content)>/i)?.[1];
    const link = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i)?.[1] || block.match(/<link\b[^>]*>([\s\S]*?)<\/link>/i)?.[1];
    items.push({ id: `${label}_${items.length}`, title: stripTags(title || `Feed item ${items.length + 1}`), summary: stripTags(summary || '').slice(0, 240), source: label, scope, url: link ? stripTags(link) : undefined });
  }
  return items;
}
async function fetchFeed(url: string, label: string, scope: string, token?: string): Promise<Feed[] | null> {
  if (!validFeedUrl(url)) return null;
  const headers = new Headers({ Accept: 'application/json, application/rss+xml, application/atom+xml, text/xml' });
  if (token) headers.set('Authorization', `Bearer ${token}`);
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(8000), redirect: 'manual' });
    if (!response.ok) { await response.body?.cancel(); return null; }
    const text = await readResponseText(response, 1_000_000);
    try {
      const data = JSON.parse(text) as { items?: Array<{ id?: string; title?: string; summary?: string; description?: string; url?: string; link?: string }> };
      if (Array.isArray(data.items)) return data.items.slice(0, 15).map((item, index) => ({ id: item.id || `${label}_${index}`, title: item.title || `Feed item ${index + 1}`, summary: (item.summary || item.description || '').slice(0, 240), source: label, scope, url: item.url || item.link }));
    } catch { /* RSS/Atom follows. */ }
    return /<(?:rss|feed|rdf:RDF)\b/i.test(text) ? parseXml(text, label, scope) : null;
  } catch { return null; }
}
export function feedSources(env: FeedBindings) {
  const sources: Array<{ url: string; label: string; scope: string; token?: string }> = [];
  if (env.PRIVATE_WWW_FEED_URL && validFeedUrl(env.PRIVATE_WWW_FEED_URL)) sources.push({ url: env.PRIVATE_WWW_FEED_URL, label: 'private_www', scope: 'MAX-INSTITUTE', token: env.PRIVATE_WWW_FEED_TOKEN });
  if (env.PUBLIC_FEEDS_JSON) {
    try {
      const entries = JSON.parse(env.PUBLIC_FEEDS_JSON) as Array<{ url?: string; label?: string; scope?: string }>;
      if (Array.isArray(entries)) for (const entry of entries.slice(0, 20)) if (entry && typeof entry.url === 'string' && validFeedUrl(entry.url)) sources.push({ url: entry.url, label: (typeof entry.label === 'string' && entry.label || 'web_feed').slice(0, 80), scope: (typeof entry.scope === 'string' && entry.scope || 'MAX-INTERNET').slice(0, 80) });
    } catch { /* Ignore malformed optional configuration. */ }
  }
  return sources;
}

export async function readConfiguredFeeds(sources: ReturnType<typeof feedSources>) {
  const feeds = await Promise.all(sources.map(({ url, label, scope, token }) => fetchFeed(url, label, scope, token)));
  return {
    items: feeds.flatMap(items => items ?? []),
    available: feeds.filter(items => items !== null).length,
    unavailable: feeds.filter(items => items === null).length,
  };
}
