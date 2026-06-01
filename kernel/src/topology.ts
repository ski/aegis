/**
 * Topology + the global separation-of-duties invariant (issues #1, #22).
 *
 * Compartmentalization cannot be a per-vat rule and it cannot be a model decision. A *chain* of
 * individually-compliant vats can still launder a secret to a sink (reader → relay → sender), so the
 * invariant must hold over the whole **flow graph**:
 *
 *   > No path may carry a `secret`-labeled value to a sink not cleared for it, unless a declassifier
 *   > that removes that secrecy lies on the path.
 *
 * The trusted base checks this *statically, at wiring time* — prevention by construction, before any
 * agent runs. This is the "control the context, don't gate the output" discipline made structural.
 */
import { harden } from './harden.ts';

export interface SourceSpec {
  readonly name: string;
  readonly emits: readonly string[]; // secrecy tags this source originates
}
export interface SinkSpec {
  readonly name: string;
  readonly allows: readonly string[]; // secrecy tags this sink is cleared to emit
}

export interface VatNode {
  readonly kind: 'vat';
  readonly id: string;
  readonly sources?: readonly SourceSpec[];
  readonly sinks?: readonly SinkSpec[];
}
export interface DeclassifierNode {
  readonly kind: 'declassifier';
  readonly id: string;
  readonly removes: readonly string[]; // secrecy tags it strips (must be soundly/structurally removed)
}
export type FlowNode = VatNode | DeclassifierNode;

export interface Edge {
  readonly from: string;
  readonly to: string;
}
export interface Topology {
  readonly nodes: readonly FlowNode[];
  readonly edges: readonly Edge[];
}

export interface Violation {
  readonly sink: string;
  readonly atVat: string;
  readonly leaks: readonly string[]; // secrecy that could reach the sink uncleared
  readonly path: readonly string[]; // an example node path that carries it
}
export interface SodResult {
  readonly ok: boolean;
  readonly violations: readonly Violation[];
}

export function checkSeparationOfDuties(topo: Topology): SodResult {
  const byId = new Map<string, FlowNode>(topo.nodes.map((n) => [n.id, n]));
  const outAdj = new Map<string, string[]>(topo.nodes.map((n) => [n.id, []]));
  const inAdj = new Map<string, string[]>(topo.nodes.map((n) => [n.id, []]));
  const indeg = new Map<string, number>(topo.nodes.map((n) => [n.id, 0]));
  for (const e of topo.edges) {
    outAdj.get(e.from)?.push(e.to);
    inAdj.get(e.to)?.push(e.from);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }

  // Kahn topological order (the flow graph must be a DAG).
  const queue = topo.nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const m of outAdj.get(id) ?? []) {
      indeg.set(m, (indeg.get(m) ?? 0) - 1);
      if ((indeg.get(m) ?? 0) === 0) queue.push(m);
    }
  }
  if (order.length !== topo.nodes.length) {
    throw new Error('topology has a cycle; the flow graph must be a DAG');
  }

  // Propagate secrecy forward: arriving[node] = sources ∪ (⋃ outgoing[pred]); a declassifier strips.
  const arriving = new Map<string, Set<string>>();
  const outgoing = new Map<string, Set<string>>();
  for (const id of order) {
    const node = byId.get(id)!;
    const arr = new Set<string>();
    for (const p of inAdj.get(id) ?? []) for (const t of outgoing.get(p) ?? []) arr.add(t);
    if (node.kind === 'vat') for (const s of node.sources ?? []) for (const t of s.emits) arr.add(t);
    arriving.set(id, arr);
    const out = new Set(arr);
    if (node.kind === 'declassifier') for (const t of node.removes) out.delete(t);
    outgoing.set(id, out);
  }

  const violations: Violation[] = [];
  for (const node of topo.nodes) {
    if (node.kind !== 'vat') continue;
    for (const sink of node.sinks ?? []) {
      const arr = arriving.get(node.id) ?? new Set<string>();
      const allows = new Set(sink.allows);
      const leaks = [...arr].filter((t) => !allows.has(t));
      if (leaks.length > 0) {
        const path = findLeakPath(byId, outAdj, leaks[0]!, node.id) ?? [node.id];
        violations.push(harden({ sink: sink.name, atVat: node.id, leaks, path }));
      }
    }
  }

  return harden({ ok: violations.length === 0, violations });
}

/** Find an example path that carries `tag` from a source vat to `toVat`, not crossing a stripper. */
function findLeakPath(
  byId: Map<string, FlowNode>,
  outAdj: Map<string, string[]>,
  tag: string,
  toVat: string,
): string[] | undefined {
  const sources = [...byId.values()].filter(
    (n): n is VatNode => n.kind === 'vat' && (n.sources ?? []).some((s) => s.emits.includes(tag)),
  );
  for (const start of sources) {
    const prev = new Map<string, string | null>([[start.id, null]]);
    const q = [start.id];
    while (q.length) {
      const id = q.shift()!;
      if (id === toVat) {
        const path: string[] = [];
        let c: string | null = id;
        while (c !== null) {
          path.unshift(c);
          c = prev.get(c) ?? null;
        }
        return path;
      }
      const node = byId.get(id)!;
      // A declassifier that strips this tag breaks the path for this tag — don't expand through it.
      if (id !== start.id && node.kind === 'declassifier' && node.removes.includes(tag)) continue;
      for (const m of outAdj.get(id) ?? []) {
        if (!prev.has(m)) {
          prev.set(m, id);
          q.push(m);
        }
      }
    }
  }
  return undefined;
}
