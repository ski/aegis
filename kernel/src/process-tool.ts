/**
 * Process-isolated tool — wrap a worker running in a separate OS process as an Aegis capability
 * (issue #D2; substrate phase 2). The untrusted component lives in its own address space, reachable
 * only through a typed channel; data crossing the boundary is labeled by provenance.
 *
 * This is the in-environment stand-in for the microVM isolation plane: a microVM (Firecracker /
 * Cloud-Hypervisor) is the hardware-isolated version, reached through the very same capability shape.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { Capability } from './capability.ts';
import { makeCapability } from './capability.ts';
import { label, source } from './label.ts';

export interface IsolatedTool {
  readonly cap: Capability;
  readonly pid: number | undefined;
  close(): void;
}

export function spawnToolWorker(): IsolatedTool {
  const workerPath = fileURLToPath(new URL('./tool-worker.ts', import.meta.url));
  const worker = spawn(process.execPath, ['--import', 'tsx', workerPath], { stdio: ['pipe', 'pipe', 'inherit'] });

  let nextId = 1;
  const pending = new Map<number, (v: { output: unknown; pid: number }) => void>();
  let buf = '';
  worker.stdout?.on('data', (d: Buffer) => {
    buf += d.toString();
    let idx: number;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line) as { id: number; output: unknown; pid: number };
        pending.get(msg.id)?.(msg);
        pending.delete(msg.id);
      } catch {
        /* ignore */
      }
    }
  });

  const call = (input: unknown): Promise<{ output: unknown; pid: number }> =>
    new Promise((resolve, reject) => {
      if (worker.killed || !worker.stdin?.writable) {
        reject(new Error('isolated worker is not running'));
        return;
      }
      const id = nextId;
      nextId += 1;
      pending.set(id, resolve);
      worker.stdin.write(`${JSON.stringify({ id, input })}\n`);
    });

  const cap = makeCapability({
    kind: 'isolated_normalize',
    clearance: source(),
    invoke: async (arg) => {
      const m = await call(arg);
      // Output crosses the isolation boundary → tag it by provenance.
      return { value: m.output, label: label([], ['isolated-component']) };
    },
  });

  return { cap, pid: worker.pid, close: () => void worker.kill() };
}
