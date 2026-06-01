/**
 * Property-based adversarial harness — turn "the demos pass" into "the invariant holds under search".
 *
 * Instead of asserting specific scenarios, we generate THOUSANDS of random action sequences / topologies
 * and check the core security invariants against an INDEPENDENT shadow oracle (so we're not merely
 * re-running the kernel's own check). A counterexample, if one exists, is reproducible from its seed.
 *
 * Three properties:
 *   P1 (membrane):   no random read/send sequence ever lets a secret reach an uncleared sink, where
 *                    "secret reached" is computed by a SEPARATE provenance shadow, not by label.ts.
 *   P2 (global SoD): the separation-of-duties checker's verdict matches an independent brute-force
 *                    reachability oracle on random DAGs — no false "ok", no missed leak path.
 *   P3 (microkernel):no random mint/attenuate/revoke/invoke sequence lets a revoked cap-chain run.
 *
 * Runnable: `pnpm fuzz [iterations]`. Also asserted in test/fuzz.test.ts.
 */
import './bootstrap.ts';
import { makeCapability } from './capability.ts';
import { bottom, label, sink, source } from './label.ts';
import { makeKernel } from './microkernel.ts';
import { checkSeparationOfDuties, type Edge, type FlowNode, type Topology } from './topology.ts';
import { Vat } from './vat.ts';

/** Seeded PRNG (mulberry32) — reproducible: a failing seed replays the exact counterexample. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;

export interface FuzzResult {
  readonly property: string;
  readonly iterations: number;
  readonly failures: ReadonlyArray<{ seed: number; detail: string }>;
}

// ── P1: membrane never leaks a secret to an uncleared sink ───────────────────────────────────────
const SECRECY_TAGS = ['alpha', 'beta', 'gamma'] as const;

async function p1_membrane(iterations: number, baseSeed: number): Promise<FuzzResult> {
  const failures: Array<{ seed: number; detail: string }> = [];
  for (let i = 0; i < iterations; i++) {
    const seed = baseSeed + i;
    const r = rng(seed);

    // Random sources: each emits a random subset of secrecy tags. Random sinks: each cleared for a
    // random subset. The SHADOW tracks, independently of label.ts, which secrets the turn has touched.
    const exfil: Array<{ sinkAllows: Set<string>; shadowSecrets: Set<string> }> = [];
    const shadow = { secrets: new Set<string>() };

    const sources = SECRECY_TAGS.map((_, k) => {
      const emits = SECRECY_TAGS.filter(() => r() < 0.5);
      return makeCapability({
        kind: `read_${k}`,
        clearance: source(),
        invoke: () => {
          for (const t of emits) shadow.secrets.add(t); // shadow: this turn has now touched these
          return { value: 'data', label: label(emits, []) };
        },
      });
    });
    const sinks = [0, 1, 2].map((k) => {
      const allows = SECRECY_TAGS.filter(() => r() < 0.5);
      const allowSet = new Set(allows);
      return makeCapability({
        kind: `send_${k}`,
        clearance: sink(allows, false),
        invoke: () => {
          // Only reached if the membrane ALLOWED the send. Record for the independent check.
          exfil.push({ sinkAllows: allowSet, shadowSecrets: new Set(shadow.secrets) });
          return { value: 'sent', label: bottom() };
        },
      });
    });

    const vat = new Vat('fuzz');
    sources.forEach((c, k) => vat.endow(`read_${k}`, c));
    sinks.forEach((c, k) => vat.endow(`send_${k}`, c));
    const tools = [...sources.map((_, k) => `read_${k}`), ...sinks.map((_, k) => `send_${k}`)];

    // One turn = a random sequence of actions. The turn label accumulates; the shadow tracks in parallel.
    vat.beginTurn();
    const steps = 3 + Math.floor(r() * 8);
    for (let s = 0; s < steps; s++) {
      await vat.act(pick(r, tools), undefined);
    }

    // INDEPENDENT INVARIANT: every send the membrane allowed must have a sink cleared for ALL secrets
    // the turn had touched at that point. If the kernel allowed a leak, the shadow catches it.
    for (const e of exfil) {
      for (const sec of e.shadowSecrets) {
        if (!e.sinkAllows.has(sec)) {
          failures.push({ seed, detail: `LEAK: secret '${sec}' reached a sink cleared only for [${[...e.sinkAllows]}]` });
        }
      }
    }
  }
  return { property: 'P1 membrane never leaks a secret to an uncleared sink', iterations, failures };
}

// ── P2: SoD checker matches an independent brute-force reachability oracle ────────────────────────
function p2_sod(iterations: number, baseSeed: number): FuzzResult {
  const failures: Array<{ seed: number; detail: string }> = [];
  const TAGS = ['s1', 's2'];

  for (let i = 0; i < iterations; i++) {
    const seed = baseSeed + i;
    const r = rng(seed);
    const n = 3 + Math.floor(r() * 4);

    // Random DAG: node j may only edge to node k>j (acyclic by construction).
    const nodes: FlowNode[] = [];
    for (let j = 0; j < n; j++) {
      const role = r();
      if (role < 0.33) {
        nodes.push({ kind: 'vat', id: `v${j}`, sources: [{ name: `src${j}`, emits: [pick(r, TAGS)] }] });
      } else if (role < 0.5) {
        nodes.push({ kind: 'declassifier', id: `v${j}`, removes: [pick(r, TAGS)] });
      } else if (role < 0.75) {
        nodes.push({ kind: 'vat', id: `v${j}`, sinks: [{ name: `snk${j}`, allows: r() < 0.5 ? [pick(r, TAGS)] : [] }] });
      } else {
        nodes.push({ kind: 'vat', id: `v${j}` });
      }
    }
    const edges: Edge[] = [];
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (r() < 0.5) edges.push({ from: `v${a}`, to: `v${b}` });
    const topo: Topology = { nodes, edges };

    // Independent oracle: forward-propagate secrecy along edges (declassifiers strip), then check every
    // sink for an arriving tag it isn't cleared for. This is a separate implementation from topology.ts.
    const byId = new Map(nodes.map((x) => [x.id, x]));
    const arriving = new Map<string, Set<string>>(nodes.map((x) => [x.id, new Set<string>()]));
    for (let a = 0; a < n; a++) {
      const id = `v${a}`;
      const node = byId.get(id)!;
      const out = new Set(arriving.get(id)!);
      if (node.kind === 'vat') for (const s of node.sources ?? []) for (const t of s.emits) out.add(t);
      if (node.kind === 'declassifier') for (const t of node.removes) out.delete(t);
      for (const e of edges) if (e.from === id) for (const t of out) arriving.get(e.to)!.add(t);
    }
    let oracleLeaks = false;
    for (const node of nodes) {
      if (node.kind !== 'vat') continue;
      for (const snk of node.sinks ?? []) {
        const allow = new Set(snk.allows);
        for (const t of arriving.get(node.id)!) if (!allow.has(t)) oracleLeaks = true;
      }
    }

    const checkerOk = checkSeparationOfDuties(topo).ok;
    // checker says ok ⟺ oracle says no leak
    if (checkerOk === oracleLeaks) {
      failures.push({ seed, detail: `checker.ok=${checkerOk} but oracleLeaks=${oracleLeaks}` });
    }
  }
  return { property: 'P2 SoD checker matches independent reachability oracle', iterations, failures };
}

// ── P3: microkernel never invokes a revoked cap-chain ─────────────────────────────────────────────
async function p3_microkernel(iterations: number, baseSeed: number): Promise<FuzzResult> {
  const failures: Array<{ seed: number; detail: string }> = [];
  const ctx = { requesterLabel: bottom(), requester: 'fuzz' };

  for (let i = 0; i < iterations; i++) {
    const seed = baseSeed + i;
    const r = rng(seed);
    const k = makeKernel();
    const handles: Array<{ h: ReturnType<typeof k.mint>; revoked: boolean; parent?: number }> = [];

    const base = k.mint({ kind: 'b', clearance: source(), effect: () => ({ value: 'ok', label: bottom() }) });
    handles.push({ h: base, revoked: false });

    const ops = 5 + Math.floor(r() * 15);
    for (let o = 0; o < ops; o++) {
      const choice = r();
      if (choice < 0.4 && handles.length < 12) {
        const pi = Math.floor(r() * handles.length);
        const d = k.attenuate(handles[pi]!.h, {});
        handles.push({ h: d, revoked: false, parent: pi });
      } else if (choice < 0.6) {
        const idx = Math.floor(r() * handles.length);
        k.revoke(handles[idx]!.h);
        handles[idx]!.revoked = true;
      } else {
        const idx = Math.floor(r() * handles.length);
        // shadow: a handle is dead if it or any ancestor was revoked
        let dead = false;
        for (let c: number | undefined = idx; c !== undefined; c = handles[c]!.parent) if (handles[c]!.revoked) dead = true;
        let invokedOk = false;
        try {
          await k.invoke(handles[idx]!.h, undefined, ctx);
          invokedOk = true;
        } catch {
          invokedOk = false;
        }
        // INVARIANT: a dead chain must NOT invoke; a live chain MUST invoke.
        if (dead && invokedOk) failures.push({ seed, detail: `revoked cap-chain (idx ${idx}) invoked successfully` });
        if (!dead && !invokedOk) failures.push({ seed, detail: `live cap (idx ${idx}) failed to invoke` });
      }
    }
  }
  return { property: 'P3 microkernel never invokes a revoked cap-chain', iterations, failures };
}

export async function runFuzz(iterations: number, baseSeed = 1): Promise<FuzzResult[]> {
  return [
    await p1_membrane(iterations, baseSeed),
    p2_sod(iterations, baseSeed + 100000),
    await p3_microkernel(iterations, baseSeed + 200000),
  ];
}
