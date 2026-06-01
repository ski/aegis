/**
 * Milestone — control-plane policy + upgrade gating (issue #31).
 *
 * Run: `pnpm demo:policy`
 *
 * Policy (clearances, invariants) is mutable trusted state, so changing it must be at least as guarded
 * as anything it governs. A change requires the unforgeable admin capability — held by the operator,
 * never by an agent — and every change is appended to a tamper-evident log. An injected agent that tries
 * to widen a clearance is refused; the operator's change is applied and recorded.
 */
import './bootstrap.ts';
import { makePolicyRoot } from './policy.ts';

function bar(): void {
  console.log('─'.repeat(86));
}

async function main(): Promise<void> {
  console.log('\nAEGIS · control-plane policy + upgrade gating · only the operator may change policy (#31)');
  bar();

  const { store, adminCap } = makePolicyRoot();
  store.set('send_external.clearance', 'no-secrets', adminCap, 'operator@boot');
  console.log(`\n  initial policy: send_external.clearance = '${store.get('send_external.clearance')}'`);

  // 1) an injected agent tries to widen its own clearance — without the admin cap
  const forgedCap = { __adminCap: true }; // looks the same, but is not the real capability
  let agentRefused = false;
  try {
    store.set('send_external.clearance', 'allow-all-secrets', forgedCap as object, 'agent(injected)');
  } catch {
    agentRefused = true;
  }
  console.log(`  agent attempts to widen clearance with a forged cap → ${agentRefused ? 'REFUSED' : 'applied?!'}`);
  console.log(`  policy after agent attempt: '${store.get('send_external.clearance')}' (unchanged)`);

  // 2) the operator makes a legitimate, audited change with the real admin cap
  store.set('send_external.clearance', 'no-secrets,allow-aggregates', adminCap, 'operator@console');
  console.log(`  operator changes policy with the real admin cap → applied: '${store.get('send_external.clearance')}'`);

  console.log('\n  change log (append-only, audited):');
  for (const c of store.changeLog) console.log(`    · ${c.by}: ${c.key} = ${JSON.stringify(c.value)}`);

  bar();
  const log = store.changeLog;
  const checks: Array<[string, boolean]> = [
    ['an agent cannot change policy without the real admin cap (forgery refused)', agentRefused],
    ['the failed attempt did not mutate policy', store.get('send_external.clearance') !== 'allow-all-secrets'],
    ['the operator can change policy with the admin cap', store.get('send_external.clearance') === 'no-secrets,allow-aggregates'],
    ['every applied change is in the append-only audit log', log.length === 2 && log.every((c) => c.by.startsWith('operator'))],
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
      ? '\n✅ ALL GUARANTEES HELD — policy changes require the operator-held admin cap and are all audited.\n'
      : '\n❌ A GUARANTEE FAILED.\n',
  );
  process.exitCode = allOk ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
