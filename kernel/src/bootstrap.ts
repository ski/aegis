/**
 * Endo bootstrap — import this FIRST, before any other kernel module.
 *
 * `@endo/init` wires up `HandledPromise` (for @endo/far / eventual-send) and calls `lockdown()`,
 * which hardens the JavaScript realm: the intrinsics (Object, Array, Function, …) are frozen, ambient
 * mutation of shared prototypes is impossible, and the real transitive `harden()` becomes a global.
 *
 * This is ADR 0001's control plane moving from SES-compatible *patterns* to actual SES. After this
 * runs, `src/harden.ts` uses SES `harden` (deep, tamper-proof) instead of a shallow `Object.freeze`,
 * and the membrane in `src/membrane.ts` is enforced against a hardened realm.
 */
import '@endo/init';
