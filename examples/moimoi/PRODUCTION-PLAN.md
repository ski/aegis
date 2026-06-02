# moimoi.me — productionization plan

> Goal: turn `examples/moimoi` (an in-memory *exposition* of Aegis) into **moimoi.me**, a consumer-grade
> social app that is also a **publishing channel for autopoet**. Keep as much of the capability/IFC model
> as survives contact with real persistence, scale, auth, and a UI.
>
> Status: PLAN ONLY (written 2026-06-01, end of the design session). No production code yet. Start here.

## The one-line thesis to preserve

A microblog is a capability system wearing ACL clothes (doc 09). Productionizing must NOT discard that —
it must make it *real*: caps become persisted/restorable references, sharing stays delegation, visibility
stays IFC, the social graph stays the capability graph. If we end up with session-tokens + ACL checks,
we failed. The whole point is moimoi is the first social app where **an autopoet agent is just another
capability-confined participant** — it holds a draft/compose cap to one account and structurally nothing else.

## Where moimoi is today (the starting point)

`examples/moimoi/`: pure in-memory TS logic, no persistence, no HTTP, no UI, no auth.
- `microblog.ts` — posts, streams, PostRefs (read/share/delegable facets), placeInStream (the dual gate).
- `social.ts` — the full complication roadmap mechanisms (boost-tree + cascading revoke, circles,
  quote-as-join, mentions-as-grants, sturdyref registry stub, leases, scoped moderation).
- `ownership.ts` — deeds (transferable mints), exclusive transfer.
- Backed by kernel primitives: `capability`, `label`, `privilege`, `membrane`, `mint`, `ertp`, `zoe`.
- 21 guarantees green (`demo:social`), but ALL in-memory, single-process, no durability.

## The gap to production (what's missing)

1. **Persistence** — caps/posts/streams/deeds live in JS objects. Need a DB + the **sturdyref** problem
   solved (the millions-of-caps challenge already flagged in doc 09 §4.5 and doc 03): a capability must be
   a persistable, restorable, revocable reference, not a live object pointer.
2. **An API** — HTTP/WS surface for clients (and for autopoet to publish through).
3. **A UI** — consumer-grade web app (feed, compose, profile, share, follow).
4. **Auth → capability bridge** — real user login (passkey/OAuth/email) that mints the user's initial
   cap set. The login proves identity; identity roots the capability tree (doc 02 — the human is the root).
5. **Multi-tenant at scale** — millions of users/caps/posts; the in-memory store won't do.
6. **The autopoet channel** — how an autopoet campaign publishes to a moimoi account.
7. **Federation (later)** — cross-instance cap-passing over OCapN (doc 03); not v1.

## Substrate decision (proposed — matches the house stack)

autopoet is entirely **Cloudflare Workers + D1 + Durable Objects + R2**. moimoi.me should be the same —
zero new ops surface, and the pieces map cleanly onto the ocap model:

| Aegis concept | Cloudflare primitive | Notes |
| --- | --- | --- |
| a vat (single-threaded, holds caps, gates every message) | a **Durable Object** | DO's single-threaded execution IS the vat model. One DO per account is the natural unit. |
| the capability registry / sturdyrefs | **D1** (+ DO storage for hot state) | a cap = a row: `{ id, holder, target, rights, delegable, parent_id, revoked, expires_at }`. Revocation = flip a flag; cascading = walk `parent_id` (the `reachable()` chain). |
| posts / streams / deeds / labels | **D1** tables | post carries its audience as a secrecy label column; stream is a sink with a clearance. |
| media (images/video) | **R2** | featured media, attachments. |
| the membrane / flow gate | Worker middleware on every action | the dual gate (authority + IFC) runs server-side before any effect. The CLIENT never holds raw authority — it holds opaque cap handles (sturdyref strings); the Worker resolves + checks. |
| money / deeds / Zoe (if monetization) | D1 ledger + a Worker "Zoe" | offer-safety for paid posts / ownership transfer; later. |

Key design rule carried from the kernel: **the client is untrusted, like the model.** A browser (or an
autopoet agent) holds *sturdyref strings*, not live caps. Every API call presents sturdyrefs; the Worker
restores them to caps, runs the dual gate, performs the effect. Naming is not authority — same axiom.

## The autopoet integration (the reason this exists)

moimoi is a **publishing channel** alongside the existing IG/FB/WhatsApp channels (see autopoet
`channel-api.ts`, the wa_publish pattern). The capability fit is exact and is the cleanest channel of all:

- A moimoi account issues a **compose capability** (attenuated: draft-only or publish, rate-limited,
  audience-capped) and hands its sturdyref to the autopoet campaign.
- autopoet's agent publishes by presenting that sturdyref — it is *structurally incapable* of doing
  anything else to the account (no DM, no delete, no follow, no settings), because it holds only that one
  cap. This is the thesis made operational: the publishing agent is a capability-confined participant.
- Revoking autopoet's access = drop the cap (cascading). No password change, no OAuth-scope dance.
- This should reuse autopoet's channel abstraction so moimoi is "just another channel" to the campaign UI.

## Proposed phases (each a session-sized chunk)

**Phase 0 — repo + skeleton.** Decide repo home (likely a new `workers/autopoet-moimoi` in the autopoet
monorepo so it shares the channel infra + CF setup, OR a standalone repo). Worker + D1 schema + DO class.
Port the in-memory `microblog.ts`/`social.ts`/`ownership.ts` logic to operate over D1/DO instead of JS maps.

**Phase 1 — caps as sturdyrefs in D1.** The core engineering challenge. A cap table; mint/restore/revoke;
cascading revocation via parent chains; the dual gate (authority + IFC flowCheck) as Worker middleware.
Port `demo:social`'s 21 guarantees to integration tests against the real DB. THIS is the make-or-break
phase — if the ocap model survives persistence, the rest is conventional app-building.

**Phase 2 — auth → root caps.** Login (passkey or email-link, matching autopoet's existing auth) mints the
user's initial cap set (their own account's compose/read/manage caps). The human is the capability root.

**Phase 3 — API + minimal UI.** REST/WS endpoints (feed, compose, post, follow, share, profile). A Lit/
web-components UI (matches autopoet-website's stack) or whatever's fastest to consumer-grade. Real feed
assembly = a membrane over the union of streams the user holds read-caps to.

**Phase 4 — the autopoet channel.** Wire moimoi as a publishing channel: campaign holds a compose cap,
publishes through it, appears in the campaign UI alongside IG/FB. Revocation + audit.

**Phase 5 — polish + scale.** Rate limits (quantitative attenuation, #26), spam/sybil (relationship-gated
reach), moderation (scoped takedown caps), media pipeline (R2 + the Gemini/Replicate hero infra already in
the runbook), SEO, performance. Federation (OCapN) is explicitly OUT of v1.

## Hard questions to settle before/early in Phase 1 (decisions, not code)

1. **Repo home:** `workers/autopoet-moimoi` (share channel infra, monorepo) vs standalone. *Lean: monorepo*
   — moimoi is fundamentally an autopoet channel, and it reuses auth/CF/media/channel-api.
2. **Sturdyref shape:** opaque random id (lookup in D1) vs signed/HMAC'd token (stateless verify, but
   revocation needs a list). *Lean: D1-row id* — revocation is the whole point and must be cheap.
3. **IFC at scale:** label-the-turn was for an LLM agent; for human-authored posts the "turn" is a single
   action, so flowCheck per-action is simpler. The audience-as-secrecy-label model carries over directly.
4. **How much Zoe/money in v1?** Probably none — ownership transfer + paid posts are a later differentiator,
   not table stakes. Keep the deed model in the schema but don't build the marketplace yet.
5. **What does "consumer-grade" mean for v1 scope?** Minimum lovable: profile, post (text + image),
   follow, home feed, public/followers-only audiences, share/boost. Defer: DMs, circles, quote, edits,
   notifications, search — all designed (doc 09) but not v1.

## What carries over verbatim (the win)

The entire `examples/moimoi` logic + `kernel/src` primitives are the *reference implementation* of the
business logic. Productionizing is mostly: (a) swap the in-memory store for D1/DO, (b) make caps
sturdyrefs, (c) put a Worker + UI in front, (d) bridge auth to root caps. The *security model is already
designed, demonstrated, and tested* — that's the part that's usually hardest and it's done.

## Pointers

- Aegis design: `aegis/docs/00`–`10`, `PAPER.md`, `aegis/docs/09-worked-example-the-microblog.md` (the
  full feature→primitive map + complication roadmap), `aegis/examples/moimoi/` (reference logic).
- autopoet channel pattern: `workers/` (IG/FB/WhatsApp channels, `channel-api.ts`, wa_publish in RUNBOOK).
- autopoet stack conventions: RUNBOOK.md (D1 migrations, DO patterns, CF deploy, the emdash/media infra).
- The blog series (live on suhail.ski) is the narrative explanation of every concept this app embodies.

## First action for the next session

Pick the repo home (question 1), then scaffold Phase 0: D1 schema for `caps`, `posts`, `streams`,
`accounts` + a DO-per-account class, and port `microblog.ts`'s `placeInStream` dual gate to run over D1.
Get ONE guarantee green end-to-end (e.g. "a followers-only post is IFC-blocked from a public stream,
against the real DB") before building outward. That proves the ocap model survives persistence — the
single riskiest assumption.
