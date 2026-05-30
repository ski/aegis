import { describe, expect, it } from 'vitest';
import { makeMembrane } from '../src/membrane';

describe('transitive revocable membrane', () => {
  it('passes calls through, then revokes the whole subgraph at once', () => {
    const base = { open: () => ({ read: () => 'treasure' }) };
    const m = makeMembrane(base);
    const sub = (m.proxy as typeof base).open(); // a sub-object obtained THROUGH the membrane
    expect(sub.read()).toBe('treasure');

    m.revoke();
    expect(() => (m.proxy as typeof base).open()).toThrow();
    expect(() => sub.read()).toThrow(); // cascading: the previously-obtained sub-cap is dead too
  });
});
