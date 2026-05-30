/**
 * Information-flow labels — the "least knowledge" half (docs/04, docs/05).
 *
 * A label travels with data. We track two axes:
 *   - `secrecy`: confidentiality tags the data carries (e.g. 'customer-db').
 *   - `taints`:  provenance taints (e.g. 'untrusted-web') — the integrity axis.
 *
 * Per docs/04, we **label the turn, not the token**: a vat's current label is the JOIN of every
 * label it has absorbed this turn. Join is set-union on both axes.
 */
export interface Label {
  readonly secrecy: ReadonlySet<string>;
  readonly taints: ReadonlySet<string>;
}

export const bottom = (): Label => harden0({ secrecy: new Set<string>(), taints: new Set<string>() });

export const label = (secrecy: string[] = [], taints: string[] = []): Label =>
  harden0({ secrecy: new Set(secrecy), taints: new Set(taints) });

export const join = (a: Label, b: Label): Label =>
  harden0({
    secrecy: new Set([...a.secrecy, ...b.secrecy]),
    taints: new Set([...a.taints, ...b.taints]),
  });

export const fmtLabel = (l: Label): string =>
  `{secrecy:[${[...l.secrecy].join(',')}] taints:[${[...l.taints].join(',')}]}`;

/**
 * Clearance — declared by a capability. Only *sinks* (caps that emit data outward) gate flow;
 * *sources* (reads) never leak by definition, so they pass unconditionally. This is why reading
 * more secrets is safe but *sending* is not — confidentiality is about output flows.
 */
export interface Clearance {
  readonly isSink: boolean;
  readonly allowsSecrecy: ReadonlySet<string>;   // the max confidentiality a sink may emit
  readonly endorsementForTaint: boolean;         // tainted data into this sink needs endorsement
}

/** A source cap (a read) — never gates flow. */
export const source = (): Clearance =>
  harden0({ isSink: false, allowsSecrecy: new Set<string>(), endorsementForTaint: false });

/** A sink cap (an outbound effect) — gates on confidentiality + integrity. */
export const sink = (allowsSecrecy: string[] = [], endorsementForTaint = true): Clearance =>
  harden0({ isSink: true, allowsSecrecy: new Set(allowsSecrecy), endorsementForTaint });

export interface FlowVerdict {
  readonly ok: boolean;
  readonly reasons: readonly string[];
}

/**
 * The flow check — half of the membrane's dual gate (the other half is the authority check).
 * A send passes only if the current turn's data-label is cleared for this sink.
 *
 * Crucially this does NOT inspect the payload for the secret — that would be unsound against a
 * model that can encode a leak (issue #2). The whole *turn* is contaminated once a secret is
 * absorbed, so any send is gated regardless of what the model put in the arguments.
 */
export function flowCheck(data: Label, c: Clearance, endorsed = false): FlowVerdict {
  if (!c.isSink) return harden0({ ok: true, reasons: [] });
  const reasons: string[] = [];
  for (const s of data.secrecy) {
    if (!c.allowsSecrecy.has(s)) {
      reasons.push(`confidentiality: data carries secrecy '${s}' but sink is not cleared for it`);
    }
  }
  if (!endorsed && c.endorsementForTaint && data.taints.size > 0) {
    reasons.push(`integrity: action is tainted by [${[...data.taints].join(', ')}] and requires endorsement`);
  }
  return harden0({ ok: reasons.length === 0, reasons });
}

// Local copy to avoid a circular import with harden.ts at module-init time.
function harden0<T>(x: T): T {
  return Object.freeze(x) as T;
}
