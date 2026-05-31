/**
 * Milestone — a capability-scoped, labeled, leased tuple space (JavaSpaces ∩ ocap ∩ IFC ∩ leases).
 *
 * Run: `pnpm demo:space`
 *
 * Four properties, together:
 *   A. decoupled coordination + capability scoping — a worker takes a producer's job without either
 *      naming the other, but a facet can only do what it's permitted (read/write/take) and only within
 *      its sub-space scope;
 *   B. labels travel — a consumer that TAKES a confidential entry is re-tainted, so its outbound send is
 *      blocked at the flow gate;
 *   C. label-scoped facets — a reader cleared for nothing cannot even SEE a confidential entry, while a
 *      cleared reader can;
 *   D. leasing — an entry with a TTL decays against the trusted clock and is no longer takeable.
 */
import './bootstrap';
import { makeCapability } from './capability';
import { bottom, label, sink, source } from './label';
import { makeSpace, makeSpaceCaps } from './space';
import { Vat } from './vat';

function bar(): void {
  console.log('─'.repeat(86));
}

async function main(): Promise<void> {
  console.log('\nAEGIS · a capability-scoped, labeled, leased tuple space (JavaSpaces meets ocap)');
  bar();

  let now = 1_000;
  const space = makeSpace(() => now);

  // ── A. decoupled coordination + capability scoping ──────────────────────────────────────────────
  const producer = space.facet({ write: true });
  const worker = space.facet({ take: true, scope: { queue: 'jobs' } }); // can only take jobs
  const observer = space.facet({ read: true }); // read-only

  producer.write({ queue: 'jobs', task: 'resize-image' }, bottom());
  producer.write({ queue: 'audit', event: 'login' }, bottom());

  const job = worker.take({}); // takes a job — never naming the producer
  const auditReach = worker.take({ queue: 'audit' }); // out of the worker's scope → nothing
  let observerCannotTake = false;
  try {
    observer.take({});
  } catch {
    observerCannotTake = true;
  }
  console.log(`\n  A. worker took job '${(job?.fields as { task?: string })?.task}' (decoupled);`);
  console.log(`     worker reaching 'audit' (out of scope) → ${auditReach === undefined ? 'nothing' : 'LEAKED'};`);
  console.log(`     read-only observer take → ${observerCannotTake ? 'denied' : 'allowed?!'}`);

  // ── B. labels travel: a taken confidential entry re-taints the consumer ────────────────────────
  const readSecret = makeCapability({ kind: 'read_secret', clearance: source(), invoke: () => ({ value: 'classified', label: label(['confidential'], []) }) });
  const sentLog: unknown[] = [];
  const sendExternal = makeCapability({ kind: 'send_external', clearance: sink([], true), invoke: (a) => ((sentLog.push(a), { value: 'sent', label: bottom() })) });

  const pCaps = makeSpaceCaps(space.facet({ write: true, scope: { queue: 'results' } }));
  const cCaps = makeSpaceCaps(space.facet({ take: true, scope: { queue: 'results' } }));

  const prod = new Vat('producer');
  prod.endow('read_secret', readSecret);
  prod.endow('space_write', pCaps.write);
  prod.beginTurn();
  await prod.act('read_secret', undefined); // context now confidential
  prod.beginTurn();
  await prod.act('space_write', { fields: { kind: 'report', data: '(derived from secret)' } }); // entry stamped confidential

  const cons = new Vat('consumer');
  cons.endow('space_take', cCaps.take);
  cons.endow('send_external', sendExternal);
  cons.beginTurn();
  await cons.act('space_take', { template: { kind: 'report' } }); // re-absorbs the confidential label
  const consSecrecy = [...cons.currentLabel().secrecy];
  const send = await cons.act('send_external', { to: 'partner.example' });
  console.log(`\n  B. consumer took the result → its label secrecy: [${consSecrecy.join(', ')}];`);
  console.log(`     consumer send_external → ${send.ok ? 'ALLOWED (LEAK)' : `BLOCKED (${send.ok ? '' : send.blocked})`}`);

  // ── C. label-scoped facets ──────────────────────────────────────────────────────────────────────
  space.facet({ write: true, scope: { topic: 'memo' } }).write({ secret: 'merger plan' }, label(['confidential'], []));
  const publicReader = space.facet({ read: true, scope: { topic: 'memo' }, clearance: sink([]) }); // cleared for nothing
  const clearedReader = space.facet({ read: true, scope: { topic: 'memo' }, clearance: sink(['confidential']) });
  const publicSees = publicReader.read({}) !== undefined;
  const clearedSees = clearedReader.read({}) !== undefined;
  console.log(`\n  C. confidential memo — public-cleared reader sees it: ${publicSees}; cleared reader sees it: ${clearedSees}`);

  // ── D. leasing / decay ─────────────────────────────────────────────────────────────────────────
  const lease = space.facet({ write: true, read: true, take: true, scope: { queue: 'ephemeral' } });
  now = 1_000;
  lease.write({ task: 'expiring' }, bottom(), { ttlMs: 50 }); // expires at 1050
  const liveBefore = lease.read({}) !== undefined;
  now = 1_100; // the trusted clock advances past the lease
  const liveAfter = lease.read({}) !== undefined;
  const takeAfter = lease.take({});
  console.log(`\n  D. leased entry — live at clock=1000: ${liveBefore}; live at clock=1100: ${liveAfter}; take after expiry: ${takeAfter === undefined ? 'nothing' : 'got it?!'}`);

  // ── Guarantees ────────────────────────────────────────────────────────────────────────────────
  bar();
  const checks: Array<[string, boolean]> = [
    ['decoupled coordination: worker took a job without naming the producer', (job?.fields as { task?: string })?.task === 'resize-image'],
    ['capability scoping (template): a jobs-worker cannot reach audit entries', auditReach === undefined],
    ['capability scoping (ops): a read-only facet cannot take', observerCannotTake],
    ['labels travel: taking a confidential entry re-taints the consumer', consSecrecy.includes('confidential')],
    ['the flow gate then blocks the consumer’s outbound send', !send.ok && (send as { blocked: string }).blocked === 'flow'],
    ['label-scoped facet: only a cleared reader can see a confidential entry', publicSees === false && clearedSees === true],
    ['leasing: an entry decays against the trusted clock', liveBefore === true && liveAfter === false && takeAfter === undefined],
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
      ? '\n✅ ALL GUARANTEES HELD — decoupled coordination, but scoped by caps, labeled by IFC, and decaying by lease.\n'
      : '\n❌ A GUARANTEE FAILED.\n',
  );
  process.exitCode = allOk ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
