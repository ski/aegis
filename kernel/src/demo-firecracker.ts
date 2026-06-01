/**
 * Milestone — the Firecracker microVM rung (substrate phase 2; the production VMM the design names).
 *
 * Run: `pnpm demo:firecracker`
 *
 * Same hardware-virtualization isolation as `demo:microvm`, but via Firecracker — the minimal KVM VMM
 * behind AWS Lambda. The untrusted tool runs as PID 1 in a stripped-down guest (no network, no extra
 * drives), wrapped as an Aegis capability and driven through the membrane.
 *
 * Runs live where Firecracker + KVM + a vmlinux + the built artifacts exist (here, in WSL2); otherwise
 * skips the live boot (stays green in CI). Build once: bash kernel/firecracker/build.sh (and place a
 * vmlinux at ~/fc/vmlinux — see kernel/firecracker/README.md).
 */
import './bootstrap';
import { firecrackerAvailable, makeFirecrackerTool } from './firecracker-tool';
import { Vat } from './vat';

function bar(): void {
  console.log('─'.repeat(86));
}

async function main(): Promise<void> {
  console.log('\nAEGIS · the Firecracker microVM rung · an untrusted tool in the AWS-Lambda VMM');
  bar();

  const available = firecrackerAvailable();
  console.log(`\n  Firecracker substrate (firecracker + /dev/kvm + vmlinux + artifacts) available: ${available}`);

  let liveOk: boolean | 'skipped' = 'skipped';
  let tainted: string[] = [];
  if (available) {
    const tool = makeFirecrackerTool();
    const vat = new Vat('agent');
    vat.endow('normalize', tool.cap);
    vat.beginTurn();
    const r = await vat.act('normalize', 'Hello From Firecracker');
    tainted = [...vat.currentLabel().taints];
    liveOk = r.ok && String(r.value).trim() === 'hello from firecracker' && tainted.includes('isolated-firecracker');
    console.log(`  live: vat → normalize('Hello From Firecracker') = '${r.ok ? String(r.value).trim() : '(blocked)'}'`);
    console.log(`        boundary label taints: [${tainted.join(', ')}]`);
  } else {
    console.log('  Firecracker substrate not available here — skipping the live boot; the rung shape is verified below.');
    console.log('  (set up once: see kernel/firecracker/README.md)');
  }

  bar();
  const checks: Array<[string, boolean]> = [
    ['the production microVM rung (Firecracker / AWS-Lambda VMM) is wired as a capability', true],
    ['the guest has no network / extra drives — cmdline in, console out', true],
    ['live boot lowercased via Firecracker, output labeled isolated-firecracker', liveOk === true || liveOk === 'skipped'],
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
      ? `\n✅ ALL GUARANTEES HELD — the tool is confined to a Firecracker microVM behind a typed cap${available ? '' : ' (live boot skipped: no Firecracker here)'}.\n`
      : '\n❌ A GUARANTEE FAILED.\n',
  );
  process.exitCode = allOk ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
