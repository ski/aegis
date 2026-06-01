/**
 * Milestone — labeled memory (issue #16).
 *
 * Run: `pnpm demo:memory`
 *
 * The across-session leak the in-turn membrane doesn't catch: a secret read in one session, written to
 * memory, and recalled in a LATER session (a fresh vat) on a clean context. With a plain store the
 * recalled value comes back unlabeled and the flow gate lets it leave — the secret escapes. With labeled
 * memory the secrecy survives the round-trip through memory, the recalling turn is re-tainted, and the
 * send is blocked exactly as it would be in-turn.
 */
import './bootstrap.ts';
import { makeCapability } from './capability.ts';
import { bottom, label, sink, source } from './label.ts';
import { makeLabeledMemory, makeMemoryCaps } from './labeled-memory.ts';
import type { Capability } from './capability.ts';
import type { ActResult } from './vat.ts';
import { Vat } from './vat.ts';

function bar(): void {
  console.log('─'.repeat(86));
}

/** The WRONG way: a plain store that drops labels — the leak we are closing. */
function makeNaiveMemoryCaps(): { write: Capability; recall: Capability } {
  const store = new Map<string, unknown>();
  const write = makeCapability({
    kind: 'memory_write',
    clearance: source(),
    invoke: (arg) => {
      const { key, value } = arg as { key: string; value: unknown };
      store.set(key, value); // label discarded
      return { value: 'written', label: bottom() };
    },
  });
  const recall = makeCapability({
    kind: 'memory_recall',
    clearance: source(),
    invoke: (arg) => {
      const { key } = arg as { key: string };
      return { value: store.get(key) ?? null, label: bottom() }; // comes back UNLABELED
    },
  });
  return { write, recall };
}

interface Outcome {
  recallSecrecy: string[];
  send: ActResult;
  exfiltrated: number;
}

/** Session A writes a secret-derived note to memory; a later session B recalls it and tries to send. */
async function runTwoSessions(writeCap: Capability, recallCap: Capability): Promise<Outcome> {
  const sentLog: unknown[] = [];
  const readDb = makeCapability({
    kind: 'read_customer_db',
    clearance: source(),
    invoke: () => ({ value: { customers: ['Alice <alice@example.com>'] }, label: label(['customer-db'], []) }),
  });
  const sendExternal = makeCapability({
    kind: 'send_external',
    clearance: sink([], true),
    invoke: (arg) => {
      sentLog.push(arg);
      return { value: 'sent', label: bottom() };
    },
  });

  // ── Session A: read the secret, write a note to (shared) memory ──
  const a = new Vat('session-A');
  a.endow('read_customer_db', readDb);
  a.endow('remember', writeCap);
  a.beginTurn();
  await a.act('read_customer_db', undefined); // context now carries 'customer-db'
  a.beginTurn();
  await a.act('remember', { key: 'customer-note', value: 'follow up with the customer next week' });

  // ── Session B: a FRESH context recalls the note and tries to send it out ──
  const b = new Vat('session-B');
  b.endow('recall', recallCap);
  b.endow('send_external', sendExternal);
  b.beginTurn();
  await b.act('recall', { key: 'customer-note' }); // re-absorbs whatever label the store returned
  const recallSecrecy = [...b.currentLabel().secrecy];
  const send = await b.act('send_external', { to: 'partner.example.com' });

  return { recallSecrecy, send, exfiltrated: sentLog.length };
}

async function main(): Promise<void> {
  console.log('\nAEGIS · labeled memory · close the across-session secret leak (#16)');
  bar();

  const naiveCaps = makeNaiveMemoryCaps();
  const naive = await runTwoSessions(naiveCaps.write, naiveCaps.recall);
  console.log('\n  PLAIN store (label dropped):');
  console.log(`    session B recall label secrecy: [${naive.recallSecrecy.join(', ')}]`);
  console.log(`    send_external → ${naive.send.ok ? 'ALLOWED — SECRET LEAKED across sessions' : 'blocked'}`);

  const store = makeLabeledMemory();
  const labeled = makeMemoryCaps(store);
  const safe = await runTwoSessions(labeled.write, labeled.recall);
  const safeBlocked = safe.send.ok ? 'ALLOWED?!' : `BLOCKED (${safe.send.blocked})`;
  console.log('\n  LABELED memory (label preserved):');
  console.log(`    session B recall label secrecy: [${safe.recallSecrecy.join(', ')}]`);
  console.log(`    send_external → ${safeBlocked}`);

  bar();
  const checks: Array<[string, boolean]> = [
    ['plain store loses the label (recall comes back unlabeled)', naive.recallSecrecy.length === 0],
    ['plain store LEAKS the secret across sessions (the bug)', naive.send.ok === true && naive.exfiltrated === 1],
    ['labeled memory preserves the secrecy through the round-trip', safe.recallSecrecy.includes('customer-db')],
    ['labeled memory re-taints the later session on recall', safe.recallSecrecy.includes('customer-db')],
    ['labeled memory BLOCKS the cross-session send at the flow gate', safe.send.ok === false && (safe.send as { blocked: string }).blocked === 'flow'],
    ['nothing leaked with labeled memory', safe.exfiltrated === 0],
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
      ? '\n✅ ALL GUARANTEES HELD — labels survive the round-trip through memory; the across-session leak is closed.\n'
      : '\n❌ A GUARANTEE FAILED.\n',
  );
  process.exitCode = allOk ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
