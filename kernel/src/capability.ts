/**
 * Capability — an unforgeable reference that combines designation and authority (docs/02).
 * To hold one is to be permitted to use the effect it names. There is no other way to act.
 *
 * The untrusted model never receives capability objects — it only emits tool *names* (forgeable
 * strings) which the vat resolves to held caps. So "possession is authority" is enforced by the
 * trust boundary: the model produces data, the trusted vat holds the references.
 */
import { harden } from './harden';
import type { Clearance, Label } from './label';
import { source } from './label';

export interface InvokeResult {
  /** The value produced by the effect (for a read: the data; for a send: an ack). */
  readonly value: unknown;
  /** The label the produced data carries — absorbed into the turn by the vat. */
  readonly label: Label;
}

/**
 * Context the *trusted vat* supplies on every invocation. The agent cannot forge it — e.g. the
 * requester's current taint is read from the vat's turn label, never from anything the model said.
 * Used by the powerbox to provenance-gate grant requests.
 */
export interface InvokeContext {
  readonly requesterLabel: Label;
  readonly requester: string;
}

export interface Capability {
  readonly id: string;
  readonly kind: string;
  readonly clearance: Clearance;
  invoke(arg: unknown, ctx?: InvokeContext): InvokeResult | Promise<InvokeResult>;
}

let counter = 0;
const nextId = (kind: string): string => `cap:${kind}:${++counter}`;

export function makeCapability(opts: {
  kind: string;
  clearance?: Clearance;
  invoke: (arg: unknown, ctx?: InvokeContext) => InvokeResult | Promise<InvokeResult>;
}): Capability {
  return harden({
    id: nextId(opts.kind),
    kind: opts.kind,
    clearance: opts.clearance ?? source(),
    invoke: opts.invoke,
  });
}
