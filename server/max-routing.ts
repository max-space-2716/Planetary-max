import type { Hono, MiddlewareHandler } from 'hono';
import { z } from 'zod';
import { bodyLimit } from 'hono/body-limit';
import { readResponseText } from './bounded-response';
import { routingTargets, type RoutingTarget, type TargetStatus } from '../src/shared/max-routing';

export type RoutingBindings = {
  AI?: { run(model: string, input: { messages: { role: string; content: string }[]; max_tokens: number }): Promise<unknown> };
  BEEMAX_LIMITER?: RateLimit;
  MAX_LLM_MODEL?: string;
  MAX_NEURAL_URL?: string;
  MAX_NEURAL_TOKEN?: string;
  MAX_SOLVER_URL?: string;
  MAX_SOLVER_TOKEN?: string;
};

export const aiProvider = 'Cloudflare Workers AI';
export function aiModel(env: RoutingBindings) {
  return env.MAX_LLM_MODEL?.trim() || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
}

export function responseText(result: unknown): string {
  const text = (result as { response?: unknown })?.response;
  if (typeof text !== 'string' || !text.trim()) throw new Error('Empty or invalid service response');
  return text;
}

function classify(prompt: string): RoutingTarget {
  if (/^(?:solver|neural|llm)\s*:/i.test(prompt)) {
    return /^solver/i.test(prompt) ? 'solver' : /^neural/i.test(prompt) ? 'neural' : 'max_llm';
  }
  if (/\b(?:solve|calculate|optimi[sz]e|equation|integral)\b/i.test(prompt)) return 'solver';
  if (/\b(?:embed(?:ding|dings)?|neural|image classification|vector similarity)\b/i.test(prompt)) return 'neural';
  return 'max_llm';
}

function endpoint(env: RoutingBindings, target: 'neural' | 'solver') {
  const rawUrl = target === 'neural' ? env.MAX_NEURAL_URL : env.MAX_SOLVER_URL;
  const token = (target === 'neural' ? env.MAX_NEURAL_TOKEN : env.MAX_SOLVER_TOKEN)?.trim();
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) return null;
    return { url, token };
  } catch { return null; }
}

function configured(env: RoutingBindings, target: RoutingTarget) {
  return Boolean(env.BEEMAX_LIMITER && (target === 'max_llm' ? env.AI : endpoint(env, target)));
}

const input = z.object({ prompt: z.string().trim().min(1).max(6000) }).strict();
const targets = Object.keys(routingTargets) as RoutingTarget[];
export function registerMaxRouting<E extends { Bindings: RoutingBindings }>(app: Hono<E>, requireAdmin: MiddlewareHandler<E>) {
  app.use('/api/admin/max-routing/*', requireAdmin);
  app.get('/api/admin/max-routing/status', c => c.json({
    targets: targets.map(target => ({ target, status: configured(c.env, target) ? 'configured' : 'unconfigured' })),
  }));
  app.use('/api/admin/max-routing/run', bodyLimit({
    maxSize: 40_000,
    onError: c => c.json({ error: 'Routing request is too large.' }, 413),
  }));
  app.post('/api/admin/max-routing/run', async c => {
    const parsed = input.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Enter a routing prompt of 1–6,000 characters.' }, 400);
    const { prompt } = parsed.data;
    const cleanPrompt = prompt.replace(/^(?:solver|neural|llm)\s*:\s*/i, '');
    if (!cleanPrompt) return c.json({ error: 'Enter a prompt after the target prefix.' }, 400);
    const target = classify(prompt);
    const service = target === 'max_llm' ? null : endpoint(c.env, target);
    const { AI, BEEMAX_LIMITER } = c.env;
    const failure = (status: TargetStatus, error: string) => ({ target, status, error });
    if (!BEEMAX_LIMITER || (target === 'max_llm' ? !AI : !service))
      return c.json(failure('unconfigured', `${routingTargets[target]} is not configured on this Worker.`), 503);
    try {
      if (!(await BEEMAX_LIMITER.limit({ key: 'administrator' })).success) {
        c.header('Retry-After', '60');
        return c.json(failure('rate_limited', 'BEEMAX is busy. Try again in a minute.'), 429);
      }
      let result: unknown;
      if (service) {
        const response = await fetch(service.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json', Accept: 'application/json',
            ...(service.token ? { Authorization: `Bearer ${service.token}` } : {}),
          },
          body: JSON.stringify({ prompt: cleanPrompt }),
          redirect: 'error',
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) {
          await response.body?.cancel();
          throw new Error('Service returned a failure');
        }
        result = JSON.parse(await readResponseText(response, 256_000));
      } else {
        result = await AI!.run(aiModel(c.env), {
          messages: [{ role: 'user', content: cleanPrompt }], max_tokens: 1200,
        });
      }
      return c.json({ target, status: 'connected', message: responseText(result) });
    } catch {
      return c.json(failure('unavailable', `${routingTargets[target]} is unavailable or returned an invalid response.`), 503);
    }
  });
}
