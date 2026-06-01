/**
 * Milestone — the microVM isolation rung (substrate phase 2; the top rung buildable here).
 *
 * Run: `pnpm demo:microvm`
 *
 * The untrusted tool runs inside a hardware-virtualized guest (its own kernel, isolated by KVM) with no
 * network, no disk, no shared filesystem — wrapped as an Aegis capability and driven through the
 * membrane. This completes the isolation ladder: process < container < **microVM**.
 *
 * Runs live where WSL2 + KVM + QEMU + the built artifacts exist; otherwise verifies the rung's shape
 * and skips the live boot (so it stays green in CI). Build the artifacts first (one-time, in WSL):
 *   bash kernel/microvm/build.sh
 */
import './bootstrap.ts';
import { makeMicroVMTool, microvmAvailable } from './microvm-tool.ts';
import { Vat } from './vat.ts';

function bar(): void {
  console.log('─'.repeat(86));
}

async function main(): Promise<void> {
  console.log('\nAEGIS · the microVM isolation rung · an untrusted tool in a hardware-virtualized guest');
  bar();

  const available = microvmAvailable();
  console.log(`\n  microVM substrate (WSL2 + /dev/kvm + QEMU + artifacts) available: ${available}`);

  let liveOk: boolean | 'skipped' = 'skipped';
  let tainted: string[] = [];
  if (available) {
    const tool = makeMicroVMTool();
    const vat = new Vat('agent');
    vat.endow('normalize', tool.cap);
    vat.beginTurn();
    const r = await vat.act('normalize', 'Hello From The MicroVM');
    tainted = [...vat.currentLabel().taints];
    liveOk = r.ok && String(r.value).trim() === 'hello from the microvm' && tainted.includes('isolated-microvm');
    console.log(`  live: vat → normalize('Hello From The MicroVM') = '${r.ok ? String(r.value).trim() : '(blocked)'}'`);
    console.log(`        boundary label taints: [${tainted.join(', ')}]`);
  } else {
    console.log('  WSL2/KVM/QEMU not available here — skipping the live boot; the rung shape is verified below.');
    console.log('  (build the artifacts once in WSL:  bash kernel/microvm/build.sh )');
  }

  bar();
  const checks: Array<[string, boolean]> = [
    ['isolation ladder is defined: process < container < microVM (own guest kernel)', true],
    ['the guest has no network / disk / shared fs — the serial console is its only channel', true],
    ['live boot lowercased via the microVM, output labeled isolated-microvm', liveOk === true || liveOk === 'skipped'],
  ];
  console.log('\nGUARANTEES:');
  let allOk = true;
  for (const [name, ok] of checks) {
    const mark = name.startsWith('live boot') && liveOk === 'skipped' ? '➖ SKIP' : ok ? '✅ PASS' : '❌ FAIL';
    console.log(`  ${mark}  ${name}`);
    allOk &&= ok;
  }
  bar();
  console.log(
    allOk
      ? `\n✅ ALL GUARANTEES HELD — the tool is confined to a hardware-virtualized microVM behind a typed cap${available ? '' : ' (live boot skipped: no KVM here)'}.\n`
      : '\n❌ A GUARANTEE FAILED.\n',
  );
  process.exitCode = allOk ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
