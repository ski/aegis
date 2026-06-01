/**
 * gVisor-isolated tool — the isolation rung between Docker and the microVM (substrate phase 2).
 *
 * gVisor (`runsc`) is a userspace kernel written in Go: it intercepts the workload's syscalls and
 * services them itself, so the workload never talks directly to the host Linux kernel. That shrinks the
 * host kernel attack surface dramatically vs. a plain container (which shares the host syscall ABI),
 * without the full weight of a VM.
 *
 * Rung ladder: child process (shared kernel) < Docker (namespaces, shared kernel) <
 *              **gVisor (userspace kernel intercepting syscalls)** < microVM (own guest kernel via KVM).
 *
 * We run the tool via `runsc do` (gVisor's standalone runner — no Docker daemon needed) with
 * networking disabled, so the sandbox's only channel is the stdio we wire. Output is labeled by
 * provenance. On this machine runsc lives in WSL2, so the adapter shells out through `wsl.exe`.
 */
import { spawnSync } from 'node:child_process';
import type { Capability } from './capability';
import { makeCapability } from './capability';
import { label, source } from './label';

const WSL_DISTRO = 'Ubuntu-24.04';

/** The gVisor sandbox argv: runsc, no network, run the given command. Auditable confinement. */
export function gvisorArgs(cmd: readonly string[]): string[] {
  return ['runsc', '--network=none', 'do', ...cmd];
}

/** Is gVisor (`runsc`) available on this host (inside WSL)? */
export function gvisorAvailable(): boolean {
  try {
    const r = spawnSync(
      'wsl.exe',
      ['-d', WSL_DISTRO, '--', 'bash', '-lc', 'command -v runsc >/dev/null && sudo -n runsc --version >/dev/null 2>&1 && echo ok'],
      { encoding: 'utf8', timeout: 20_000 },
    );
    return r.status === 0 && r.stdout.includes('ok');
  } catch {
    return false;
  }
}

export interface GvisorTool {
  readonly cap: Capability;
}

/**
 * A capability that runs an untrusted transform inside a fresh gVisor sandbox per call. The tool here
 * lowercases its input (mirroring the other rungs); the point is the syscall-interception boundary.
 */
export function makeGvisorTool(): GvisorTool {
  const cap = makeCapability({
    kind: 'gvisor_tool',
    clearance: source(),
    invoke: (arg) => {
      const req = String(arg).replace(/[\r\n]+/g, ' ');
      // runsc do needs root; the tool is `tr A-Z a-z` inside the sandbox, fed via stdin.
      const r = spawnSync(
        'wsl.exe',
        ['-d', WSL_DISTRO, '--', 'bash', '-lc', 'sudo runsc --network=none do sh -c "tr A-Z a-z"'],
        { encoding: 'utf8', input: `${req}\n`, timeout: 60_000 },
      );
      if (r.status !== 0) throw new Error(`gvisor run failed: ${r.stderr || r.status}`);
      // crossing the gVisor boundary → labeled by provenance
      return { value: r.stdout.trim(), label: label([], ['isolated-gvisor']) };
    },
  });
  return { cap };
}
