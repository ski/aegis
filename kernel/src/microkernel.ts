/**
 * Microkernel — a step toward shrinking the TCB (issue #19).
 *
 * The J1 critique: every security property routes through a large, unverifiable control plane. The
 * answer is to concentrate *all raw authority* into one small, auditable core that everything else is
 * built on. This is that core. Its entire trusted surface is four methods, and the raw effect of every
 * capability lives in a single closure-private `WeakMap` that nothing outside this module can reach.
 *
 * Consequence: a capability handle is an opaque token exposing only metadata. You cannot invoke its
 * effect by holding it — the *only* door to authority is `kernel.invoke(handle, …)`, which is where the
 * dual gate (membership + liveness for authority, clearance for flow) lives. "Caps can't be invoked
 * off-path" becomes structural, not a discipline.
 *
 * This is not the verified seL4 floor (that is phase 3). It is the JS-level move that makes the totally
 * trusted code small enough to audit.
 */
import type { InvokeContext, InvokeResult } from './capability';
import { harden } from './harden';
import type { Clearance } from './label';
import { flowCheck } from './label';

export interface CapHandle {
  readonly id: string;
  readonly kind: string;
  readonly clearance: Clearance;
}

type Effect = (arg: unknown, ctx: InvokeContext) => InvokeResult | Promise<InvokeResult>;

interface Entry {
  readonly effect: Effect;
  readonly parent?: CapHandle;
  readonly expiresAt?: number; // a lease, measured against the kernel's trusted clock (issue #30)
  live: boolean;
}

export interface Kernel {
  mint(spec: { kind: string; clearance: Clearance; effect: Effect; expiresAt?: number }): CapHandle;
  invoke(handle: CapHandle, arg: unknown, ctx: InvokeContext): Promise<InvokeResult>;
  attenuate(handle: CapHandle, opts: { kind?: string; clearance?: Clearance; ttlMs?: number }): CapHandle;
  revoke(handle: CapHandle): void;
}

/**
 * The kernel owns ONE trusted clock (issue #30). Leases are measured against it; nothing else reads
 * time, so an agent cannot forge expiry — it never supplies a timestamp, and the effect functions don't
 * read the clock. Inject a controllable clock for tests; the default is the host clock read here, in the
 * trusted base, exactly once per check.
 */
export function makeKernel(clock: () => number = () => Date.now()): Kernel {
  // The entire raw authority of the system. Closure-private — unreachable from any handle or caller.
  const registry = new WeakMap<CapHandle, Entry>();
  let counter = 0;

  const liveChain = (h: CapHandle): boolean => {
    const e = registry.get(h);
    if (!e || !e.live) return false;
    if (e.expiresAt !== undefined && clock() >= e.expiresAt) return false; // lease expired
    return e.parent ? liveChain(e.parent) : true;
  };

  const kernel: Kernel = {
    mint({ kind, clearance, effect, expiresAt }) {
      counter += 1;
      const handle: CapHandle = harden({ id: `cap:${kind}:${counter}`, kind, clearance });
      registry.set(handle, { effect, live: true, expiresAt });
      return handle;
    },

    async invoke(handle, arg, ctx) {
      const e = registry.get(handle);
      if (!e) throw new Error('not a capability of this kernel');
      if (!liveChain(handle)) throw new Error('capability revoked or expired');
      const verdict = flowCheck(ctx.requesterLabel, handle.clearance);
      if (!verdict.ok) throw new Error(`flow: ${verdict.reasons.join('; ')}`);
      return e.effect(arg, ctx);
    },

    attenuate(handle, opts) {
      if (!registry.get(handle)) throw new Error('not a capability of this kernel');
      counter += 1;
      const kind = opts.kind ?? handle.kind;
      const derived: CapHandle = harden({ id: `cap:${kind}:${counter}`, kind, clearance: opts.clearance ?? handle.clearance });
      // ttlMs leases the derived cap against the kernel's trusted clock (issue #30).
      const expiresAt = opts.ttlMs !== undefined ? clock() + opts.ttlMs : undefined;
      // The derived effect forwards through the kernel, so revoking/expiring the parent cascades.
      registry.set(derived, { effect: (a, c) => kernel.invoke(handle, a, c), parent: handle, live: true, expiresAt });
      return derived;
    },

    revoke(handle) {
      const e = registry.get(handle);
      if (e) e.live = false;
    },
  };

  return harden(kernel);
}
