/**
 * Docker-isolated tool — a stronger isolation rung than a bare child process (issue #D2; substrate
 * phase 2). The untrusted tool runs in a hardened container, reached only over a typed stdio channel
 * and wrapped as an Aegis capability.
 *
 * The container is locked down so the tool's ONLY channel is the cap:
 *   --cap-drop=ALL                drop every Linux capability
 *   --security-opt=no-new-privileges  no privilege escalation
 *   --network=none                no network — it cannot phone home / exfiltrate
 *   --read-only                   cannot write the host (or its own) filesystem
 *   --pids-limit / --memory       bound resource exhaustion (issue #26)
 *
 * Docker shares the host kernel (namespace isolation), so it sits BELOW a microVM (Firecracker / Kata,
 * which add a guest kernel) and ABOVE the plain child-process tool. Same capability shape at every rung.
 */
import { spawn, spawnSync } from 'node:child_process';
import type { Capability } from './capability.ts';
import { makeCapability } from './capability.ts';
import { label, source } from './label.ts';

export interface DockerToolOpts {
  readonly image: string;
  readonly cmd: readonly string[];
  readonly memoryMb?: number;
  readonly pidsLimit?: number;
}

/** The hardened `docker run` argv — the confinement is all here, and it's auditable. */
export function dockerRunArgs(opts: DockerToolOpts): string[] {
  return [
    'run',
    '--rm',
    '-i',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '--network=none',
    '--read-only',
    `--pids-limit=${opts.pidsLimit ?? 64}`,
    `--memory=${opts.memoryMb ?? 128}m`,
    opts.image,
    ...opts.cmd,
  ];
}

export function dockerAvailable(): boolean {
  try {
    const r = spawnSync('docker', ['info'], { stdio: 'ignore', timeout: 5_000 });
    return r.status === 0;
  } catch {
    return false;
  }
}

export interface IsolatedDockerTool {
  readonly cap: Capability;
  close(): void;
}

/** Spawn a tool inside a hardened container; wrap it as a capability over a line protocol. */
export function spawnDockerTool(opts: DockerToolOpts): IsolatedDockerTool {
  const proc = spawn('docker', dockerRunArgs(opts), { stdio: ['pipe', 'pipe', 'inherit'] });
  const pending: Array<(line: string) => void> = [];
  let buf = '';
  proc.stdout?.on('data', (d: Buffer) => {
    buf += d.toString();
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      pending.shift()?.(line);
    }
  });
  const call = (text: string): Promise<string> =>
    new Promise((resolve, reject) => {
      if (proc.killed || !proc.stdin?.writable) {
        reject(new Error('container is not running'));
        return;
      }
      pending.push(resolve);
      proc.stdin.write(`${text.replace(/\n/g, ' ')}\n`);
    });

  const cap = makeCapability({
    kind: 'docker_tool',
    clearance: source(),
    invoke: async (arg) => {
      const out = await call(String(arg));
      return { value: out, label: label([], ['isolated-container']) }; // crossing the boundary → labeled
    },
  });

  return { cap, close: () => void proc.kill() };
}
