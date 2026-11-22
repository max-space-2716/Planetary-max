import { workspacePanels, type WorkspaceSnapshot } from './workspace-state';

export type WebLookupMode = 'live_route' | 'unwired_honest';

export interface HudContextSnapshot {
  activePage: 'Command' | string;
  activeView: string;
  nodeId?: string;
  routingStatus?: { llm?: string; neural?: string; solver?: string };
  transport: {
    active: 'Cloudflare HTTPS';
    planned: ['P-STEP/1.0', 'MAX-TELECOM'];
  };
}

export interface WebLookupIR {
  action: 'web_check';
  rawPrompt: string;
  query: string;
  mode: WebLookupMode;
  hudSnapshot: HudContextSnapshot;
}

export interface WebLookupResult {
  ok: boolean;
  mode: WebLookupMode;
  query: string;
  summary: string;
  sources: string[];
  lineage: {
    intent: string;
    ir: WebLookupIR;
    resultDigestInputs: {
      signature: 'MaxJ';
      layer: 'Layer 13';
      umbrella: 'OUR umbrella';
      dat: 'DAT-JURREAUISM-v1';
      nodeTag: string;
      utcTimestamp: string;
    };
  };
}

export function lookupHudSnapshot(snapshot: WorkspaceSnapshot): HudContextSnapshot {
  const view = snapshot.panel === 'substrate' && snapshot.viewport
    ? `${workspacePanels[snapshot.panel].label} / ${snapshot.viewport.mode}${snapshot.viewport.rendering ? ` / ${snapshot.viewport.rendering}` : ''}`
    : workspacePanels[snapshot.panel].label;
  return {
    activePage: 'Command',
    activeView: view,
    ...(snapshot.registry.selectedNodeId ? { nodeId: snapshot.registry.selectedNodeId } : {}),
    routingStatus: { llm: snapshot.routing.max_llm, neural: snapshot.routing.neural, solver: snapshot.routing.solver },
    transport: { active: 'Cloudflare HTTPS', planned: ['P-STEP/1.0', 'MAX-TELECOM'] },
  };
}

export function parseWebLookupIntent(
  prompt: string, hudSnapshot: HudContextSnapshot, hasSearchRoute: boolean,
): WebLookupIR | null {
  const trimmed = prompt.trim();
  // Require a word boundary so ordinary prompts such as "search websites" stay in chat.
  const explicit = trimmed.match(/^(?:check|search)\s+(?:the\s+)?web\b(?:\s+(?:for|about)\b)?\s*([\s\S]*)$/i);
  if (!explicit && !hasSearchRoute) return null;
  const query = (explicit ? explicit[1].trim() : trimmed) || 'general current status';
  return { action: 'web_check', rawPrompt: trimmed, query, mode: hasSearchRoute ? 'live_route' : 'unwired_honest', hudSnapshot };
}

export async function runWebLookupFlow(params: {
  prompt: string;
  hudSnapshot: HudContextSnapshot;
  searchEndpointUrl?: string | null;
  nodeTag?: string;
  computeLineagePayload?: (payload: WebLookupResult) => unknown;
  signal?: AbortSignal;
}): Promise<WebLookupResult | null> {
  const endpoint = params.searchEndpointUrl?.trim() || '';
  const ir = parseWebLookupIntent(params.prompt, params.hudSnapshot, Boolean(endpoint));
  if (!ir) return null;

  const lineage: WebLookupResult['lineage'] = {
    intent: params.prompt,
    ir,
    resultDigestInputs: {
      signature: 'MaxJ', layer: 'Layer 13', umbrella: 'OUR umbrella', dat: 'DAT-JURREAUISM-v1',
      nodeTag: params.nodeTag || params.hudSnapshot.nodeId || 'unassigned-node',
      utcTimestamp: new Date().toISOString(),
    },
  };

  let result: WebLookupResult;
  if (!endpoint) {
    result = {
      ok: false, mode: 'unwired_honest', query: ir.query, sources: [],
      summary: `MAX-REALITY check: No live web-search route is currently wired for "${ir.query}". Active transport remains Cloudflare HTTPS (P-STEP/1.0 and MAX-TELECOM are planned). Configure a zero-burn search endpoint to enable live web lookups.`,
      lineage,
    };
  } else {
    const response = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: params.signal,
      body: JSON.stringify({ query: ir.query, ir }),
    });
    if (!response.ok) throw new Error(`Web lookup route failed with HTTP ${response.status}.`);
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object' || !('summary' in data) || typeof data.summary !== 'string' || !data.summary.trim()
      || !('sources' in data) || !Array.isArray(data.sources) || !data.sources.every((source: unknown) => typeof source === 'string')) {
      throw new Error('Web lookup route returned an invalid summary or sources.');
    }
    result = { ok: true, mode: 'live_route', query: ir.query, summary: data.summary, sources: data.sources, lineage };
  }
  params.computeLineagePayload?.(result);
  return result;
}
