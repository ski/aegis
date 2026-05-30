/**
 * Phase-1 milestone 3 — a real WASM tool is a capability with zero ambient authority (issue #D1).
 *
 * Run: `pnpm demo:wasm`
 *
 * Two real WebAssembly modules (compiled from WAT at runtime) are wrapped as Aegis capabilities and
 * driven through the same membrane as everything else. The point:
 *
 *   - a WASM tool can reach NOTHING the host doesn't hand it — its entire authority surface is its
 *     import list (the engine enforces this; there is no fs/net/env to reach);
 *   - a tool with one import has exactly one capability — and cannot even instantiate without it;
 *   - "a tool is a capability" holds at the boundary: the sandboxed export plugs into the vat.
 */
import './bootstrap'; // lockdown() first — real SES harden for the whole run
import { makeCapability } from './capability';
import { bottom, sink } from './label';
import { Vat } from './vat';
import { EMIT_DOUBLE_WAT, SQUARE_WAT, compileWat, importsOf, wrapWasmExport } from './wasm-tool';

function bar(): void {
  console.log('─'.repeat(86));
}

async function main(): Promise<void> {
  console.log('\nAEGIS · phase-1 · milestone 3 · a WASM tool is a capability (zero ambient authority)');
  bar();

  // ── A pure tool: no imports, so it can compute but reach nothing ──────────────────────────────
  const squareMod = await compileWat('square', SQUARE_WAT);
  const squareInst = await WebAssembly.instantiate(squareMod, {});
  const squareImports = importsOf(squareMod);
  console.log(`\n  square.wasm   imports: ${JSON.stringify(squareImports)}  → zero ambient authority`);

  // ── An effectful tool: its ONE authority is a host-provided emit capability ───────────────────
  const emitted: number[] = [];
  // The host function we inject IS the tool's capability. We back it with an Aegis sink cap.
  const metricsSink = makeCapability({
    kind: 'metrics_emit',
    clearance: sink([], false),
    invoke: (arg) => {
      emitted.push(arg as number);
      return { value: 'ok', label: bottom() };
    },
  });
  const doubleMod = await compileWat('emit_double', EMIT_DOUBLE_WAT);
  const doubleImports = importsOf(doubleMod);
  console.log(`  double.wasm   imports: ${JSON.stringify(doubleImports)}  → exactly one capability, nothing else`);

  const doubleInst = await WebAssembly.instantiate(doubleMod, {
    cap: { emit: (v: number) => void metricsSink.invoke(v) },
  });

  // A tool cannot run without being handed its capability — it can't conjure authority.
  let rejectedWithoutCap = false;
  try {
    await WebAssembly.instantiate(doubleMod, {});
  } catch {
    rejectedWithoutCap = true;
  }
  console.log(`  double.wasm without its emit cap → ${rejectedWithoutCap ? 'REJECTED (cannot instantiate)' : 'ran anyway?!'}`);

  // ── Wrap both as Aegis caps and drive them through the membrane ───────────────────────────────
  const wasmSquare = wrapWasmExport({ kind: 'wasm_square', run: (arg) => squareInst.exports.square!(arg as number) });
  const wasmDouble = wrapWasmExport({
    kind: 'wasm_emit_double',
    run: (arg) => {
      doubleInst.exports.run!(arg as number);
      return 'emitted';
    },
  });

  const vat = new Vat('tooluser');
  vat.endow('wasm_square', wasmSquare);
  vat.endow('wasm_emit_double', wasmDouble);

  vat.beginTurn();
  const sq = await vat.act('wasm_square', 7);
  console.log(`\n  vat → wasm_square(7)      = ${sq.ok ? sq.value : 'blocked'}`);
  vat.beginTurn();
  const db = await vat.act('wasm_emit_double', 21);
  console.log(`  vat → wasm_emit_double(21) → emitted ${JSON.stringify(emitted)} (via the injected cap)`);

  // ── Guarantees ────────────────────────────────────────────────────────────────────────────────
  bar();
  const onlyAllowedImports = doubleImports.every((i) => i.module === 'cap' && i.name === 'emit');
  const noWasiOrEnv = [...squareImports, ...doubleImports].every((i) => !['wasi_snapshot_preview1', 'env', 'wasi'].includes(i.module));
  const checks: Array<[string, boolean]> = [
    ['pure WASM tool has ZERO imports (no ambient authority)', squareImports.length === 0],
    ['effectful WASM tool exposes exactly ONE capability (cap.emit)', doubleImports.length === 1 && onlyAllowedImports],
    ['no tool imports fs/net/env/wasi (nothing ambient is reachable)', noWasiOrEnv],
    ['a tool cannot instantiate without being handed its capability', rejectedWithoutCap],
    ['WASM tool runs through the membrane as a capability (square(7)=49)', sq.ok && sq.value === 49],
    ['effect happened only via the injected cap (emit → [42])', emitted.length === 1 && emitted[0] === 42],
  ];

  console.log('\nGUARANTEES:');
  let allOk = true;
  for (const [name, ok] of checks) {
    console.log(`  ${ok ? '✅ PASS' : '❌ FAIL'}  ${name}`);
    allOk &&= ok;
  }
  bar();
  console.log(
    allOk
      ? '\n✅ ALL GUARANTEES HELD — the WASM tool has only the authority it was handed; a tool is a capability.\n'
      : '\n❌ A GUARANTEE FAILED.\n',
  );
  process.exitCode = allOk ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
