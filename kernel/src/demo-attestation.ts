/**
 * Milestone — supply-chain attestation (issue #29).
 *
 * Run: `pnpm demo:attestation`
 *
 * Before admitting an artifact (here, a real WASM tool), the trusted base verifies its content digest
 * against a pinned hash. The genuine artifact is admitted and runs; a single tampered byte fails
 * attestation and is refused — runtime confinement can't help once the confiner/tool is compromised, so
 * we catch it at admission. This is ADR 0002's tool-admission ritual made concrete.
 */
import './bootstrap.ts';
import wabtInit from 'wabt';
import { admitArtifact, attest, digest } from './attestation.ts';
import { SQUARE_WAT, wrapWasmExport } from './wasm-tool.ts';

function bar(): void {
  console.log('─'.repeat(86));
}

async function compileToBytes(wat: string): Promise<Uint8Array> {
  const wabt = await wabtInit();
  const parsed = wabt.parseWat('artifact', wat);
  const bytes = parsed.toBinary({}).buffer;
  parsed.destroy?.();
  return bytes;
}

async function main(): Promise<void> {
  console.log('\nAEGIS · supply-chain attestation · verify the artifact before you trust it (#29)');
  bar();

  // Compile a real WASM tool to bytes and pin its hash (what the operator records at admission time).
  const artifact = await compileToBytes(SQUARE_WAT);
  const pinned = digest(artifact);
  console.log(`\n  pinned hash: ${pinned.slice(0, 24)}…`);

  // 1) genuine artifact → admitted → runs
  const admitted = admitArtifact(artifact, pinned);
  const inst = await WebAssembly.instantiate(await WebAssembly.compile(admitted), {});
  const square = wrapWasmExport({ kind: 'wasm_square', run: (a) => inst.exports.square!(a as number) });
  const result = await square.invoke(9);
  console.log(`  genuine artifact: ADMITTED → square(9) = ${(result as { value: unknown }).value}`);

  // 2) tampered artifact → attestation fails → refused
  const tampered = new Uint8Array(artifact);
  tampered[tampered.length - 1] = (tampered[tampered.length - 1]! ^ 0x01) & 0xff; // flip one bit
  const tamperedCheck = attest(tampered, pinned);
  let refused = false;
  try {
    admitArtifact(tampered, pinned);
  } catch {
    refused = true;
  }
  console.log(`  tampered artifact: attest.ok=${tamperedCheck.ok} → ${refused ? 'REFUSED at admission' : 'admitted?!'}`);

  bar();
  const checks: Array<[string, boolean]> = [
    ['the genuine artifact attests and is admitted', attest(artifact, pinned).ok],
    ['the admitted artifact runs (square(9) = 81)', (result as { value: unknown }).value === 81],
    ['a single tampered byte fails attestation', tamperedCheck.ok === false],
    ['the tampered artifact is refused at admission', refused],
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
      ? '\n✅ ALL GUARANTEES HELD — only an artifact matching its pinned hash is admitted; a tampered build is refused.\n'
      : '\n❌ A GUARANTEE FAILED.\n',
  );
  process.exitCode = allOk ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
