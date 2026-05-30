/**
 * Supervisor — the trusted base's wiring authority. `wire()` admits a topology only if it satisfies
 * the global separation-of-duties invariant (issues #1, #22). A rejected topology never runs — the
 * unsafe arrangement is prevented by construction, not detected at runtime.
 */
import type { Label } from './label';
import { bottom } from './label';
import type { SodResult, Topology, Violation } from './topology';
import { checkSeparationOfDuties } from './topology';

export class SeparationOfDutiesError extends Error {
  readonly violations: readonly Violation[];
  constructor(violations: readonly Violation[]) {
    const summary = violations
      .map((v) => `[${v.leaks.join(', ')}] can reach sink '${v.sink}' via ${v.path.join(' → ')}`)
      .join('; ');
    super(`separation-of-duties violated: ${summary}`);
    this.name = 'SeparationOfDutiesError';
    this.violations = violations;
  }
}

/** Admit a topology, or refuse it. Throws `SeparationOfDutiesError` if the invariant is violated. */
export function wire(topo: Topology): SodResult {
  const result = checkSeparationOfDuties(topo);
  if (!result.ok) throw new SeparationOfDutiesError(result.violations);
  return result;
}

/**
 * A declassifier is a TRUSTED transform on the edge — never the model (docs/04). It must construct
 * its output from only-cleared inputs so the removal is *sound* (structural), and it stamps the
 * result with a reduced label. This one turns a confidential record set into a non-secret aggregate.
 */
export interface Declassified {
  readonly value: unknown;
  readonly label: Label;
}

export function countOnlyDeclassifier(records: { readonly customers: readonly unknown[] }): Declassified {
  // Sound by construction: the output is derived from the *cardinality* only — no record content
  // crosses the boundary. (Boundary noted in docs/04: tiny counts can themselves leak; out of scope.)
  return { value: { customerCount: records.customers.length }, label: bottom() };
}
