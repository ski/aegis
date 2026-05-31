/**
 * Unified capability-secure, labeled, leased store (issue convergence: #16 ⨯ doc 07).
 *
 * Labeled memory (keyed) and the labeled space (associative, by template) were the same idea at two
 * interfaces. This is the single core: a set of labeled, optionally-leased entries, exposed through
 * BOTH a keyed facet (`kv`, the labeled-memory interface) and an associative facet (`space`, the
 * tuple-space interface). Keyed is the special case where the template is `{ __key: k }`.
 *
 * Everything from both predecessors holds: facets are attenuated (which ops, sub-space scope,
 * clearance), entry labels travel (take/read/get return them so the taker re-absorbs), entries lease
 * against the trusted clock.
 */
import { harden } from './harden';
import type { Clearance, Label } from './label';
import { flowCheck } from './label';

export type Template = Readonly<Record<string, unknown>>;

export interface Entry {
  readonly fields: Readonly<Record<string, unknown>>;
  readonly label: Label;
  readonly expiresAt?: number;
}

const KEY = '__key';

export interface SpaceFacetOpts {
  readonly read?: boolean;
  readonly write?: boolean;
  readonly take?: boolean;
  readonly scope?: Template;
  readonly clearance?: Clearance;
}

export interface SpaceFacet {
  write(fields: Record<string, unknown>, label: Label, opts?: { ttlMs?: number }): void;
  read(template: Template): Entry | undefined;
  take(template: Template): Entry | undefined;
}

export interface KvFacetOpts {
  readonly get?: boolean;
  readonly put?: boolean;
  readonly del?: boolean;
  readonly clearance?: Clearance;
}

export interface KvFacet {
  put(key: string, value: unknown, label: Label, opts?: { ttlMs?: number }): void;
  get(key: string): Entry | undefined;
  del(key: string): boolean;
}

export interface Store {
  space(opts: SpaceFacetOpts): SpaceFacet;
  kv(opts: KvFacetOpts): KvFacet;
}

const matches = (e: Entry, t: Template): boolean => Object.entries(t).every(([k, v]) => e.fields[k] === v);

export function makeStore(clock: () => number = () => Date.now()): Store {
  const entries: Entry[] = [];
  const live = (e: Entry): boolean => e.expiresAt === undefined || clock() < e.expiresAt;

  return harden({
    space(opts: SpaceFacetOpts): SpaceFacet {
      const scope = opts.scope ?? {};
      const visible = (e: Entry): boolean =>
        live(e) && matches(e, scope) && (opts.clearance === undefined || flowCheck(e.label, opts.clearance).ok);
      return harden({
        write(fields, label, w) {
          if (!opts.write) throw new Error('store.space: write not permitted');
          const expiresAt = w?.ttlMs !== undefined ? clock() + w.ttlMs : undefined;
          entries.push(harden({ fields: harden({ ...scope, ...fields }), label, expiresAt }));
        },
        read(t) {
          if (!opts.read) throw new Error('store.space: read not permitted');
          return entries.find((e) => visible(e) && matches(e, t));
        },
        take(t) {
          if (!opts.take) throw new Error('store.space: take not permitted');
          const i = entries.findIndex((e) => visible(e) && matches(e, t));
          if (i < 0) return undefined;
          return entries.splice(i, 1)[0];
        },
      });
    },

    kv(opts: KvFacetOpts): KvFacet {
      const visible = (e: Entry): boolean =>
        live(e) && (opts.clearance === undefined || flowCheck(e.label, opts.clearance).ok);
      return harden({
        put(key, value, label, w) {
          if (!opts.put) throw new Error('store.kv: put not permitted');
          const expiresAt = w?.ttlMs !== undefined ? clock() + w.ttlMs : undefined;
          // a put overwrites the keyed entry (keyed semantics, unlike space's multi-write)
          const i = entries.findIndex((e) => e.fields[KEY] === key);
          const entry = harden({ fields: harden({ [KEY]: key, value }), label, expiresAt });
          if (i >= 0) entries[i] = entry;
          else entries.push(entry);
        },
        get(key) {
          if (!opts.get) throw new Error('store.kv: get not permitted');
          const e = entries.find((x) => x.fields[KEY] === key);
          return e && visible(e) ? e : undefined;
        },
        del(key) {
          if (!opts.del) throw new Error('store.kv: del not permitted');
          const i = entries.findIndex((e) => e.fields[KEY] === key);
          if (i < 0) return false;
          entries.splice(i, 1);
          return true;
        },
      });
    },
  });
}
