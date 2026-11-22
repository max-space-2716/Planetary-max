import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearViewportVideoElement, safeVideoUrl, searchAndLoadViewportVideo } from '../video-search';

afterEach(() => vi.unstubAllGlobals());

describe('viewport video search', () => {
  it('reports an unwired search without a network request or touching playback', async () => {
    const fetchSpy = vi.fn();
    const player = { pause: vi.fn(), load: vi.fn(), removeAttribute: vi.fn(), src: 'https://example.test/playing.mp4' };
    vi.stubGlobal('fetch', fetchSpy);
    const result = await searchAndLoadViewportVideo({ query: '  constellation  ', videoEl: player as unknown as HTMLVideoElement, autoSelectFirst: true });
    expect(result).toMatchObject({
      ok: false, mode: 'unwired_honest', query: 'constellation', items: [],
      lineage: { signature: 'MaxJ', layer: 'Layer 13', transportPlanned: ['P-STEP/1.0', 'MAX-TELECOM'] },
    });
    expect(result.statusNote).toContain('No live video search route');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(player.pause).not.toHaveBeenCalled();
    expect(player.src).toBe('https://example.test/playing.mp4');
  });

  it('posts to a configured route, returns HTTPS results, and reports blocked autoplay', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      items: [{ id: 'a', title: 'Stars', srcUrl: 'https://example.test/video.mp4', sourceLabel: 'Fixture' }],
    })));
    vi.stubGlobal('fetch', fetchSpy);
    const player = { pause: vi.fn(), load: vi.fn(), removeAttribute: vi.fn(), play: vi.fn().mockRejectedValue(new Error('blocked')), src: '' };
    const result = await searchAndLoadViewportVideo({
      query: ' stars ', searchEndpointUrl: 'https://search.example.test/videos',
      videoEl: player as unknown as HTMLVideoElement, autoSelectFirst: true,
    });
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [endpoint, options] = fetchSpy.mock.calls[0];
    expect(endpoint).toBe('https://search.example.test/videos');
    expect(JSON.parse(options.body)).toEqual({ action: 'video_search', query: 'stars' });
    expect(result).toMatchObject({ ok: true, mode: 'live_search', items: [{ id: 'a', title: 'Stars' }] });
    expect(player.pause).toHaveBeenCalledOnce();
    expect(player.removeAttribute).toHaveBeenCalledWith('src');
    expect(player.load).toHaveBeenCalledOnce();
    expect(player.src).toBe('https://example.test/video.mp4');
    expect(result.statusNote).toContain('could not autoplay');
  });

  it('rejects unsafe sources and malformed or failed provider responses', async () => {
    expect(safeVideoUrl('http://example.test/a')).toBeNull();
    expect(safeVideoUrl('https://user:password@example.test/a')).toBeNull();
    const fetchSpy = vi.fn().mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: 'x', title: 'Bad', srcUrl: 'http://example.test/a' }] })))
      .mockResolvedValueOnce(new Response('{}'));
    vi.stubGlobal('fetch', fetchSpy);
    const params = { query: 'x', searchEndpointUrl: 'https://search.example.test/videos' };
    await expect(searchAndLoadViewportVideo(params)).rejects.toThrow('HTTP 503');
    await expect(searchAndLoadViewportVideo(params)).rejects.toThrow('invalid result');
    await expect(searchAndLoadViewportVideo(params)).rejects.toThrow('invalid results list');
  });

  it('does not select a result after cancellation and still unloads if pause throws', async () => {
    const controller = new AbortController();
    const player = { pause: vi.fn(), load: vi.fn(), removeAttribute: vi.fn(), play: vi.fn(), src: '' };
    vi.stubGlobal('fetch', vi.fn(async () => {
      controller.abort();
      return new Response(JSON.stringify({ items: [{ id: 'x', title: 'Video', srcUrl: 'https://example.test/a' }] }));
    }));
    await expect(searchAndLoadViewportVideo({ query: 'x', searchEndpointUrl: 'https://search.example.test/', videoEl: player as unknown as HTMLVideoElement, autoSelectFirst: true, signal: controller.signal })).rejects.toThrow();
    expect(player.pause).not.toHaveBeenCalled();
    player.pause.mockImplementation(() => { throw new Error('pause failed'); });
    expect(() => clearViewportVideoElement(player as unknown as HTMLVideoElement)).toThrow('pause failed');
    expect(player.removeAttribute).toHaveBeenCalledWith('src');
    expect(player.load).toHaveBeenCalledOnce();
  });
});
