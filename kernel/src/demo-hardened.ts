/**
 * Milestone — harden the kernel with Endo (SES lockdown + transitive membrane).
 *
 * Run: `pnpm demo:hardened`
 *
 * Shows the patterns we kept SES-compatible becoming actual SES, and the structural upgrade — a real
 * transitive revocable membrane — that turns "the vat is well-behaved" into "the engine enforces it":
 *
 *   1. lockdown is active — the intrinsics are frozen; you cannot pollute a shared prototype;
 *   2. caps are tamper-proof — SES harden() makes a capability unforgeable and immutable;
 *   3. Far remotables work — ready for caps to marshal over CapTP when distribution lands;
 *   4. the transitive membrane — a sub-cap obtained THROUGH a membrane dies when it is revoked
 *      (cascading revocation), and the raw target cannot be extracted;
 *   5. cascading revocation as a kernel kill-switch — revoke a caretaker and the vat can no longer
 *      use the cap at all.
 */
import './bootstrap.ts'; // lockdown() first
import { Far } from '@endo/far';
import { makeCapability } from './capability.ts';
import { bottom, source } from './label.ts';
import { makeCaretaker, makeMembrane } from './membrane.ts';
import { Vat } from './vat.ts';

function bar(): void {
  console.log('─'.repeat(86));
}

async function main(): Promise<void> {
  console.log('\nAEGIS · harden the kernel with Endo · SES lockdown + transitive membrane');
  bar();

  // 1) lockdown active
  const frozenIntrinsics = Object.isFrozen(Object.prototype);
  let pollutionBlocked = false;
  try {
    (Object.prototype as Record<string, unknown>)['polluted'] = 'x';
  } catch {
    pollutionBlocked = true;
  }
  console.log(`\n  lockdown: Object.prototype frozen = ${frozenIntrinsics}; prototype pollution blocked = ${pollutionBlocked}`);

  // 2) cap is tamper-proof under real SES harden
  const cap = makeCapability({ kind: 'noop', clearance: source(), invoke: () => ({ value: 'ok', label: bottom() }) });
  let capTamperBlocked = false;
  try {
    (cap as unknown as Record<string, unknown>)['invoke'] = () => ({ value: 'pwned', label: bottom() });
  } catch {
    capTamperBlocked = true;
  }
  console.log(`  cap tamper (replace invoke) blocked = ${capTamperBlocked}`);

  // 3) Far remotable — a method-only object, ready to marshal over CapTP later
  const counter = Far('Counter', (() => {
    let n = 0;
    return { inc: () => (n += 1), get: () => n };
  })()) as { inc(): number; get(): number };
  counter.inc();
  counter.inc();
  let farTamperBlocked = false;
  try {
    (counter as unknown as Record<string, unknown>)['inc'] = () => 999;
  } catch {
    farTamperBlocked = true;
  }
  console.log(`  Far remotable works (counter=${counter.get()}); tamper blocked = ${farTamperBlocked}`);

  // 4) transitive membrane + cascading revocation
  const vault = { open: () => ({ read: () => 'treasure' }) };
  const m = makeMembrane(vault);
  const opened = (m.proxy as typeof vault).open(); // a sub-cap obtained THROUGH the membrane
  const beforeRevoke = opened.read();
  m.revoke();
  let serviceDead = false;
  let subcapDead = false;
  try {
    (m.proxy as typeof vault).open();
  } catch {
    serviceDead = true;
  }
  try {
    opened.read();
  } catch {
    subcapDead = true;
  }
  console.log(`\n  membrane: through-membrane read = '${beforeRevoke}'`);
  console.log(`  after revoke → service dead = ${serviceDead}; previously-obtained sub-cap dead = ${subcapDead} (cascading)`);

  // 5) cascading revocation as a kernel kill-switch
  let writes = 0;
  const effect = makeCapability({
    kind: 'do_thing',
    clearance: source(),
    invoke: () => {
      writes += 1;
      return { value: 'done', label: bottom() };
    },
  });
  const caretaker = makeCaretaker(effect);
  const vat = new Vat('agent');
  vat.endow('do_thing', caretaker.cap);

  vat.beginTurn();
  const r1 = await vat.act('do_thing', undefined);
  caretaker.revoke();
  vat.beginTurn();
  const r2 = await vat.act('do_thing', undefined);
  console.log(`\n  vat: do_thing before revoke = ${r1.ok ? 'ALLOWED' : 'blocked'}; after revoke = ${r2.ok ? 'ALLOWED?!' : `BLOCKED (${r2.blocked})`}`);

  // ── Guarantees ────────────────────────────────────────────────────────────────────────────────
  bar();
  const checks: Array<[string, boolean]> = [
    ['lockdown is active: intrinsics frozen, prototype pollution blocked', frozenIntrinsics && pollutionBlocked],
    ['capabilities are tamper-proof under SES harden', capTamperBlocked],
    ['Far remotables work and are tamper-proof (ready for CapTP)', counter.get() === 2 && farTamperBlocked],
    ['membrane is transitive: a cap reached through it works', beforeRevoke === 'treasure'],
    ['cascading revocation: revoke severs the whole subgraph at once', serviceDead && subcapDead],
    ['kernel kill-switch: revoked cap is unusable by the vat, effect did not run', r1.ok && !r2.ok && r2.blocked === 'revoked' && writes === 1],
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
      ? '\n✅ ALL GUARANTEES HELD — the kernel runs on real SES; the membrane makes attenuation and revocation structural.\n'
      : '\n❌ A GUARANTEE FAILED.\n',
  );
  process.exitCode = allOk ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
