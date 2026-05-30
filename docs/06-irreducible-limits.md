# 06 — Irreducible limits

> What three adversarial passes could **not** patch — because these are properties of the problem, not
> defects in the design. A security model that doesn't publish its limits is selling something. These are
> ours. Each is *scoped around*, never *solved*.

The rule for reading this: every item below is **managed** (we have a discipline that bounds it) but not
**eliminated**. Honesty about the difference is the whole point.

## 1. Free-text confidentiality cannot be soundly enforced (issues #2, #13)

Against a model that mixes its entire context into one latent state *and* can be steered to adversarially
encode (steganography, paraphrase, acrostics), there is **no sound general declassifier** for natural-language
output. You cannot mechanically prove a free-text summary doesn't leak a secret it was shown.

**Lived with by:** scoping phase 1 **integrity-first**; allowing confidentiality flows only for structured
data with a sound structural redactor; preferring **prevention** (never co-mingle, §[04 ingestion](04-information-flow.md))
over detection; and §3 below (make the secret worthless before the leak matters).

## 2. You cannot revoke knowledge (issue #18)

Authority is revocable; information is not. Once the model has seen a secret it is in context, logs, memory.
Dropping a membrane stops future *actions*, never un-tells a *fact*. This is a law of information, not a bug.

**Lived with by:** the decay principle — make the only secrets the model sees **ephemeral by construction**
(short-TTL, single-use), so a leaked copy is dead on arrival; and **minimize creation/retention** of the
*durable-semantic* secrets that can't decay (§[05](05-least-authority-least-knowledge.md)).

## 3. Reality-bound secrets leak eventually (issue #18, boundary)

The decay defense works for *system-issued* information (tokens, keys — rotate them to worthlessness). It does
**not** work for *reality-bound* secrets (a medical fact, an M&A target) whose value is bound to the world and
doesn't expire on rotation. Given enough agents and enough time, these leak and do not decay.

**Lived with by:** treating data minimization as a security primitive — don't let the model learn or retain a
reality-bound secret unless the task truly requires it, and never co-mingle it with untrusted content.

## 4. Security bounds blast radius, not competence (the "unhelpful agent")

Every guarantee here is about what an agent *can't do*. None makes it *correct*. A perfectly confined agent
can still be wrong, useless, or manipulated-within-its-authority. Ocaps bound the damage of a bad decision;
they don't make the decision good.

**Lived with by:** accepting that confinement and capability are different problems; the model can be small
and dumb *because* safety doesn't depend on its competence (§[01](01-substrate.md)) — but usefulness still does.

## 5. Both minimizations trade against usefulness (issues #8/C3, #23)

Least authority vs. usability, and least knowledge vs. competence, are **fundamental tensions**, not bugs.
Withhold too much authority or context and the agent is secure and useless; grant too much and you widen the
blast radius. There is no setting that maximizes both.

**Lived with by:** treating authority *and* knowledge as budgeted resources — spend the least that clears the
task's competence floor, found empirically per task class.

## 6. The human-attention budget is finite and load-bearing (issues #7, #24)

The human is the root of trust and the final arbiter of the hard calls (grants, declassification, labeling).
That makes human attention a single, low-bandwidth, fatigue-prone resource that *every* gate draws on. You can
minimize the draw; you cannot remove it without removing the human from the root — which removes the
legitimacy.

**Lived with by:** a first-class, bounded human-interrupt budget — batching, durable grants, policy-rooted
auto-decisions, surfacing only outcome-changing decisions — plus an unspoofable trusted path so each decision
the human *does* make is real.

## 7. Something must be trusted (issues #19, #25, #29, #31)

There is no zero-TCB system. The control plane that enforces every property is itself the universal point of
total failure; its *build* and its *upgrades* are total-compromise surfaces; and its highly-privileged
components are themselves confused-deputy targets. Trust is **reducible** (smaller, verifiable core) but never
**eliminable**.

**Lived with by:** the aspiration of a minimized, separately-verifiable **membrane microkernel**; reproducible
builds + attestation for the trusted base; capability-gated, audited upgrades and policy changes; and hardening
the trusted components' own input-handling.

## 8. Shared hardware leaks below the logical layer (issue #28)

On one machine, vats share caches, memory, and — most acutely — a single inference engine (shared KV-cache,
batching). Microarchitectural and shared-state side channels can move information across perfectly
logically-isolated vats. These are **bounded, not closed**, short of separate physical hardware per trust
domain.

**Lived with by:** no shared inference state across trust domains (per-domain contexts, no cross-domain
KV-cache reuse/batching); phase-2 microVM isolation; and documenting the residual rather than denying it.

## 9. Covert channels through the model's behavior remain (issue #13)

Even with labels and prevention, a model that has seen a secret can leak through *timing*, *which tool it
chooses*, or subtle structure in otherwise-clean output. Explicit-flow control doesn't touch these.

**Lived with by:** rate-limiting, output coarsening, and the decay principle (a leaked ephemeral secret is
worthless however it escaped) — bounding the bandwidth, not closing the channel.

---

## The shape of the residue

Notice the pattern: the **authority** half of the design (ocaps, vats, membranes, revocation) has *no entries
here* — it survived all three passes. Every irreducible limit lives in the **knowledge / human / hardware**
halves:

- *knowledge* is irreversible (1, 2, 3, 9),
- *humans* are finite and load-bearing (6) and the system can be useless or dumb (4, 5),
- *something physical and something trusted* always remain (7, 8).

That is the honest map. Aegis can make an untrusted agent **provably unable to escalate authority**. It can
make it **structurally hard to exfiltrate, and the exfiltrated thing worthless**. It cannot make information
reversible, humans infinite, hardware perfectly isolating, or the trusted base zero. Those aren't on the
roadmap because they aren't on the menu — for anyone.
