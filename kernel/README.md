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
pnpm demo        # runs the injection scenario, prints the audit trail, asserts the guarantees
pnpm typecheck   # tsc --noEmit
```

`pnpm demo` exits nonzero if any guarantee fails.

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
| `src/demo.ts` | the scenario, the printed audit trail, and the asserted guarantees |

## Honest scope (what this is NOT yet)

Tracked against the design's known gaps:

- **No WASM/WASI isolation yet** — caps are in-process objects; the trust boundary is that the
  untrusted oracle only emits *data*, never touches kernel objects. Phase 1b moves untrusted effects
  into WASM components (issue #D1 / substrate phase 1).
- **No real model yet** — the oracle is scripted for determinism. A small CPU model swaps in behind
  the same `Oracle` interface (ADR 0001 inference contract).
- **Single over-endowed vat** — to prove the flow gate blocks exfil even when the agent holds both a
  secret source and an outbound sink. The **compartmentalized** reader/sender split (issues #1, #22)
  is the next demo.
- **No powerbox / trusted path yet** (issues #7, #17) — endowment is static. The brokered grant flow
  with an unspoofable UI is the next build milestone.
- **`harden` is shallow** (`Object.freeze`) — SES transitive `harden()` after `lockdown()` is the
  hardening swap.

## Next

See `../docs/decisions/README.md` → "Threads still open". Immediate roadmap: compartmentalized
two-vat demo (#1/#22) → powerbox + trusted path (#7/#17) → WASM component for one real tool (#D1) →
real CPU model behind the oracle.
