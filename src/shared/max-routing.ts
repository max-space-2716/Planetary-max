export const routingTargets = {
  max_llm: 'MAX LLM',
  neural: 'Neural',
  solver: 'Solver',
} as const;

export type RoutingTarget = keyof typeof routingTargets;
export type TargetStatus = 'configured' | 'unconfigured' | 'unavailable' | 'connected' | 'rate_limited';

export const researchCommand = /^\/research(?:\s+([\s\S]*))?$/i;
