import { describe, expect, it } from 'vitest';
import type { Topology } from '../src/topology';
import { checkSeparationOfDuties } from '../src/topology';

const reader = { kind: 'vat', id: 'reader', sources: [{ name: 'db', emits: ['customer-db'] }] } as const;
const sender = { kind: 'vat', id: 'sender', sinks: [{ name: 'out', allows: [] as string[] }] } as const;

describe('global separation of duties', () => {
  it('rejects a direct secret → uncleared-sink path', () => {
    const topo: Topology = { nodes: [reader, sender], edges: [{ from: 'reader', to: 'sender' }] };
    expect(checkSeparationOfDuties(topo).ok).toBe(false);
  });

  it('rejects a laundering chain — the invariant is global, not per-vat', () => {
    const topo: Topology = {
      nodes: [reader, { kind: 'vat', id: 'relay' }, sender],
      edges: [{ from: 'reader', to: 'relay' }, { from: 'relay', to: 'sender' }],
    };
    const r = checkSeparationOfDuties(topo);
    expect(r.ok).toBe(false);
    expect(r.violations[0]?.path.length).toBe(3);
  });

  it('accepts when a declassifier strips the secrecy on the path', () => {
    const topo: Topology = {
      nodes: [reader, { kind: 'declassifier', id: 'scrub', removes: ['customer-db'] }, sender],
      edges: [{ from: 'reader', to: 'scrub' }, { from: 'scrub', to: 'sender' }],
    };
    expect(checkSeparationOfDuties(topo).ok).toBe(true);
  });
});
