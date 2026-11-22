import { createOverviewViewportController } from './overview-viewport-controller';
import { safeVideoUrl } from './video-search';

export interface SportsBarController {
  clear: () => void;
  destroy: () => void;
}

/** Classify by pathname so query strings and fragments do not affect direct video detection. */
export function sportsUrlKind(url: string): 'stream' | 'embed' {
  return /\.(m3u8|mp4|webm)$/i.test(new URL(url).pathname) ? 'stream' : 'embed';
}

export function attachSportsUrlBar(params: {
  rootEl: Pick<ParentNode, 'querySelector'>;
  viewportEl: HTMLElement;
  defaultTitle?: string;
}): SportsBarController {
  const input = params.rootEl.querySelector<HTMLInputElement>('#max-sports-url-input');
  const load = params.rootEl.querySelector<HTMLButtonElement>('#max-sports-load-btn');
  const clearButton = params.rootEl.querySelector<HTMLButtonElement>('#max-sports-clear-btn');
  const status = params.rootEl.querySelector<HTMLElement>('#max-sports-status');
  const controller = createOverviewViewportController(params.viewportEl);
  const setStatus = (message: string) => { if (status) status.textContent = message; };
  const clear = () => {
    controller.switchAwayTo('idle');
    if (input) input.value = '';
    setStatus('MAX-REALITY (unwired_honest): Sports feed cleared. Cloudflare HTTPS active; P-STEP/1.0 & MAX-TELECOM planned.');
  };
  const loadFromInput = () => {
    const raw = (input?.value ?? '').trim();
    if (!raw) { clear(); return; }
    const url = safeVideoUrl(raw);
    if (!url) {
      controller.switchAwayTo('idle');
      setStatus('MAX-REALITY (unwired_honest): Enter a valid https:// sports URL without embedded credentials.');
      return;
    }
    const kind = sportsUrlKind(url);
    controller.activateSportsFeed(kind === 'stream'
      ? { streamUrl: url, title: params.defaultTitle }
      : { embedUrl: url, title: params.defaultTitle });
    if (kind === 'stream') {
      const video = params.viewportEl.querySelector('video');
      if (video) void video.play().catch(() => {});
    }
    const host = new URL(url).hostname;
    setStatus(kind === 'stream'
      ? `MAX-REALITY: Mounted direct stream over Cloudflare HTTPS (${host}).`
      : `MAX-REALITY: Mounted iframe for ${host} over Cloudflare HTTPS (subject to host X-Frame-Options / CSP).`);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') { event.preventDefault(); loadFromInput(); }
  };
  load?.addEventListener('click', loadFromInput);
  clearButton?.addEventListener('click', clear);
  input?.addEventListener('keydown', onKeyDown);
  return {
    clear,
    destroy() {
      load?.removeEventListener('click', loadFromInput);
      clearButton?.removeEventListener('click', clear);
      input?.removeEventListener('keydown', onKeyDown);
      controller.switchAwayTo('idle');
    },
  };
}
