export interface VideoSearchCandidate {
  id: string;
  title: string;
  srcUrl: string;
  sourceLabel?: string;
  durationLabel?: string;
}

export interface VideoSearchOutcome {
  ok: boolean;
  mode: 'live_search' | 'unwired_honest';
  query: string;
  items: VideoSearchCandidate[];
  statusNote: string;
  lineage: {
    signature: 'MaxJ';
    layer: 'Layer 13';
    umbrella: 'OUR umbrella';
    dat: 'DAT-JURREAUISM-v1';
    transportActive: 'Cloudflare HTTPS';
    transportPlanned: ['P-STEP/1.0', 'MAX-TELECOM'];
  };
}

/** Restrict playback to direct HTTPS URLs without embedded credentials. */
export function safeVideoUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function clearViewportVideoElement(videoEl: HTMLVideoElement | null): void {
  if (!videoEl) return;
  try {
    videoEl.pause();
  } finally {
    videoEl.removeAttribute('src');
    videoEl.load();
  }
}

export async function searchAndLoadViewportVideo(params: {
  query: string;
  searchEndpointUrl?: string | null;
  videoEl?: HTMLVideoElement | null;
  autoSelectFirst?: boolean;
  signal?: AbortSignal;
}): Promise<VideoSearchOutcome> {
  const query = params.query.trim();
  const endpoint = params.searchEndpointUrl?.trim() || '';
  const lineage: VideoSearchOutcome['lineage'] = {
    signature: 'MaxJ', layer: 'Layer 13', umbrella: 'OUR umbrella', dat: 'DAT-JURREAUISM-v1',
    transportActive: 'Cloudflare HTTPS', transportPlanned: ['P-STEP/1.0', 'MAX-TELECOM'],
  };
  if (!endpoint) return {
    ok: false, mode: 'unwired_honest', query, items: [],
    statusNote: `MAX-REALITY: No live video search route is wired yet for "${query}". Existing Command viewport playback remains intact. Cloudflare HTTPS is active; P-STEP/1.0 and MAX-TELECOM are planned.`,
    lineage,
  };

  // A configured relative route is same-origin. Absolute routes must use HTTPS.
  let route: URL;
  try {
    route = new URL(endpoint, globalThis.location?.href ?? 'http://localhost/');
  } catch { throw new Error('Video search route must be a valid URL.'); }
  if (route.username || route.password || (route.protocol !== 'https:' && route.origin !== globalThis.location?.origin)) {
    throw new Error('Video search route must use HTTPS or a same-origin path without embedded credentials.');
  }

  const response = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: params.signal,
    credentials: 'same-origin', redirect: 'error', body: JSON.stringify({ action: 'video_search', query }),
  });
  if (!response.ok) throw new Error(`Video search failed with HTTP ${response.status}.`);
  const data: unknown = await response.json();
  if (!data || typeof data !== 'object' || !('items' in data) || !Array.isArray(data.items)) {
    throw new Error('Video search returned an invalid results list.');
  }
  const items: VideoSearchCandidate[] = data.items.slice(0, 30).map((item: unknown) => {
    if (!item || typeof item !== 'object' || !('id' in item) || typeof item.id !== 'string' || !item.id.trim()
      || !('title' in item) || typeof item.title !== 'string' || !item.title.trim()
      || !('srcUrl' in item) || typeof item.srcUrl !== 'string' || !safeVideoUrl(item.srcUrl)
      || ('sourceLabel' in item && typeof item.sourceLabel !== 'string')
      || ('durationLabel' in item && typeof item.durationLabel !== 'string')) {
      throw new Error('Video search returned an invalid result or non-HTTPS media URL.');
    }
    return {
      id: item.id, title: item.title, srcUrl: safeVideoUrl(item.srcUrl)!,
      ...('sourceLabel' in item ? { sourceLabel: item.sourceLabel as string } : {}),
      ...('durationLabel' in item ? { durationLabel: item.durationLabel as string } : {}),
    };
  });
  params.signal?.throwIfAborted();
  let statusNote = items.length
    ? `Found ${items.length} video match(es) for "${query}"${data.items.length > 30 ? ' (first 30 shown)' : ''}.`
    : `Search completed for "${query}" with 0 matching video items.`;
  if (params.autoSelectFirst && items[0] && params.videoEl) {
    clearViewportVideoElement(params.videoEl);
    params.videoEl.src = items[0].srcUrl;
    try { await params.videoEl.play(); }
    catch { statusNote += ' The selected video could not autoplay; use the player controls to try again.'; }
  }
  return { ok: true, mode: 'live_search', query, items, statusNote, lineage };
}
