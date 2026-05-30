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

The remaining findings (#3, #5–#13) are tracked but not yet addressed.

## Threads still open (not yet ADR'd)

- Powerbox grant protocol — what the UI/flow looks like, how provenance gates a grant, how an injected
  grant-request dies (issues #7, #9). Discussed in
  [02](../02-capabilities-and-resolution.md); not yet locked.
- Phase-1 buildable kernel scope — the minimal runnable system (one agent, a powerbox, a few real caps,
  an integrity-first prompt-injection demo that *structurally* fails to escalate).
