# Aegis — parked threads & next work

Durable scratchpad for things we've explicitly deferred. Newest intent at top.

## Parked (come back to these)

- **Labels in aegisd specifically.** The lattice + declassify/endorse-as-capability is now built and
  demonstrated (`pnpm demo:labels`, `docs/08`, `kernel/src/privilege.ts`; the vat derives endorsement
  from held privileges). What's *not* yet done: wire multiple compartments and the privilege model into
  **aegisd's live workspace** (today it uses one `confidential` tag), and surface both label axes in the
  aegisd `/label` view. The hard semantic question — *is a given free-text declassify actually safe?* —
  remains open (issue #2), by design: decentralized IFC says who holds the pen, not that what they sign
  is safe.

## Open / housekeeping (not blocking, but real)

- **CI is parked** on a GitHub account billing lock. Re-enable: clear billing, then uncomment the
  `push`/`pull_request` triggers in `.github/workflows/ci.yml`. (The suite now boots real VMs + seL4,
  ~80s; it only runs manually until then.)
- **Temp passwordless sudo still active** in WSL (`/etc/sudoers.d/aegis-temp`). Install-heavy work is
  done — safe to revoke: `sudo rm /etc/sudoers.d/aegis-temp`.
- **llama-server** runs in WSL holding ~5 GB while up (`pkill llama-server` to stop).

## Bigger forks (pick deliberately)

- **Live with aegisd** — use it over a real session; see whether a stronger model plans well enough and
  whether powerbox/attention-budget fatigue (#7/#24) actually bites. The unanswered question.
- **A stronger model** behind aegisd — Gemma 4 E4B (4.5B) is a weak planner; try a 14B (Phi-class) or a
  remote frontier cap, and measure planning vs. the unchanged security guarantees.

## Done (this arc)

- [x] **The label lattice + declassification-as-capability** — `pnpm demo:labels`, `docs/08`,
  `kernel/src/privilege.ts`. Multi-compartment secrecy + the taint axis; declassify/endorse are *scoped
  capabilities* (the (a) axiom governs IFC); the vat *derives* endorsement from held privileges (no
  ambient flag). The headline: **the authority graph and the label lattice are one graph.** *(2026-06-01)*
- [x] **The write-up / paper** — `PAPER.md` ("An Operating System Where the AI Is Never a Principal"),
  the full argument backed by running code; linked from the README. *(2026-06-01)*
- [x] **Property-based adversarial suite** — `pnpm fuzz` + `test/fuzz.test.ts`: 3 invariants vs.
  independent shadow oracles, **60,000 random cases, zero counterexamples**, mutation-tested so it has
  teeth. CI-gated at 1500/property. *(2026-06-01)*
- [x] **aegisd — the design made real** — persistent interactive agent on real files, real local model,
  grammar-constrained, native Linux/WSL2. Secret-exfil blocked live by the IFC membrane. `kernel/AEGISD.md`.
- [x] **Full isolation ladder, every rung live** — process → container → gVisor → microVM → Firecracker
  → seL4 (verified). All wrapped as the same capability.
- [x] **Real model + grammar-constrained tool-calls** — Gemma 4 E4B via llama.cpp, GBNF-locked output.
