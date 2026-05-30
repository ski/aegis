import { describe, expect, it } from 'vitest';
import { flowCheck, join, label, sink, source } from '../src/label';

describe('information-flow labels', () => {
  it('a source never gates flow', () => {
    expect(flowCheck(label(['secret'], ['untrusted']), source()).ok).toBe(true);
  });

  it('a sink blocks secrecy it is not cleared for', () => {
    const v = flowCheck(label(['customer-db']), sink([], false));
    expect(v.ok).toBe(false);
    expect(v.reasons.some((r) => r.startsWith('confidentiality'))).toBe(true);
  });

  it('a sink blocks tainted data that needs endorsement', () => {
    const v = flowCheck(label([], ['untrusted-web']), sink([], true));
    expect(v.ok).toBe(false);
    expect(v.reasons.some((r) => r.startsWith('integrity'))).toBe(true);
  });

  it('a sink allows cleared, endorsed flow', () => {
    expect(flowCheck(label([], ['x']), sink([], true), true).ok).toBe(true);
    expect(flowCheck(label(['ok']), sink(['ok'], true)).ok).toBe(true);
  });

  it('join unions both axes', () => {
    const j = join(label(['a'], ['x']), label(['b'], ['y']));
    expect([...j.secrecy].sort()).toEqual(['a', 'b']);
    expect([...j.taints].sort()).toEqual(['x', 'y']);
  });
});
