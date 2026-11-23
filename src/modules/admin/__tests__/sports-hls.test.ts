import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountSportsFeedViewport } from '../sports-feed-viewport';

const state = vi.hoisted(() => ({ players: [] as any[], supported: true }));
vi.mock('hls.js', () => {
  class FakeHls {
    static Events = { MEDIA_ATTACHED: 'attached', MANIFEST_PARSED: 'manifest', ERROR: 'error' };
    static isSupported() { return state.supported; }
    handlers = new Map<string, (...args: any[]) => void>();
    destroy = vi.fn(); loadSource = vi.fn(); attachMedia = vi.fn();
    constructor() { state.players.push(this); }
    on(event: string, handler: (...args: any[]) => void) { this.handlers.set(event, handler); }
    fire(event: string, data?: unknown) { this.handlers.get(event)?.(event, data); }
  }
  return { default: FakeHls };
});

function fixture(nativeHls = false) {
  const videos: any[] = [];
  const container: any = {
    ownerDocument: { createElement: () => {
      const video = {
        style: {}, src: '', canPlayType: vi.fn(() => nativeHls ? 'maybe' : ''),
        pause: vi.fn(), load: vi.fn(), play: vi.fn().mockResolvedValue(undefined), setAttribute: vi.fn(),
        removeAttribute: vi.fn(), dispatchEvent: vi.fn(),
      };
      videos.push(video); return video;
    } },
    appendChild: vi.fn(), querySelectorAll: (tag: string) => tag === 'video' ? videos.slice() : [],
    replaceChildren: () => { videos.length = 0; },
  };
  return { container, videos, handle: mountSportsFeedViewport({ container }) };
}

beforeEach(() => { state.players.length = 0; state.supported = true; });

describe('sports HLS playback', () => {
  it('uses native HLS when supported and clears the video', () => {
    const { handle, videos } = fixture(true);
    handle.loadStream('https://example.test/live.m3u8?token=1', 'Live');
    const video = videos[0];
    expect(video.src).toBe('https://example.test/live.m3u8?token=1');
    expect(state.players).toHaveLength(0);
    handle.clearFeed();
    expect(video.pause).toHaveBeenCalledOnce();
    expect(video.removeAttribute).toHaveBeenCalledWith('src');
    expect(video.load).toHaveBeenCalledOnce();
  });
  it('attaches HLS.js for non-native HLS, plays after the manifest, and destroys it on teardown', async () => {
    const { handle, videos } = fixture();
    handle.loadStream('https://example.test/live.m3u8', 'Live');
    const video = videos[0];
    await vi.waitFor(() => expect(state.players).toHaveLength(1));
    const player = state.players[0];
    expect(player.attachMedia).toHaveBeenCalledWith(video);
    player.fire('attached');
    expect(player.loadSource).toHaveBeenCalledWith('https://example.test/live.m3u8');
    player.fire('manifest');
    expect(video.play).toHaveBeenCalledOnce();
    handle.clearFeed();
    expect(player.destroy).toHaveBeenCalledOnce();
    expect(video.removeAttribute).toHaveBeenCalledWith('src');
    expect(video.load).toHaveBeenCalledOnce();
  });
  it('does not attach a late player after leaving and reports fatal errors', async () => {
    const first = fixture();
    first.handle.loadStream('https://example.test/first.m3u8', 'First');
    first.handle.clearFeed();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(state.players).toHaveLength(0);
    const second = fixture();
    second.handle.loadStream('https://example.test/second.m3u8', 'Second');
    const video = second.videos[0];
    await vi.waitFor(() => expect(state.players).toHaveLength(1));
    const player = state.players[0];
    player.fire('error', { fatal: true });
    expect(player.destroy).toHaveBeenCalledOnce();
    expect(video.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
    second.handle.clearFeed();
    expect(player.destroy).toHaveBeenCalledOnce();
  });
});
