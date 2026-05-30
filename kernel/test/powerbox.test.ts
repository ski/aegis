import { describe, expect, it } from 'vitest';
import { makeCapability } from '../src/capability';
import { bottom, label, source } from '../src/label';
import type { Grantable, OperatorConsole } from '../src/powerbox';
import { Powerbox } from '../src/powerbox';
import { Vat } from '../src/vat';

function setup(): { pb: Powerbox } {
  const cap = makeCapability({ kind: 'add_event', clearance: source(), invoke: () => ({ value: 'ok', label: bottom() }) });
  const domain = new Map<string, Grantable>([['add_event', { cap, sensitivity: 'low', description: 'Add an event' }]]);
  const operator: OperatorConsole = { decide: () => true };
  return { pb: new Powerbox(domain, operator) };
}

describe('powerbox + trusted path', () => {
  it('denies an out-of-domain request without consulting the operator', async () => {
    const { pb } = setup();
    const v = new Vat('a');
    v.attachPowerbox(pb);
    v.beginTurn();
    const r = await v.act('request_capability', { petname: 'charge_card' });
    expect(r.ok).toBe(false);
    expect(pb.operatorConsultations).toBe(0);
  });

  it('auto-denies a tainted (manufactured) request without consulting the operator', async () => {
    const { pb } = setup();
    const fetchPage = makeCapability({ kind: 'fetch', clearance: source(), invoke: () => ({ value: 'x', label: label([], ['untrusted-web']) }) });
    const v = new Vat('a');
    v.attachPowerbox(pb);
    v.endow('fetch', fetchPage);
    v.beginTurn();
    await v.act('fetch', undefined); // taint the context
    v.beginTurn();
    const r = await v.act('request_capability', { petname: 'add_event' });
    expect(r.ok).toBe(false);
    expect(pb.operatorConsultations).toBe(0);
  });

  it('grants a clean in-domain request via the operator; usable only after approval', async () => {
    const { pb } = setup();
    const v = new Vat('a');
    v.attachPowerbox(pb);
    v.beginTurn();
    expect((await v.act('add_event', undefined)).ok).toBe(false); // cannot self-grant
    v.beginTurn();
    expect((await v.act('request_capability', { petname: 'add_event' })).ok).toBe(true);
    v.beginTurn();
    expect((await v.act('add_event', undefined)).ok).toBe(true);
    expect(pb.operatorConsultations).toBe(1);
  });
});
