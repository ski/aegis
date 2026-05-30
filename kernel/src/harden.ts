/**
 * `harden` — make an object tamper-proof so a capability cannot be forged or mutated.
 *
 * After the Endo bootstrap (`src/bootstrap.ts`) calls `lockdown()`, this delegates to SES's global
 * `harden()` — a TRANSITIVE freeze that walks the whole own-reference graph and is enforced against
 * frozen intrinsics, so a hostile realm cannot tamper with a cap or its prototype chain. Without the
 * bootstrap it falls back to a shallow `Object.freeze`, keeping modules usable in either mode.
 *
 * The check is at call time, so import order never matters: once lockdown has run, every harden() is
 * the real one. Per ADR 0001 the production control plane always runs under lockdown.
 */
export const harden = <T>(x: T): T => {
  const sesHarden = (globalThis as { harden?: <U>(value: U) => U }).harden;
  return sesHarden ? sesHarden(x) : (Object.freeze(x) as T);
};
