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
pnpm demo:model         # milestone 4: model-as-oracle — constrained decoding + deterministic replay
pnpm demo:hardened      # hardening: SES lockdown + tamper-proof caps + transitive revocable membrane
pnpm demo:distribution  # CapTP: cross-vat capabilities, promise pipelining, revocation across the wire
pnpm demo:microkernel   # #19: all raw authority behind a 4-method core; caps can't be invoked off-path
pnpm demo:model:http    # real model end-to-end over HTTP (OpenAI-compatible adapter, real round-trips)
pnpm demo:isolation     # phase-2 substrate: an untrusted tool confined to its own OS process behind a cap
pnpm demo:memory        # #16: labels survive memory — the across-session secret leak is closed
pnpm demo:clock         # #30: leases expire against one trusted clock the agent cannot forge
pnpm demo:attestation   # #29: verify an artifact's pinned hash before admitting it; tampered builds refused
pnpm demo:policy        # #31: only the operator's admin cap may change policy; every change is audited
pnpm demo:assistant     # capstone: a confined document assistant doing a real task on real files
pnpm demo:space         # a capability-scoped, labeled, leased tuple space (JavaSpaces ∩ ocap ∩ IFC ∩ leases)
pnpm test               # vitest: unit tests + an integration test that runs every demo under lockdown
pnpm typecheck          # tsc --noEmit
# point demo:model at a real local model:
#   AEGIS_MODEL_URL=http://localhost:11434/v1/chat/completions pnpm demo:model
```

Each demo exits nonzero if any guarantee fails.

`pnpm test` runs the **vitest** suite: unit tests for the pure logic (labels/flow, the global
separation-of-duties checker, the microkernel, the transitive membrane, the model-oracle's constrained
decoding + replay, the powerbox) plus an integration test that spawns **every demo** and asserts it
exits 0 — so the full lockdown path is CI-gated, not demo-as-test. (Unit tests run without lockdown via
the `Object.freeze` fallback; the integration test exercises the real SES path in subprocesses.)

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
| `src/bootstrap.ts` | Endo bootstrap — `@endo/init` (lockdown + HandledPromise); import first |
| `src/harden.ts` | `harden` — SES transitive `harden()` under lockdown, else `Object.freeze` |
| `src/membrane.ts` | the transitive revocable membrane (shadow-target) + `makeCaretaker` |
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
| `src/model-oracle.ts` | model-as-oracle: constrained decoding (validate+retry), inference log, replay, OpenAI-compatible adapter |
| `src/demo-model.ts` | milestone 4: messy model text → tool-calls; guarantees invariant under model swap; deterministic replay |
| `src/demo-hardened.ts` | hardening: lockdown active, tamper-proof caps, Far, transitive membrane, cascading-revoke kill-switch |
| `src/demo-distribution.ts` | CapTP: cross-vat caps, promise pipelining, confinement + revocation across a wire |
| `src/microkernel.ts` | #19 core: all raw authority behind a 4-method kernel + a private sealed registry |
| `src/demo-microkernel.ts` | #19: off-path invocation is structurally impossible; dual gate in the small core |
| `src/demo-model-http.ts` | real model end-to-end over HTTP (OpenAI-compatible adapter + local mock server) |
| `src/tool-worker.ts` / `src/process-tool.ts` | an isolated tool in its own OS process, wrapped as a capability |
| `src/demo-isolation.ts` | phase-2 substrate: process isolation behind a typed cap (microVM is the next rung) |
| `src/labeled-memory.ts` | #16: a label-preserving, cap-scoped memory store + its write/recall caps |
| `src/demo-memory.ts` | #16: plain store leaks across sessions; labeled memory closes it |
| `src/microkernel.ts` (leases) | #30: an injected trusted clock + TTL leases enforced by the kernel |
| `src/attestation.ts` / `src/demo-attestation.ts` | #29: pin-and-verify artifact digests at admission |
| `src/policy.ts` / `src/demo-policy.ts` | #31: admin-cap-gated, append-only-audited policy changes |
| `src/demo-clock.ts` | #30: leased caps expire against the trusted clock |
| `src/demo-assistant.ts` | capstone: a confined document assistant doing a real task on real files |
| `src/space.ts` | a capability-scoped, labeled, leased tuple space (facets + template match + lease) |
| `src/demo-space.ts` | decoupled coordination scoped by caps, labeled by IFC, decaying by lease |

## Honest scope (what this is NOT yet)

Tracked against the design's known gaps:

- **No WASM/WASI isolation yet** — caps are in-process objects; the trust boundary is that the
  untrusted oracle only emits *data*, never touches kernel objects. Phase 1b moves untrusted effects
  into WASM components (issue #D1 / substrate phase 1).
- **The default model is a deterministic mock** — milestone 4 builds the real model-as-oracle harness
  (constrained decoding, inference logging, replay) and a real OpenAI-compatible adapter, but the
  *default* demo uses a scripted mock so the property stays testable offline. Set `AEGIS_MODEL_URL` to
  drive it with a real local CPU model.
- **No powerbox / trusted path yet** (issues #7, #17) — endowment is static. The brokered grant flow
  with an unspoofable UI is the next build milestone.
- **The declassifier is structural and demo-specific** (a count-only reducer). It is sound *because*
  it constructs its output from cardinality alone — it is not a general free-text declassifier, which
  remains out of scope (issue #2).
- ~~`harden` is shallow~~ — **done:** the kernel runs under SES `lockdown()`, so `harden()` is the
  real transitive freeze and the membrane is enforced against a hardened realm (`pnpm demo:hardened`).
  Still open: this hardens the *realm*, not the *TCB* — the minimized verifiable membrane core (#19)
  is separate, harder work.

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
- [x] **4 — model-as-oracle: constrained decoding + replay** (`pnpm demo:model`): the injected
  scenario driven by a *model* emitting messy free text. The harness constrains it into valid
  tool-calls (retrying on garbage) and logs every inference. The membrane's guarantees are unchanged
  (safety doesn't depend on the model) and the logged run replays deterministically. A real
  OpenAI-compatible adapter is wired — point a local CPU model at it with `AEGIS_MODEL_URL`.
- [x] **Hardening — Endo / SES** (`pnpm demo:hardened`): the kernel now runs under `lockdown()`
  (all six demos). The SES-compatible patterns became actual SES — caps are tamper-proof under
  transitive `harden()`, `Far` remotables are ready for CapTP — and the structural headline is a
  **transitive revocable membrane**: a sub-cap reached through a membrane dies when it is revoked
  (cascading revocation), wired into the vat as a kill-switch. (Note: this hardens the *realm*; it
  does not shrink the TCB — #19 still stands.)
- [x] **Distribution — CapTP** (`pnpm demo:distribution`): two vats over a channel; a guest invokes a
  host capability via `E()` with promise pipelining; confinement holds across the boundary; the host's
  revocation reaches the guest. In-process loopback now — swap the channel for a socket/worker and
  nothing else changes (docs/03 OCapN).
- [x] **Membrane microkernel — #19 (progress)** (`pnpm demo:microkernel`): all raw authority lives
  behind a **4-method core** (`mint`/`invoke`/`attenuate`/`revoke`) and one closure-private registry.
  A cap handle exposes only metadata and **cannot be invoked off-path** — the only door to authority is
  the kernel, where the dual gate and cascading revocation live. This shrinks the JS-level trusted
  surface; *separately-verifiable* (the seL4 floor) remains the phase-3 completion of #19.
- [x] **Real model end-to-end over HTTP** (`pnpm demo:model:http`): a local OpenAI-compatible server
  drives the agent through the real `fetch` adapter — constrained decoding and the membrane on the live
  transport. Only the weights are mocked; point `AEGIS_MODEL_URL` at Ollama/llama.cpp for a real model
  (`ollama run llama3.2:1b` then `AEGIS_MODEL_URL=…:11434/v1/chat/completions pnpm demo:model`).
- [x] **Phase-2 substrate — isolation plane** (`pnpm demo:isolation`): an untrusted tool runs in its
  own OS process, wrapped as a capability and driven through the membrane; it shares no memory and
  holds none of the parent's caps, its output is labeled by provenance, and killing it severs the cap.
  Process isolation is the rung below a **microVM** (Firecracker) — the hardware-isolated version of the
  same shape, reached the same way.
- [x] **Labeled memory — #16** (`pnpm demo:memory`): closes the across-session leak. A secret written to
  a *plain* store comes back unlabeled on recall and the flow gate lets it leave; **labeled memory** stores
  the label with the value, so a later session that recalls it is re-tainted and the send is blocked
  exactly as in-turn. Plugs in with no vat change — the write cap stamps the writer's true turn-label
  (`ctx.requesterLabel`), the recall cap returns `{value, label}` which the vat already re-absorbs.
- [x] **TCB-integrity trio** — tightening the trusted base:
  - **#30 trusted clock** (`pnpm demo:clock`): the kernel owns one injected clock; leases expire against
    it and the agent supplies no time, so expiry can't be forged.
  - **#29 supply-chain attestation** (`pnpm demo:attestation`): an artifact is admitted only if its
    content digest matches a pinned hash; a single tampered byte is refused at admission (ADR 0002).
  - **#31 policy/upgrade gating** (`pnpm demo:policy`): policy changes require the operator-held,
    unforgeable admin capability and are all written to an append-only audit log.
- [x] **Capstone — a real task on real files** (`pnpm demo:assistant`): a document assistant
  summarizes meeting notes into `summary.md` (real filesystem I/O) with least authority — a read cap
  scoped to `notes/`, a write sink cleared for no secrets, and *no* outbound cap. An injected note
  tries to exfiltrate; reading outside scope is refused, there is no email cap to escalate through, and
  writing confidential content to the public summary is blocked by the flow gate. The legitimate
  summary lands on disk; no secret does. Surfaced two findings (see issues) — the value of wiring it real.
- [x] **Capability-scoped labeled leased space** (`pnpm demo:space`): a coordination layer — Linda /
  JavaSpaces tuple-space reconciled with the kernel's discipline. Producers and consumers coordinate
  *decoupled* (write/read/take by template, never naming each other), but you hold an attenuated **facet**
  (read/write/take, confined to a sub-space scope and/or a clearance); **labels travel** with entries so
  taking a confidential entry re-taints the taker (and the flow gate then blocks its send); a reader
  cleared for nothing can't even see a confidential entry; and entries **lease** — decaying against the
  trusted clock. Decoupled coordination without ambient authority.
