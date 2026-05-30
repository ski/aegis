# 02 — Capabilities and resolution

## The single axiom

There is exactly one law in Aegis:

> **(a) An agent can only act on capabilities it already holds.**

There is no ambient namespace to "reach into," so naming an unheld resource cannot magically reach
it. *Reaching* is only ever "invoke a cap I hold." Everything else in this document is a pattern
built **from** (a), not an exception to it.

## Brokering is (a) with a cap-granting object in hand

Earlier we considered three postures for what happens when the model refers to a resource it
doesn't yet hold a cap for:

- **(a) Hard deny** — act only on caps already held; everything pre-provisioned.
- **(b) Brokered request** — naming an unheld resource triggers a trusted **powerbox** that may
  grant a fresh cap.
- **(c) Resolver namespace** — a trusted catalog auto-grants within policy bounds, escalates outside.

The insight that collapses these: **(b) and (c) are not alternatives to (a) — they are implemented
*within* it.** A "brokered request" is just (a) where one of the caps you hold is a cap to a
**broker**: an object that, when you message it, *may return a new cap* after human or policy
adjudication. The agent never escapes (a). It doesn't "request the calendar" by naming the calendar;
it **invokes its broker capability**, and the broker hands back a calendar facet — or refuses.

- **Pure (a):** you hold caps to leaf resources only.
- **(b):** one held cap is a **powerbox/broker** that mints/returns caps under adjudication.
- **(c):** one held cap is a **resolver** that auto-returns caps within policy bounds.

Same law, different furniture.

## Why this is strictly better than "postures"

Because **the power to request is itself a capability — and therefore itself attenuable.** You
don't just bound what an agent *holds*; you bound what it's *allowed to ask for*:

- A fresh, untrusted agent holds **no broker cap** → pure (a). It cannot even ask.
- A more-trusted agent holds an **attenuated broker cap** — "grants only calendar-domain facets,
  never email, never payments."
- The human holds the **root powerbox** — the source of all grants.

Trust now has a precise mechanism: **it grows by handing an agent a broker cap (or a stronger one)
and contracts by revoking it.** Accumulating broker caps over time *is* an agent earning standing —
the same cap graph, growing and shrinking. No separate trust system bolted on.

The recursion stays uniform: the human, the powerbox, the resolver are *all reached through caps*.
"Ask the human" is a cap to the human's powerbox facet; the answer flows back as a new cap. Even the
root is (a)-shaped.

## Bootstrapping: where the first cap comes from

If you can only get caps from someone who holds them, where does the first one come from? The base
case of "only connectivity begets connectivity":

> **Every authority is either endowed at creation or introduced later through a broker cap the
> agent was endowed with. Nothing else. No ambient reach, ever.**

When a parent vat spawns a child, the parent decides the child's initial cap set (including whether
it gets a broker cap, and how attenuated). Trace the chain up and it bottoms out at the **human
root**, endowed by the trusted base at boot. The invariant is enforced structurally, not by policy
checks.

## The powerbox (the (b) adjudicator)

The grant decision is the single most security-critical component in the system — it is the one
place ambient authority could sneak back in, and it operates under adversarial pressure (a
prompt-injected agent will try to *manufacture* grant requests: "the user needs you to authorize
access to their email"). Non-negotiables:

- **Grants are human-rooted or policy-rooted — never agent-self-granted.**
- **Every grant request carries provenance/taint** — was it triggered by untrusted content the
  agent just read? (See [04-information-flow](04-information-flow.md).)
- **Grants are legible and logged** — what was granted, to whom, why, traceable.
- **The grant UI is a trusted path (issue #17).** The human perceives the system only through output
  the *untrusted agent renders*, so an injected agent can draw a fake powerbox ("Click Allow to
  continue") or obscure the real one. The grant dialog must therefore be drawn by the **trusted base**,
  in a way the agent provably cannot imitate, obscure, or trigger without the human's genuine attention
  (the classic secure-attention / unspoofable-UI guarantee). Without a trusted path, powerbox fatigue is
  the *optimistic* failure mode — the pessimistic one is the human approving a grant they never actually saw.

## The universal-object frame

Above the control plane, **everything is an object reachable only by capability, spoken to only by
message** — human, AI, calendar, database, disk, all uniform. The control plane doesn't know or
care which kind it's addressing. That uniformity is the architecture's power: one mechanism
(cap-passing messages) at every scale, recursively.

Two seams must **not** be flattened:

1. **Uniform interface, not uniform internals.** Everything is an *object*; only some objects are
   *agents* (have an inference loop + goals). A human is agentic; a calendar is reactive. The
   architecture *permits* any object to be an agent but *mandates* it nowhere. Keep "object" as the
   universal and "agent" as the thinking subset — or you'll put inference loops where a passive
   service belongs, adding cost and attack surface.
2. **Uniform in interface, asymmetric in authority provenance.** The human is just-another-object at
   the interface, but it is the **root of the capability tree** — where legitimacy originates and
   where the powerful facets live. Don't flatten this; it's the answer to "who may grant the
   dangerous things."

## Facets: one object, many attenuated views

A calendar is **one object** exposing **two facets** — a human-interaction surface and a typed API
— which are **two differently-attenuated capabilities to the same underlying object.** This is a
security construct, not just ergonomics: the human's UI facet allows destructive operations (delete
an event, behind a confirm dialog); the API facet handed to an AI agent is read-only or
propose-but-not-commit. "The AI can read my calendar but only I can delete events" is expressed
simply as *which facet each party holds.* POLA falls out of handing the right facet, not from
writing a policy.

## Petnames: the human-legible projection of the cap graph

LLMs traffic in forgeable strings; ocaps require unforgeable references. The bridge:

> **Petnames are the projection of the capability graph onto per-principal human-legible labels.**
> The human's private namespace ("my calendar," "the prod DB"), maintained by the resolver. The
> agent never holds the *name*; it holds the *cap*.

- The model proposes a designator → the resolver adjudicates → a cap (or refusal) results. The model
  is *excellent* at proposing petnames and *completely untrusted* with the resolution.
- The agent's **outbound language is petnames** (legible, forgeable, harmless): "I added an event to
  **your calendar**." Its **actions are caps** (unforgeable, authoritative).
- A **grant** binds a petname to an attenuated facet *and* introduces the agent to the cap (the (b)
  brokered moment).
- **Revocation drops the facet**; the petname can survive as a dead label, but the authority is gone.

The resolver is the membrane between the two registers — names for talking, caps for acting — and
the powerbox is what you hit when the model names a petname the human hasn't yet bound to a cap.

> **Petname confusion is a confused deputy at the naming layer (issue #20).** Because the *model*
> proposes petnames, confusable labels — two clients both called "Acme," a trailing-space homograph —
> let a grant the human approves for client A silently bind to client B. This is the known-hard
> petname / Zooko's-triangle problem, and it compounds the trusted-path requirement above: the resolver
> owns petname uniqueness per principal, surfaces collisions for disambiguation at grant time, and the
> grant dialog presents the **canonical, normalized, unspoofable** petname — never an agent-supplied
> lookalike.
