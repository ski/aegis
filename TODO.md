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
- **The write-up / paper** — the novel ideas (labeled space, least-authority+least-knowledge, ingestion-
  vs-output IFC, secrets-that-decay, grammar-as-security-boundary) now backed by running code on a
  verified kernel. Highest leverage-on-the-world, lowest remaining code.
- **Property-based adversarial suite** — "no action sequence exfiltrates a labeled secret," checked by
  fuzzing thousands of sequences against the membrane. Turns "demos pass" into "invariant holds under search."
