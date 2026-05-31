import { describe, expect, it } from 'vitest';
import { makeCapability } from '../src/capability';
import { bottom, label, sink, source } from '../src/label';
import { makeLabeledMemory, makeMemoryCaps } from '../src/labeled-memory';
import { Vat } from '../src/vat';

describe('labeled memory (#16)', () => {
  it("stores the writer's label and returns it on recall", () => {
    const mem = makeLabeledMemory();
    mem.write('k', 'v', label(['customer-db']));
    const e = mem.recall('k');
    expect(e?.value).toBe('v');
    expect([...(e?.label.secrecy ?? [])]).toContain('customer-db');
  });

  it('the write cap stamps the CURRENT turn label (supplied by the trusted vat, not the model)', async () => {
    const store = makeLabeledMemory();
    const caps = makeMemoryCaps(store);
    const readDb = makeCapability({ kind: 'read', clearance: source(), invoke: () => ({ value: 'x', label: label(['secret-x']) }) });
    const a = new Vat('A');
    a.endow('read', readDb);
    a.endow('remember', caps.write);
    a.beginTurn();
    await a.act('read', undefined);
    a.beginTurn();
    await a.act('remember', { key: 'n', value: 'v' });
    expect([...(store.recall('n')?.label.secrecy ?? [])]).toContain('secret-x');
  });

  it('a recalled secret re-taints a fresh session and the send is blocked', async () => {
    const store = makeLabeledMemory();
    const caps = makeMemoryCaps(store);
    const readDb = makeCapability({ kind: 'read', clearance: source(), invoke: () => ({ value: 'x', label: label(['customer-db']) }) });
    const sentLog: unknown[] = [];
    const send = makeCapability({
      kind: 'send',
      clearance: sink([], true),
      invoke: (a) => ((sentLog.push(a), { value: 'sent', label: bottom() })),
    });

    const a = new Vat('A');
    a.endow('read', readDb);
    a.endow('remember', caps.write);
    a.beginTurn();
    await a.act('read', undefined);
    a.beginTurn();
    await a.act('remember', { key: 'n', value: 'note' });

    const b = new Vat('B'); // a fresh session, clean context, shares the memory
    b.endow('recall', caps.recall);
    b.endow('send', send);
    b.beginTurn();
    await b.act('recall', { key: 'n' });
    expect([...b.currentLabel().secrecy]).toContain('customer-db');
    const r = await b.act('send', { to: 'x' });
    expect(r.ok).toBe(false);
    expect(sentLog.length).toBe(0);
  });

  it('a plain (unlabeled) store would leak — the bug labeled memory fixes', async () => {
    const plain = new Map<string, unknown>();
    const write = makeCapability({ kind: 'w', clearance: source(), invoke: (a) => { const { key, value } = a as { key: string; value: unknown }; plain.set(key, value); return { value: 'ok', label: bottom() }; } });
    const recall = makeCapability({ kind: 'r', clearance: source(), invoke: (a) => ({ value: plain.get((a as { key: string }).key) ?? null, label: bottom() }) });
    const sentLog: unknown[] = [];
    const send = makeCapability({ kind: 'send', clearance: sink([], true), invoke: (a) => ((sentLog.push(a), { value: 'sent', label: bottom() })) });
    const readDb = makeCapability({ kind: 'read', clearance: source(), invoke: () => ({ value: 'x', label: label(['customer-db']) }) });

    const a = new Vat('A');
    a.endow('read', readDb);
    a.endow('w', write);
    a.beginTurn();
    await a.act('read', undefined);
    a.beginTurn();
    await a.act('w', { key: 'n', value: 'note' });

    const b = new Vat('B');
    b.endow('r', recall);
    b.endow('send', send);
    b.beginTurn();
    await b.act('r', { key: 'n' });
    expect([...b.currentLabel().secrecy]).toHaveLength(0); // label lost
    const r = await b.act('send', { to: 'x' });
    expect(r.ok).toBe(true); // leaks
    expect(sentLog.length).toBe(1);
  });
});
