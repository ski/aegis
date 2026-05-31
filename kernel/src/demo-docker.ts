/**
 * Milestone — the Docker isolation rung (issue #D2; substrate phase 2).
 *
 * Run: `pnpm demo:docker`
 *
 * A stronger isolation rung than the bare child process: the untrusted tool runs in a hardened
 * container whose ONLY channel is the cap (no caps, no network, read-only fs, resource-bounded). The
 * confinement is structural and auditable in the `docker run` argv — we verify those flags always. If
 * Docker is present we also run it live; if not, the live step is skipped (this demo still passes), so
 * it stays green in CI while doing the real thing wherever Docker exists.
 *
 * Rung ladder: child process  <  Docker (namespaces, this)  <  gVisor  <  microVM (Firecracker/Kata).
 */
import './bootstrap';
import { dockerAvailable, dockerRunArgs, spawnDockerTool } from './docker-tool';
import { Vat } from './vat';

function bar(): void {
  console.log('─'.repeat(86));
}

const TOOL = {
  image: 'busybox',
  cmd: ['sh', '-c', 'while IFS= read -r l; do printf "%s\\n" "$l" | tr "A-Z" "a-z"; done'],
};

async function main(): Promise<void> {
  console.log('\nAEGIS · the Docker isolation rung · an untrusted tool confined to a hardened container');
  bar();

  const args = dockerRunArgs(TOOL);
  console.log(`\n  docker ${args.slice(0, 9).join(' ')} …`);
  const hardened = ['--cap-drop=ALL', '--security-opt=no-new-privileges', '--network=none', '--read-only'].every((f) => args.includes(f));
  const bounded = args.some((a) => a.startsWith('--pids-limit=')) && args.some((a) => a.startsWith('--memory='));
  console.log(`  confinement flags present: ${hardened}; resource bounds present: ${bounded}`);

  const available = dockerAvailable();
  let liveOk: boolean | 'skipped' = 'skipped';
  if (available) {
    const tool = spawnDockerTool(TOOL);
    const vat = new Vat('agent');
    vat.endow('normalize', tool.cap);
    vat.beginTurn();
    const r = await vat.act('normalize', '  HeLLo Docker  ');
    const tainted = [...vat.currentLabel().taints];
    liveOk = r.ok && String(r.value).trim() === 'hello docker' && tainted.includes('isolated-container');
    console.log(`  live: vat → normalize('  HeLLo Docker  ') = '${r.ok ? r.value : '(blocked)'}' (taints: [${tainted.join(', ')}])`);
    tool.close();
  } else {
    console.log('  Docker not available here — skipping the live run; the confinement argv is verified above.');
  }

  bar();
  const checks: Array<[string, boolean]> = [
    ['the container drops all caps, disables network, and is read-only (no channel but the cap)', hardened],
    ['resource exhaustion is bounded (pids + memory limits) — issue #26', bounded],
    ['live run normalized via the containerized tool, output labeled isolated-container', liveOk === true || liveOk === 'skipped'],
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
      ? `\n✅ ALL GUARANTEES HELD — the tool is confined to a hardened container behind a typed cap${available ? '' : ' (live run skipped: Docker not present)'}.\n`
      : '\n❌ A GUARANTEE FAILED.\n',
  );
  process.exitCode = allOk ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
