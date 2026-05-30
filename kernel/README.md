# Aegis kernel — phase 1a

The first runnable slice of the Aegis control plane. It demonstrates the project's headline
property as executable, asserted code:

> **A prompt-injected agent structurally fails to (1) escalate authority and (2) exfiltrate a
> secret — and an audit trail proves why.**

This is the design docs (`../docs/`) made concrete. TypeScript, matching ADR 0001's language-level
ocap control plane; the `harden` patterns are SES-compatible so `lockdown()` is a drop-in hardening
step later.

## Run it

```bash
pnpm install
pnpm demo               # injection scenario: escalation + exfiltration blocked, with audit trail
pnpm demo:compartments  # milestone 1: global separation-of-duties — unsafe wiring rejected, safe wiring runs
pnpm demo:powerbox      # milestone 2: brokered grants — manufactured grants die, real grants flow over the trusted path
pnpm demo:wasm          # milestone 3: a real WASM tool is a capability with zero ambient authority
pnpm typecheck          # tsc --noEmit
```

Each demo exits nonzero if any guarantee fails.

## What it proves

A scripted oracle (`src/oracle.ts`) plays a model hijacked by a malicious web page. It attempts two
attacks; both are blocked **structurally** — not by detecting the injection:

| Attack | Blocked by | Mechanism |
| --- | --- | --- |
| `admin_delete_all` (escalation) | the **(a) axiom** (docs/02) | naming a tool the vat doesn't hold is not authority — there is no capability to resolve to |
| `send_external` (exfiltration) | the **flow gate** (docs/04) | once the turn absorbed `untrusted-web` taint and `customer-db` secrecy, the send is uncleared on *both* the confidentiality and integrity axes |

Key property: the flow gate **never inspects the payload for the secret** — that would be unsound
against a model that can encode a leak (issue #2). The whole *turn* is contaminated once a secret is
absorbed ("label the turn, not the token"), so any send is gated regardless of the arguments.

## Map

| File | Role |
| --- | --- |
| `src/harden.ts` | `harden` (Object.freeze now; SES `harden` later) |
| `src/label.ts` | IFC labels, the lattice join, clearance, the flow check — the "least knowledge" half |
| `src/capability.ts` | the unforgeable capability primitive |
| `src/vat.ts` | the agent-as-vat: the single membrane where authority + flow are both checked, with the audit log |
| `src/oracle.ts` | the model as an external oracle; a scripted "injected" stand-in |
| `src/tools.ts` | three real caps + the injected model's plan |
| `src/demo.ts` | the escalation/exfiltration scenario, audit trail, and asserted guarantees |
| `src/topology.ts` | the flow graph + the **global** separation-of-duties checker (#1, #22) |
| `src/supervisor.ts` | the trusted base: `wire()` admits/refuses a topology; a sound structural declassifier |
| `src/demo-compartmentalized.ts` | milestone 1: unsafe wiring rejected (incl. laundering chain), safe wiring run |
| `src/powerbox.ts` | the brokered-grant adjudicator: attenuated domain, provenance gate, trusted-path console |
| `src/demo-powerbox.ts` | milestone 2: manufactured grants die at the gate; real grants flow over the trusted path |
| `src/wasm-tool.ts` | compile WAT→wasm; wrap a WASM export as a capability; `importsOf` (the authority surface) |
| `src/demo-wasm.ts` | milestone 3: a WASM tool has only the authority it was handed |

## Honest scope (what this is NOT yet)

Tracked against the design's known gaps:

- **No WASM/WASI isolation yet** — caps are in-process objects; the trust boundary is that the
  untrusted oracle only emits *data*, never touches kernel objects. Phase 1b moves untrusted effects
  into WASM components (issue #D1 / substrate phase 1).
- **No real model yet** — the oracle is scripted for determinism. A small CPU model swaps in behind
  the same `Oracle` interface (ADR 0001 inference contract).
- **No powerbox / trusted path yet** (issues #7, #17) — endowment is static. The brokered grant flow
  with an unspoofable UI is the next build milestone.
- **The declassifier is structural and demo-specific** (a count-only reducer). It is sound *because*
  it constructs its output from cardinality alone — it is not a general free-text declassifier, which
  remains out of scope (issue #2).
- **`harden` is shallow** (`Object.freeze`) — SES transitive `harden()` after `lockdown()` is the
  hardening swap.

## Milestones

- [x] **1a** — injection cannot escalate or exfiltrate (`pnpm demo`).
- [x] **1 — compartmentalization + global separation of duties** (`pnpm demo:compartments`): unsafe
  wiring (incl. a multi-hop laundering chain) is rejected *at wiring time*; the safe topology with a
  declassifier is admitted and confines an injected sender to a declassified aggregate (#1, #22).
- [x] **2 — powerbox + trusted path** (`pnpm demo:powerbox`): brokered grants. An out-of-domain
  request is refused; a tainted (manufactured) request is auto-denied without reaching the operator;
  a clean request is decided over the canonical description via the trusted path; the agent cannot
  self-grant (#7, #17, #20).
- [x] **3 — a real WASM tool is a capability** (`pnpm demo:wasm`): real WebAssembly modules
  (compiled from WAT) wrapped as caps and driven through the membrane. A pure tool has zero imports
  (no ambient authority); an effectful tool's entire authority surface is its one host import, and it
  cannot even instantiate without being handed that capability (#D1).
- [ ] **4** — a real small CPU model behind the `Oracle`, with the inference call logged for replay.
