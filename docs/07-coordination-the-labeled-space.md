# 07 — Coordination: the capability-scoped, labeled, leased space

> A novel primitive that fell out of the kernel: Linda / JavaSpaces tuple-space coordination reconciled
> with object-capabilities, information-flow, and leases. Implemented in `kernel/src/space.ts`
> (`pnpm demo:space`).

## The problem

Agents need to **coordinate** — hand off work, share state, publish results — and there are two shapes
for it:

- **Introduction-based (CapTP, doc 03):** point-to-point. To talk to B you must *hold a reference* to B;
  authority travels as attenuated caps. Precise, but coupled — the producer must know the consumer.
- **Space-based (Linda / JavaSpaces):** anonymous and decoupled. Producers `write` entries; consumers
  `read`/`take` them by associative *template match*; neither names the other. Ergonomically lovely for
  fan-out, work queues, and shared blackboards.

The catch: a classic tuple space is the **canonical example of ambient authority.** Anyone holding the
space can take anything matching any template — no designation by unforgeable reference, no least
authority. It is exactly the sin the rest of Aegis abolishes. So the question is: *can we keep the
decoupling and lose the ambient authority?*

## The synthesis

Yes — by layering the kernel's three disciplines onto the tuple space. The result keeps the
decoupling and is, as far as we know, novel: **decoupled coordination without ambient authority.**

| Tradition | Contribution | What it fixes |
| --- | --- | --- |
| **Linda / JavaSpaces** (Gelernter; Sun/Jini) | `write` / `read` / `take` by template match | gives decoupled, anonymous coordination |
| **Object-capabilities** (doc 02) | you hold an attenuated **facet**, never the space | removes the ambient authority — POLA restored |
| **Information-flow** (doc 04) | labels **travel** with entries | makes cross-trust-level sharing safe |
| **Leases** (doc 01/05; #30) | entries expire against the trusted clock | coordination state decays by default |

### 1. Capability-scoped — you hold a facet, not the space

You never touch the space ambiently. You hold a **facet**: an attenuated view that may permit only some
of `{read, write, take}`, may be confined to a **sub-space scope** (a template every entry it sees must
match), and may carry a **clearance** (below). A read-only facet cannot take; a facet scoped to
`{queue:'jobs'}` cannot even see `{queue:'audit'}` entries. The power to coordinate is itself attenuable.

### 2. Decoupled — coordination by template, not by reference

Within a facet, producers and consumers still never name each other. A worker `take`s a job by template;
the producer that wrote it is irrelevant. The Linda ergonomics survive intact.

### 3. Labeled — entries carry their writer's label, and it travels

Every entry is stamped with the label of whoever wrote it (the writer's true turn-label, supplied by the
trusted vat as `ctx.requesterLabel` — the model cannot forge it). `read`/`take` return that label, and
the taker **re-absorbs** it. So taking a `confidential` entry re-taints the consumer, and the flow gate
then governs what it may do — its outbound send is blocked exactly as if it had read the secret directly.
This is the **labeled-memory insight (doc 04 §asymmetry, #16) generalized to coordination**.

Additionally a facet may carry a **clearance**: a reader cleared for nothing cannot even *see* a
`confidential` entry (the entry is filtered out of its matches), while a cleared reader can. Capability
scoping and IFC fuse: *you can't take what you're not cleared for.*

### 4. Leased — coordination state decays

Entries may carry a TTL and **expire against the trusted clock** (#30). A job left untaken, a result left
unread, a registration left unrenewed — all reclaimed by default. This is **Jini leasing**, and it is the
same lease-by-default discipline as the rest of the kernel (#18 "design information to decay").

## Why this matters

- **Cross-trust-level coordination becomes safe.** A confidential producer and a public consumer can
  share one space: the consumer simply never sees the confidential entries (clearance filter), and if it
  *does* hold a take cap, anything it takes re-taints it so it can't exfiltrate. You don't need separate
  spaces per trust level.
- **It's the coordination layer above CapTP.** CapTP is precise point-to-point; the space is anonymous
  fan-out. They compose: a space shared across machines *over* CapTP is a **distributed coordination
  fabric** — the fleet vision, but capability-clean.

## Convergence: the space and labeled memory are one family

The [labeled memory](04-information-flow.md) store (#16) and this space are the same idea at two
interfaces — **keyed** vs **associative** — both label-preserving and cap-scoped. They want to unify into
a single *capability-secure, labeled, leased store*, with the space as the richer (template-matched,
leased) front end and labeled memory as the keyed special case.

## Honest limits (v1)

- **Template matching is primitive-equality only.** Object-valued fields won't match; classic Linda did
  type/structural matching. Fine for queues and flags; richer matching is v2.
- **In-memory.** JavaSpaces was persistent. Persistence + this is the real version (and merges with
  labeled memory's store).
- **`take` is an O(n) scan.** Fine at demo scale; an index is v2.
- **No `notify`.** Reactive callbacks (a consumer woken on a matching write) are not yet implemented.

## Reference

`kernel/src/space.ts` (the space + facets + `makeSpaceCaps`), `kernel/src/demo-space.ts` (the four
properties shown together), `kernel/test/space.test.ts`. Run `pnpm demo:space`.
