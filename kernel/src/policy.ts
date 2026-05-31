/**
 * Control-plane policy + upgrade gating (issue #31).
 *
 * The control plane's policy (labels, clearances, separation invariants) is mutable trusted state. A
 * malicious policy edit bypasses every runtime check because it *is* the runtime check. So policy
 * changes are themselves a privileged, capability-gated, audited act rooted in the human (ADR 0002's
 * single root): you can only mutate policy if you hold the unforgeable admin capability, and every
 * change is recorded in an append-only log.
 */
import { harden } from './harden';

export interface PolicyChange {
  readonly key: string;
  readonly value: unknown;
  readonly by: string;
}

export interface PolicyStore {
  get(key: string): unknown;
  /** Mutate policy — requires the admin capability. Throws if it is missing or wrong. */
  set(key: string, value: unknown, adminCap: object, by: string): void;
  readonly changeLog: readonly PolicyChange[];
}

export interface PolicyRoot {
  readonly store: PolicyStore;
  /** The unforgeable admin capability — held by the operator, never given to an agent. */
  readonly adminCap: object;
}

export function makePolicyRoot(): PolicyRoot {
  const adminCap = harden({ __adminCap: true });
  const values = new Map<string, unknown>();
  const log: PolicyChange[] = [];

  const store: PolicyStore = harden({
    get(key) {
      return values.get(key);
    },
    set(key, value, cap, by) {
      // Identity check: only the genuine admin capability authorizes a policy change.
      if (cap !== adminCap) {
        throw new Error('policy change refused: missing or invalid admin capability');
      }
      values.set(key, value);
      log.push(harden({ key, value, by })); // append-only audit
    },
    get changeLog() {
      return harden([...log]);
    },
  });

  return harden({ store, adminCap });
}
