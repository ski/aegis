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

## Microblog complication roadmap (doc 09 §4 — the full checklist)

The worked-example app (`docs/09`, `demo:microblog`) has a complication roadmap. Tracking which rungs
are **built** vs **designed** (mechanism named in doc 09 but not yet coded). Build any by turning the
named mechanism into a demo.

**Built:**
- [x] **Alice → Bob → Eve sharing** — `demo:microblog`: sharing=delegation; Eve sees it only through
  Bob; delegable vs terminal facets; followers-only→public IFC-blocked unless declassify privilege;
  read-only agent can't share. *(2026-06-01)*
- [x] **Money + ownership transfer** — `demo:ownership` (`mint.ts` + `ownership.ts`): ownership = the
  deed (the share-cap mint); sharing is copy, ownership is exclusive (cascading-revoke + re-mint);
  humans and agents own identically. *(2026-06-01)*
- [x] **Offer safety / trustless sale** — `demo:zoe` (`ertp.ts` + `zoe.ts`): an untrusted contract sells
  the deed; offer safety + rights conservation; worst case a refund, never theft. *(2026-06-01)*

**Designed (mechanism in doc 09, not yet built):**
- [ ] **Revocation mid-spread** — Alice deletes/blocks after Eve re-shared → cascading revocation
  through the transitive membrane. (doc 09 §4.1; membrane exists, not wired to the microblog yet)
- [ ] **Re-shares of re-shares / cycles** — N-hop attribution chain; audience-label survives all hops.
- [ ] **Mute vs block vs soft-block** — three different revocation shapes (local filter membrane vs
  two-directional revoke vs one-directional).
- [ ] **Custom circles / lists / close-friends** — multi-tag secrecy lattice with overlapping audiences.
- [ ] **Quote-share that ADDS commentary** — the quote post's label is the *join* of commentary + quoted
  content (doc 04 join). Quote a followers-only post publicly → blocked unless declassify.
- [ ] **Reply-chains with per-reply audiences** — thread *self-redacts per viewer* by flow check.
- [ ] **Edits** — mutable vs immutable refs (fork-on-edit vs caretaker-backed cell; edit-after-virality
  must be label/taint-gated).
- [ ] **Mention-as-capability-grant** — @-mentioning grants the mentioned party a read-cap (deliberate
  narrow leak); attenuable to "mentions from followers only"; a spam vector.
- [ ] **Brand/automation agent** — multi-cap agent (draft-compose + scheduler + analytics-read), publish
  behind the powerbox.
- [ ] **Malicious-quote taint** — a quoted post carrying a prompt injection taints the quoting agent;
  its actions then require endorsement.
- [ ] **Spam / sybil** — caps help (mention/DM caps attenuable to held relationships) but don't solve;
  still needs rate-limits / personhood.
- [ ] **Federation over OCapN** — Alice@A, Bob@B, Eve@C: cross-machine cap-passing (the
  labeled-space-over-CapTP fabric applied to posts); distributed revocation timing (leases bound it).
- [ ] **Millions of caps** — the capability-DB / sturdyref engineering problem (persistable, restorable,
  efficiently revocable references). The main *systems* (vs *model*) challenge.
- [ ] **Paid posts / subscriptions** — read-cap you buy; subscription = a *leased* read-cap that expires
  unless renewed (Jini leasing, doc 05).
- [ ] **Scoped moderation** — a `takedown` cap scoped to a community; a user *report* = a capability
  request to the moderation powerbox.

**Honest "stays hard" (doc 09 §5):** the screenshot attack (out-of-band retyping), scale, edit-after-
share semantics, distributed-revocation timing, spam/sybil — named, not solved.

## Bigger forks (pick deliberately)

- **Live with aegisd** — use it over a real session; see whether a stronger model plans well enough and
  whether powerbox/attention-budget fatigue (#7/#24) actually bites. The unanswered question.
- **A stronger model** behind aegisd — Gemma 4 E4B (4.5B) is a weak planner; try a 14B (Phi-class) or a
  remote frontier cap, and measure planning vs. the unchanged security guarantees.
- **A real Zoe contract** — an auction or constant-product AMM under the offer-safety framework (doc 10),
  not just an atomic swap.

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
