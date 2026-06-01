/**
 * Firecracker-isolated tool — the production microVM rung (substrate phase 2; ADR 0001).
 *
 * Firecracker is the minimal KVM-based VMM behind AWS Lambda and Fargate: it boots a stripped-down
 * microVM in tens of milliseconds with a tiny device model (no BIOS, no PCI, just virtio over MMIO).
 * Same hardware-virtualization isolation as the QEMU microVM rung, but the VMM the design actually
 * names for production. The untrusted tool runs as PID 1 in the guest; request in via kernel cmdline,
 * response out via console; a fresh microVM per call.
 *
 * On this machine Firecracker + /dev/kvm live in WSL2, so the adapter shells out through `wsl.exe`.
 * Trust chain is still long here (Windows → Hyper-V → WSL2 → nested KVM → Firecracker), so this is a
 * dev-grade demonstration of the production VMM, not a production substrate (the real target is a Linux
 * box with direct KVM).
 */
import { spawnSync } from 'node:child_process';
import type { Capability } from './capability.ts';
import { makeCapability } from './capability.ts';
import { label, source } from './label.ts';

const WSL_DISTRO = 'Ubuntu-24.04';
const RUN_SH = '/mnt/c/Users/suhai/gitt/aegis/kernel/firecracker/run.sh';

/** Is Firecracker + /dev/kvm + a vmlinux + the built artifacts available here? */
export function firecrackerAvailable(): boolean {
  try {
    const r = spawnSync(
      'wsl.exe',
      [
        '-d',
        WSL_DISTRO,
        '--',
        'bash',
        '-lc',
        `command -v firecracker >/dev/null && test -r /dev/kvm && test -w /dev/kvm && test -f "$HOME/fc/vmlinux" && test -f ${RUN_SH} && echo ok`,
      ],
      { encoding: 'utf8', timeout: 15_000 },
    );
    return r.status === 0 && r.stdout.includes('ok');
  } catch {
    return false;
  }
}

export interface FirecrackerTool {
  readonly cap: Capability;
}

/** A capability that boots a fresh Firecracker microVM per call for one request/response. */
export function makeFirecrackerTool(): FirecrackerTool {
  const cap = makeCapability({
    kind: 'firecracker_tool',
    clearance: source(),
    invoke: (arg) => {
      const req = String(arg).replace(/[\r\n]+/g, ' ');
      const r = spawnSync('wsl.exe', ['-d', WSL_DISTRO, '--', 'bash', '-lc', `cat | ${RUN_SH}`], {
        encoding: 'utf8',
        input: `${req}\n`,
        timeout: 60_000,
      });
      if (r.status !== 0) throw new Error(`firecracker run failed: ${r.stderr || r.status}`);
      return { value: r.stdout.trim(), label: label([], ['isolated-firecracker']) };
    },
  });
  return { cap };
}
