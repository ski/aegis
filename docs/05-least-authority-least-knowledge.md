# 05 — The two minimizations: least authority, least knowledge

> The unifying principle the other four docs were circling.

## One sentence

> **Minimize what an agent can *do*, and minimize what it *knows* — as little authority as the task
> needs, held as briefly as possible; as little information as the task needs, retained as briefly as
> possible.** Power and memory are the two axes along which an untrusted agent is dangerous, and Aegis
> shrinks both.

Everything else in this repo is one of these two minimizations, or the machinery that makes it hold.

## Why there are exactly two axes

An agent can harm you in exactly two ways:

1. by **doing** something — exercising authority (deleting, sending, paying, spawning);
2. by **knowing** something — holding information that then escapes (a secret it read, leaked onward).

These are independent. A least-authority agent with no exfiltration limit still leaks (it holds a
legitimate outbound cap and a secret). A perfectly information-contained agent with too much authority
still wreaks havoc (it can't leak, but it can *act*). So you must minimize **both**, and they are duals:

| | **Least authority** | **Least knowledge** |
| --- | --- | --- |
| Governs | what the agent can *do* | what the agent can *know* |
| Mechanism | object-capabilities | information-flow + ephemerality |
| Property | the worst injection is misuse of least authority, never escalation | the worst leak is of information already near-worthless |
| Time-structure | revocable — enforce at the moment of action | irreversible — enforce at ingestion, then let it decay |
| Question | *could it act?* | *should it know this — and for how long?* |
| Tradition | Dennis & Van Horn, KeyKOS, EROS, seL4, the E language | Lampson confinement, Bell–LaPadula, forward secrecy |

The ocap world has always had the left column. The right column is what AI forces us to add, because an
LLM is a *mixing function with a memory* — the first actor that is simultaneously untrusted-to-behave and
exposed-to-everything-it-reads.

## Least authority (the left column, in brief)

Covered in [02](02-capabilities-and-resolution.md) and [03](03-agents-as-vats.md). The single axiom —
*an agent can only act on capabilities it holds* — plus attenuation, transitive membranes, and the
spawn primitive (*a child can never exceed its parent; the model can only narrow*) gives you POLA by
construction. Authority is **revocable**, so it can be enforced at the moment of action and clawed back
by dropping a membrane. This column is solid; it keeps surviving adversarial contact.

## Least knowledge (the right column — the part AI forces)

Covered in [04](04-information-flow.md). It rests on one asymmetry the first design missed:

> **Authority is revocable; information is not.** You can revoke a capability. You cannot revoke
> knowledge. So the two columns must be enforced at *opposite ends of the pipeline*: authority *after*
> proposal (gate the action), information *before* ingestion (control the context).

It has a thermodynamic shape worth stating plainly.

### The second law, for secrets

The value of information ≈ its surprise ≈ −log(probability) ≈ the inverse of how *replicated* it is. A
secret is a **low-entropy, high-surprise, low-replication** state. Exfiltration is just copying — which
raises replication, lowers surprise, and **decays value.** Leaks are entropy-increasing: irreversible,
like heat. You cannot un-mix a gas; you cannot un-tell a fact.

This is not a wall to defend. It is a gradient to manage — and it carries its own remedy:

> **Replication is decay.** The more a secret spreads, the less it is worth. So exfiltration is the
> *beginning of a secret's devaluation*, not only its compromise. Design with the law instead of against
> it: make the only secrets the model ever sees **decay faster than they can be exploited.**

### Three design moves that follow

1. **Secrets are born dying.** Don't guard permanent secrets (impossible against a mixing model). Issue
   **ephemeral** ones — single-use, short-TTL, freshly-derived — so a leaked copy is *dead on arrival*.
   This is the ocap *lease* applied to data: **both authority and information are leased, decaying
   resources, never permanent possessions.** Confidentiality becomes a *race won by expiry*, not a wall.

2. **Forward secrecy, generalized.** Cryptography already lives by this law in one corner — TLS ephemeral
   Diffie–Hellman, Signal's double ratchet: session keys are ephemeral and discarded, so a leaked
   long-term key never compromises past traffic. Aegis's information-lease is **forward secrecy promoted
   from a crypto trick to an OS-wide discipline** — applied to all information, not just keys.

3. **Minimize creation and retention, not just access.** The law also names the secrets you can *never*
   keep. Classifier:

   > **System-issued information can be made to decay; reality-bound information cannot.** A token is
   > system-issued (rotate it to worthlessness). A medical fact or an M&A target is reality-bound — its
   > value doesn't expire on rotation, and given enough agents and time it *will* leak and *won't* decay.

   So for reality-bound secrets the only real defense is to **not create or retain them unless you must,
   and to never co-mingle them with untrusted content** ([04 §ingestion](04-information-flow.md)). Data
   minimization, arrived at from first principles rather than from a privacy regulation.

## The cost of the second minimization: knowledge vs. competence (issue #23)

Least knowledge is not pure upside, and the doc would be dishonest to imply it. It has the exact dual of the
POLA-vs-usability tension on the authority axis:

> Every bit of context or authority you withhold makes the model **dumber** — its usefulness depends on the
> context it can see. Push least-knowledge too far and you *starve* the model: the agent becomes secure and
> useless.

So "least knowledge" means **the least context that still makes the model competent at the task — not the
least context, period.** Treat knowledge as a budgeted resource exactly like authority: spend the minimum
that clears the competence floor, and find that floor empirically per task class. The goal is a model minimal
in power and memory but *not lobotomized* — a real tension to manage, not a slogan.

## How the two minimizations meet the machinery

- **Least authority** → caps, membranes, attenuation, the spawn invariant, revocation. *Enforced at the
  moment of action.*
- **Least knowledge** → the context assembler (don't co-mingle), labeled memory (labels persist), and
  ephemerality (born dying). *Enforced at ingestion, then by decay.*
- **Both** are checked at the **same membrane**, over **single-threaded turns**, and both want the same
  thing from the system's structure: **decompose the task so each vat holds the least authority *and*
  sees the least information** — the same split serves both columns
  ([04 §compartmentalization](04-information-flow.md)).

## The line for the README

> **Aegis minimizes what an agent can do *and* what it knows.** Object-capabilities bound its authority;
> information-flow and ephemerality bound its knowledge. The model is never a principal — only a subject,
> minimal in power and minimal in memory.
