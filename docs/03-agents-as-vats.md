# 03 — Agents as vats

## The unit: an agent is a vat

A **vat** is a single-threaded event loop that holds a cap set and communicates only by sending
async messages to caps it holds. An AI agent maps onto it directly: the agent **is** a vat, and one
**turn** is one reasoning step (one inference call plus the messages it decides to send).

Single-threaded matters here beyond the classic concurrency story:

1. **The vat boundary is a containment boundary around an untrusted reasoner.** Classic vats run
   trusted code; here the vat's "code" is an LLM. Because turns are serialized, you can **inspect
   and gate every message the vat tries to send, at its membrane, before it leaves.** The model
   proposes a send; the membrane disposes. Only possible because nothing happens concurrently behind
   your back.
2. **Turn-based reasoning is legible.** Each turn has a clean causal record: these caps held, this
   inference happened, these messages went out. The seed of the audit dividend below.

## The identity this whole thread reduces to

> **Task decomposition and authority decomposition are the same act.**

When an agent spawns a sub-agent "to book the flight," it spawns a child vat and **endows it with
exactly the caps that subtask needs** — the flight-booking cap, the budget cap, nothing else. The
child is *structurally incapable* of touching email or the calendar, no matter what an injection
tells it, because it was never handed those references. Splitting the work splits the authority. You
don't write "the flight-booker may not read email" — the flight-booker simply has no email cap.

This is the multi-agent protocol in full. There is no "agent A calls agent B's API with shared
credentials" (that's ambient authority with extra hops). There is only: **A introduces B to a subset
of A's caps.** Inter-agent communication *is* capability-passing.

The safety property that makes it sound under an untrusted model:

> **A child can never exceed its parent, and the model can only ever propose *narrowing*.**

The model proposes "spawn a flight-booker with these caps." A **trusted spawn primitive** enforces
that the child receives only caps the parent already holds, attenuated no weaker than the parent's.
The model's proposal cannot *widen* authority — only subtract. POLA is preserved by construction down
the entire spawn tree.

> **Caveat (issue #1): narrowing is not enough — the trusted base must also enforce separation of
> duties.** "Child ⊑ parent" bounds the *magnitude* of a child's authority but not its *composition*.
> A prompt-injected model could propose a *non-compartmentalizing* split — handing one child *both* a
> `secret`-labeled read cap and an uncleared outbound cap (both ⊑ parent) — which is exactly the
> exfiltration combination IFC relies on compartmentalization to prevent (see
> [04-information-flow](04-information-flow.md)). Compartmentalization therefore **cannot be a model
> decision.** The spawn primitive must additionally enforce a structural **separation-of-duties
> invariant** drawn from policy, independent of how the model wants to decompose — e.g. *"no single vat
> may simultaneously hold a `secret`-labeled read cap and an uncleared outbound cap."* The model
> proposes the split; the trusted base refuses any split that violates the invariant.

## Membranes and transitive attenuation

"Hand over less than you hold" is the **membrane**, and the part that makes it *correct* rather than
leaky is **transitivity.** By connectivity-begets-connectivity: if you give a child a cap to an
object, and that object hands back *other* caps, those escape your attenuation unless they're also
wrapped. A membrane wraps a cap such that **every cap reachable through it is automatically wrapped
the same way** — across the whole reachable subgraph, not just the first reference. That is the
difference between real confinement and a fence with a hole behind it.

Membranes you'll use constantly:

- **Read-only** — mutating methods vanish; every returned object comes back read-only too.
- **Revocable (caretaker)** — you hand out a forwarder and keep the off-switch.
- **Lease / rate / budget** — expiry, rate limits, the spend cap.

## Revocation = dropping a membrane, and it cascades for free

This is how trust contracts. The kill switch for a misbehaving agent is: **drop the membrane around
its cap set.** Because the membrane is transitive, *everything that flowed through it dies at once* —
including caps the agent delegated onward to its own sub-agents, since those were attenuated through
your membrane in the first place. **Cascading revocation falls out of the transitive membrane with no
extra machinery.** Yank one agent and its entire descendant authority graph goes inert in the same
instant — structural, not a cleanup script chasing references.

## The AI-specific twist: spawning itself is a metered capability

Classic vats spawn rarely, from trusted code. Here the *model* decides, at runtime, to spawn — so an
injected agent could fork-bomb sub-agents or drain inference budget through children. Therefore
**spawn is a capability too**, and attenuable: "you may create ≤ N children, each with an inference
budget ≤ a slice of yours." The ability to make agents is bounded the same way the ability to read a
file is.

## Across machines: OCapN / CapTP and sturdyrefs

When vats live on different machines, the *same* protocol runs over the wire (CapTP, modern
incarnation OCapN). A cap to a remote object is a local proxy; messages serialize and travel;
revocation works across the network. Two pieces matter:

- **Promise pipelining** — messaging a cap returns a *promise immediately*, and you can message that
  promise before it resolves. So an agent composes "get the calendar → add an event → email the
  attendees" as three pipelined sends in **one round trip**, even though each depends on the prior.
  This keeps a network-distributed agent from being latency-bound — the model composes a multi-step
  plan and the protocol collapses round-trips, *without* any step escaping the caps in play.
- **Sturdyrefs** — a persistent, restorable capability you can write down and reconnect to later (a
  live cap dies with its connection). The **remote inference box is exactly a sturdyref**; the fleet
  vision is vats on many machines introducing each other to sturdyrefs.

## Two payoffs

- **Replay despite non-determinism.** Classic vats are deterministic (which gave KeyKOS/EROS
  orthogonal persistence and replay). The model breaks determinism via sampling. The fix: treat
  **inference as an external nondeterministic oracle whose output is logged.** Given the logged
  result, the turn is deterministic — so you can checkpoint and *replay an agent's entire causal
  history* for debugging and audit.
- **Structural + auditable confinement (the governance dividend).** Because all authority is cap-passing
  messages over single-threaded turns, you get a causal log: *agent X could do Y because it held cap C,
  endowed by Z at turn T.* You can **show exactly which caps an agent held** — which ACL/identity systems
  fundamentally cannot. For AI governance that's most of the ballgame: not "we sandboxed it," but an
  auditable account of exactly what authority each agent was endowed with, and why.

  > **Honesty about the word "proof" (issue #4).** This is *structural and auditable*, not *proven*. Two
  > limits: (1) seL4's machine-checked proofs cover the *kernel's isolation between components* — **not**
  > our control-plane enforcement logic (membranes, resolver, IFC checks, spawn invariants), which is a
  > large unverified component in every phase. (2) Knowing the cap *set* is bounded is not the same as
  > knowing the reachable *effect* is bounded, because a cap to a broker or to an agent-object is
  > transitively as powerful as whatever that object does — and agent-objects contain untrusted models.
  > So we claim **structural + auditable** confinement; we reserve "**proven**" strictly for the seL4
  > kernel-isolation property at phase 3, never for "the agent cannot escalate."
