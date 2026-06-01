# 08 — The two graphs are one: declassification as a capability

> Where the labels thread led. Implemented in `kernel/src/privilege.ts` (`pnpm demo:labels`).

## The question the label system couldn't answer

[doc 04](04-information-flow.md) builds the information-flow half: data carries a **label** (a `secrecy`
axis for confidentiality, a `taints` axis for integrity), the label travels with the data, and an
outbound action is gated on whether its data is cleared for the sink. It also names the two trusted
escape hatches — **declassify** (lower a secrecy tag: "this is cleared to leave") and **endorse** (clear
a taint: "this untrusted-influenced action is sanctioned") — and frets, correctly, that they are *the
most security-critical operations in the system*:

> A model-as-declassifier reintroduces the untrusted-model problem — now your safety boundary is itself
> an LLM you can fool.

But doc 04 left the structural question open: **who, exactly, is allowed to declassify?** A central
trusted oracle? A policy file? In the early kernel, `flowCheck(data, clearance, endorsed)` even took an
`endorsed` boolean with *no principled source* — nothing trusted set it. That gap is where this doc goes.

## The answer is already in Aegis's own structure

> **The right to declassify a tag is itself a capability.**

Not a central oracle, not a policy file — a **least-authority privilege, scoped to specific tags, minted
by the trusted base and handed out like any other capability.** This is the decentralized-IFC tradition
(HiStar, Flume, Myers–Liskov DLM), and it fits Aegis exactly because Aegis already *has* a capability
graph. Declassification authority is just another thing you can hold a cap to.

`kernel/src/privilege.ts`:

```ts
interface Privilege {
  declassifies: ReadonlySet<string>;  // secrecy tags this privilege may LOWER
  endorses:     ReadonlySet<string>;  // taint tags this privilege may CLEAR
}
declassify(data, priv)  // removes ONLY the secrecy tags priv owns; others untouched
endorse(data, priv)     // clears  ONLY the taint   tags priv owns; others untouched
```

## The unification

This collapses a distinction the project had been carrying since [doc 05](05-least-authority-least-knowledge.md):
least *authority* (the capability graph) and least *knowledge* (the label lattice) looked like two
separate mechanisms. They are not.

> **The authority graph and the label lattice are the same graph.** A capability may grant *action*
> authority (send email, read a file) **or** *label* authority (declassify `medical`, endorse
> `untrusted-web`). Both are unforgeable references; both are handed out by endowment or brokering; both
> are bounded by the same axiom.

And the **(a) axiom now governs information flow itself**:

> You can only lower a tag you hold the privilege for. A `medical`-declassify privilege is *structurally
> incapable* of lowering `salaries` — exactly as a calendar capability is incapable of touching email.
> Least authority, applied to declassification.

That is the principled source the `endorsed` boolean never had: a send is endorsed iff the acting vat
*holds an endorse-privilege for every taint on the data*. No ambient "trust me" flag — a held cap, or
nothing.

## Why this matters

- **It removes the scariest centralized component.** doc 04's "the declassifier is the most
  security-critical thing" stops being a single trusted oracle and becomes a *distributed, least-authority*
  privilege. Compromising one privilege lowers exactly one tag — not the whole lattice. The blast radius
  of a declassify bug is one compartment.
- **It makes declassification auditable and revocable like any cap.** Who may declassify `medical`?
  Whoever was endowed the privilege — traceable in the same causal log as every other authority, and
  revocable by dropping the membrane around it (cascading revocation, [doc 03](03-agents-as-vats.md)).
- **It composes with everything.** A declassify privilege can be attenuated, brokered through the
  powerbox (a human grants "you may declassify `medical` for this task"), leased (a privilege that
  expires — declassification authority that decays, per [doc 05](05-least-authority-least-knowledge.md)),
  and passed across machines over CapTP. Nothing new is needed; it is a capability.

## The shape of the whole system, now

Three things turn out to be one thing — a single graph of unforgeable references, governed by one axiom:

| You hold a cap to… | …which grants the authority to… | governed by |
| --- | --- | --- |
| an object (calendar, file, model) | *act* on it | (a): act only on caps you hold |
| a broker / powerbox | *request* more caps | (a): ask only via a broker cap you hold |
| a **label privilege** | *declassify / endorse* a specific tag | (a): lower only a tag you hold the privilege for |

Least authority and least knowledge were never two systems. They are two readings of one capability
graph — one about what you may *do*, one about what you may *reveal* — and declassification-as-capability
is the bridge that makes them literally the same.

## Honest limits (unchanged)

Making declassification a *scoped capability* answers **who may declassify**. It does **not** answer the
harder semantic question doc 04 raised: even a correctly-held `medical`-declassify privilege, applied to
free-text the model produced, cannot *prove the text doesn't still leak `medical` content by paraphrase*.
Scoping the authority is sound; the *judgment* of when to exercise it on unstructured data remains the
open problem (issue #2). Decentralized IFC tells you who holds the pen — not that what they sign is safe.
