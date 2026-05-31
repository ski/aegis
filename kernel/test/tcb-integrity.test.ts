import { describe, expect, it } from 'vitest';
import { attest, digest } from '../src/attestation';
import { bottom, source } from '../src/label';
import { makeKernel } from '../src/microkernel';
import { makePolicyRoot } from '../src/policy';

const ctx = { requesterLabel: bottom(), requester: 't' };

describe('#30 trusted clock + leases', () => {
  it('expires a leased cap against the kernel clock', async () => {
    let now = 1000;
    const k = makeKernel(() => now);
    const base = k.mint({ kind: 'x', clearance: source(), effect: () => ({ value: 'ok', label: bottom() }) });
    const leased = k.attenuate(base, { ttlMs: 100 });
    await expect(k.invoke(leased, undefined, ctx)).resolves.toBeDefined();
    now = 1200;
    await expect(k.invoke(leased, undefined, ctx)).rejects.toThrow();
    // a non-leased cap is unaffected
    await expect(k.invoke(base, undefined, ctx)).resolves.toBeDefined();
  });

  it('invoke takes no timestamp — the agent cannot supply time', () => {
    expect(makeKernel().invoke.length).toBe(3); // (handle, arg, ctx)
  });
});

describe('#29 supply-chain attestation', () => {
  it('attests a genuine artifact and rejects a tampered one', () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const pinned = digest(bytes);
    expect(attest(bytes, pinned).ok).toBe(true);
    const tampered = new Uint8Array(bytes);
    tampered[0] = 9;
    expect(attest(tampered, pinned).ok).toBe(false);
  });
});

describe('#31 policy + upgrade gating', () => {
  it('only the real admin cap can change policy; changes are audited', () => {
    const { store, adminCap } = makePolicyRoot();
    expect(() => store.set('k', 'v', { __adminCap: true }, 'agent')).toThrow(); // forged cap
    expect(store.get('k')).toBeUndefined();
    store.set('k', 'v', adminCap, 'operator');
    expect(store.get('k')).toBe('v');
    expect(store.changeLog.length).toBe(1);
    expect(store.changeLog[0]?.by).toBe('operator');
  });
});
