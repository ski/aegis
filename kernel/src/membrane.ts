/**
 * Transitive revocable membrane (docs/03) — the structural upgrade.
 *
 * Until now the kernel relied on a discipline ("only the vat invokes caps"). A membrane makes
 * attenuation and revocation *structural*: wrapping a target so that
 *
 *   - every object reachable THROUGH the wrapper is itself wrapped (transitivity), and
 *   - a single `revoke()` severs the entire reachable subgraph at once (cascading revocation),
 *
 * with no way to extract the raw target from the proxy. It uses the shadow-target technique so it
 * works over *hardened* (frozen, non-configurable) caps — a plain pass-through proxy over a frozen
 * object violates the Proxy invariants, so we proxy a fresh extensible shadow and redirect the traps
 * to the real cap.
 */
import type { Capability } from './capability';

export interface Membrane<T> {
  readonly proxy: T;
  revoke(): void;
}

const revokedError = (): Error => Object.freeze(new Error('membrane revoked'));

export function makeMembrane<T extends object>(target: T): Membrane<T> {
  let live = true;

  const wrap = (real: unknown): unknown => {
    if (real === null || (typeof real !== 'object' && typeof real !== 'function')) {
      return real; // primitives pass through untouched
    }

    if (typeof real === 'function') {
      const shadow = (): void => {};
      return new Proxy(shadow, {
        apply(_s, _thisArg, args: unknown[]) {
          if (!live) throw revokedError();
          const fn = real as (...a: unknown[]) => unknown;
          return wrap(Reflect.apply(fn, undefined, args.map(wrap)));
        },
      });
    }

    return new Proxy(
      {},
      {
        get(_s, prop) {
          if (!live) throw revokedError();
          const v = Reflect.get(real as object, prop);
          if (typeof v === 'function') {
            // Return a fresh function bound to the REAL object, then wrap it so its result is
            // membraned too — this is what makes the wrapping transitive across method calls.
            const method = v as (...a: unknown[]) => unknown;
            return wrap((...args: unknown[]) => Reflect.apply(method, real, args));
          }
          return wrap(v);
        },
        // No `set`/`defineProperty` traps → the membrane is read-only on structure; you can call
        // through it but never mutate the cap behind it.
      },
    );
  };

  return { proxy: wrap(target) as T, revoke: () => void (live = false) };
}

/**
 * Caretaker — wrap a capability behind a revocable membrane and keep the off-switch. Endow the
 * `cap` to an agent; later `revoke()` makes it (and anything it handed onward) inert at once.
 */
export function makeCaretaker(cap: Capability): { cap: Capability; revoke(): void } {
  const m = makeMembrane(cap);
  return { cap: m.proxy, revoke: m.revoke };
}
