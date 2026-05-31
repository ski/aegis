/**
 * Milestone — unify labeled memory and the labeled space into one store.
 *
 * Run: `pnpm demo:store`
 *
 * Labeled memory (keyed) and the labeled space (associative) were two interfaces over the same idea.
 * This shows them as ONE store: a value put via the keyed facet is the same entry, with the same label,
 * that the associative facet can see — and both halves keep facet attenuation, label-travel, clearance
 * filtering, and leasing.
 */
import './bootstrap';
import { label, sink } from './label';
import { makeStore } from './store';

function bar(): void {
  console.log('─'.repeat(86));
}

async function main(): Promise<void> {
  console.log('\nAEGIS · one store, two faces · labeled memory (keyed) = labeled space (associative)');
  bar();

  let now = 1_000;
  const store = makeStore(() => now);

  // 1) one store, two interfaces over the SAME entries
  const kv = store.kv({ put: true, get: true, del: true });
  const space = store.space({ read: true });
  kv.put('greeting', 'hello', label([], []));
  const viaKv = kv.get('greeting');
  const viaSpace = space.read({ __key: 'greeting' }); // keyed = associative on the __key field
  console.log(`\n  put via kv → get via kv: '${(viaKv?.fields as { value?: string }).value}'`);
  console.log(`  same entry seen via space.read({__key:'greeting'}): '${(viaSpace?.fields as { value?: string }).value}'`);

  // 2) labels travel through either face
  const kvSecret = store.kv({ put: true });
  kvSecret.put('memo', 'merger plan', label(['confidential'], []));
  const publicSpace = store.space({ read: true, clearance: sink([]) }); // cleared for nothing
  const clearedKv = store.kv({ get: true, clearance: sink(['confidential']) });
  const publicSeesIt = publicSpace.read({ __key: 'memo' }) !== undefined;
  const clearedSeesIt = clearedKv.get('memo') !== undefined;
  console.log(`\n  confidential entry — public space facet sees it: ${publicSeesIt}; cleared kv facet sees it: ${clearedSeesIt}`);

  // 3) leasing applies uniformly
  const ttlKv = store.kv({ put: true, get: true });
  ttlKv.put('otp', '123456', label([], []), { ttlMs: 50 }); // expires at 1050
  const otpLive = ttlKv.get('otp') !== undefined;
  now = 1_100;
  const otpExpired = ttlKv.get('otp') === undefined;
  console.log(`\n  leased kv entry — live at 1000: ${otpLive}; expired at 1100: ${otpExpired}`);

  // 4) attenuation holds on both faces
  let kvReadonlyBlocked = false;
  let spaceReadonlyBlocked = false;
  try { store.kv({ get: true }).put('x', 1, label()); } catch { kvReadonlyBlocked = true; }
  try { store.space({ read: true }).take({}); } catch { spaceReadonlyBlocked = true; }

  bar();
  const checks: Array<[string, boolean]> = [
    ['one store: a keyed put is visible through the associative face', (viaKv?.fields as { value?: string }).value === 'hello' && (viaSpace?.fields as { value?: string }).value === 'hello'],
    ['labels travel + clearance filters through either face', publicSeesIt === false && clearedSeesIt === true],
    ['leasing applies uniformly (keyed entry decays)', otpLive === true && otpExpired === true],
    ['facet attenuation holds on both faces (kv get-only can’t put; space read-only can’t take)', kvReadonlyBlocked && spaceReadonlyBlocked],
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
      ? '\n✅ ALL GUARANTEES HELD — labeled memory and the labeled space are one capability-secure store, two faces.\n'
      : '\n❌ A GUARANTEE FAILED.\n',
  );
  process.exitCode = allOk ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
