/**
 * Milestone — the labeled space, distributed over CapTP (the fleet coordination fabric).
 *
 * Run: `pnpm demo:space:distributed`
 *
 * A space lives on a "host" vat. A "worker" vat on the other end of a CapTP channel holds only a
 * remote *facet* (an attenuated presence), and coordinates through it with `E()`. Decoupled
 * coordination now spans machines, but the discipline is unchanged: the worker holds a facet, not the
 * space; it can only do what the facet permits; and entry labels still travel back across the wire.
 *
 * In-process loopback channel — swap it for a socket and this is a multi-machine coordination fabric.
 */
import './bootstrap';
import { makeCapTP } from '@endo/captp';
import { E } from '@endo/eventual-send';
import { Far } from '@endo/far';
import { bottom, label } from './label';
import { makeStore } from './store';

interface CapTPSide {
  dispatch(message: unknown): void;
  getBootstrap(): unknown;
}
interface RemoteFacet {
  write(fields: Record<string, unknown>, secrecy: string[]): Promise<string>;
  take(template: Record<string, unknown>): Promise<{ fields: Record<string, unknown>; secrecy: string[] } | null>;
}

function bar(): void {
  console.log('─'.repeat(86));
}

async function main(): Promise<void> {
  console.log('\nAEGIS · the labeled space distributed over CapTP · coordination across machines');
  bar();

  // ── Host: owns the store; exposes an ATTENUATED facet as a remotable ──────────────────────────
  const store = makeStore(() => 0);
  const hostFacet = store.space({ read: true, write: true, take: true, scope: { queue: 'jobs' } });
  // What the host publishes to the worker: a write+take facet over the jobs queue, labels marshaled.
  const remotable = Far('JobsFacet', {
    write: (fields: Record<string, unknown>, secrecy: string[]) => {
      hostFacet.write(fields, label(secrecy, []));
      return 'written';
    },
    take: (template: Record<string, unknown>) => {
      const e = hostFacet.take(template);
      return e ? { fields: { ...e.fields }, secrecy: [...e.label.secrecy] } : null;
    },
  });

  // ── Channel (loopback) ────────────────────────────────────────────────────────────────────────
  let hostSide: CapTPSide;
  let workerSide: CapTPSide;
  const send = (get: () => CapTPSide) => (m: unknown): Promise<void> => Promise.resolve().then(() => get().dispatch(m));
  hostSide = makeCapTP('host', send(() => workerSide), () => remotable) as CapTPSide;
  workerSide = makeCapTP('worker', send(() => hostSide), () => undefined) as CapTPSide;

  const remoteFacet = workerSide.getBootstrap() as RemoteFacet;

  // ── Host seeds a job locally; worker takes it over the wire ────────────────────────────────────
  hostFacet.write({ queue: 'jobs', task: 'resize-image' }, bottom());
  const taken = await E(remoteFacet).take({ task: 'resize-image' });
  console.log(`\n  worker took job over CapTP: '${taken?.fields?.['task']}' (never naming the host)`);

  // ── Worker writes a confidential result back; its label travels across the wire ────────────────
  await E(remoteFacet).write({ queue: 'jobs', result: 'done', detail: 'secret' }, ['confidential']);
  const back = store.space({ read: true }).read({ result: 'done' });
  const labelTravelled = back !== undefined && back.label.secrecy.has('confidential');
  console.log(`  worker wrote a result; its label on the host: [${[...(back?.label.secrecy ?? [])].join(', ')}]`);

  // ── Confinement across the boundary: the worker can only call the facet's methods ──────────────
  let confined = false;
  try {
    await E(remoteFacet as unknown as { drop(): unknown }).drop();
  } catch {
    confined = true;
  }
  console.log(`  worker calling an un-granted method → ${confined ? 'REJECTED' : 'allowed?!'}`);

  bar();
  const checks: Array<[string, boolean]> = [
    ['decoupled coordination spans machines: worker took a job over CapTP', taken?.fields?.['task'] === 'resize-image'],
    ['the worker holds a facet, not the store (only granted methods exist)', confined],
    ['entry labels travel back across the wire (confidential preserved)', labelTravelled],
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
      ? '\n✅ ALL GUARANTEES HELD — the labeled space coordinates across a wire; facet attenuation + label-travel survive CapTP.\n'
      : '\n❌ A GUARANTEE FAILED.\n',
  );
  process.exitCode = allOk ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
