# Decision records

Dated, ADR-style records of locked architectural decisions. A decision lands here once it's settled in
discussion; the design docs in `docs/` reference back to these for the "why."

| # | Decision | Status | Date |
| --- | --- | --- | --- |
| [0001](0001-substrate.md) | Substrate — laptop target, CPU-floor inference, WASM/WASI control plane, optional seL4 floor | Accepted | 2026-05-30 |

## Threads still open (not yet ADR'd)

- Powerbox grant protocol — what the UI/flow looks like, how provenance gates a grant, how an injected
  grant-request dies. (Discussed in [02](../02-capabilities-and-resolution.md); not yet locked.)
- Phase-1 buildable kernel scope — the minimal runnable system (one agent, a powerbox, a few real caps,
  a prompt-injection demo that provably fails to escalate).
