import { describe, expect, it } from 'vitest';
import { bottom, label, sink, source } from '../src/label';
import { makeKernel } from '../src/microkernel';

const ctx = (taints: string[] = []) => ({ requesterLabel: label([], taints), requester: 't' });

describe('microkernel', () => {
  it('a handle exposes only metadata and cannot be invoked off-path', () => {
    const k = makeKernel();
    let ran = 0;
    const h = k.mint({ kind: 'x', clearance: source(), effect: () => ((ran += 1), { value: 'ok', label: bottom() }) });
    expect(Object.keys(h).sort()).toEqual(['clearance', 'id', 'kind']);
    expect((h as unknown as Record<string, unknown>)['effect']).toBeUndefined();
    expect(() => (h as unknown as () => void)()).toThrow();
    expect(ran).toBe(0);
  });

  it('kernel.invoke is the only door to authority', async () => {
    const k = makeKernel();
    let ran = 0;
    const h = k.mint({ kind: 'x', clearance: source(), effect: () => ((ran += 1), { value: 'ok', label: bottom() }) });
    const r = await k.invoke(h, undefined, ctx());
    expect(ran).toBe(1);
    expect((r as { value: unknown }).value).toBe('ok');
  });

  it('enforces the flow gate inside the kernel', async () => {
    const k = makeKernel();
    const h = k.mint({ kind: 'send', clearance: sink([], true), effect: () => ({ value: 'sent', label: bottom() }) });
    await expect(k.invoke(h, undefined, ctx(['untrusted-web']))).rejects.toThrow();
  });

  it('cascading revocation: revoke parent kills the derived cap', async () => {
    const k = makeKernel();
    const h = k.mint({ kind: 'x', clearance: source(), effect: () => ({ value: 'ok', label: bottom() }) });
    const d = k.attenuate(h, {});
    await k.invoke(d, undefined, ctx());
    k.revoke(h);
    await expect(k.invoke(d, undefined, ctx())).rejects.toThrow();
  });
});
