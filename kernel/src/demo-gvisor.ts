/**
 * Milestone — the gVisor isolation rung (substrate phase 2; fills the gap between Docker and microVM).
 *
 * Run: `pnpm demo:gvisor`
 *
 * The untrusted tool runs inside a gVisor sandbox: its syscalls are intercepted and serviced by runsc's
 * userspace kernel (Go), so it never touches the host Linux kernel directly — a far smaller host attack
 * surface than a plain container, without a full VM. Wrapped as an Aegis capability, driven through the
 * membrane, output labeled by provenance.
 *
 * Isolation ladder: process < container < **gVisor (userspace kernel)** < microVM (own guest kernel).
 *
 * Runs live where runsc exists (here, in WSL2); skips the live run otherwise (stays green in CI).
 */
import './bootstrap';
import { gvisorArgs, gvisorAvailable, makeGvisorTool } from './gvisor-tool';
import { Vat } from './vat';

function bar(): void {
  console.log('─'.repeat(86));
}

async function main(): Promise<void> {
  console.log('\nAEGIS · the gVisor isolation rung · an untrusted tool behind a userspace kernel');
  bar();

  const args = gvisorArgs(['sh', '-c', 'tr A-Z a-z']);
  console.log(`\n  sandbox argv: ${args.join(' ')}`);
  const noNetwork = args.includes('--network=none');
  console.log(`  syscalls intercepted by runsc's userspace kernel; network disabled: ${noNetwork}`);

  const available = gvisorAvailable();
  let liveOk: boolean | 'skipped' = 'skipped';
  let tainted: string[] = [];
  if (available) {
    const tool = makeGvisorTool();
    const vat = new Vat('agent');
    vat.endow('normalize', tool.cap);
    vat.beginTurn();
    const r = await vat.act('normalize', 'Hello From GVISOR');
    tainted = [...vat.currentLabel().taints];
    liveOk = r.ok && String(r.value).trim() === 'hello from gvisor' && tainted.includes('isolated-gvisor');
    console.log(`  live: vat → normalize('Hello From GVISOR') = '${r.ok ? String(r.value).trim() : '(blocked)'}' (taints: [${tainted.join(', ')}])`);
  } else {
    console.log('  runsc not available here — skipping the live run; the sandbox argv is verified above.');
  }

  bar();
  const checks: Array<[string, boolean]> = [
    ['the workload is sandboxed by a userspace kernel (runsc), not the host kernel', args[0] === 'runsc'],
    ['networking is disabled — the sandbox channel is only the wired stdio', noNetwork],
    ['live run lowercased via the gVisor sandbox, output labeled isolated-gvisor', liveOk === true || liveOk === 'skipped'],
  ];
  console.log('\nGUARANTEES:');
  let allOk = true;
  for (const [name, ok] of checks) {
    const mark = name.startsWith('live run') && liveOk === 'skipped' ? '➖ SKIP' : ok ? '✅ PASS' : '❌ FAIL';
    console.log(`  ${mark}  ${name}`);
    allOk &&= ok;
  }
  bar();
  console.log(
    allOk
      ? `\n✅ ALL GUARANTEES HELD — the tool is confined behind a userspace kernel (gVisor)${available ? '' : ' (live run skipped: no runsc here)'}.\n`
      : '\n❌ A GUARANTEE FAILED.\n',
  );
  process.exitCode = allOk ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
