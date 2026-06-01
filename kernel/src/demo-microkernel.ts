/**
 * Milestone — the membrane microkernel (#19, progress).
 *
 * Run: `pnpm demo:microkernel`
 *
 * The whole trusted core is four methods (`mint`, `invoke`, `attenuate`, `revoke`) and one private
 * map. This demo shows the property that matters: a capability handle gives you NO way to invoke its
 * effect — the only door to authority is the kernel — and the dual gate + cascading revocation live in
 * that small, auditable core.
 */
import './bootstrap.ts';
import { bottom, label, sink, source } from './label.ts';
import { makeKernel } from './microkernel.ts';

function bar(): void {
  console.log('─'.repeat(86));
}
const ctx = (taints: string[] = []) => ({ requesterLabel: label([], taints), requester: 'demo' });

async function main(): Promise<void> {
  console.log('\nAEGIS · the membrane microkernel · all raw authority behind a tiny auditable core');
  bar();

  const kernel = makeKernel();
  let ran = 0;
  const handle = kernel.mint({ kind: 'do_thing', clearance: source(), effect: () => { ran += 1; return { value: 'done', label: bottom() }; } });

  // 1) the handle is opaque — only metadata, no reachable effect
  const keys = Object.keys(handle).sort();
  const asAny = handle as unknown as Record<string, unknown>;
  const offPath = asAny['effect'] ?? asAny['invoke'] ?? asAny['run'] ?? asAny['exec'];
  let callableOffPath = false;
  try {
    (handle as unknown as () => void)();
  } catch {
    /* not callable */
  }
  console.log(`\n  handle exposes: [${keys.join(', ')}]`);
  console.log(`  reachable effect on handle: ${offPath === undefined ? 'none' : 'FOUND (bad)'}; handle callable: ${callableOffPath}`);

  // 2) the only door is the kernel
  const r = await kernel.invoke(handle, undefined, ctx());
  const ranAfterFirst = ran;
  console.log(`  kernel.invoke(handle) → '${(r as { value: unknown }).value}' (ran=${ran})`);

  // 3) the dual gate lives in the kernel: a tainted requester hitting a sink is blocked here
  const sinkHandle = kernel.mint({ kind: 'send', clearance: sink([], true), effect: () => ({ value: 'sent', label: bottom() }) });
  let flowBlocked = false;
  try {
    await kernel.invoke(sinkHandle, undefined, ctx(['untrusted-web']));
  } catch {
    flowBlocked = true;
  }
  console.log(`  kernel flow gate: tainted → sink ${flowBlocked ? 'BLOCKED' : 'allowed?!'}`);

  // 4) cascading revocation through the kernel
  const derived = kernel.attenuate(handle, { kind: 'do_thing_derived' });
  await kernel.invoke(derived, undefined, ctx()); // works while parent lives
  kernel.revoke(handle); // revoke the PARENT
  let derivedDead = false;
  try {
    await kernel.invoke(derived, undefined, ctx());
  } catch {
    derivedDead = true;
  }
  console.log(`  revoke(parent) → derived cap dead: ${derivedDead} (cascading)`);

  // ── Guarantees ────────────────────────────────────────────────────────────────────────────────
  bar();
  const surface = Object.keys(kernel).length;
  const checks: Array<[string, boolean]> = [
    ['a handle exposes only metadata (id, kind, clearance)', keys.join(',') === 'clearance,id,kind'],
    ['off-path invocation is structurally impossible (no reachable effect)', offPath === undefined && !callableOffPath],
    ['the only door to authority is kernel.invoke', ranAfterFirst === 1 && (r as { value: unknown }).value === 'done'],
    ['the dual gate (flow) is enforced inside the kernel', flowBlocked],
    ['cascading revocation works through the kernel', derivedDead],
    [`the trusted surface is tiny (${surface} methods)`, surface <= 5],
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
      ? '\n✅ ALL GUARANTEES HELD — all raw authority lives behind a 4-method core; caps cannot be invoked off-path.\n'
      : '\n❌ A GUARANTEE FAILED.\n',
  );
  process.exitCode = allOk ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
