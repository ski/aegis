import { describe, expect, it } from 'vitest';
import { makeCapability } from '../src/capability';
import { bottom, label, sink } from '../src/label';
import { makeSpace, makeSpaceCaps } from '../src/space';
import { Vat } from '../src/vat';

describe('capability-scoped, labeled, leased space', () => {
  it('decoupled write/take by template match', () => {
    const s = makeSpace(() => 0);
    s.facet({ write: true }).write({ q: 'jobs', task: 't1' }, bottom());
    const got = s.facet({ take: true }).take({ q: 'jobs' });
    expect((got?.fields as { task?: string }).task).toBe('t1');
  });

  it('enforces facet permissions', () => {
    const ro = makeSpace(() => 0).facet({ read: true });
    expect(() => ro.take({})).toThrow();
    expect(() => ro.write({ a: 1 }, bottom())).toThrow();
  });

  it('scope confines a facet to its sub-space', () => {
    const s = makeSpace(() => 0);
    s.facet({ write: true }).write({ q: 'audit', e: 'x' }, bottom());
    expect(s.facet({ take: true, scope: { q: 'jobs' } }).take({ q: 'audit' })).toBeUndefined();
  });

  it('labels travel: taking a confidential entry re-taints and blocks the send', async () => {
    const s = makeSpace(() => 0);
    s.facet({ write: true }).write({ k: 'r' }, label(['confidential']));
    const caps = makeSpaceCaps(s.facet({ take: true }));
    const sent: unknown[] = [];
    const send = makeCapability({ kind: 'send', clearance: sink([], true), invoke: (a) => ((sent.push(a), { value: 'ok', label: bottom() })) });
    const v = new Vat('c');
    v.endow('take', caps.take);
    v.endow('send', send);
    v.beginTurn();
    await v.act('take', { template: { k: 'r' } });
    expect([...v.currentLabel().secrecy]).toContain('confidential');
    expect((await v.act('send', {})).ok).toBe(false);
    expect(sent.length).toBe(0);
  });

  it('label-scoped facet hides entries the reader is not cleared for', () => {
    const s = makeSpace(() => 0);
    s.facet({ write: true }).write({ topic: 'm', x: 1 }, label(['confidential']));
    expect(s.facet({ read: true, clearance: sink([]) }).read({ topic: 'm' })).toBeUndefined();
    expect(s.facet({ read: true, clearance: sink(['confidential']) }).read({ topic: 'm' })).toBeDefined();
  });

  it('leased entries decay against the clock', () => {
    let now = 100;
    const s = makeSpace(() => now);
    const f = s.facet({ write: true, read: true });
    f.write({ k: 'e' }, bottom(), { ttlMs: 50 });
    expect(f.read({ k: 'e' })).toBeDefined();
    now = 200;
    expect(f.read({ k: 'e' })).toBeUndefined();
  });
});
