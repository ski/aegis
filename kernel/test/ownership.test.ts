import { describe, expect, it } from 'vitest';
import { makeMint } from '../src/mint.ts';
import { makeDeedRegistry } from '../src/ownership.ts';

describe('money — mint & purse', () => {
  it('conserves value across a payment; cannot overdraw', () => {
    const m = makeMint('coin');
    const a = m.issue(100);
    const b = m.issue(0);
    b.deposit(70, a);
    expect(a.getBalance()).toBe(30);
    expect(b.getBalance()).toBe(70);
    expect(() => b.deposit(999, a)).toThrow(); // insufficient funds
  });

  it('rejects a deposit from a foreign currency', () => {
    const usd = makeMint('usd');
    const eur = makeMint('eur');
    const u = usd.issue(10);
    const e = eur.issue(10);
    expect(() => u.deposit(5, e)).toThrow();
  });
});

describe('ownership — transferable deed (exclusive)', () => {
  it('the deed holder can mint share-caps; sharing keeps the deed', () => {
    const reg = makeDeedRegistry();
    const { deed } = reg.createPost('alice', 'p', 'public');
    expect(deed.mintShareCap().canShare).toBe(true);
    expect(deed.isLive()).toBe(true);
  });

  it('transfer is EXCLUSIVE: the seller’s deed goes inert, the buyer’s is live', () => {
    const reg = makeDeedRegistry();
    const { deed: aliceDeed, revokeDeed: revokeAlice } = reg.createPost('alice', 'p', 'public');
    const { deed: eveDeed } = reg.transfer(aliceDeed, 'eve');
    revokeAlice(); // the exclusive step
    expect(() => aliceDeed.mintShareCap()).toThrow(); // seller lost it
    expect(eveDeed.mintShareCap().canShare).toBe(true); // buyer holds it
  });

  it('an agent can own identically (deed is principal-agnostic)', () => {
    const reg = makeDeedRegistry();
    const { deed } = reg.createPost('alice', 'p', 'public');
    const { deed: agentDeed } = reg.transfer(deed, 'brand-agent-7');
    expect(agentDeed.owner).toBe('brand-agent-7');
    expect(agentDeed.mintShareCap().canShare).toBe(true);
  });
});
