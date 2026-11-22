import { describe, expect, it } from 'vitest';
import { contextualConversation, ledgerNote, scenarioSnapshot, transportNote, type WorkspaceSnapshot } from '../workspace-state';

const snapshot: WorkspaceSnapshot = {
  panel: 'mesh',
  registry: { status: 'available', enrolled: 2, activeTrust: 1, selectedNodeId: 'node-b' },
  routing: { max_llm: 'configured', neural: 'unconfigured', solver: 'unknown' },
  scenario: scenarioSnapshot(2, 3),
  ledger: ledgerNote,
  transport: transportNote,
};

describe('BEEMAX HUD message context', () => {
  it('adds the current snapshot to the latest prompt without changing the conversation history', () => {
    const history = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'How can I help?' },
      { role: 'user', content: 'Which node is selected?' },
    ] as const;
    const messages = contextualConversation([...history], snapshot);
    expect(messages.slice(0, 2)).toEqual(history.slice(0, 2));
    expect(messages.at(-1)?.content).toContain('"panel":"ICV Mesh"');
    expect(messages.at(-1)?.content).toContain('"selectedNodeId":"node-b"');
    expect(messages.at(-1)?.content).toContain('"neural:":"unconfigured"');
    expect(messages.at(-1)?.content).toContain('"tetration":16');
    expect(messages.at(-1)?.content.endsWith(history[2].content)).toBe(true);
  });

  it('pairs orchestration with live viewport evidence and preserves the final research command', () => {
    const state: WorkspaceSnapshot = {
      ...snapshot, activeRoute: 'solver', viewport: { mode: 'MAX Renderings', rendering: 'MAX-SPORTS', sourceSet: false },
    };
    const response = contextualConversation([{ role: 'user', content: 'What is ready?' }], state);
    expect(response[0].content).toContain('MAX-FORCE');
    expect(response[0].content).toContain('MAX-REALITY');
    expect(response[0].content).toContain('"rendering":"MAX-SPORTS"');
    expect(response[0].content).toContain('"activeRoute":"solver:"');
    const research = { role: 'user', content: '/research orbital compute' } as const;
    expect(contextualConversation([...response, research], state)).toEqual([research]);
    expect(contextualConversation([], state)).toEqual([]);
  });

  it('keeps a full length prompt intact and trims older complete turns to fit the chat API', () => {
    const prompt = { role: 'user', content: 'x'.repeat(6000) } as const;
    const reply = { role: 'assistant', content: 'y'.repeat(6000) } as const;
    const messages = contextualConversation([prompt, reply, prompt, reply, prompt], snapshot);
    expect(messages.slice(0, 2)).toEqual([prompt, reply]);
    expect(messages).toHaveLength(4);
    expect(messages.at(-2)?.content).toContain('PORTAL-OS1 HUD snapshot');
    expect(messages.at(-1)).toEqual(prompt);
    expect(messages.reduce((length, message) => length + message.content.length, 0)).toBeLessThanOrEqual(24000);
  });
});
