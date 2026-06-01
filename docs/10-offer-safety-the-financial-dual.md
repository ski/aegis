# 10 — Offer safety: the financial dual of the Aegis thesis

> Where the money thread led: Agoric's ERTP + Zoe (Mark Miller's *other* major system) turn out to be
> the **same confinement move** as Aegis, transplanted from AI to finance. Implemented in
> `kernel/src/ertp.ts` + `kernel/src/zoe.ts` (`pnpm demo:zoe`).

## The connection

Everything in Aegis descends from Mark Miller's object-capability work — SES, vats, eventual-send, the
mint-and-purse pattern. **Agoric** is the production system Miller co-founded to put that work on a
blockchain, and its two core pieces are:

- **ERTP** (Electronic Rights Transfer Protocol) — assets as capabilities: *brands*, *issuers*, *mints*,
  *purses*, *payments*. The production refinement of our [`mint.ts`](../kernel/src/mint.ts).
- **Zoe** — a framework for running financial **smart contracts** with one extraordinary guarantee.

And Zoe's guarantee is, structurally, *the Aegis thesis again*:

| Aegis (AI) | Zoe (DeFi) |
| --- | --- |
| the **model is never a principal** | the **contract is never trusted with assets** |
| the model **proposes**, the capability graph **disposes** | the contract **proposes** a reallocation, Zoe **disposes** (checks it) |
| worst case of a prompt injection = misuse of least authority, **never escalation** | worst case of a malicious contract = a **refund, never theft** |
| confine an untrusted *reasoner*, still let it participate | confine an untrusted *contract*, still let it run |

> **A malicious smart contract is the same kind of threat as a prompt-injected model**, and the same
> kind of architecture defeats both: let the untrusted thing *propose*, and put a small trusted layer
> between its proposal and any real authority. **Zoe is the financial dual of the membrane.**

## Offer safety (what Zoe guarantees)

Each party makes an **offer**: a `proposal = { give, want }` plus the actual `payments` they put in. Zoe
**escrows** the payments — so the untrusted contract never touches real assets; it sees only *Amounts*
(descriptions, which carry no value). The contract proposes a **reallocation** (who ends up with what).
Before paying out, Zoe enforces:

1. **Offer safety, per seat:** *either* you get everything you `want`ed, *or* you get back everything you
   `give`-d (a full refund). Never less than your stated offer.
2. **Rights conservation, per brand:** total assets out == total escrowed in. The contract cannot create
   or destroy value.

If the contract's proposal violates either — or the contract throws, or hangs — Zoe rejects it and
**refunds everyone**. The contract's power is reduced to "propose a reallocation Zoe will check"; it has
no other capability over the escrowed assets, because it was never handed one. (a)-axiom, for money.

## What the demo shows (`pnpm demo:zoe`)

Alice sells post EF342's deed to Eve through an **untrusted** contract. Four runs, same trusted Zoe path:

- **Honest atomic-swap** → trade completes: Alice gets 70 Coin, Eve gets the EF342 Deed.
- **Thief** (`Eve gets nothing, Alice keeps deed + takes coin`) → **rejected by offer safety**; Eve fully
  refunded her 70 Coin.
- **Counterfeiter** (`give Eve 1000 Coin from nothing`) → **rejected by rights conservation**.
- **Buggy** (throws) → **rejected**; both parties refunded — assets were never at risk.

Three different attacks, three different guards, one invariant: *you cannot end up worse than your offer,
no matter what the contract does.*

### A real computing contract: the AMM (`pnpm demo:amm`)

The swap above is trivial — the honest reallocation is just "give each party the other's escrow". The
sharper test is a contract that does **real math**: a constant-product **AMM** (`x·y=k`, the Uniswap
mechanism). The contract computes a price off the curve and proposes a reallocation; Zoe still bounds it:

- **honest AMM** → trader spends 100 Coin, gets the curve amount (90 Tok, rounded so `k` never
  decreases — the pool keeps the dust); trade completes.
- **shortchange AMM** (gives 50, trader's `want` floor was 90) → **rejected by offer safety**; the
  trader's slippage limit *is* their `want`, so a below-floor fill is refunded.
- **counterfeit AMM** (mint 5000 Tok from a 1000-Tok pool) → **rejected by rights conservation**.
- **vanish AMM** (drops the trader's 100 Coin) → **rejected by rights conservation**.

So offer safety isn't an artifact of a trivial contract: even with real pricing computation in the loop,
a buggy-or-malicious AMM is bounded to *refund, never theft*. The trader's `want` doubles as their
slippage protection — enforced by the trusted framework, not by trusting the AMM.

## Why this is the right capstone for the money thread

The earlier [`demo:ownership`](../examples/moimoi/demo-ownership.ts) sale used a **trusted** escrow agent —
both parties had to trust it not to cheat. Zoe removes that trust: the *framework* is trusted (small,
auditable, like the membrane), the *contract* is not (arbitrary, like the model). This is the same
progression Aegis makes everywhere — *don't trust the powerful flexible component; confine it behind a
small fixed one* — and seeing it arrive independently in Miller's blockchain work is strong evidence the
pattern is fundamental, not a quirk of the AI setting.

It also completes a pleasing symmetry across the project's unifications:

- [doc 05] least authority **+** least knowledge — what an agent may *do* and *know*.
- [doc 08] the authority graph **=** the label lattice — declassification is a capability.
- [doc 09] the social graph **=** the capability graph — sharing is delegation.
- **doc 10** the membrane **=** offer safety — confining a model and confining a contract are one move.

## Honest scope

This is a *miniature* ERTP/Zoe — enough to demonstrate offer safety and rights conservation faithfully,
not the full Agoric system (no on-chain consensus, no real `seat`/`zcf` API surface, no invitation
objects, no priced/auction mechanisms, single-process rather than a chain of vats). The point is the
*architecture*, shown to be identical to Aegis's: the production version lives at agoric.com and in the
Agoric SDK. What we've shown is that **Aegis and Agoric are the same idea pointed at two different
untrusted actors** — a model, and a contract.
