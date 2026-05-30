/**
 * WASM tools — "a tool is a capability" at the boundary (issue #D1, substrate phase 1).
 *
 * A WebAssembly module has NO ambient authority by construction: it can touch nothing the host does
 * not explicitly hand it as an import. So a WASM tool's entire authority surface *is* its import
 * list — which is exactly the object-capability discipline, enforced by the engine. We compile real
 * WAT to wasm (via wabt) and wrap the instance as an Aegis `Capability`, so a sandboxed tool plugs
 * into the same membrane as everything else.
 */
import wabtInit from 'wabt';
import type { Capability } from './capability';
import { makeCapability } from './capability';
import type { Clearance } from './label';
import { bottom, source } from './label';

let wabtPromise: ReturnType<typeof wabtInit> | null = null;
const getWabt = (): ReturnType<typeof wabtInit> => (wabtPromise ??= wabtInit());

export async function compileWat(name: string, wat: string): Promise<WebAssembly.Module> {
  const wabt = await getWabt();
  const parsed = wabt.parseWat(name, wat);
  const { buffer } = parsed.toBinary({});
  parsed.destroy?.();
  return WebAssembly.compile(buffer);
}

/** The complete authority surface of a module — every host import it can possibly reach. */
export function importsOf(mod: WebAssembly.Module): Array<{ module: string; name: string }> {
  return WebAssembly.Module.imports(mod).map((i) => ({ module: i.module, name: i.name }));
}

/** A pure tool — no imports, so it can compute but reach nothing. */
export const SQUARE_WAT = `(module
  (func (export "square") (param $x i32) (result i32)
    (i32.mul (local.get $x) (local.get $x))))`;

/** A tool whose ONE authority is a host-provided \`cap.emit\` — its only way to affect the world. */
export const EMIT_DOUBLE_WAT = `(module
  (import "cap" "emit" (func $emit (param i32)))
  (func (export "run") (param $x i32)
    (call $emit (i32.mul (local.get $x) (i32.const 2)))))`;

/**
 * Wrap an instantiated WASM export as an Aegis capability. The export is invoked through the same
 * membrane as any other cap; the WASM sandbox guarantees it cannot exceed the imports it was given.
 */
export function wrapWasmExport(opts: {
  kind: string;
  clearance?: Clearance;
  run: (arg: unknown) => unknown;
}): Capability {
  return makeCapability({
    kind: opts.kind,
    clearance: opts.clearance ?? source(),
    invoke: (arg) => ({ value: opts.run(arg), label: bottom() }),
  });
}
