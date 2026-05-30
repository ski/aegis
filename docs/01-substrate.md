# 01 — Substrate (LOCKED)

> Status: **locked** 2026-05-30. See [decisions/0001-substrate.md](decisions/0001-substrate.md).

## The constraint that shapes everything: where does the GPU go?

Model inference is a giant blob of opaque native code — CUDA/Metal kernels, a multi-gigabyte
tensor runtime, vendor drivers. That blob **cannot** live inside a small, verifiable trusted base,
and you would never want it to. Therefore, on *every* substrate:

> The model is reached **through a capability** as an isolated external component — never part of
> the kernel, never ambient authority.

This is forced by physics, not taste, and it is clarifying: **the substrate decision is about the
control plane** (the part that mints caps, spawns agents, runs membranes, resolves petnames), not
about the inference plane. The model is a sandboxed peer behind a cap on all of them.

## Deployment target

A **single consumer-grade laptop**, real hardware, no datacenter dependency.

## Trust-layered architecture (kept across all phases)

- **Control plane** — an ocap language/runtime layer (hardened-JS/SES or Goblins-style vats) that
  mints, attenuates, delegates, and revokes capabilities, runs membranes, and hosts the petname
  resolver. This is the logical "kernel" — a supervisor, not ring-0.
- **Isolation plane** — WASM Component Model + WASI Preview 2 for tools and untrusted native bits,
  each reachable only through a typed capability. "A tool is a capability" holds at the type level.
- **Inference plane** — never in the trusted base; always reached as a capability, ideally as its
  own confined component (local microVM) or a remote sturdyref.

### Why WASM/WASI is the v1 pick

It is the only option that simultaneously gives ocap discipline (WASI is capability-oriented by
construction — no ambient filesystem, preopened handles only; a component can call *only* the
imports it was given), real sandbox isolation, a production runtime (Wasmtime), and "a tool is a
capability" at the type level — today.

## Inference contract (LOCKED)

- **CPU is the guaranteed floor.** Portable, driver-light, keeps the secure base verifiable. Small
  models (1–8B, 4-bit quantized) carry everyday control-plane reasoning. This is what keeps the
  verified-substrate path (below) reachable, because CPU inference pulls no GPU driver into the base.
- **Integrated GPU is opportunistic acceleration** of the same capability (Vulkan / Intel SYCL on
  the Linux base). The agent never sees the difference — routing CPU vs. iGPU vs. remote is the
  membrane's job.
- **A remote frontier model is a metered, optional escalation cap** for rare hard reasoning. Never
  required for the OS to function.

### Why a small model suffices

The model's job here is **tool-use + planning**, not "be a world oracle," and two scaffolds lower
the bar further: (1) **constrained decoding** forces valid tool-call shapes, so the model needn't
be smart enough to emit valid JSON — only to pick the right cap and fill plausible args; (2) the
**security model removes intelligence-as-safety-net** — authority is bounded no matter how weak the
model is, so you can run a smaller model than any ambient-authority agent would dare. The ocap
layer is what *lets* you use a small model; that's a dividend, not a compromise.

Honest floor: below some size the OS is still *secure* but *annoying* (multi-step planning, error
recovery, manipulation-resistance, and petname nuance all degrade). Finding the floor is empirical.

### Laptop footprints (4-bit)

| Model | ~Size | Runs on |
| --- | --- | --- |
| 1–4B (Llama 3.2 1/3B, Qwen2.5 small, Phi-3.5-mini, Gemma 2 2B) | 1–3 GB | CPU comfortably; usable tool-router |
| 7–8B | ~5–6 GB | CPU (slow) or any iGPU via Vulkan |
| 14B | ~9 GB | iGPU with 32 GB system RAM |

## Phasing (LOCKED)

1. **Linux base** + WASM/WASI components + hardened control plane. Real hardware, real inference,
   demonstrable "injection can't escalate." iGPU acceleration available here.
2. **MicroVM the untrusted components** (Firecracker / Cloud-Hypervisor) for hardware-grade
   isolation of inference and outward-facing tools. Still Linux.
3. **seL4 + Genode floor** — *earned, optional.* Buys **machine-checked kernel isolation between
   components** (issue #4) — note this proves the *kernel's* isolation, **not** our control-plane
   enforcement logic, which remains a large unverified component even here. CPU inference carries this
   phase (iGPU here is Intel-only research). Adopt only if a verified isolation floor is the product's
   reason to exist.

Steps 1–2 give ~90% of the security at ~10% of the cost; step 3 is for when the pitch is literally
"verified AI confinement."

### A partition that fell out for free

CPU-inference rides the verified path; iGPU-acceleration rides the pragmatic Linux path. The
"CPU minimum, GPU if available" constraint **is** the phase boundary.

### Honest caveat on the verified floor

Even with seL4, the model can't run on bare metal (no GPU/driver), so inference lives in a Linux
guest VM reached through a capability-routed channel. The "verified OS" therefore still contains a
big *unverified* Linux guest doing inference — which is the point: verification proves *everything
else is isolated from that untrusted guest.* Never claim the guest itself is verified.

## Optional distribution

If/when inference (or other agents) live on separate machines, the **same** cap-passing protocol
runs over the wire via **OCapN/CapTP**, with **sturdyrefs** for durable, reconnectable caps. A
remote inference box is exactly a sturdyref. Lands when multi-machine becomes real; not a v1
dependency.

## Deferred (not blocking)

- Exact small-model choice (empirical, tune later).
- Whether step 3 (verified floor) is ever taken.
- OCapN/distribution timing.
