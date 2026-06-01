import { describe, expect, it } from 'vitest';
import { runFuzz } from '../src/fuzz.ts';

// Property-based: the core security invariants hold across many random adversarial cases, each checked
// by an INDEPENDENT shadow oracle (not the kernel's own logic). The CLI `pnpm fuzz 20000` runs more; the
// suite runs a smaller deterministic slice (fixed seed) so CI stays fast but still gated.
describe('property-based adversarial invariants', () => {
  it('hold across 1500 random cases per property (independent shadow oracle)', async () => {
    const results = await runFuzz(1500, 42);
    for (const r of results) {
      if (r.failures.length) console.error(r.property, r.failures.slice(0, 3));
      expect(r.failures, r.property).toHaveLength(0);
    }
  }, 60_000);
});
