# Aegis — parked threads & next work

Durable scratchpad for things we've explicitly deferred. Newest intent at top.

## Parked (come back to these)

- **Labels — exercise the full two-axis system.** (Founder: "remember the labels, I'll come to it later.")
  Today aegisd only uses a single `secrecy` tag (`confidential`). The label system
  (`kernel/src/label.ts`) is richer and underused:
  - `secrecy` (confidentiality) — arbitrary tags: `customer-db`, `medical`, `salaries`, `project-x`…
  - `taints` (integrity) — arbitrary tags: `untrusted-web`, `isolated-microvm`, `isolated-gvisor`…
  - labels **join** (set-union both axes) when data mixes ("label the turn").
  Ideas to demonstrate the real lattice, not just one tag:
  - multiple distinct secrecy tags that can't cross into each other's cleared sinks
    (a `medical` note and a `salaries` note, separate clearances);
  - the **taint** axis end-to-end: read an `untrusted-web` file → it requires *endorsement*
    before a trusted action (the integrity direction, doc 04 §the-two-AI-threats);
  - **declassify/endorse** as real operations in aegisd (the two trusted escape hatches);
  - surface labels in the aegisd UI (`/label` exists; make it show both axes clearly).

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
