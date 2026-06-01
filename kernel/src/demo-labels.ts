/**
 * Milestone — the full label lattice + declassification-as-capability (decentralized IFC).
 *
 * Run: `pnpm demo:labels`
 *
 * Shows the label system as the real two-axis lattice it is, and then the unification: the right to
 * declassify is itself a capability, so the capability graph (least authority) and the label lattice
 * (least knowledge) are the SAME graph.
 *
 *   A. Compartments don't cross — `medical` data can't reach a `salaries`-cleared sink, and vice versa.
 *   B. Mixing joins labels — read both, and the turn carries BOTH tags; only an all-clearing sink takes it.
 *   C. The taint axis — `untrusted-web` data needs ENDORSEMENT before a trusted action.
 *   D. Declassify is a scoped capability — a `medical`-only privilege lowers `medical` and nothing else.
 *   E. The (a) axiom governs IFC — without the privilege, you cannot declassify; holding it, you can.
 */
import './bootstrap.ts';
import { makeCapability } from './capability.ts';
import { bottom, fmtLabel, label, sink, source } from './label.ts';
import { declassify, endorse, makePrivilege } from './privilege.ts';
import { Vat } from './vat.ts';

// (helpers `sentPub` etc. and caps are defined in main)

function bar(): void {
  console.log('─'.repeat(86));
}

async function main(): Promise<void> {
  console.log('\nAEGIS · the label lattice + declassification-as-capability');
  bar();

  // Two confidential compartments + an untrusted source + differently-cleared sinks.
  const sentMed: unknown[] = [];
  const sentSal: unknown[] = [];
  const sentPub: unknown[] = [];

  const readMedical = makeCapability({ kind: 'read_medical', clearance: source(), invoke: () => ({ value: 'BP 120/80', label: label(['medical'], []) }) });
  const readSalaries = makeCapability({ kind: 'read_salaries', clearance: source(), invoke: () => ({ value: 'Alice 200k', label: label(['salaries'], []) }) });
  const readWeb = makeCapability({ kind: 'read_web', clearance: source(), invoke: () => ({ value: '<malicious page>', label: label([], ['untrusted-web']) }) });

  const sendToMedical = makeCapability({ kind: 'send_medical', clearance: sink(['medical'], false), invoke: (a) => ((sentMed.push(a), { value: 'ok', label: bottom() })) });
  const sendToSalaries = makeCapability({ kind: 'send_salaries', clearance: sink(['salaries'], false), invoke: (a) => ((sentSal.push(a), { value: 'ok', label: bottom() })) });
  const sendPublic = makeCapability({ kind: 'send_public', clearance: sink([], true), invoke: (a) => ((sentPub.push(a), { value: 'ok', label: bottom() })) });

  const checks: Array<[string, boolean]> = [];

  // ── A. compartments don't cross ───────────────────────────────────────────────────────────────
  {
    const v = new Vat('A');
    v.endow('read_medical', readMedical); v.endow('send_salaries', sendToSalaries); v.endow('send_medical', sendToMedical);
    v.beginTurn();
    await v.act('read_medical', undefined); // turn now carries `medical`
    const toSal = await v.act('send_salaries', 'x'); // salaries-cleared sink rejects medical data
    const toMed = await v.act('send_medical', 'x');  // medical-cleared sink accepts it
    console.log(`\n  A. read medical → send to salaries-sink: ${toSal.ok ? 'ALLOWED?!' : 'BLOCKED'}; to medical-sink: ${toMed.ok ? 'ALLOWED' : 'blocked'}`);
    checks.push(['compartments do not cross: medical data blocked at a salaries-cleared sink', !toSal.ok && toMed.ok]);
  }

  // ── B. mixing joins labels ────────────────────────────────────────────────────────────────────
  {
    const sendBoth = makeCapability({ kind: 'send_both', clearance: sink(['medical', 'salaries'], false), invoke: () => ({ value: 'ok', label: bottom() }) });
    const v = new Vat('B');
    v.endow('read_medical', readMedical); v.endow('read_salaries', readSalaries);
    v.endow('send_medical', sendToMedical); v.endow('send_both', sendBoth);
    v.beginTurn();
    await v.act('read_medical', undefined);
    await v.act('read_salaries', undefined); // turn now carries BOTH
    console.log(`  B. after reading both, turn label = ${fmtLabel(v.currentLabel())}`);
    const toMedOnly = await v.act('send_medical', 'x'); // cleared for medical only → blocked (salaries leaks)
    const toBoth = await v.act('send_both', 'x');       // cleared for both → allowed
    checks.push(['mixing joins labels: a medical-only sink rejects medical+salaries; an all-cleared sink accepts', !toMedOnly.ok && toBoth.ok]);
  }

  // ── C. the taint axis: untrusted input needs endorsement ──────────────────────────────────────
  {
    const v = new Vat('C');
    v.endow('read_web', readWeb); v.endow('send_public', sendPublic);
    v.beginTurn();
    await v.act('read_web', undefined); // turn now tainted `untrusted-web`
    const unendorsed = await v.act('send_public', 'x');                 // public sink requires endorsement
    const endorsedSend = await v.act('send_public', 'x', { endorsed: true }); // explicitly endorsed → allowed
    console.log(`  C. untrusted-web → public sink: unendorsed=${unendorsed.ok ? 'ALLOWED?!' : 'BLOCKED'}, endorsed=${endorsedSend.ok ? 'ALLOWED' : 'blocked'}`);
    checks.push(['taint axis: untrusted action blocked until endorsed', !unendorsed.ok && endorsedSend.ok]);
  }

  // ── D & E. declassify is a scoped capability; the (a) axiom governs IFC ───────────────────────
  {
    // A privilege that may declassify ONLY `medical`. (Held like any cap.)
    const medPriv = makePrivilege({ declassifies: ['medical'] });

    const mixed = label(['medical', 'salaries'], []);
    const afterMed = declassify(mixed, medPriv);           // removes medical, leaves salaries
    console.log(`\n  D. declassify {med,sal} with a medical-only privilege → ${fmtLabel(afterMed)}`);
    checks.push(['declassify is SCOPED: medical-privilege lowers medical only, not salaries', !afterMed.secrecy.has('medical') && afterMed.secrecy.has('salaries')]);

    // The (a) axiom for IFC: you can only lower a tag you hold the privilege for.
    const salFromMed = declassify(label(['salaries'], []), medPriv); // privilege doesn't own salaries
    checks.push(['(a) axiom governs IFC: no privilege for salaries ⇒ cannot lower it', salFromMed.secrecy.has('salaries')]);

    // Endorsement-as-capability too: an endorse privilege clears a specific taint.
    const webEndorse = makePrivilege({ endorses: ['untrusted-web'] });
    const cleared = endorse(label([], ['untrusted-web', 'untrusted-email']), webEndorse);
    console.log(`  E. endorse [untrusted-web,untrusted-email] with a web-only privilege → ${fmtLabel(cleared)}`);
    checks.push(['endorse is scoped too: clears untrusted-web only, leaves untrusted-email', !cleared.taints.has('untrusted-web') && cleared.taints.has('untrusted-email')]);
  }

  // ── F. the vat DERIVES endorsement from held privileges (no ambient flag) ─────────────────────
  {
    // Vat WITHOUT the privilege: tainted send is blocked. Vat WITH it: the same send passes — because
    // it HOLDS endorse('untrusted-web'), not because anyone passed an `endorsed: true` flag.
    const mkVat = (withPriv: boolean): Vat => {
      const v = new Vat(withPriv ? 'F-priv' : 'F-noPriv');
      v.endow('read_web', readWeb);
      v.endow('send_public', sendPublic);
      if (withPriv) v.grantPrivilege(makePrivilege({ endorses: ['untrusted-web'] }));
      return v;
    };
    const noPriv = mkVat(false);
    noPriv.beginTurn(); await noPriv.act('read_web', undefined);
    const blockedNoPriv = await noPriv.act('send_public', 'x');

    const withPriv = mkVat(true);
    withPriv.beginTurn(); await withPriv.act('read_web', undefined);
    const allowedWithPriv = await withPriv.act('send_public', 'x');

    console.log(`\n  F. tainted send — vat without endorse-priv: ${blockedNoPriv.ok ? 'ALLOWED?!' : 'BLOCKED'}; vat holding endorse('untrusted-web'): ${allowedWithPriv.ok ? 'ALLOWED' : 'blocked'}`);
    checks.push(['the vat DERIVES endorsement from a held privilege — no ambient flag', !blockedNoPriv.ok && allowedWithPriv.ok]);
  }

  bar();
  console.log('\nGUARANTEES:');
  let allOk = true;
  for (const [name, ok] of checks) {
    console.log(`  ${ok ? '✅ PASS' : '❌ FAIL'}  ${name}`);
    allOk &&= ok;
  }
  bar();
  console.log(
    allOk
      ? '\n✅ ALL GUARANTEES HELD — the lattice is real, and declassification is a scoped capability: ' +
        'the authority graph and the label lattice are one graph.\n'
      : '\n❌ A GUARANTEE FAILED.\n',
  );
  process.exitCode = allOk ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
