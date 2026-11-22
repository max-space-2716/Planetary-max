import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookupHudSnapshot, parseWebLookupIntent, runWebLookupFlow, type HudContextSnapshot } from '../web-lookup';
import { ledgerNote, scenarioSnapshot, transportNote, type WorkspaceSnapshot } from '../workspace-state';

const hud: HudContextSnapshot = {
  activePage: 'Command', activeView: 'MAX-SPACE lab / MAX Renderings / MAX-SPORTS', nodeId: 'node-a',
  routingStatus: { llm: 'configured', neural: 'unconfigured', solver: 'unknown' },
  transport: { active: 'Cloudflare HTTPS', planned: ['P-STEP/1.0', 'MAX-TELECOM'] },
};

afterEach(() => vi.unstubAllGlobals());

describe('web lookup', () => {
  it('distinguishes explicit requests from ordinary chat and direct wired queries', () => {
    expect(parseWebLookupIntent('  Check the WEB for orbital news  ', hud, false)).toMatchObject({
      query: 'orbital news', mode: 'unwired_honest', rawPrompt: 'Check the WEB for orbital news',
    });
    expect(parseWebLookupIntent('search web about', hud, false)?.query).toBe('general current status');
    expect(parseWebLookupIntent('search websites for art', hud, false)).toBeNull();
    expect(parseWebLookupIntent('Help plan a release', hud, false)).toBeNull();
    expect(parseWebLookupIntent('orbital news', hud, true)).toMatchObject({ query: 'orbital news', mode: 'live_route' });
  });

  it('maps the actual HUD panel, rendering, node and routing status', () => {
    const snapshot: WorkspaceSnapshot = {
      panel: 'substrate', registry: { status: 'available', enrolled: 1, activeTrust: 1, selectedNodeId: 'node-a' },
      routing: { max_llm: 'configured', neural: 'unconfigured', solver: 'unknown' },
      scenario: scenarioSnapshot(2, 3), ledger: ledgerNote, transport: transportNote,
      viewport: { mode: 'MAX Renderings', rendering: 'MAX-SPORTS', sourceSet: false },
    };
    expect(lookupHudSnapshot(snapshot)).toEqual(hud);
  });

  it('returns an honest result and complete lineage without fetching when unwired', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const result = await runWebLookupFlow({ prompt: 'check the web for astronomy', hudSnapshot: hud });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false, mode: 'unwired_honest', query: 'astronomy', sources: [],
      lineage: { ir: { action: 'web_check', hudSnapshot: hud }, resultDigestInputs: { signature: 'MaxJ', nodeTag: 'node-a' } },
    });
    expect(result?.summary).toContain('No live web-search route');
    expect(result?.lineage.resultDigestInputs.utcTimestamp).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(await runWebLookupFlow({ prompt: 'ordinary chat', hudSnapshot: hud })).toBeNull();
  });

  it('posts the query and IR to a configured route and preserves returned sources', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ summary: 'Found evidence', sources: ['https://example.test/source'] })));
    vi.stubGlobal('fetch', fetchSpy);
    const callback = vi.fn();
    const result = await runWebLookupFlow({
      prompt: 'search web for stars', hudSnapshot: hud, searchEndpointUrl: '/api/search', nodeTag: 'tag', computeLineagePayload: callback,
    });
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [endpoint, options] = fetchSpy.mock.calls[0];
    expect(endpoint).toBe('/api/search');
    expect(JSON.parse(options.body)).toEqual({ query: 'stars', ir: expect.objectContaining({ mode: 'live_route', hudSnapshot: hud }) });
    expect(result).toMatchObject({ ok: true, mode: 'live_route', summary: 'Found evidence', sources: ['https://example.test/source'], lineage: { resultDigestInputs: { nodeTag: 'tag' } } });
    expect(callback).toHaveBeenCalledWith(result);
  });

  it('fails honestly on provider errors or invalid responses', async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sources: [] })));
    vi.stubGlobal('fetch', fetchSpy);
    const params = { prompt: 'check web', hudSnapshot: hud, searchEndpointUrl: '/api/search' };
    await expect(runWebLookupFlow(params)).rejects.toThrow('HTTP 503');
    await expect(runWebLookupFlow(params)).rejects.toThrow('invalid summary or sources');
  });
});
