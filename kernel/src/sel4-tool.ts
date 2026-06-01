/**
 * seL4-isolated tool — the VERIFIED isolation rung (the assurance floor; ADR 0001 phase 3, doc 06).
 *
 * The untrusted tool runs as a confined protection domain on the formally-verified seL4 microkernel
 * (built with the seL4 Microkit SDK, booted on qemu-aarch64). Unlike every rung below it — process,
 * container, gVisor, microVM, all of which provide *strong but unverified* isolation — seL4 has
 * machine-checked proofs of isolation. So the confinement here is **proven**, not merely structural.
 *
 * Assurance ladder (orthogonal to the mechanism ladder):
 *   process < container < gVisor < microVM (KVM)   — stronger MECHANISM, all unverified
 *                                  < seL4           — PROVEN isolation (a separation kernel)
 *
 * Same capability shape as the other rungs: the PD has exactly the authority its static Microkit system
 * description grants (nothing ambient); a fresh image boots per call; output is labeled by provenance.
 * On this machine the build+boot live in WSL2, so the adapter shells out through `wsl.exe`.
 */
import { spawnSync } from 'node:child_process';
import type { Capability } from './capability.ts';
import { makeCapability } from './capability.ts';
import { label, source } from './label.ts';

const WSL_DISTRO = 'Ubuntu-24.04';
const BUILD_SH = '/mnt/c/Users/suhai/gitt/aegis/kernel/sel4/aegis-tool/build.sh';

/** Is the seL4 substrate (Microkit SDK + aarch64 gcc + qemu-aarch64 + build script) available here? */
export function sel4Available(): boolean {
  try {
    const r = spawnSync(
      'wsl.exe',
      [
        '-d',
        WSL_DISTRO,
        '--',
        'bash',
        '-lc',
        `test -d "$HOME/sel4/microkit-sdk-2.2.0" && command -v aarch64-linux-gnu-gcc >/dev/null && command -v qemu-system-aarch64 >/dev/null && test -f ${BUILD_SH} && echo ok`,
      ],
      { encoding: 'utf8', timeout: 20_000 },
    );
    return r.status === 0 && r.stdout.includes('ok');
  } catch {
    return false;
  }
}

export interface Sel4Tool {
  readonly cap: Capability;
}

/**
 * A capability that, per call, builds a fresh seL4 Microkit image with the request baked in, boots it
 * on the verified kernel under qemu-aarch64, and returns the transformed output. Fresh-image-per-call:
 * no state survives between invocations.
 */
export function makeSel4Tool(): Sel4Tool {
  const cap = makeCapability({
    kind: 'sel4_tool',
    clearance: source(),
    invoke: (arg) => {
      const req = String(arg).replace(/[\r\n]+/g, ' ');
      const r = spawnSync('wsl.exe', ['-d', WSL_DISTRO, '--', 'bash', '-lc', `cat | ${BUILD_SH}`], {
        encoding: 'utf8',
        input: `${req}\n`,
        timeout: 120_000, // build + boot
      });
      if (r.status !== 0) throw new Error(`sel4 run failed: ${r.stderr || r.status}`);
      // crossing the verified-kernel boundary → labeled by provenance
      return { value: r.stdout.trim(), label: label([], ['isolated-sel4-verified']) };
    },
  });
  return { cap };
}
