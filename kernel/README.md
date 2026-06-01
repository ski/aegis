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
pnpm demo:docker        # the Docker isolation rung — a tool in a hardened container (skips live if no Docker)
pnpm demo:gvisor        # the gVisor rung — a tool behind a userspace kernel (runsc) (skips live if no runsc)
pnpm demo:microvm       # the microVM rung — a tool in a hardware-virtualized guest via KVM (skips live if no KVM)
pnpm demo:firecracker   # the production microVM rung — a tool in a Firecracker (AWS-Lambda VMM) guest (skips if absent)
pnpm demo:sel4          # the VERIFIED rung — a confined PD on the formally-verified seL4 microkernel (skips if no SDK)
pnpm demo:grammar       # a REAL local model (Gemma 4 E4B / llama.cpp), grammar-constrained tool-calls (set AEGIS_LLM_URL)
pnpm demo:store         # unify labeled memory (keyed) and the labeled space (associative) — one store, two faces
pnpm demo:space:distributed  # the labeled space distributed over CapTP — coordination across machines
pnpm demo:labels        # the full label lattice + declassification-as-capability (decentralized IFC, doc 08)
pnpm demo:microblog     # a microblog as caps+IFC — Alice→Bob→Eve: sharing=delegation, visibility=IFC (doc 09)
pnpm fuzz [n]           # property-based: invariants hold across n random adversarial cases per property
pnpm test               # vitest: unit tests + an integration test that runs every demo under lockdown
pnpm typecheck          # tsc --noEmit
# point demo:model at a real local model:
#   AEGIS_MODEL_URL=http://localhost:11434/v1/chat/completions pnpm demo:model

# aegisd — the REAL interactive agent (native Linux/WSL2, bare node, no tsx/build). See AEGISD.md:
#   AEGIS_LLM_URL=http://127.0.0.1:8080/v1/chat/completions node --experimental-transform-types src/aegisd.ts
```

> **Native Linux note:** relative imports use explicit `.ts` extensions, so the kernel runs with bare
> `node --experimental-transform-types` (no tsx, no esbuild) — important on Linux/WSL2 where the
> Windows-installed esbuild binary can't run. tsx and tsc still accept `.ts` imports, so the demos work
> on both. This aligns with ADR 0001's Linux target.

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
| `src/tool-grammar.ts` | GBNF grammar that locks output to a valid tool-call whose `tool` is a held cap |
| `src/grammar-oracle.ts` | oracle that grammar-constrains a llama.cpp server at decode time (hard guarantee) |
| `src/demo-grammar.ts` | a real local model, structurally confined to valid tool-calls; the membrane still decides |
| `llm/` | llama.cpp + GGUF setup, what we verified about grammar enforcement, and the gotchas |
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
| `src/docker-tool.ts` | spawn a tool in a hardened container (no caps/network, read-only, bounded) as a cap |
| `src/demo-docker.ts` | the Docker isolation rung; runs live where Docker exists, else verifies the argv |
| `src/gvisor-tool.ts` | run a tool behind gVisor's userspace kernel (`runsc do`), wrapped as a cap |
| `src/demo-gvisor.ts` | the gVisor rung; runs live where runsc exists, else verifies the sandbox argv |
| `src/microvm-tool.ts` | boot a hardware-virtualized guest (KVM) per call, wrapped as a cap |
| `src/demo-microvm.ts` | the microVM rung; runs live where WSL2+KVM+QEMU exist, else skips the live boot |
| `microvm/` | guest init (static C), zero-download build, run script, and rung README |
| `src/firecracker-tool.ts` | boot a Firecracker (AWS-Lambda VMM) microVM per call, wrapped as a cap |
| `src/demo-firecracker.ts` | the Firecracker rung; runs live where firecracker+KVM exist, else skips |
| `firecracker/` | guest init, build, run (declarative JSON boot), and rung README |
| `src/sel4-tool.ts` | build+boot a confined PD on the verified seL4 kernel per call, wrapped as a cap |
| `src/demo-sel4.ts` | the verified rung; runs live where the Microkit SDK exists, else skips |
| `sel4/` | the Aegis tool as an seL4 Microkit protection domain + build script + rung README |
| `src/store.ts` | unified labeled+leased store: keyed (`kv`) + associative (`space`) faces over one core |
| `src/demo-store.ts` | one store, two faces — labeled memory and the labeled space unified |
| `src/demo-space-distributed.ts` | the labeled space over CapTP — coordination across a wire |

## Honest scope (what this is NOT yet)

Accurate as of the current milestones. Honesty cuts both ways — when a caveat here gets shipped past,
it is *removed*, not left to overclaim a gap that no longer exists. For limits that are *fundamental*
(can't be patched, only scoped around) see [`docs/06-irreducible-limits.md`](../docs/06-irreducible-limits.md).

**Implemented since the early caveats (no longer gaps):** WASM/WASI tools are capabilities with zero
ambient authority (`demo:wasm`, #D1); the powerbox + trusted path are built (`demo:powerbox`, #7/#17);
`harden` is the real SES transitive freeze under `lockdown()` (`demo:hardened`); model-as-oracle runs
over real HTTP (`demo:model:http`); labeled memory, the labeled space, the unified store, CapTP
distribution, the microkernel, the TCB-integrity trio, and a Docker isolation rung all exist.

**Still genuinely open (engineering — buildable here):**
- **The model is the swappable oracle, not the core caps.** WASM isolates *tools* (`demo:wasm`); the
  *control-plane* caps are still in-process JS objects relying on SES + the microkernel boundary, not
  per-cap WASM/VM isolation. Hardening each effect into its own sandbox is incremental.
- **The default demos use a deterministic mock model** so the security property stays testable offline.
  Real inference works — `demo:model:http` (mock HTTP server), and `demo:grammar` drives a **real local
  model** (Gemma 4 E4B via llama.cpp) with **grammar-constrained** tool-calls when opted in via
  `AEGIS_LLM_URL`. Constrained decoding is now structural (GBNF), not validate-and-retry. See
  [`llm/`](llm/).
- **Stores are in-memory.** The unified labeled store (`store.ts`) is not persisted; JavaSpaces-style
  durability + label preservation across restarts is unbuilt.
- **Template matching is primitive-equality only** (doc 07): object-valued fields won't match; no
  structural/type matching, no `notify`, `take` is an O(n) scan.
- **Distribution is in-process loopback.** CapTP + the distributed space run over a loopback channel,
  not a real socket/worker transport (`demo:distribution`, `demo:space:distributed`).
- **CI is parked** — the workflow exists but auto-triggers are disabled pending an account billing fix;
  the tests are run manually, not gated on push.
- **The M12 audit finding (#32)** — the vat collapses all cap-invocation errors into `blocked:'revoked'`,
  so a scope/validation refusal is mislabeled in the audit trail. Cheap to fix.

**Open by design / harder (research or host-dependent):**
- **The declassifier is structural and demo-specific** (a count-only reducer, sound because it derives
  from cardinality alone). A general free-text declassifier is an open problem, not a TODO (#2).
- **SES hardens the realm, not the TCB.** The 4-method microkernel (`demo:microkernel`) shrinks the
  trusted surface. The **seL4 verified floor is now demonstrated** (`demo:sel4`) — a confined PD on the
  machine-checked microkernel — but as a *rung* (prebuilt SDK, under QEMU in WSL2), not yet the project's
  own *separately-verifiable control-plane core* (#19, still the deeper open work).
- **The full isolation ladder runs live** — process (`demo:isolation`) < container (`demo:docker`) <
  gVisor (`demo:gvisor`) < microVM / Firecracker (`demo:microvm` / `demo:firecracker`) < the **verified**
  seL4 floor (`demo:sel4`) — but all inside WSL2-on-Windows, a long trust chain (dev-grade). A production
  substrate on a real Linux box with direct KVM (and the seL4 floor on real hardware) remains future work.
- **Never run for real.** Every demo is a scenario authored to pass; the kernel has not been used as a
  persistent daily-driver, so the ergonomic tensions (POLA-vs-usability #7, the human-attention budget
  #24) remain theoretical.

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
- [x] **Docker isolation rung** (`pnpm demo:docker`): a stronger isolation rung than the bare child
  process — the untrusted tool runs in a hardened container (`--cap-drop=ALL --network=none --read-only
  --security-opt=no-new-privileges` + pid/memory limits), reached only over a typed cap. With **no
  network**, the tool's *only* channel is the capability. Rung ladder: child process &lt; **Docker
  (namespaces)** &lt; gVisor &lt; microVM (Firecracker/Kata). Runs live where Docker exists; verifies the
  confinement argv and skips the live run otherwise (stays green in CI).
- [x] **gVisor isolation rung** (`pnpm demo:gvisor`): the rung between container and microVM — the
  untrusted tool runs behind **gVisor's userspace kernel** (`runsc`), which intercepts and services its
  syscalls so it never touches the host Linux kernel directly (far smaller host attack surface than a
  plain container, no full VM). Run via `runsc do` standalone (no Docker daemon needed), network
  disabled, wrapped as a capability, output labeled `isolated-gvisor`. Runs live where runsc exists.
- [x] **MicroVM isolation rung** (`pnpm demo:microvm`): the strongest rung — the untrusted tool runs in a
  **hardware-virtualized guest with its own kernel** (isolated by KVM), no network/disk/shared-fs, the
  serial console its only channel, wrapped as a capability. Built with zero downloads (static-C init +
  python-packed initramfs + the reused WSL2 kernel; see [`microvm/`](microvm/)). Completes the ladder:
  process &lt; container &lt; **microVM**. Runs live where WSL2+KVM+QEMU exist; skips the live boot
  otherwise. *Dev-grade here* — the VM runs inside WSL2-on-Windows (long trust chain), not a production
  substrate (ADR 0001).
- [x] **Firecracker rung — the production microVM** (`pnpm demo:firecracker`): the same
  hardware-virtualization isolation as the QEMU microVM, but via **Firecracker** — the minimal KVM VMM
  behind AWS Lambda. The tool runs as PID 1 in a stripped-down guest (no network, no extra drives),
  request in via kernel cmdline, response out via console, a fresh microVM per call. Built zero-download
  (static-C init + initramfs) on Firecracker's CI vmlinux. See [`firecracker/`](firecracker/). Dev-grade
  here (runs inside WSL2); the real target is a Linux box with direct KVM (ADR 0001).
- [x] **seL4 verified rung — the assurance floor** (`pnpm demo:sel4`): the untrusted tool runs as a
  confined **Microkit protection domain on the formally-verified seL4 microkernel** (booted on
  qemu-aarch64). Every rung above provides strong-but-*unverified* isolation; seL4 has machine-checked
  proofs, so confinement here is **proven**, not merely structural — ADR 0001's phase-3 verified floor.
  A fresh image is built + booted per call; output labeled `isolated-sel4-verified`. See
  [`sel4/`](sel4/). Honest: the proof covers the *kernel*, not our PD/tooling/stack; we use the prebuilt
  SDK under QEMU in WSL2 — a demonstration of the rung, not a hardened bare-metal deployment.
- [x] **Unified labeled store** (`pnpm demo:store`): labeled memory (keyed) and the labeled space
  (associative) are one capability-secure, labeled, leased store with two faces — a keyed `kv` put is the
  same entry the associative `space` face sees (keyed = template on the `__key` field). Facet attenuation,
  label-travel, clearance filtering, and leasing all hold on both faces.
- [x] **Distributed labeled space over CapTP** (`pnpm demo:space:distributed`): the coordination fabric —
  a space on a host vat, a worker vat holding only a remote *facet* coordinating with `E()` across a
  CapTP channel. Decoupled coordination spans machines; facet attenuation and label-travel survive the
  wire. Loopback channel now; swap for a socket and it's multi-machine.
