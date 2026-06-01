/**
 * MicroVM-isolated tool — the strongest isolation rung (issue #28-adjacent; substrate phase 2).
 *
 * The untrusted tool runs inside a hardware-virtualized guest (its OWN kernel, isolated by KVM), with
 * no network, no disk, and no shared filesystem — the serial console is its only channel. The host
 * wraps one boot/request/response as an Aegis capability, same shape as the process and Docker rungs.
 *
 * Rung ladder: child process (shared kernel) < Docker (namespaces) < gVisor (user-kernel) <
 *              **microVM (own guest kernel via KVM)**.
 *
 * On this machine the VM runs inside WSL2 (where /dev/kvm + QEMU live), so the adapter shells out to
 * `wsl.exe … run.sh`. The trust chain is long (Windows → Hyper-V → WSL2 → nested KVM → QEMU), so this
 * is a DEV-grade rung, not a production substrate — the real target is a Linux box (ADR 0001).
 */
import { spawnSync } from 'node:child_process';
import type { Capability } from './capability.ts';
import { makeCapability } from './capability.ts';
import { label, source } from './label.ts';

const WSL_DISTRO = 'Ubuntu-24.04';
const RUN_SH = '/mnt/c/Users/suhai/gitt/aegis/kernel/microvm/run.sh';

/** Is a WSL2 + KVM + QEMU + built-artifacts microVM available here? */
export function microvmAvailable(): boolean {
  try {
    const r = spawnSync(
      'wsl.exe',
      ['-d', WSL_DISTRO, '--', 'bash', '-lc', `test -r /dev/kvm && test -w /dev/kvm && command -v qemu-system-x86_64 >/dev/null && test -f ${RUN_SH} && echo ok`],
      { encoding: 'utf8', timeout: 15_000 },
    );
    return r.status === 0 && r.stdout.includes('ok');
  } catch {
    return false;
  }
}

export interface MicroVMTool {
  readonly cap: Capability;
}

/**
 * A capability that, on each invoke, boots a fresh microVM for one request/response. Fresh-VM-per-call
 * is the strongest hygiene: no state survives between invocations (the guest is destroyed each time).
 */
export function makeMicroVMTool(): MicroVMTool {
  const cap = makeCapability({
    kind: 'microvm_tool',
    clearance: source(),
    invoke: (arg) => {
      // Pipe the request via stdin (env vars do NOT cross the Windows→WSL boundary without WSLENV).
      const req = String(arg).replace(/[\r\n]+/g, ' ');
      const r = spawnSync('wsl.exe', ['-d', WSL_DISTRO, '--', 'bash', '-lc', `cat | ${RUN_SH}`], {
        encoding: 'utf8',
        timeout: 60_000,
        input: `${req}\n`,
      });
      if (r.status !== 0) throw new Error(`microvm run failed: ${r.stderr || r.status}`);
      const out = r.stdout.trim();
      // crossing the VM boundary → labeled by provenance
      return { value: out, label: label([], ['isolated-microvm']) };
    },
  });
  return { cap };
}
