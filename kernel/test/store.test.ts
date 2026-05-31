import { describe, expect, it } from 'vitest';
import { bottom, label, sink } from '../src/label';
import { makeStore } from '../src/store';

describe('unified store (labeled memory ⨯ labeled space)', () => {
  it('a keyed put is the same entry the associative face sees', () => {
    const s = makeStore(() => 0);
    s.kv({ put: true }).put('g', 'hello', bottom());
    expect((s.space({ read: true }).read({ __key: 'g' })?.fields as { value?: string }).value).toBe('hello');
  });

  it('kv put overwrites by key; space write appends', () => {
    const s = makeStore(() => 0);
    const kv = s.kv({ put: true, get: true });
    kv.put('k', 1, bottom());
    kv.put('k', 2, bottom());
    expect((kv.get('k')?.fields as { value?: number }).value).toBe(2);
  });

  it('clearance filters through either face', () => {
    const s = makeStore(() => 0);
    s.kv({ put: true }).put('m', 'x', label(['confidential']));
    expect(s.space({ read: true, clearance: sink([]) }).read({ __key: 'm' })).toBeUndefined();
    expect(s.kv({ get: true, clearance: sink(['confidential']) }).get('m')).toBeDefined();
  });

  it('leasing applies to keyed entries', () => {
    let now = 100;
    const s = makeStore(() => now);
    const kv = s.kv({ put: true, get: true });
    kv.put('otp', '1', bottom(), { ttlMs: 50 });
    expect(kv.get('otp')).toBeDefined();
    now = 200;
    expect(kv.get('otp')).toBeUndefined();
  });

  it('facet attenuation holds on both faces', () => {
    const s = makeStore(() => 0);
    expect(() => s.kv({ get: true }).put('x', 1, bottom())).toThrow();
    expect(() => s.space({ read: true }).take({})).toThrow();
  });
});
