# Decision records

Dated, ADR-style records of locked architectural decisions. A decision lands here once it's settled in
discussion; the design docs in `docs/` reference back to these for the "why."

| # | Decision | Status | Date |
| --- | --- | --- | --- |
| [0001](0001-substrate.md) | Substrate — laptop target, CPU-floor inference, WASM/WASI control plane, optional seL4 floor | Accepted | 2026-05-30 |

## Pressure-test (2026-05-30)

First adversarial pass against the four design docs produced 13 findings, tracked as
[issues #1–#13](https://github.com/ski/aegis/issues). Severity labels: `blocks-phase-1`,
`synthesis-risk`, `usability`, `engineering`, `honesty`.

**Three blocking findings were folded into the docs immediately:**

- **#1** (`blocks-phase-1`, `synthesis-risk`) — compartmentalization must be a trusted-base
  separation-of-duties invariant, not a model decision. Folded into
  [03 §spawn](../03-agents-as-vats.md) and [04 §compartmentalization](../04-information-flow.md).
- **#2** (`blocks-phase-1`, `synthesis-risk`) — no sound free-text declassifier; phase 1 scoped
  **integrity-first**, confidentiality only for structured data. Folded into
  [04 §Phase-1 scope](../04-information-flow.md).
- **#4** (`blocks-phase-1`, `honesty`) — "provable confinement" walked back to **structural +
  auditable**; "proven" reserved for seL4 kernel isolation. Folded into README, 00, 01, 03, 04.

The remaining wave-1 findings (#3, #5–#13) are tracked but not yet addressed.

**Second adversarial pass** produced 7 more findings, [issues #14–#20](https://github.com/ski/aegis/issues),
going after pillars the architecture didn't model. Doc-actionable ones were folded in immediately:

- **#15** (F1) — enforce confidentiality at *ingestion* (context assembler), not output. → [04 §asymmetry](../04-information-flow.md)
- **#16** (G1) — labels must persist into memory (labeled-memory layer). → [04 §asymmetry](../04-information-flow.md)
- **#17** (H1) — the powerbox needs a *trusted path* (unspoofable grant UI). → [02 §powerbox](../02-capabilities-and-resolution.md)
- **#18** (I1) — you can't revoke knowledge; **design secrets to decay** (ephemerality / leased information). → [04 §asymmetry](../04-information-flow.md)
- **#19** (J1) — the control plane is a single point of total failure; needs a minimized verifiable membrane core. → [00 §threat model](../00-overview.md)
- **#20** (L1) — petname confusion is a confused deputy at the naming layer. → [02 §petnames](../02-capabilities-and-resolution.md)

**#14** (E1) is a *strategy* decision, not a code fix — see open threads below.

## Threads still open (not yet ADR'd)

- **Personal-OS vs. platform (issue #14, candidate ADR 0002).** Cap-purity is all-or-nothing; an ecosystem
  has a chicken-and-egg adoption problem, a single-tenant personal OS does not (you write all the tools).
  Recommendation: the personal-OS framing — it dissolves #14, #12, and half of #7. **Needs a deliberate call.**
- Powerbox grant protocol — what the UI/flow looks like, how provenance gates a grant, how an injected
  grant-request dies, and the trusted-path mechanism (issues #7, #9, #17). Discussed in
  [02](../02-capabilities-and-resolution.md); not yet locked.
- Phase-1 buildable kernel scope — the minimal runnable system (one agent, a powerbox with a trusted path,
  a few real caps, an integrity-first prompt-injection demo that *structurally* fails to escalate).
