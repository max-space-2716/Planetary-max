import { describe, expect, it, vi } from 'vitest';
import { createOverviewViewportController } from '../overview-viewport-controller';
import { mountSessionSportsIframe } from '../session-sports-iframe';
import { attachSportsUrlBar, sportsUrlKind } from '../sports-url-bar';
import { mountSportsHudWithChoices } from '../sports-hud-choices';

class ElementFixture {
  children: ElementFixture[] = [];
  parent: ElementFixture | null = null;
  dataset: Record<string, string> = {};
  listeners = new Map<string, (event: any) => void>();
  style = { cssText: '' };
  attributes: Record<string, string> = {};
  src = ''; title = ''; href = ''; textContent = ''; target = ''; rel = ''; value = '';
  pause = vi.fn(); load = vi.fn(); play = vi.fn().mockResolvedValue(undefined);
  ownerDocument = { createElement: (tag: string) => new ElementFixture(tag) };
  constructor(public tag: string) {}
  appendChild(child: ElementFixture) { child.parent = this; this.children.push(child); return child; }
  prepend(child: ElementFixture) { child.parent = this; this.children.unshift(child); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  addEventListener(name: string, handler: (event: any) => void) { this.listeners.set(name, handler); }
  fire(name: string, event: any = {}) { this.listeners.get(name)?.(event); }
  append(...children: ElementFixture[]) { this.children.push(...children); }
  replaceChildren() { this.children = []; }
  setAttribute(name: string, value: string) { this.attributes[name] = value; }
  removeAttribute = vi.fn((name: string) => { delete this.attributes[name]; if (name === 'src') this.src = ''; });
  querySelectorAll(tag: string): ElementFixture[] {
    return this.children.flatMap(child => [...(child.tag === tag ? [child] : []), ...child.querySelectorAll(tag)]);
  }
  querySelector(tag: string) { return this.querySelectorAll(tag)[0] ?? null; }
}
const asContainer = (element: ElementFixture) => element as unknown as HTMLElement;

describe('overview sports viewport', () => {
  it('reports an unwired feed, prefers an embed, and tears it down on switching views', () => {
    const container = new ElementFixture('div');
    const controller = createOverviewViewportController(asContainer(container));
    expect(controller.getActiveMode()).toBe('idle');
    expect(controller.activateSportsFeed({})).toMatchObject({ mode: 'sports_live', status: 'unwired_honest', note: expect.stringContaining('No live sports feed URL') });
    expect(container.children).toHaveLength(0);
    expect(controller.activateSportsFeed({ embedUrl: 'https://example.test/embed', streamUrl: 'https://example.test/stream', title: 'Game' }))
      .toEqual({ mode: 'sports_live', status: 'live_embed' });
    const frame = container.querySelectorAll('iframe')[0];
    expect(frame).toMatchObject({ src: 'https://example.test/embed', title: 'Game' });
    expect(controller.switchAwayTo('art_preview')).toEqual({ mode: 'art_preview' });
    expect(frame.removeAttribute).toHaveBeenCalledWith('src');
    expect(container.children).toHaveLength(0);
    expect(controller.getActiveMode()).toBe('art_preview');
  });

  it('unloads a stream on replacement and when switching away', () => {
    const container = new ElementFixture('div');
    const controller = createOverviewViewportController(asContainer(container));
    expect(controller.activateSportsFeed({ streamUrl: 'https://example.test/first.mp4' }))
      .toEqual({ mode: 'sports_live', status: 'live_stream' });
    const first = container.querySelectorAll('video')[0];
    expect(first.attributes['aria-label']).toBe('MAX-SPORTS Live Stream');
    controller.activateSportsFeed({ streamUrl: 'https://example.test/second.mp4' });
    expect(first.pause).toHaveBeenCalledOnce();
    expect(first.removeAttribute).toHaveBeenCalledWith('src');
    expect(first.load).toHaveBeenCalledOnce();
    const second = container.querySelectorAll('video')[0];
    controller.switchAwayTo('chess_preview');
    expect(second.pause).toHaveBeenCalledOnce();
    expect(container.children).toHaveLength(0);
  });

  it('clears previous media even if pause fails, rejects unsafe URLs, and offers a safe fallback link', () => {
    const container = new ElementFixture('div');
    const video = new ElementFixture('video');
    video.pause.mockImplementation(() => { throw new Error('pause failed'); });
    container.appendChild(video);
    expect(mountSessionSportsIframe({ container: asContainer(container) }).status).toBe('unwired_honest');
    expect(video.removeAttribute).toHaveBeenCalledWith('src');
    expect(video.load).toHaveBeenCalledOnce();
    for (const url of ['http://example.test/embed', 'https://user:pass@example.test/embed', 'javascript:alert(1)']) {
      expect(mountSessionSportsIframe({ container: asContainer(container), inputUrl: url })).toMatchObject({ status: 'unwired_honest', url: null });
      expect(container.children).toHaveLength(0);
    }
    expect(mountSessionSportsIframe({ container: asContainer(container), inputUrl: ' https://example.test/embed?x=1 ' }))
      .toMatchObject({ status: 'mounted_iframe', url: 'https://example.test/embed?x=1' });
    const frame = container.querySelectorAll('iframe')[0];
    expect(frame.attributes.sandbox).toBe('allow-scripts allow-same-origin allow-presentation allow-forms');
    const link = container.querySelectorAll('a')[0];
    expect(link).toMatchObject({ href: 'https://example.test/embed?x=1', target: '_blank', rel: 'noopener noreferrer', textContent: 'Open Stream Tab' });
  });

  it('loads, clears and detaches the URL bar listeners', () => {
    class Control {
      value = ''; textContent = '';
      listeners = new Map<string, (event: KeyboardEvent) => void>();
      addEventListener(name: string, handler: (event: KeyboardEvent) => void) { this.listeners.set(name, handler); }
      removeEventListener(name: string) { this.listeners.delete(name); }
      fire(name: string, event = {} as KeyboardEvent) { this.listeners.get(name)?.(event); }
    }
    const input = new Control(), load = new Control(), clear = new Control(), status = new Control();
    const controls: Record<string, Control> = { '#max-sports-url-input': input, '#max-sports-load-btn': load, '#max-sports-clear-btn': clear, '#max-sports-status': status };
    const root = { querySelector: (selector: string) => controls[selector] } as unknown as ParentNode;
    const container = new ElementFixture('div');
    const bar = attachSportsUrlBar({ rootEl: root, viewportEl: asContainer(container) });
    expect(sportsUrlKind('https://example.test/VIDEO.MP4?token=x#t')).toBe('stream');
    input.value = 'https://example.test/live.mp4?token=x';
    const preventDefault = vi.fn();
    input.fire('keydown', { key: 'Enter', preventDefault } as unknown as KeyboardEvent);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(container.querySelectorAll('video')[0].play).toHaveBeenCalledOnce();
    input.value = 'https://example.test/embed';
    load.fire('click');
    expect(container.querySelectorAll('iframe')).toHaveLength(1);
    expect(status.textContent).toContain('host X-Frame-Options');
    clear.fire('click');
    expect(input.value).toBe('');
    expect(container.children).toHaveLength(0);
    input.value = 'http://example.test/live';
    load.fire('click');
    expect(status.textContent).toContain('valid https://');
    bar.destroy();
    expect(load.listeners.size + clear.listeners.size + input.listeners.size).toBe(0);
  });

  it('selects presets, handles custom URLs and dismisses the frame notice without unloading the feed', () => {
    const root = new ElementFixture('div');
    const viewport = new ElementFixture('div');
    const hud = mountSportsHudWithChoices({
      rootEl: root as unknown as ParentNode,
      viewportEl: asContainer(viewport),
      presetSources: [
        { id: 'first', label: 'First feed', url: 'https://example.test/embed' },
        { id: 'second', label: 'Second feed', url: 'https://example.test/live.mp4?x=1' },
      ],
    });
    const tabs = root.querySelectorAll('button');
    const input = root.querySelectorAll('input')[0];
    tabs[0].fire('click');
    const frame = viewport.querySelectorAll('iframe')[0];
    expect(frame).toMatchObject({ src: 'https://example.test/embed', title: 'First feed' });
    expect(tabs[0].attributes['aria-pressed']).toBe('true');
    expect(tabs[1].attributes['aria-pressed']).toBe('false');
    viewport.querySelectorAll('button')[0].fire('click');
    expect(viewport.querySelectorAll('iframe')).toHaveLength(1);
    expect(viewport.querySelectorAll('a')).toHaveLength(0);
    tabs[1].fire('click');
    expect(frame.removeAttribute).toHaveBeenCalledWith('src');
    const video = viewport.querySelectorAll('video')[0];
    expect(video.src).toBe('https://example.test/live.mp4?x=1');
    expect(video.play).toHaveBeenCalledOnce();
    expect(tabs[1].attributes['aria-pressed']).toBe('true');
    input.value = 'http://example.test/bad';
    tabs[2].fire('click');
    expect(video.pause).toHaveBeenCalledOnce();
    expect(viewport.children).toHaveLength(0);
    expect(tabs[1].attributes['aria-pressed']).toBe('false');
    input.value = 'https://example.test/custom';
    const preventDefault = vi.fn();
    input.fire('keydown', { key: 'Enter', preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(viewport.querySelectorAll('iframe')).toHaveLength(1);
    expect(tabs[0].attributes['aria-pressed']).toBe('false');
    hud.clearAll();
    expect(input.value).toBe('');
    expect(viewport.children).toHaveLength(0);
    hud.mountUrl('https://example.test/other.webm');
    const lastVideo = viewport.querySelectorAll('video')[0];
    hud.destroy();
    expect(lastVideo.pause).toHaveBeenCalledOnce();
    expect(viewport.children).toHaveLength(0);
    expect(root.children).toHaveLength(0);
    hud.mountUrl('https://example.test/after-destroy.mp4');
    expect(viewport.children).toHaveLength(0);
  });
});
