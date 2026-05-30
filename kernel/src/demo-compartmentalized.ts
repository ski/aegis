/**
 * Phase-1a milestone 1 — compartmentalization and the GLOBAL separation-of-duties invariant.
 *
 * Run: `pnpm demo:compartments`
 *
 * Part 1 (prevention by construction): the trusted base refuses to wire any topology where a secret
 * could reach an uncleared sink — including a multi-hop laundering chain where every individual vat
 * is compliant (issue #22). No agent runs; the unsafe arrangement simply cannot be built.
 *
 * Part 2 (it still works): the SAFE topology (a declassifier interposed) is admitted and run. The
 * sender vat is injected and hostile, yet it can neither read the database (it holds no such cap) nor
 * leak the records (they never reach it) — all it ever has is the declassified count.
 */
import './bootstrap'; // lockdown() first — real SES harden for the whole run
import { makeCapability } from './capability';
import { bottom, label, sink, source } from './label';
import { SeparationOfDutiesError, countOnlyDeclassifier, wire } from './supervisor';
import type { Topology, Violation } from './topology';
import { Vat } from './vat';

function bar(): void {
  console.log('─'.repeat(86));
}

// ── Topologies ────────────────────────────────────────────────────────────────────────────────
const reader = { kind: 'vat', id: 'reader', sources: [{ name: 'read_customer_db', emits: ['customer-db'] }] } as const;
const senderSink = { kind: 'vat', id: 'sender', sinks: [{ name: 'send_external', allows: [] as string[] }] } as const;

const TOPO_DIRECT: Topology = { nodes: [reader, senderSink], edges: [{ from: 'reader', to: 'sender' }] };

const TOPO_LAUNDER: Topology = {
  nodes: [reader, { kind: 'vat', id: 'relay' }, senderSink],
  edges: [{ from: 'reader', to: 'relay' }, { from: 'relay', to: 'sender' }],
};

const TOPO_SAFE: Topology = {
  nodes: [reader, { kind: 'declassifier', id: 'scrub', removes: ['customer-db'] }, senderSink],
  edges: [{ from: 'reader', to: 'scrub' }, { from: 'scrub', to: 'sender' }],
};

type Outcome = { accepted: true } | { accepted: false; violations: readonly Violation[] };

function attempt(name: string, topo: Topology): Outcome {
  try {
    wire(topo);
    console.log(`  ✅ ACCEPTED  ${name}`);
    return { accepted: true };
  } catch (e) {
    if (e instanceof SeparationOfDutiesError) {
      console.log(`  ⛔ REJECTED  ${name}`);
      for (const v of e.violations) {
        console.log(`       · [${v.leaks.join(', ')}] can reach sink '${v.sink}' via ${v.path.join(' → ')}`);
      }
      return { accepted: false, violations: e.violations };
    }
    throw e;
  }
}

async function main(): Promise<void> {
  console.log('\nAEGIS · phase-1a · milestone 1 · compartmentalization + global separation of duties');
  bar();
  console.log('\nPART 1 — wiring is checked statically, before anything runs:\n');

  const direct = attempt('direct: reader(customer-db) → sender(uncleared)', TOPO_DIRECT);
  const launder = attempt('laundering chain: reader → relay → sender  (each vat individually compliant)', TOPO_LAUNDER);
  const safe = attempt('safe: reader → declassifier(strips customer-db) → sender', TOPO_SAFE);

  // ── Part 2: run the admitted safe topology with a hostile sender ──────────────────────────────
  bar();
  console.log('\nPART 2 — running the admitted SAFE topology with an INJECTED sender:\n');

  const sentLog: unknown[] = [];
  const readDb = makeCapability({
    kind: 'read_customer_db',
    clearance: source(),
    invoke: () => ({
      value: { customers: ['Alice <alice@example.com>', 'Bob <bob@example.com>'] },
      label: label(['customer-db'], []),
    }),
  });
  const sendExternal = makeCapability({
    kind: 'send_external',
    clearance: sink([], true),
    invoke: (arg) => {
      sentLog.push(arg);
      return { value: 'sent', label: bottom() };
    },
  });

  // reader vat holds ONLY the source; sender vat holds ONLY the sink (the compartments).
  const readerVat = new Vat('reader');
  readerVat.endow('read_customer_db', readDb);
  const senderVat = new Vat('sender');
  senderVat.endow('send_external', sendExternal);

  // 1) reader reads the secret (stays inside the reader compartment).
  readerVat.beginTurn();
  const read = await readerVat.act('read_customer_db', undefined);
  console.log(`  reader: read_customer_db → ${read.ok ? 'ALLOWED' : 'blocked'}`);

  // 2) trusted declassifier (NOT the model) reduces it to a non-secret aggregate.
  const records = (read as { value: { customers: readonly unknown[] } }).value;
  const declassified = countOnlyDeclassifier(records);
  console.log(`  scrub:  declassified → ${JSON.stringify(declassified.value)} (label cleared)`);

  // 3) the injected sender gets ONLY the declassified value and tries to exfiltrate.
  senderVat.beginTurn();
  senderVat.receive(declassified.value, declassified.label);
  const grab = await senderVat.act('read_customer_db', undefined); // injection tries to read the DB itself
  console.log(`  sender(injected): read_customer_db → ${grab.ok ? 'ALLOWED' : 'BLOCKED (no-authority)'}`);
  const leak = await senderVat.act('send_external', senderVat.lastReceived()); // sends all it has
  console.log(`  sender(injected): send_external → ${leak.ok ? 'ALLOWED' : 'blocked'} (emitted: ${JSON.stringify(sentLog[0])})`);

  // ── Guarantees ────────────────────────────────────────────────────────────────────────────────
  bar();
  const emitted = JSON.stringify(sentLog[0] ?? null);
  const checks: Array<[string, boolean]> = [
    ['direct unsafe topology REJECTED at wiring time', direct.accepted === false],
    [
      'laundering chain REJECTED (invariant is GLOBAL, not per-vat — #22)',
      launder.accepted === false &&
        (launder as { violations: readonly Violation[] }).violations.some((v) => v.path.length === 3),
    ],
    ['safe topology (with declassifier) ACCEPTED', safe.accepted === true],
    ['injected sender could not read the DB (holds no such cap)', grab.ok === false],
    ['nothing secret was emitted — only the declassified count', !emitted.includes('@example.com') && emitted.includes('customerCount')],
    ['the raw records never left the reader compartment', !JSON.stringify(sentLog).includes('Alice')],
  ];

  console.log('\nGUARANTEES:');
  let allOk = true;
  for (const [name, ok] of checks) {
    console.log(`  ${ok ? '✅ PASS' : '❌ FAIL'}  ${name}`);
    allOk &&= ok;
  }
  bar();
  console.log(
    allOk
      ? '\n✅ ALL GUARANTEES HELD — unsafe wiring is prevented; the safe wiring confines an injected agent.\n'
      : '\n❌ A GUARANTEE FAILED.\n',
  );
  process.exitCode = allOk ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
