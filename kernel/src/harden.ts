/**
 * `harden` — make an object tamper-proof so a capability cannot be forged or mutated.
 *
 * Phase-1a uses `Object.freeze`. In production this becomes SES's transitive `harden()`
 * (after `lockdown()`), per ADR 0001's control-plane choice. The object-capability *patterns*
 * here are identical — unforgeable references via closure encapsulation, frozen objects — SES
 * just makes the freeze deep and tamper-proof against a hostile realm.
 *
 * Swap path: `import 'ses'; lockdown();` then re-export the global `harden`. No call-site changes.
 */
export const harden = <T>(x: T): T => Object.freeze(x) as T;
