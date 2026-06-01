/**
 * Milestone — phase-2 substrate: the isolation plane at the process level (issue #D2).
 *
 * Run: `pnpm demo:isolation`
 *
 * An untrusted tool runs in its OWN OS process, wrapped as an Aegis capability and driven through the
 * membrane like any other. It shares no memory with the parent and holds none of the parent's caps; it
 * is reachable only through a typed channel, and its output is labeled by provenance. Killing the
 * worker severs the capability — the boundary is real.
 *
 * A microVM (Firecracker / Cloud-Hypervisor) is the hardware-isolated version of exactly this shape;
 * swap the process boundary for a VM boundary and nothing above it changes.
 */
import './bootstrap.ts';
import { spawnToolWorker } from './process-tool.ts';
import { Vat } from './vat.ts';

function bar(): void {
  console.log('─'.repeat(86));
}

async function main(): Promise<void> {
  console.log('\nAEGIS · phase-2 substrate · an isolated tool runs in its own process');
  bar();

  const tool = spawnToolWorker();
  const vat = new Vat('agent');
  vat.endow('normalize', tool.cap);

  console.log(`\n  parent pid = ${process.pid}; isolated worker pid = ${tool.pid}`);

  vat.beginTurn();
  const r = await vat.act('normalize', '  HeLLo  World  ');
  const value = r.ok ? r.value : '(blocked)';
  const tainted = [...vat.currentLabel().taints];
  console.log(`  vat → normalize('  HeLLo  World  ') = '${String(value)}'  (label taints: [${tainted.join(', ')}])`);

  tool.close(); // pull the worker
  vat.beginTurn();
  const r2 = await vat.act('normalize', 'x');
  console.log(`  after killing the worker → ${r2.ok ? 'ALLOWED?!' : `BLOCKED (${r2.blocked})`} (the boundary is real)`);

  bar();
  const checks: Array<[string, boolean]> = [
    ['the tool runs in a SEPARATE OS process', tool.pid !== undefined && tool.pid !== process.pid],
    ['the isolated tool works through the membrane (result normalized)', r.ok && r.value === 'hello  world'],
    ['data crossing the isolation boundary is labeled by provenance', tainted.includes('isolated-component')],
    ['killing the worker severs the capability (boundary is real)', !r2.ok],
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
      ? '\n✅ ALL GUARANTEES HELD — the untrusted tool is confined to its own process behind a typed cap (microVM is the next rung).\n'
      : '\n❌ A GUARANTEE FAILED.\n',
  );
  process.exitCode = allOk ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
