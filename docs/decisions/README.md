# Decision records

Dated, ADR-style records of locked architectural decisions. A decision lands here once it's settled in
discussion; the design docs in `docs/` reference back to these for the "why."

| # | Decision | Status | Date |
| --- | --- | --- | --- |
| [0001](0001-substrate.md) | Substrate — laptop target, CPU-floor inference, WASM/WASI control plane, optional seL4 floor | Accepted | 2026-05-30 |
| [0002](0002-personal-os-not-platform.md) | Aegis is a single-tenant personal OS, not a multi-tenant platform (resolves #14) | Accepted | 2026-05-30 |

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

**#14** (E1) was a strategy decision — resolved by [ADR 0002](0002-personal-os-not-platform.md).

**Third adversarial pass** swept by security *category* (DoS, supply chain, side channels, human-factors in
aggregate, the parts of the trusted base previously treated as free) and produced 11 more findings,
[issues #21–#31](https://github.com/ski/aegis/issues), all folded in:

- **#21** (M1) — who assigns labels/clearances; default-deny, operator-stamps-sources at admission. → [04](../04-information-flow.md)
- **#22** (M2, `blocks-phase-1`) — separation of duties must be *global across the flow graph*, not per-vat. → [03 §spawn](../03-agents-as-vats.md)
- **#23** (M3) — least-knowledge vs competence: the cost of the second minimization. → [05](../05-least-authority-least-knowledge.md)
- **#24** (M4) — the aggregate human-attention budget is overspent across all gates. → [02 §powerbox](../02-capabilities-and-resolution.md)
- **#25** (M5) — the trusted components are themselves confused-deputy targets. → [00 §threat model](../00-overview.md)
- **#26** (M6) — quantitative attenuation (rate/quota/budget) is first-class; DoS is a threat category. → [03 §membranes](../03-agents-as-vats.md)
- **#27** (M7) — leaf-resource caps are only as fine-grained as the driver behind them. → [00 §threat model](../00-overview.md)
- **#28** (M8) — microarchitectural side channels on shared hardware (shared KV-cache/caches). → [00 §threat model](../00-overview.md)
- **#29** (M9) — supply-chain integrity of the trusted base (and trojaned models). → [00 §threat model](../00-overview.md)
- **#30** (M10) — leases/ephemerality depend on a trusted clock (now in the TCB). → [00 §threat model](../00-overview.md)
- **#31** (M11) — control-plane upgrade & mutable policy is a total-compromise surface. → [00 §threat model](../00-overview.md)

Also resolved an open question in the docs: **label-the-turn is the right *detection* granularity; finer
precision comes from finer *compartments*, not finer labels** ([04](../04-information-flow.md)).

## Threads still open (not yet ADR'd)

- ~~Personal-OS vs. platform (issue #14)~~ — **resolved: [ADR 0002](0002-personal-os-not-platform.md),
  single-tenant personal OS.** Dissolves #14, makes #12 tractable, softens #7.
- Powerbox grant protocol — what the UI/flow looks like, how provenance gates a grant, how an injected
  grant-request dies, and the trusted-path mechanism (issues #7, #9, #17). Discussed in
  [02](../02-capabilities-and-resolution.md); not yet locked.
- Phase-1 buildable kernel scope — the minimal runnable system (one agent, a powerbox with a trusted path,
  a few real caps, an integrity-first prompt-injection demo that *structurally* fails to escalate).
