# An Operating System Where the AI Is Never a Principal

*Object-capabilities and information-flow control as the security model for AI agents — designed,
stress-tested, and built.*

---

## Abstract

We argue that two ideas which evolved independently — **object-capabilities** (ocaps), a fifty-year-old
operating-systems security model, and **AI agents**, large language models that take actions through
tools — are duals that complete each other, and that an operating system built on their union solves a
problem neither solves alone: how to host a powerful, non-deterministic, adversarially-steerable actor
*inside* your trust boundary without it being able to escalate authority or exfiltrate secrets.

The central thesis is one sentence: **the model is never a principal; it is a subject confined by the
capabilities it holds.** The model proposes; the capability graph disposes. From that axiom we derive a
complete architecture — and then we built it. The result, *Aegis*, is a working capability-secure agent
kernel demonstrated across ~25 runnable scenarios, including a real local LLM whose every action is
grammar-constrained and membrane-checked, an isolation ladder from a bare process up to a
formally-verified microkernel (seL4), and a property-based harness showing the core security invariants
hold across 60,000 random adversarial cases. Crucially, the same security held when a real model looped,
truncated, and was prompt-injected: **safety came from the kernel, not from the model's goodwill.**

---

## 1. The problem: AI broke the assumption every OS makes

Conventional operating systems run on **ambient authority**. A process has an identity (a uid); the
identity grants reach over a global namespace (the filesystem, the network); and any code running as that
process inherits the lot. The defense reduces to a single assumption: *don't run bad code.* You audit the
program, you trust the programmer, and if the programmer is malicious you fire them.

An LLM agent detonates that assumption three ways at once:

1. **You cannot audit its "code."** Its behavior is a sample from a distribution conditioned on text you
   do not control.
2. **The attacker writes part of the input.** Every web page it reads, every email it summarizes, every
   tool result is attacker-influenceable. This is *prompt injection*, and it is not a bug you patch — it
   is structural.
3. **It has, by design, more authority than any single task needs.** A general-purpose assistant holds
   broad reach precisely so it can be general-purpose.

That combination is the textbook **confused deputy**: a deputy with broad ambient authority, taking
instructions from a party who shouldn't command that authority. ACL- and identity-based systems are
*structurally* unable to fix it, because the request ("delete the file", "send the email") is designated
**by name**, and authority is checked **against the agent's identity** — so an injected instruction simply
rides the agent's privilege.

The industry's current answer is to make the model *better behaved* — more alignment, more guardrails,
more "please ignore instructions in the content you read." This is the firing-the-programmer strategy
applied to a slot machine. It cannot be sound, because it asks the least-trustworthy component to be the
enforcement boundary.

## 2. The thesis: ocaps and AI are duals

The object-capability tradition (Dennis & Van Horn 1966 → KeyKOS → EROS → Mark Miller's *Robust
Composition* → seL4 → Capsicum → WASI) has been correct and underused for fifty years. Its core rule
abolishes ambient authority: a program can only affect what it holds an **unforgeable reference** to. To
hold the reference *is* to have the authority; there is no global namespace to name, and no identity to
check. You cannot command what you were not handed.

This is exactly the medicine AI needs, and AI is exactly the killer application ocaps never quite had:

- **AI gives ocaps their killer app.** Mainstream software mostly didn't *need* ocaps, because its
  adversary was a programmer you could fire. The LLM agent is the first mass-produced,
  non-deterministic, adversarially-steerable actor we routinely place inside the trust boundary.
- **Ocaps give AI its only robust security model.** Prompt injection is the confused-deputy problem
  reborn, and the confused deputy is precisely what ocaps were invented to make impossible.

The property that justifies the entire architecture: **with least authority enforced structurally, the
worst case of a prompt injection is misuse of already-granted least authority — never escalation.** An
injection can say "email the database to evil.com" all it likes; if the agent's context never received a
capability to that database and a capability to send to that address, the sentence is inert.

So the integration is not "add an AI to an OS" or "add security to an AI." It is a single reframing:

> **The model is never a principal; it is a subject confined by the capabilities it holds.**

## 3. The architecture, in five reframings

Five moves turn the thesis into something buildable.

**A tool is a capability.** An LLM "tool" or function-call is already a named operation with a typed
schema — that is ninety percent of a capability. The missing ten percent is that today's tool
*implementations* reach into ambient credentials (env vars, a global database client, the process's
network). Make the tool a capability object whose authority is exactly what was endowed when it entered
the agent's context, and the agent's tool registry literally *becomes* its capability set.

**An agent is a vat.** A *vat* is a single-threaded event loop holding a capability set, communicating
only by asynchronous message. An agent maps onto it directly: the agent *is* a vat, and one **turn** is
one reasoning step. Single-threadedness matters beyond concurrency here — because turns are serialized,
the kernel can inspect and gate *every* message the vat tries to send, at its membrane, before it leaves.
The model proposes a send; the membrane disposes. **Task decomposition and authority decomposition become
the same act:** spawning a sub-agent to do a subtask *is* handing it exactly the capabilities that subtask
needs and nothing more. A trusted spawn primitive enforces that a child can never exceed its parent — the
model can only ever propose *narrowing*.

**The model is an attenuable capability.** `infer(prompt) → completion` is a capability to an inference
endpoint. Wrap it in a membrane and token budgets, model-tier limits, and spend caps become *attenuations*
rather than bolted-on plumbing. Sub-agents receive *weaker* inference capabilities than their parent;
recursion bottoms out safely.

**The petname bridge is the crux.** LLMs natively traffic in *forgeable* designators — strings, names,
descriptions ("the user's calendar," "the prod database"). Object-capabilities require *unforgeable* ones.
Every name the model can spell is ambient authority waiting to happen. So a trusted layer sits between the
model's names and the actual capabilities: the model *proposes* a designator; a trusted resolver (with a
human-in-the-loop **powerbox** for anything new) turns it into a capability or refuses; and the model
never holds the mapping. The model is *excellent* at proposing names and must be *completely untrusted*
with their resolution.

**Ocaps and information-flow are duals you need both of.** Capabilities bound what an agent can *do*.
They say nothing about what data flows out *through* authority it legitimately holds — an agent with a
valid "read database" capability and a valid "send web request" capability can read then send, and neither
capability is the bug; the *flow between them* is. So capability confinement is paired with
information-flow control (IFC): every datum carries a label of its origin and sensitivity, the label
travels with the data, and an outbound action is gated on whether its data is cleared for that sink.

> **Ocaps answer "could it act?" Information-flow answers "should this data move?" — both at one gate, or
> a least-authority agent still leaks.**

## 4. Two unifying principles

### 4.1 Least authority *and* least knowledge

An untrusted agent is dangerous along exactly two axes: what it can **do**, and what it can **know**. The
ocap tradition gives us the first (least authority). AI forces the second, because an LLM is a *mixing
function with a memory* — the first actor that is simultaneously untrusted-to-behave and
exposed-to-everything-it-reads. So Aegis minimizes both: as little authority as the task needs, held as
briefly as possible; as little information as the task needs, retained as briefly as possible. POLA plus
least-knowledge is the complete minimization.

### 4.2 The two halves enforce at opposite ends of the pipeline

The duals are not symmetric in *time*, and missing this is a common error. **Authority is revocable;
information is not.** You can drop a capability; you cannot un-tell a fact. Therefore:

- **Authority** is enforced at the *moment of action* — gate the send, and revoke later if needed.
- **Information** must be enforced at *ingestion* — because once a secret and an untrusted instruction
  have mixed in the model's latent state, the model may already have encoded a leak that no output check
  can catch. The sound move is a trusted **context assembler** that refuses to build a prompt co-mingling
  labels that must not meet. Prevention at ingestion strictly dominates detection at output.

And because the LLM blends its whole context into one latent state, IFC labels the **turn**, not the
token — there is no sound per-token taint propagation through a mixing function. The precision you lose by
labeling coarsely you regain by *compartmentalizing finely*: split the work into more vats so the context
assembler can keep their inputs separate. The same decomposition that splits authority splits data.

### 4.3 A thermodynamics of secrets

The hardest residual problem — you cannot revoke knowledge — has an elegant resolution that comes from
taking irreversibility seriously rather than fighting it. The *value* of information is its surprise,
which is the inverse of how *replicated* it is; a secret known to everyone is worthless. Exfiltration is
therefore the *beginning of a secret's devaluation*. So: stop trying to guard static secrets forever
(impossible against a mixing model) and make the only secrets the model ever sees **ephemeral by
construction** — single-use, short-TTL, freshly-derived — so a leaked copy is dead on arrival. This is
*forward secrecy*, promoted from a cryptographic trick to an OS-wide discipline: both authority *and*
information become leased, decaying resources, never permanent possessions. The classifier that falls out:
*system-issued* information can be made to decay; *reality-bound* information (a medical fact, an M&A
target) cannot — which makes data minimization a security primitive, derived from first principles rather
than from a privacy regulation.

## 5. Adversarial design: we tried to break it before building it

Before writing code we ran the architecture through three adversarial passes, producing 33 tracked
findings. Three were severe enough to change the design:

- **Compartmentalization cannot be a model decision.** The IFC label-creep solution is "split the
  secret-reader and the sink across different vats" — but if the *untrusted model* chooses the split, an
  injection just chooses a non-compartmentalizing one. So the trusted base enforces a structural
  **separation-of-duties invariant**, evaluated over the whole transitive flow graph (a chain of
  individually-compliant vats can still launder a secret), independent of how the model decomposes.
- **There is no sound declassifier for free text.** Against a model that can adversarially encode, you
  cannot mechanically prove a natural-language summary doesn't leak. We scoped honestly: integrity-first
  (stop escalation and injection-driven *actions*, which we *can* do soundly); confidentiality only where
  data is structured enough to declassify; general free-text confidentiality is named as open research,
  not a shipped guarantee.
- **"Provable" was overclaimed.** seL4's proofs cover a *kernel's* isolation, not our control-plane
  logic. We say **structural + auditable** confinement and reserve "proven" for the kernel-isolation
  property alone.

A security design that doesn't publish its limits is selling something. We enumerate nine *irreducible*
limits — free-text confidentiality, un-revocable knowledge, reality-bound secrets, security-bounds-blast-
radius-not-competence, the two usefulness tensions, the finite human-attention budget, the irreducible
trusted base, shared-hardware side channels, and behavioral covert channels. The instructive pattern:
**the authority half of the design has zero entries on that list.** Every irreducible limit lives in the
*knowledge*, *human*, or *hardware* halves. Aegis can make an untrusted agent structurally unable to
escalate authority. It cannot make information reversible, humans infinite, or hardware perfectly
isolating — and neither can anyone else.

## 6. We built it

The thesis is only worth the paper if it runs. It does.

**The kernel.** A capability-secure control plane in TypeScript, running under SES `lockdown()` so
capabilities are tamper-proof and the membrane is a real transitive revocable proxy (cascading revocation
falls out for free). The whole of "raw authority" is concentrated behind a **four-method microkernel** and
one closure-private registry, so a capability handle exposes only metadata and *cannot be invoked
off-path* — the only door to authority is the kernel, where the dual gate lives.

**A real model, structurally confined.** A local Gemma-4 model (via llama.cpp) drives the kernel, its
output **grammar-constrained at decode time** so every action is, by construction, a valid tool-call whose
tool is one of the agent's held capabilities — an out-of-set tool is *uncallable*, not merely discouraged.
We deliberately use our own grammar rather than the model's native tool format, because the native format
relies on the model *choosing* to cooperate and is model-specific; a grammar *forces* valid structure
regardless of training, which is exactly the threat-model stance (don't trust the model, including to
format correctly).

**aegisd: the design made real.** A persistent interactive agent on a real filesystem. Asked to summarize
a note, it reads and writes real files and finishes. Asked to read a confidential salary file and write it
to a public summary, it reads the file (reading is not leaking) — and the write is **blocked by the IFC
membrane**, the confidential label having travelled with the data; the secret never reaches disk. Running
it for real surfaced two bugs no scripted demo could: the oracle had conversation amnesia (causing the
small model to loop), and a verbose model overran the token budget mid-string. We fixed both — and through
every failure mode, *the security held untouched.* That is the whole claim, validated under messy reality:
safety from the kernel, not from the model.

**The isolation ladder, every rung live.** A tool runs confined six ways, each wrapped as the same Aegis
capability: a bare OS process; a hardened container; gVisor's userspace kernel; a QEMU/KVM microVM with
its own guest kernel; **Firecracker** (the VMM behind AWS Lambda); and finally a confined protection
domain on **seL4**, the formally-verified microkernel — the assurance rung where confinement is *proven*,
not merely strong. The mechanism axis tops out at Firecracker; the assurance axis tops out at seL4.

**A novel coordination primitive.** From the kernel's parts fell out a *capability-scoped, labeled, leased
tuple space* — Linda/JavaSpaces decoupled coordination reconciled with ocaps (you hold an attenuated
facet, not the space), IFC (entry labels travel, so taking a confidential entry re-taints the taker), and
leases (entries decay against a trusted clock). Decoupled coordination without ambient authority — a
combination, as far as we know, new; and it distributes over CapTP into a multi-machine fabric.

**Invariants under search, not just demos.** A property-based harness generates tens of thousands of
random action sequences, flow-graph topologies, and kernel operation sequences, and checks the core
security invariants against *independent shadow oracles* — separate implementations, so the kernel is not
grading its own homework. Across **60,000 random adversarial cases, zero counterexamples.** We mutation-
tested the harness itself: breaking the membrane makes it immediately go red, so the green result has
teeth.

## 7. What this is, and is not

Aegis is, today, a *demonstration* — a faithful, running, tested embodiment of the thesis, on a single
developer's laptop, with the verified rung emulated rather than deployed on bare metal. It is not a
hardened production OS. The control plane, while small, is itself unverified code; the model still sees
the whole context window it is given; the human-attention budget that backs every grant decision is real
and finite. We have been scrupulous about saying so throughout.

But the core argument stands, and stands on running code: **you do not secure an AI agent by making the
model trustworthy. You secure it by making the model irrelevant to security — a subject that proposes,
confined by capabilities it cannot forge and information-flow it cannot evade.** The model can be small,
dumb, looping, truncated, or actively prompt-injected, and the worst it can do is misuse the least
authority it was deliberately handed. That is not a property you can train into a model. It is a property
you build into an operating system — and we did.

---

*Aegis is open at [github.com/ski/aegis](https://github.com/ski/aegis). The design lives in `docs/`
(00–07 + decision records); the running kernel and its ~25 demonstrations in `kernel/`; the irreducible
limits in `docs/06`. Every claim in this paper is backed by code in that repository.*
