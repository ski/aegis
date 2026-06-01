/**
 * A capability-scoped, labeled, leased tuple space — JavaSpaces/Linda coordination reconciled with the
 * object-capability + information-flow + lease discipline.
 *
 * Classic tuple spaces (Linda, JavaSpaces) give beautifully *decoupled* coordination — producers and
 * consumers never name each other, they `write`/`read`/`take` entries by associative template match —
 * but they are ambient-authority by design: anyone with the space can take anything matching. This
 * version keeps the decoupling and fixes the authority model:
 *
 *   - **Capability-scoped:** you never touch the space ambiently; you hold a *facet* — an attenuated
 *     view that may permit only read / write / take, and may be confined to a sub-space (a template
 *     scope) and/or a clearance (it only sees entries whose label flows to it).
 *   - **Labeled (IFC):** every entry carries the label of whoever wrote it; `read`/`take` return that
 *     label so the taker re-absorbs it — a confidential entry taints whoever takes it, and the flow
 *     gate governs what they can then do (the labeled-memory insight, generalized to coordination).
 *   - **Leased (decay):** entries may carry a TTL and expire against the trusted clock (Jini leasing /
 *     issues #30 & #18) — coordination state decays by default.
 */
import type { Capability, InvokeContext } from './capability.ts';
import { makeCapability } from './capability.ts';
import { harden } from './harden.ts';
import type { Clearance, Label } from './label.ts';
import { bottom, flowCheck, source } from './label.ts';

export type Template = Readonly<Record<string, unknown>>;

export interface Entry {
  readonly fields: Readonly<Record<string, unknown>>;
  readonly label: Label;
  readonly expiresAt?: number;
}

export interface FacetOpts {
  readonly read?: boolean;
  readonly write?: boolean;
  readonly take?: boolean;
  readonly scope?: Template; // confine the facet to a sub-space
  readonly clearance?: Clearance; // read/take only return entries cleared by this (sink-style filter)
}

export interface SpaceFacet {
  write(fields: Record<string, unknown>, label: Label, opts?: { ttlMs?: number }): void;
  read(template: Template): Entry | undefined;
  take(template: Template): Entry | undefined;
}

export interface Space {
  facet(opts: FacetOpts): SpaceFacet;
}

const matches = (entry: Entry, template: Template): boolean =>
  Object.entries(template).every(([k, v]) => entry.fields[k] === v);

export function makeSpace(clock: () => number = () => Date.now()): Space {
  const entries: Entry[] = [];
  const live = (e: Entry): boolean => e.expiresAt === undefined || clock() < e.expiresAt;

  const facet = (opts: FacetOpts): SpaceFacet => {
    const scope = opts.scope ?? {};
    const visible = (e: Entry): boolean =>
      live(e) &&
      matches(e, scope) &&
      (opts.clearance === undefined || flowCheck(e.label, opts.clearance).ok);

    return harden({
      write(fields, label, wopts) {
        if (!opts.write) throw new Error('space facet: write not permitted');
        const merged = { ...scope, ...fields }; // a scoped facet's writes stay within its sub-space
        const expiresAt = wopts?.ttlMs !== undefined ? clock() + wopts.ttlMs : undefined;
        entries.push(harden({ fields: harden({ ...merged }), label, expiresAt }));
      },
      read(template) {
        if (!opts.read) throw new Error('space facet: read not permitted');
        return entries.find((e) => visible(e) && matches(e, template));
      },
      take(template) {
        if (!opts.take) throw new Error('space facet: take not permitted');
        const i = entries.findIndex((e) => visible(e) && matches(e, template));
        if (i < 0) return undefined;
        const [e] = entries.splice(i, 1);
        return e;
      },
    });
  };

  return harden({ facet });
}

/** Wrap a facet as kernel capabilities: write stamps the writer's label; read/take return labels. */
export function makeSpaceCaps(facet: SpaceFacet): { write: Capability; read: Capability; take: Capability } {
  const write = makeCapability({
    kind: 'space_write',
    clearance: source(),
    invoke: (arg, ctx?: InvokeContext) => {
      const { fields, ttlMs } = arg as { fields: Record<string, unknown>; ttlMs?: number };
      facet.write(fields, ctx?.requesterLabel ?? bottom(), { ttlMs });
      return { value: 'written', label: bottom() };
    },
  });
  const read = makeCapability({
    kind: 'space_read',
    clearance: source(),
    invoke: (arg) => {
      const e = facet.read((arg as { template: Template }).template);
      return e ? { value: e.fields, label: e.label } : { value: null, label: bottom() };
    },
  });
  const take = makeCapability({
    kind: 'space_take',
    clearance: source(),
    invoke: (arg) => {
      const e = facet.take((arg as { template: Template }).template);
      return e ? { value: e.fields, label: e.label } : { value: null, label: bottom() };
    },
  });
  return { write, read, take };
}
