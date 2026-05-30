// Minimal ambient declarations for the bits of WebAssembly + wabt we use, so the kernel can keep
// compiling with `lib: ["ES2022"]` (no DOM). The runtime (Node) provides the real WebAssembly.

declare namespace WebAssembly {
  class Module {
    static imports(m: Module): Array<{ module: string; name: string; kind: string }>;
  }
  class Instance {
    readonly exports: Record<string, (...args: number[]) => number | void>;
  }
  function compile(bytes: Uint8Array): Promise<Module>;
  function instantiate(m: Module, imports: Record<string, Record<string, unknown>>): Promise<Instance>;
}

declare module 'wabt' {
  interface ParsedModule {
    toBinary(opts: object): { buffer: Uint8Array };
    destroy?(): void;
  }
  interface Wabt {
    parseWat(filename: string, source: string): ParsedModule;
  }
  const init: () => Promise<Wabt>;
  export default init;
}
