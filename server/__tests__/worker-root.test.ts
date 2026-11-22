import { expect, it, vi } from 'vitest';

vi.mock('cloudflare:workers', () => ({ DurableObject: class {} }));

it('serves the gateway root without touching database, storage, AI, or assets', async () => {
  const { default: worker } = await import('../../src/worker');
  const env = new Proxy({}, {
    get(_target, name) {
      if (['BASE_CHAIN_ID', 'BASE_USDC_ADDRESS', 'RELEASE_ANCHOR_ID'].includes(String(name))) return undefined;
      throw new Error(`Unexpected Worker binding access: ${String(name)}`);
    },
  });
  const response = await worker.fetch(new Request('https://max.test/'), env as never, {} as never);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ chain_id: 8453, write_performed: false });
});
