# Aegis

**An operating system where AI and object-capabilities are the same idea seen from two sides.**

Aegis is a design (and, in time, an implementation) for an OS whose security model is
built from the ground up to host AI agents — not by trusting them, but by *confining*
them with object-capabilities and information-flow control. The core bet:

> **The model is never a principal. It is a subject confined by the capabilities it holds.
> The model proposes; the capability graph disposes.**

## The unifying principle: least authority + least knowledge

An untrusted agent is dangerous along exactly two axes — what it can **do** and what it can **know** —
so Aegis minimizes both:

> **Aegis minimizes what an agent can do *and* what it knows.** Object-capabilities bound its authority;
> information-flow and ephemerality bound its knowledge. The model is never a principal — only a subject,
> minimal in power and minimal in memory.

This is the spine the four design docs hang from. Least authority is the mature half (the ocap
tradition); least knowledge is the half AI forces, because an LLM is a *mixing function with a memory* —
the first actor that is at once untrusted-to-behave and exposed-to-everything-it-reads. See
**[docs/05 — The two minimizations](docs/05-least-authority-least-knowledge.md)** for the full frame,
including the thermodynamics of secrets and why *information should be designed to decay*.

## Why these two things belong together

AI and object-capabilities (ocaps) are not two features bolted onto an OS. They are
**duals that complete each other.**

- **AI gives ocaps their killer app.** The capability tradition (Dennis & Van Horn 1966 →
  KeyKOS → EROS → Miller's *Robust Composition* → seL4 → Capsicum → WASI) has been correct
  and underused for fifty years, because mainstream software's adversary was a programmer you
  could fire. An LLM agent is the first mass-produced, non-deterministic, adversarially-steerable
  actor we routinely place *inside* the trust boundary.
- **Ocaps give AI its only robust security model.** Prompt injection is not a bug class you
  patch — it is the **confused-deputy problem** reborn, and the confused deputy is exactly what
  ocaps were invented to make impossible. With least authority enforced structurally, the worst
  case of a prompt injection is *misuse of already-granted least authority — never escalation.*

That single property is the reason to build the OS this way.

## The spine, in four decisions

1. **[Substrate](docs/01-substrate.md)** — a single consumer laptop; CPU inference as the
   guaranteed floor, integrated GPU as opportunistic acceleration; a WASM/WASI component
   isolation plane under an ocap control plane; an optional seL4/Genode verified floor earned
   later. Inference is *always* a capability, never in the trusted base.
2. **[Capabilities & resolution](docs/02-capabilities-and-resolution.md)** — there is exactly
   one law: **an agent can only act on capabilities it holds.** Brokering, powerboxes, and
   resolvers are not exceptions to that law — they are patterns *built from* it (a held cap to a
   cap-granting object). Petnames are the human-legible projection of the capability graph.
3. **[Agents as vats](docs/03-agents-as-vats.md)** — an agent *is* a vat. Spawning a sub-agent
   *is* handing it an attenuated subset of your caps. **Task decomposition and authority
   decomposition are the same act.** A child can never exceed its parent; the model can only
   narrow. Revocation is dropping a transitive membrane, and it cascades for free.
4. **[Information flow](docs/04-information-flow.md)** — ocaps bound what an agent can *do*;
   information-flow control bounds what data can *move*. Both are checked at the **same membrane**,
   on every send. Because the context window is a mixing channel, you **label the turn, not the
   token.** Label-creep is dissolved by vat compartmentalization — the same decomposition that
   splits authority splits data.

The slogan that ties it together:

> **Ocaps answer "could it act?" Information-flow answers "should this data move?" —
> both at one gate, or a least-authority agent still leaks.**

## Status

**Phase 1 complete — the design is running code.** Reasoned from first principles, stress-tested
through three adversarial passes (31 findings tracked as issues), and now demonstrated by five
runnable demos in **[`kernel/`](kernel/)** (`cd kernel && pnpm install`):

| Demo | Proves |
| --- | --- |
| `pnpm demo` | a prompt-injected agent cannot escalate or exfiltrate; full audit trail (#1, #2, #4) |
| `pnpm demo:compartments` | global separation of duties — unsafe wiring (incl. laundering chains) rejected *before it runs* (#1, #22) |
| `pnpm demo:powerbox` | brokered grants — manufactured grants die at the gate; real grants flow over a trusted path (#7, #17, #20) |
| `pnpm demo:wasm` | a real WASM tool is a capability with zero ambient authority (#D1) |
| `pnpm demo:model` | model-as-oracle — constrained decoding + deterministic replay; guarantees invariant under model swap |

See [docs/00-overview.md](docs/00-overview.md) for the full argument,
[docs/06-irreducible-limits.md](docs/06-irreducible-limits.md) for what it honestly cannot do, and
[docs/decisions/](docs/decisions/) for the locked decisions.

## Repo map

| Path | What's in it |
| --- | --- |
| `docs/00-overview.md` | The full thesis: why AI + ocaps, the threat model, the layer model |
| `docs/01-substrate.md` | Locked substrate decision: hardware, inference contract, phasing |
| `docs/02-capabilities-and-resolution.md` | The single axiom, broker caps, powerbox, petnames, facets |
| `docs/03-agents-as-vats.md` | Vat model, spawn-as-delegation, membranes, revocation, OCapN |
| `docs/04-information-flow.md` | The ocap/IFC dual, label-the-turn, declassify/endorse, compartments |
| `docs/05-least-authority-least-knowledge.md` | The unifying principle — the two minimizations, thermodynamics of secrets, designing information to decay |
| `docs/06-irreducible-limits.md` | What the design honestly *cannot* solve — the fundamental limits it scopes around rather than fixes |
| `docs/07-coordination-the-labeled-space.md` | A novel primitive — Linda/JavaSpaces coordination reconciled with ocap + IFC + leases |
| `docs/glossary.md` | Quick reference for the vocabulary |
| `docs/decisions/` | Dated decision records (ADR-style) |

## Lineage we're standing on

KeyKOS · EROS/CapROS · seL4 · Capsicum · Genode · Fuchsia/Zircon · WASI Preview 2 & the
WebAssembly Component Model · the E language and Mark Miller's *Robust Composition* ·
Spritely Goblins / OCapN / CapTP · Lampson's confinement problem · Bell–LaPadula and the
information-flow lattice.
