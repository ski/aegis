/**
 * Milestone — distribution over CapTP (docs/03 OCapN; @endo/captp + @endo/eventual-send).
 *
 * Run: `pnpm demo:distribution`
 *
 * Two vats — a "host" holding real authority and a "guest" agent on the other end of a channel —
 * connected by CapTP. The same capability discipline now runs *across a wire*:
 *
 *   - cross-vat capability passing: the guest gets a remote presence and invokes a host cap via E();
 *   - promise pipelining: a chained call is sent to the promise before it resolves (fewer round trips);
 *   - confinement across the boundary: the guest can only call the interface it was given;
 *   - revocation across the wire: when the host revokes, the guest's remote invoke fails too.
 *
 * (The channel here is in-process loopback; swap it for a socket/worker and nothing else changes —
 * that is the point of CapTP.)
 */
import './bootstrap.ts';
import { makeCapTP } from '@endo/captp';
import { E } from '@endo/eventual-send';
import { Far } from '@endo/far';

interface CapTPSide {
  dispatch(message: unknown): void;
  getBootstrap(): unknown;
  abort?(reason?: unknown): void;
}

// Typed facade for the host's remote interface (what the guest is allowed to see).
interface RemoteMetricCap {
  invoke(arg: unknown): Promise<string>;
}
interface RemoteDirectory {
  getMetrics(): Promise<RemoteMetricCap>;
}

function bar(): void {
  console.log('─'.repeat(86));
}

async function main(): Promise<void> {
  console.log('\nAEGIS · distribution over CapTP · cross-vat capabilities with promise pipelining');
  bar();

  // ── Host vat: holds the real authority ────────────────────────────────────────────────────────
  let live = true;
  const recorded: unknown[] = [];
  const directory = Far('Directory', {
    // hands out an ATTENUATED cap — the guest gets exactly this, nothing more
    getMetrics: () =>
      Far('MetricCap', {
        invoke: (arg: unknown) => {
          if (!live) throw new Error('cap revoked by host');
          recorded.push(arg);
          return 'recorded';
        },
      }),
  });

  // ── The channel (in-process loopback) with a message counter ──────────────────────────────────
  let hostSide: CapTPSide;
  let guestSide: CapTPSide;
  let messages = 0;
  const send = (getTarget: () => CapTPSide) => (m: unknown): Promise<void> => {
    messages += 1;
    return Promise.resolve().then(() => getTarget().dispatch(m));
  };
  hostSide = makeCapTP('host', send(() => guestSide), () => directory) as CapTPSide;
  guestSide = makeCapTP('guest', send(() => hostSide), () => undefined) as CapTPSide;

  const remoteDir = guestSide.getBootstrap() as RemoteDirectory;

  // 1) cross-vat capability passing + invoke (the effect happens on the host)
  const cap = await E(remoteDir).getMetrics();
  const ack = await E(cap).invoke({ cpu: 0.5 });
  console.log(`\n  guest → E(cap).invoke({cpu:0.5}) → '${ack}'; host recorded ${recorded.length} metric(s)`);

  // 2) promise pipelining — measure round trips
  messages = 0;
  const c1 = await E(remoteDir).getMetrics();
  await E(c1).invoke({ seq: 1 });
  const seqMsgs = messages;

  messages = 0;
  await E(E(remoteDir).getMetrics()).invoke({ pipe: 1 }); // invoke sent to the promise, not the resolved cap
  const pipeMsgs = messages;
  console.log(`  round-trips: sequential=${seqMsgs}  pipelined=${pipeMsgs}  (pipelining collapses the chain)`);

  // 3) confinement across the boundary — the guest can only call the granted interface
  let confined = false;
  try {
    await E(remoteDir as unknown as { getSecret(): unknown }).getSecret();
  } catch {
    confined = true;
  }
  console.log(`  guest → E(remoteDir).getSecret() → ${confined ? 'REJECTED (no such method)' : 'returned?!'}`);

  // 4) revocation across the wire
  const beforeCount = recorded.length;
  live = false; // host pulls the plug
  let remoteRevoked = false;
  try {
    await E(cap).invoke({ after: 1 });
  } catch {
    remoteRevoked = true;
  }
  console.log(`  after host revokes → guest's remote invoke ${remoteRevoked ? 'REJECTED' : 'succeeded?!'}`);

  // ── Guarantees ────────────────────────────────────────────────────────────────────────────────
  bar();
  const checks: Array<[string, boolean]> = [
    ['cross-vat capability passing: guest invoked a host cap remotely', ack === 'recorded' && recorded.length >= 1],
    ['promise pipelining used no more round trips than sequential', pipeMsgs <= seqMsgs && pipeMsgs > 0],
    ['confinement: guest can only call the granted interface', confined],
    ['revocation across the wire: post-revoke remote invoke rejected', remoteRevoked],
    ['the revoked invoke had no effect on the host', recorded.length === beforeCount],
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
      ? '\n✅ ALL GUARANTEES HELD — the capability discipline runs unchanged across a wire.\n'
      : '\n❌ A GUARANTEE FAILED.\n',
  );
  process.exitCode = allOk ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
