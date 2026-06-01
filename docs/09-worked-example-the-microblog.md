# 09 — Worked example: a microblog as capabilities + IFC

> The first full application of the whole stack to something real. Implemented (the core) in
> `examples/moimoi/microblog.ts` (`pnpm demo:microblog`); the rest is a decomposition roadmap.

A microblog (Twitter / Mastodon / Bluesky shape) is *secretly already* a capability/IFC system wearing
ACL clothes. Making that honest is exactly what lets humans **and agents** use it safely. This doc
decomposes it — first the core (built), then every way it gets genuinely hard (each mapped to the model).

---

## 0. The reframe: god-token → capability set

Today: you authenticate, receive a **session/OAuth bearer token** (ambient authority), and the server
checks ACLs. That token is a **god-token** — it can do everything the account can. Hand it to an agent
and *the agent **is** you*: DM, delete, follow, post, settings, all of it. OAuth "scopes" are coarse,
server-trusted strings.

Aegis: you never hold a god-token. You hold a **set of capabilities**, each an unforgeable reference to a
specific authority over specific objects — "post as me (draft-only, rate-limited)", "read my home
timeline", "reply to *this* thread". Separate, attenuable, delegatable, revocable.

> Hand an agent a **draft-only compose cap** + a **home-timeline read cap** and nothing else. It is
> **structurally incapable** of DMing, deleting, or following — not "not allowed", *incapable*, because
> it was never handed the reference. No prompt injection can conjure authority that isn't in the context.

## 1. Objects & verbs

Objects, reachable only by capability: **Account**, **Post**, **Stream/Timeline** (an aggregating view),
**DM thread**, **Media**, and the **social-graph edges** themselves.

Verbs become capabilities, most scoped to *specific objects* (not blanket verbs):

| Action | Capability | Natural attenuations |
| --- | --- | --- |
| post | `compose(account)` | draft-only, rate-limited, visibility-capped |
| reply | `reply(post)` | a cap to **that thread**, not "reply to anything" |
| react | `react(post)` | per-target |
| share/boost | `boost(post)` | needs a *shareable* (delegable) ref to the post |
| quote | `quote(post)` | read the quoted post **+** compose |
| DM | `send(thread)` | a cap to **one thread**, not "DM anyone" |
| follow | `follow(account)` | public free; private → powerbox |
| delete/edit | `delete(post)`/`edit(post)` | scoped to a post you authored |
| block/mute | `block(account)` | — |

Key point: **"reply to #123" is a different capability than "reply to #456."** Authority is per-object.

## 2. The three identities (where this stops being "ACLs with extra steps")

- **Sharing IS capability propagation.** A boost creates an object holding a reference to the post and
  introduces your followers to it. *Only connectivity begets connectivity.* Holding a share-cap is not
  propagation; **exercising it is.**
- **Visibility IS an IFC secrecy compartment.** `public`, `followers-only`, `circle-X` are confidentiality
  tags. A stream is a **sink cleared for an audience**; a post carries its audience as a secrecy label.
  Leaking a private post to a public stream is an *information-flow violation*, computed, not an ACL check.
- **The social graph IS the capability graph.** Follow = hold a read-cap to a stream. Follow-private =
  a powerbox request the owner approves. Your feed = a membrane over the union of streams you hold caps
  to. Block/unfollow = **revocation** (drop the cap; cascading revocation makes their boosts of you go
  inert too).

## 3. The Alice → Bob → Eve scenario (built: `demo:microblog`)

Alice posts. Bob gets a share-cap to it. Eve follows Bob, **not** Alice.

1. **Before Bob shares:** the post isn't in any stream Eve can reach → **Eve can't see it.**
2. **Bob boosts:** introduces his followers to the post → **Eve reaches it *through* Bob's stream** — one
   post, *not* Alice's whole stream. Eve never became Alice's follower.
3. **Can Eve re-share?** Only if the facet Bob propagated was **delegable**. The author sets the *max*
   delegability; each hop may **narrow** but never widen (`child ⊑ parent`):
   - delegable facet → Eve re-shares onward (virality, governed);
   - **terminal** facet → Eve *reads* but gets a dead-end ref → **the spread stops at Bob's followers.**
4. **IFC on top:** a `followers-only` post boosted into a **public** stream is **blocked** (audience-label
   not cleared for the sink) — **unless** the placer holds a `declassify(followers-only)` privilege, which
   only Alice can grant (the author's lever; see [doc 08](08-the-two-graphs-are-one.md)).
5. **Injected agent** holding only a read-cap → **structurally cannot share.**

So "can Eve see it?" is a *conjunction*: (1) Bob exercised a share, (2) the propagated facet reaches Eve
as ≥ read, (3) the post's audience-label is cleared for the stream Bob placed it in. Authority **and**
information-flow must both say yes.

---

## 4. Complication roadmap — every way it gets hard, mapped to the model

Each item below is a *known-hard* real-microblog problem, decomposed. **Built** = in the demo today;
everything else is designed-but-unbuilt, with the mechanism named.

### 4.1 Graph & propagation

- **Revocation mid-spread** *(membrane, doc 03).* Alice deletes the post / blocks Bob *after* Eve
  re-shared. Because every onward reference was attenuated *through* Alice's original facet (a transitive
  membrane), dropping it makes the whole reachable subgraph inert at once — Eve's re-share included.
  Cascading revocation is the deletion/block semantics, for free. *(Open: distributed timing — a boost
  in flight across a federation hop may lag; leases bound the window.)*
- **Re-shares of re-shares / cycles.** Eve boosts Bob's boost of Alice's post. Each hop is a new
  reference attenuated from the prior; attribution is the chain of introducers; the audience-label is
  carried by the post object, so it survives N hops unchanged (a `followers-only` post stays
  `followers-only` however far it's boosted). Cycles are harmless — a reference already held isn't
  re-granted.
- **Mute vs block vs soft-block.** Different revocation shapes: *block* = revoke both directions (they
  lose read-cap to you, you to them). *Mute* = a local filter membrane on **your** feed view (no
  authority change on their side — they don't know). *Soft-block* = revoke their read-cap to you but
  leave yours to them.

### 4.2 Audience & IFC, made hard

- **Custom circles / lists / "close friends".** Not just `public`/`followers-only` but overlapping
  audiences → the **multi-tag secrecy lattice** (already supported, `label.ts`): a post to `circle-A`
  carries secrecy `{circle-A}`; a stream cleared for `{circle-A, circle-B}` accepts it; a `circle-B`-only
  viewer's stream does not. Partial clearances and overlaps are just set membership.
- **Quote-share that *adds* commentary** *(label join, doc 04).* Your new text mixes with the quoted
  content → the quote post's label is the **join** of your commentary's label and the quoted post's. Quote
  a `followers-only` post and add public commentary → the whole quote is `followers-only` (the join rose);
  publishing it publicly needs declassify. This is the in-app "don't screenshot-leak a private post."
- **Reply-chains with per-reply audiences.** Each reply is its own post with its own audience label; a
  thread is a sequence whose visible prefix depends on which labels the viewer is cleared for. A
  `followers-only` reply under a public post is invisible to non-followers — the thread *self-redacts* per
  viewer, by flow check, not by special-case code.
- **Edits: mutable vs immutable refs.** Editing after sharing is the classic mutable-capability question.
  Two honest options: (a) posts are **immutable**, an edit forks a new post and the boost still points at
  the old one (auditable, but "edited" boosts go stale); (b) a post is a **mutable cell behind a
  caretaker** — edits propagate to all holders, but then an edit can change what was already boosted
  (the "editing into something malicious after virality" attack — so edits should themselves be
  label/taint-gated).

### 4.3 The capability-leak surprises (subtle, important)

- **Mentions / @-tags as capability grants.** @-mentioning someone in a `followers-only` post arguably
  *grants them a read-cap* to a post they otherwise couldn't see — a deliberate, narrow capability leak by
  mention. Must be explicit: mention-grants are a real authority change (and a spam/abuse vector — see
  below), so they should be attenuable ("allow mentions from followers only" = you only accept
  mention-grants from accounts you already hold a relationship cap with).
- **Notifications** are read-caps to *events* about objects, separately attenuable from read-caps to the
  objects themselves.

### 4.4 Agents & adversaries

- **A brand/automation account.** An agent endowed with `compose(draft-only)` + a `scheduler` cap +
  `analytics-read` — and **nothing else**. Publishing requires the human's endorsement (powerbox), so the
  agent drafts and the human signs. Multi-cap agent, least authority per function.
- **A maliciously-quoted post** carrying a prompt injection *(taint, doc 04).* The quoted content is
  tainted `untrusted-content`; the quoting agent's turn absorbs the taint; any *action* it then takes
  (publish, DM, follow) requires endorsement. The injection can't make the agent escalate — and even its
  legitimate-authority actions are gated by the taint until a human endorses.
- **Spam / sybil.** Partly orthogonal (rate-limits, proof-of-personhood) — but the cap model *helps*:
  mention-grants and DM-thread caps are attenuable to "from accounts I hold a relationship with", so a
  sybil swarm with no relationship caps can't reach your notifications or DMs at all. The cost of reaching
  you is holding a cap you granted.

### 4.5 Scale & federation

- **Millions of caps.** The capability-database / **sturdyref** problem ([doc 03](03-agents-as-vats.md)):
  caps must be persistable, restorable references (not just live object pointers) with efficient lookup
  and revocation. Real, solvable, not free — this is the main *systems* (vs. *model*) challenge.
- **Federation.** Alice on server A, Bob on B, Eve on C → **cross-machine cap-passing over OCapN/CapTP**
  ([doc 03](03-agents-as-vats.md); demonstrated in `demo:space:distributed`). A boost across servers is a
  remote introduction; revocation across servers is the distributed-revocation problem (leases bound the
  staleness window). Federation *is* the labeled-space-over-CapTP fabric applied to social posts.

### 4.6 Money & moderation

- **Money & ownership transfer — BUILT** (`pnpm demo:ownership`; `kernel/src/mint.ts`,
  `examples/moimoi/ownership.ts`). This is the deepest part, and it formalizes **ownership**:
  - **Money is a mint & purse** (Miller/E): value lives in the mint's closure-private ledger keyed by
    purse identity, *not* in the reference — so you can't forge money by copying a purse, and payment
    conserves total value.
  - **Owning a post = holding its DEED** — the *mint* that issues all its share/read caps, plus the
    right to transfer it. A mere share-cap is a leaf; the deed is the root.
  - **Sharing is COPY; ownership is EXCLUSIVE.** Capability-passing is copy-by-default (the giver keeps
    theirs) — perfect for sharing, *wrong* for selling. Exclusivity is **manufactured**: the deed is held
    behind a caretaker from birth, so `transfer := cascading-revoke(seller's deed) + mint a fresh deed
    for the buyer`. After the sale the seller's deed is **inert** (and so is every share-cap she copied
    from it — transitive revocation); the buyer holds the only live deed.
  - **The sale is an escrow swap** — atomic within one single-threaded vat turn: verify funds, move
    payment, transfer the deed, or refund.
  - **Humans and agents own identically.** The deed is *principal-agnostic* — transferring it to an
    autonomous agent (`brand-agent-7`) works exactly as transferring it to a person. There is no special
    "agents can't own" case; an agent holding a deed is an owner, full stop.
- **Paid posts / subscriptions** *(designed).* A paid post's read-cap is something you *buy* (a purse
  payment in exchange for a minted read-cap); a subscription is a **leased** read-cap to a stream that
  **expires** unless renewed — Jini-style leasing ([doc 05](05-least-authority-least-knowledge.md)).
- **Moderation** *(designed).* A moderator holds a `takedown` cap **scoped to a community** (not global)
  — least authority for moderators too. A user *report* is a **capability request** (a message to the
  moderation powerbox), adjudicated and audited like any grant.

---

## 5. What this buys, and what stays hard

**Buys:** agents as safe first-class users; OAuth-scopes-done-right (unforgeable, attenuated, revocable
without a password change); visibility & sharing as *structure*, not policy; structural prevention of
private→public leaks; the social graph and the permission model unified into one graph.

**Stays hard (honest):**
- **The screenshot attack** is out of scope — IFC stops the in-app *reference* flow, not a human (or an
  agent's vision) retyping a secret out of band. Same free-text limit as everywhere (issue #2).
- **Scale** (millions of caps) is a genuine database/sturdyref engineering problem.
- **Edit-after-share** and **distributed revocation timing** have real, named tensions (§4.1, §4.2).
- **Spam/sybil** is helped but not solved by caps; it still needs rate-limits / personhood.

The core, though — *sharing is delegation, visibility is information-flow, the social graph is the
capability graph* — is not a metaphor. It runs: `pnpm demo:microblog`.
