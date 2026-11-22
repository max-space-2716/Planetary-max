import { createOverviewViewportController } from './overview-viewport-controller';
import { safeVideoUrl } from './video-search';
import { sportsUrlKind } from './sports-url-bar';

export interface SportsSourceOption {
  id: string;
  label: string;
  url: string;
}

export interface SportsHudOptions {
  rootEl: ParentNode;
  viewportEl: HTMLElement;
  presetSources?: SportsSourceOption[];
  defaultTitle?: string;
}

export function mountSportsHudWithChoices(options: SportsHudOptions) {
  const doc = options.viewportEl.ownerDocument;
  const controller = createOverviewViewportController(options.viewportEl);
  const controls = doc.createElement('div');
  controls.className = 'sports-feed-hud-controls';
  const tabs = doc.createElement('div');
  tabs.className = 'sports-feed-tabs';
  tabs.setAttribute('role', 'group');
  tabs.setAttribute('aria-label', 'Sports feed sources');
  const inputRow = doc.createElement('div');
  inputRow.className = 'sports-feed-controls';
  const label = doc.createElement('label');
  label.textContent = 'HTTPS sports URL';
  const input = doc.createElement('input');
  input.type = 'url';
  input.placeholder = 'Paste HTTPS sports feed or embed URL...';
  input.maxLength = 2048;
  label.appendChild(input);
  const load = doc.createElement('button');
  load.type = 'button';
  load.textContent = 'Load feed';
  const clear = doc.createElement('button');
  clear.type = 'button';
  clear.textContent = 'Clear';
  const status = doc.createElement('p');
  status.setAttribute('role', 'status');
  status.textContent = 'No live sports feed URL is attached yet. Select a source or enter an HTTPS URL.';
  inputRow.appendChild(label);
  inputRow.appendChild(load);
  inputRow.appendChild(clear);
  if (options.presetSources?.length) controls.appendChild(tabs);
  controls.appendChild(inputRow);
  controls.appendChild(status);
  options.rootEl.prepend(controls);

  let activeSourceId: string | null = null;
  let destroyed = false;
  const buttons: Array<{ id: string; element: HTMLButtonElement }> = [];
  const syncTabs = () => {
    for (const button of buttons) button.element.setAttribute('aria-pressed', String(button.id === activeSourceId));
  };
  const clearAll = () => {
    if (destroyed) return;
    controller.switchAwayTo('idle');
    activeSourceId = null;
    input.value = '';
    syncTabs();
    status.textContent = 'Sports feed cleared. No live sports feed URL is attached.';
  };
  const mountUrl = (rawUrl: string, title?: string, sourceId: string | null = null) => {
    if (destroyed) return;
    const raw = rawUrl.trim();
    if (!raw) { clearAll(); return; }
    const url = safeVideoUrl(raw);
    if (!url) {
      controller.switchAwayTo('idle');
      activeSourceId = null;
      syncTabs();
      status.textContent = 'Enter a valid HTTPS sports URL without embedded credentials.';
      return;
    }
    const kind = sportsUrlKind(url);
    controller.activateSportsFeed(kind === 'stream'
      ? { streamUrl: url, title: title ?? options.defaultTitle }
      : { embedUrl: url, title: title ?? options.defaultTitle });
    activeSourceId = sourceId;
    input.value = url;
    syncTabs();
    if (kind === 'stream') {
      const video = options.viewportEl.querySelector('video');
      if (video) void video.play().catch(() => {});
    }
    status.textContent = kind === 'stream'
      ? `Direct video URL attached (${title ?? new URL(url).hostname}). Playback depends on browser support.`
      : `Embed URL attached (${title ?? new URL(url).hostname}). The host may block framing.`;
  };

  for (const preset of options.presetSources ?? []) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.textContent = preset.label;
    button.dataset.sourceId = preset.id;
    button.addEventListener('click', () => mountUrl(preset.url, preset.label, preset.id));
    buttons.push({ id: preset.id, element: button });
    tabs.appendChild(button);
  }
  syncTabs();
  load.addEventListener('click', () => mountUrl(input.value));
  clear.addEventListener('click', clearAll);
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); mountUrl(input.value); }
  });
  return {
    mountUrl,
    clearAll,
    destroy() {
      if (destroyed) return;
      controller.switchAwayTo('idle');
      controls.remove();
      destroyed = true;
    },
  };
}
