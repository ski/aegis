# ADR 0002 — Aegis is a personal OS, not a multi-tenant platform

- **Status:** Accepted (locked)
- **Date:** 2026-05-30
- **Resolves:** issue #14 (E1)
- **Related:** #12 (tool-purity all-or-nothing), #7 (powerbox fatigue)

## Context

Cap-purity is all-or-nothing: the system's integrity is only as good as the most ambient tool it admits
(#12). A multi-tenant *platform* therefore faces a chicken-and-egg adoption problem — third-party tool
authors have no incentive to ship capability-pure components until Aegis has enough users to matter, and
Aegis can't get users without tools. Every secure-by-default platform that lost to a convenient insecure
one is precedent. Meanwhile the deployment target (ADR 0001) is already a *single consumer laptop for one
operator*.

## Decision

**Aegis is a single-tenant personal OS.** One human root. The operator writes, or explicitly vets and
admits, every tool. There is no open third-party tool ecosystem in scope.

## Rationale

The personal-OS framing dissolves or softens several open findings at once:

- **#14 (adoption):** gone — there is no ecosystem to bootstrap; the operator supplies the tools.
- **#12 (tool-purity all-or-nothing):** tractable — you control the entire tool set, so purity is a
  vetting discipline you apply to yourself, not a standard you must persuade strangers to adopt.
- **#7 (powerbox fatigue):** softened — far fewer novel third-party grant requests; most authority is
  pre-arranged by the operator who understands it.
- **Multi-tenant isolation questions:** never arise — a single human root means no cross-tenant cap
  confusion, no per-tenant policy, no shared-secret-across-tenants problem.

## Consequences

- **Market is narrow.** Accepted: this is a research / personal-sovereignty project first. Correctness and
  the integrity of the confinement model matter more than reach.
- **Tools are first-party or explicitly admitted.** A tool enters the system only after the operator vets
  its capability footprint. "Admission" is itself a privileged, audited act.
- **A future platform pivot is expensive and reopens #12/#14.** It would require a tool-vetting /
  attestation regime (signed capability manifests, reproducible builds, a trusted admission authority).
  Reversible in principle, but a deliberate, costly re-scoping — not a drift.
- **Positive security side effect.** The single human root simplifies the trust hierarchy and the
  trusted-path / petname story (one principal's namespace, not many).

## Open / deferred

- The exact tool-admission ritual (how the operator vets and admits a tool, and how that admission is
  recorded as a capability grant) — design later, alongside the powerbox.
