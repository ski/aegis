# 00 — Overview: integrating AI and object-capabilities

## The thesis

AI and object-capabilities are not two ingredients stirred into the same pot. They are a lock
and key filed for each other before either side knew the other existed.

- **AI gives object-capabilities its killer app.** The ocap tradition has been correct and
  underused for fifty years because mainstream software mostly didn't *need* it — the adversary
  model was a programmer, and programmers can be fired. The ocap world kept saying "ambient
  authority is the original sin" while the industry kept shipping `open("/etc/passwd")`.
- **Object-capabilities gives AI its only robust security model.** An LLM agent is the first
  mass-produced, non-deterministic, adversarially-steerable actor we routinely put *inside* the
  trust boundary. Prompt injection isn't a bug you patch — it's the **confused-deputy problem**
  reborn, and the confused deputy is exactly what ocaps make impossible.

So the integration is not "add an AI to an OS" or "add security to an AI." It is:

> **The model is never a principal; it is a subject confined by the capabilities it holds.
> The model proposes; the capability graph disposes.** Authority comes from the references
> passed into a tool-call context — never from the model's identity, never from a name it can spell.

## Why ambient authority is fatal *specifically* for AI

In a conventional OS, authority is ambient: a process has a uid, the uid grants reach over a
global namespace (the filesystem, the network), and any code running as that process inherits the
lot. The defense is "don't run bad code." You cannot run that playbook against an LLM, because:

1. **You can't audit the agent's "code"** — its behavior is a sample from a distribution
   conditioned on text you don't control.
2. **The attacker writes part of the prompt** — every web page it reads, every email it
   summarizes, every tool result is attacker-influenceable input.
3. **The agent has, by design, more authority than the task needs** — it's general-purpose.

That is the textbook confused deputy: a deputy with broad ambient authority, taking instructions
from a party who shouldn't command that authority. ACL/identity systems are *structurally* unable
to fix this, because the request ("delete the file", "send the email") is designated **by name**
and authority is checked **against the agent's identity** — so injected instructions ride the
agent's privilege.

Ocaps fix it at the root: a request must *carry* the authority as an unforgeable reference. You
cannot command what you were not handed. An injection can say "email the database to evil.com" all
it likes; if the agent's context never received a cap to that database and a cap to send to that
address, the sentence is inert.

**The property that justifies the whole architecture:** the worst case of a prompt injection is
*misuse of already-granted least authority — never escalation.*

## What "integration" concretely means, layer by layer

Five reframes turn the thesis into a buildable system:

1. **A tool *is* a capability.** An LLM tool/function-call is a named operation with a typed
   schema — that's 90% of a capability. The missing 10%: today's tool *implementations* reach into
   ambient credentials. Make the tool a capability object whose authority is exactly what was
   endowed when it entered the agent's context, and the tool registry *becomes* the cap set.
2. **An agent *is* a vat.** A single-threaded event loop holding a cap set, communicating only by
   async message. Sub-agents are new vats introduced to a *subset* of caps. See
   [03-agents-as-vats](03-agents-as-vats.md).
3. **The model itself is an attenuable capability.** `infer(prompt) → completion` is a cap to an
   inference endpoint; wrap it in a membrane for token budgets, model-tier limits, content policy,
   spend caps. See [01-substrate](01-substrate.md).
4. **The petname bridge is the crux.** LLMs traffic in forgeable designators (strings); ocaps
   require unforgeable ones (references). The bridge between them is a security boundary. See
   [02-capabilities-and-resolution](02-capabilities-and-resolution.md).
5. **Ocaps + information-flow are duals you need both of.** Ocaps bound *authority* outflow; IFC
   bounds *data* outflow. See [04-information-flow](04-information-flow.md).

## The central tension

> **LLMs natively traffic in forgeable designators. Object-capabilities require unforgeable ones.
> The bridge between them is the security kernel.**

The model wants to say "the user's calendar," "the prod database," "`/etc/passwd`." Every one of
those is ambient authority by name. So a trusted layer (a **petname resolver**, with a
human-in-the-loop **powerbox** for escalation) sits between the model's names and the actual
capabilities, and it can *never* trust the model's framing. The model proposes a designator → the
resolver turns it into a cap or refuses → only then can the agent act. Get this boundary right and
everything composes; get it wrong and you've rebuilt ambient authority with extra steps.

## Threat model (working)

- **Scope:** a **single-tenant personal OS** — one human root, the operator supplies/vets all tools
  ([ADR 0002](decisions/0002-personal-os-not-platform.md)). Multi-tenant isolation is explicitly out of
  scope; there is exactly one principal whose authority everything derives from.
- **Adversary:** any content the agent ingests (web pages, emails, documents, tool outputs) is
  attacker-controlled and may contain instructions. The model may be manipulated into *any*
  behavior expressible through the authority it holds.
- **Not assumed trustworthy:** the model's outputs, the model's self-reports about safety, any
  string the model produces as a designator.
- **Trusted base:** the ocap control plane (membranes, resolver, spawn primitive, context-assembler,
  declassify/endorse gates), a **trusted monotonic clock** (leases and ephemerality depend on it —
  issue #30), and — at the verified phase — the seL4 microkernel beneath it. Two cautions: these trusted
  components are themselves **confused-deputy targets** that take untrusted input (petname proposals,
  grant requests, content to assemble/redact) and must be hardened accordingly (issue #25); and the
  **integrity of the trusted base's *build*** is itself a total-compromise surface — runtime confinement
  does nothing about a compromised confiner, so reproducible builds + attestation are required (issues
  #29, #31).
- **Explicitly out of the trusted base:** the model/inference engine, every tool that touches the
  outside world, all native blobs.
- **Goals:** (1) no authority escalation under injection — guaranteed structurally by ocaps;
  (2) no injection-driven *actions* — guaranteed by IFC-integrity; (2b) no data exfiltration through
  held authority — *aspirational*: sound only where data is structured enough to declassify; general
  free-text confidentiality is the hard research track, not a phase-1 guarantee (issue #2);
  (3) **structural + auditable** confinement — an auditable account of what authority each agent was
  endowed with and why. *Not* "proven the agent couldn't escalate": seL4's proofs cover kernel
  isolation, not our (unverified) enforcement logic (issue #4).
- **Residual / not fully solved:** covert channels (timing, tool-choice encoding) and **microarchitectural
  side channels** on shared hardware — shared caches, shared inference KV-cache/batching (issue #28); the
  semantic correctness of declassifiers (#2) and the burden of **label assignment** itself (#21); the
  granularity of **leaf-driver enforcement** (a cap is only as fine-grained as the driver behind it — #27);
  **resource exhaustion / DoS** unless quantitative attenuation is enforced (#26); the **aggregate
  human-attention budget** across all the gates that route to the human (#24); and the model simply being
  *unhelpful* — ocaps bound blast radius, not competence, and least-knowledge can *starve* it (#23).
- **Central architectural risk (issue #19):** every security property routes through the control
  plane (membranes, resolver, IFC checks, spawn invariant, declassify/endorse), so it is the universal
  chokepoint *and* the universal target — one bug there and all attenuation collapses at once. Today
  that totally-trusted surface is a large interpreter (hardened-JS/Goblins runtime), not a small
  auditable core, and seL4 (phase 3) isolates components from each other but not the control-plane logic
  from its own bugs. The long answer is a **minimized, separately-verifiable membrane core** — a
  "capability microkernel." Named here so it isn't mistaken for solved.

## The unifying frame

- **Ocaps** — what an agent can *do* (authority outflow); the forward reachability graph.
- **IFC-confidentiality** — what data can *leave* (high data can't reach low sinks).
- **IFC-integrity** — what can *influence trusted actions* (untrusted data can't reach trusted
  sinks without endorsement).
- All three enforced at **one membrane**, on **every send**, over **single-threaded turns**.
- **Label-creep** dissolved by **vat compartmentalization** — the same decomposition that splits
  authority splits data, *enforced as a trusted-base separation-of-duties invariant, not left to the
  untrusted model's task-split* (issue #1).

> **Ocaps answer "could it act?" Information-flow answers "should this data move?" —
> both at one gate, or a least-authority agent still leaks.**
