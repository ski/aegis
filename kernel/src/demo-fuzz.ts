/**
 * CLI entry for the property-based adversarial fuzzer. `pnpm fuzz [iterations]`.
 * (Separate from fuzz.ts so the test can import runFuzz without triggering the CLI.)
 */
import { runFuzz } from './fuzz.ts';

const iters = Number(process.argv[2] ?? 2000);
console.log(`\nAEGIS · property-based adversarial fuzz · ${iters} iterations per property\n${'─'.repeat(86)}`);
const results = await runFuzz(iters);
let ok = true;
for (const res of results) {
  const pass = res.failures.length === 0;
  ok &&= pass;
  console.log(`  ${pass ? '✅ PASS' : '❌ FAIL'}  ${res.property}  (${res.iterations} cases)`);
  for (const f of res.failures.slice(0, 3)) console.log(`        seed ${f.seed}: ${f.detail}`);
}
console.log('─'.repeat(86));
console.log(ok ? `\n✅ INVARIANTS HELD across ${iters * 3} random adversarial cases.\n` : '\n❌ A COUNTEREXAMPLE WAS FOUND.\n');
process.exitCode = ok ? 0 : 1;
