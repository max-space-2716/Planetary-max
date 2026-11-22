import { safeVideoUrl } from './video-search';

export interface SportsIframeMountResult {
  status: 'mounted_iframe' | 'unwired_honest';
  url: string | null;
  note: string;
}

/** Stop all previous media before clearing the dedicated viewport. */
export function clearSportsViewport(container: HTMLElement): void {
  for (const video of container.querySelectorAll('video')) {
    try { video.pause(); } catch { /* Still remove the source if pausing fails. */ }
    video.removeAttribute('src');
    try { video.load(); } catch { /* Continue clearing the viewport. */ }
  }
  for (const frame of container.querySelectorAll('iframe')) frame.removeAttribute('src');
  container.replaceChildren();
}

export function mountSessionSportsIframe(params: {
  container: HTMLElement;
  inputUrl?: string | null;
  title?: string;
}): SportsIframeMountResult {
  clearSportsViewport(params.container);
  const input = (params.inputUrl ?? '').trim();
  if (!input) return {
    status: 'unwired_honest', url: null,
    note: 'MAX-REALITY: No live sports stream URL is entered. Viewport ready over Cloudflare HTTPS.',
  };
  const url = safeVideoUrl(input);
  if (!url) return {
    status: 'unwired_honest', url: null,
    note: 'MAX-REALITY: Invalid or non-HTTPS URL rejected to preserve mixed-content and frame safety.',
  };

  const doc = params.container.ownerDocument;
  const wrapper = doc.createElement('div');
  wrapper.style.cssText = 'position:relative;width:100%;height:100%';
  const iframe = doc.createElement('iframe');
  iframe.src = url;
  iframe.title = params.title ?? 'MAX-SPORTS Live Feed';
  iframe.style.cssText = 'width:100%;height:100%;border:0';
  iframe.allow = 'autoplay; fullscreen; encrypted-media; picture-in-picture';
  iframe.referrerPolicy = 'no-referrer';
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-forms');
  const fallback = doc.createElement('div');
  fallback.style.cssText = 'position:absolute;bottom:8px;right:8px;z-index:10;background:rgba(10,14,20,0.85);color:#e2e8f0;padding:6px 10px;border-radius:6px;font-size:12px;display:flex;gap:8px;align-items:center';
  const label = doc.createElement('span');
  label.textContent = 'If frame is blocked by host headers:';
  const link = doc.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Open Stream Tab';
  link.style.cssText = 'color:#38bdf8;text-decoration:underline';
  fallback.appendChild(label);
  fallback.appendChild(link);
  wrapper.appendChild(iframe);
  wrapper.appendChild(fallback);
  params.container.appendChild(wrapper);
  return {
    status: 'mounted_iframe', url,
    note: 'MAX-REALITY: Mounted session iframe over Cloudflare HTTPS; external host framing headers still govern visibility.',
  };
}
