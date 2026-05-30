# ADR 0001 — Substrate

- **Status:** Accepted (locked)
- **Date:** 2026-05-30
- **Supersedes:** —

## Context

Aegis must run on real hardware (not a research toy), and real AI needs a real accelerator — yet
accelerator drivers are the single biggest obstacle to a small, trustworthy base. We need a substrate
that gives genuine capability discipline *and* real isolation *and* runs the model, on hardware a person
actually owns.

## Decision

**Target:** a single consumer-grade laptop.

**Trust-layered architecture (all phases):**
- Control plane = ocap language/runtime (hardened-JS/SES or Goblins-style vats): mints, attenuates,
  delegates, revokes caps; runs membranes; hosts the petname resolver. The logical "kernel" — a
  supervisor, not ring-0.
- Isolation plane = WASM Component Model + WASI Preview 2 for tools and untrusted native bits, each
  reachable only through a typed capability.
- Inference = never in the trusted base; always a capability behind a confined component or remote
  sturdyref.

**Inference contract:**
- CPU is the guaranteed floor (portable, driver-light, keeps the base verifiable). Small models (1–8B,
  4-bit) carry control-plane reasoning.
- Integrated GPU is opportunistic acceleration of the same capability (Vulkan/SYCL on the Linux base).
- A remote frontier model is a metered, optional escalation cap, never required.

**Phasing:**
1. Linux base + WASM/WASI + hardened control plane. iGPU acceleration here.
2. MicroVM the untrusted components (Firecracker-style). Still Linux.
3. seL4 + Genode verified floor — earned, optional; buys a machine-checked confinement theorem; CPU
   inference carries it.

## Rationale

- The GPU blob can't live in a verifiable base, so the model is a capability on *every* substrate — which
  means the substrate choice is about the control plane, not inference.
- WASM/WASI is the only v1 option giving ocap discipline + real sandbox isolation + a production runtime +
  "a tool is a capability" at the type level, today.
- A small model suffices because the workload is tool-use + planning, constrained decoding handles output
  validity, and the security model removes intelligence-as-safety-net. The ocap layer is what *lets* us
  use a small model.
- The "CPU minimum, GPU if available" constraint cleanly partitions the phases: CPU-inference rides the
  verified path; iGPU-acceleration rides the pragmatic Linux path.

## Consequences

- Steps 1–2 deliver ~90% of the security at ~10% of the cost; step 3 is only for "verified AI confinement."
- Even at the verified floor, inference runs in an *unverified* Linux guest VM; verification proves
  everything else is isolated from it, not that the guest is correct.
- Distribution (OCapN/CapTP, sturdyrefs) is a later layer, not a v1 dependency.

## Open / deferred

- Exact small-model choice (empirical).
- Whether step 3 is ever taken.
- Distribution timing.
