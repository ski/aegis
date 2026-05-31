/**
 * Milestone — trusted clock + leases (issue #30).
 *
 * Run: `pnpm demo:clock`
 *
 * Leases and ephemerality depend on a time source. If a compromised component could supply or advance
 * time, it would defeat expiry. So the kernel owns ONE trusted clock: leases are measured against it,
 * effects never read it, and an agent never supplies a timestamp — so expiry cannot be forged. Here we
 * inject a controllable clock to drive expiry deterministically and show the agent cannot influence it.
 */
import './bootstrap';
import { bottom, source } from './label';
import { makeKernel } from './microkernel';

function bar(): void {
  console.log('─'.repeat(86));
}
const ctx = { requesterLabel: bottom(), requester: 'demo' };

async function main(): Promise<void> {
  console.log('\nAEGIS · trusted clock + leases · expiry the agent cannot forge (#30)');
  bar();

  // The trusted base owns the clock. The agent has no reference to it.
  let now = 1_000;
  const trustedClock = (): number => now;
  const kernel = makeKernel(trustedClock);

  let uses = 0;
  const base = kernel.mint({ kind: 'session', clearance: source(), effect: () => ((uses += 1), { value: 'ok', label: bottom() }) });
  const leased = kernel.attenuate(base, { kind: 'session_token', ttlMs: 100 }); // expires at now+100 = 1100
  const permanent = kernel.attenuate(base, { kind: 'permanent' }); // no ttl

  console.log(`\n  clock=${now}: leased token minted with a 100ms lease (expires at 1100)`);
  await kernel.invoke(leased, undefined, ctx);
  console.log(`  clock=${now}: invoke leased → OK`);

  now = 1_050;
  await kernel.invoke(leased, undefined, ctx);
  console.log(`  clock=${now}: invoke leased → OK (still within lease)`);

  now = 1_200; // the trusted clock advances past the lease
  let expired = false;
  try {
    await kernel.invoke(leased, undefined, ctx);
  } catch {
    expired = true;
  }
  console.log(`  clock=${now}: invoke leased → ${expired ? 'EXPIRED (rejected)' : 'still ok?!'}`);

  // the permanent cap is unaffected by the clock
  await kernel.invoke(permanent, undefined, ctx);
  console.log(`  clock=${now}: invoke permanent (no lease) → OK`);

  // the agent cannot forge time: invoke takes no timestamp, and the agent has no clock reference
  const invokeArity = kernel.invoke.length; // (handle, arg, ctx) — no time parameter
  console.log(`  invoke() takes ${invokeArity} args (handle, arg, ctx) — no timestamp the agent could supply`);

  bar();
  const checks: Array<[string, boolean]> = [
    ['a leased cap works within its lease', uses >= 2],
    ['the trusted clock advancing past the lease expires the cap', expired],
    ['a non-leased cap is unaffected by the clock', uses === 3],
    ['expiry is measured by the kernel clock; the agent supplies no time', invokeArity === 3],
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
      ? '\n✅ ALL GUARANTEES HELD — leases expire against one trusted clock the agent cannot reach or forge.\n'
      : '\n❌ A GUARANTEE FAILED.\n',
  );
  process.exitCode = allOk ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
