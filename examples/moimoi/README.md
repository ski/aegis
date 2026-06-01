# moimoi — a microblog as a worked exposition of Aegis

> **This is not a product. It is a lens.** moimoi exists to make the Aegis kernel concrete on something
> you already understand — a microblog (post / share / quote / follow / own / sell). Every feature here
> is *just an exhibition* of a kernel primitive; nothing in this directory is a new mechanism.

It lives in `examples/` precisely to keep that honest: the kernel (`../../kernel`) is the project; moimoi
is the kernel *pointed at* a familiar domain. The design write-up is [`docs/09`](../../docs/09-worked-example-the-microblog.md)
(the microblog) and [`docs/10`](../../docs/10-offer-safety-the-financial-dual.md) (the trustless sale).

## The map: microblog feature → Aegis primitive it exhibits

| moimoi feature | …is really an exhibition of |
| --- | --- |
| share / quote-share | capability **delegation** ("only connectivity begets connectivity") |
| public / followers-only / circles | **IFC secrecy compartments** + the label lattice (`label.ts`) |
| "can Eve re-share?" | **attenuation** — delegable vs terminal facets (child ⊑ parent) |
| follow / block | the **social graph *is* the capability graph**; block = revocation |
| private→public leak blocked | the **flow gate** (`label.ts` `flowCheck`) |
| "the author can make it public" | **declassification as a capability** (`privilege.ts`, docs/08) |
| owning a post / selling it | **mint + exclusive transfer** via cascading revocation (`ownership.ts`) |
| trustless sale (untrusted contract) | **offer safety = the membrane, in finance** (`zoe.ts`, docs/10) |
| an agent running a brand account | the **model-is-never-a-principal** thesis |

## Run it

From this directory (shares the workspace toolchain — no separate install):

```bash
pnpm demo:microblog   # Alice → Bob → Eve: sharing=delegation, visibility=IFC
pnpm demo:ownership   # Alice SELLS post EF342's deed to Eve (money + exclusive transfer)
pnpm demo:zoe         # an UNTRUSTED contract sells the deed; worst case a refund, never theft
pnpm test             # the ownership/money unit tests
```

## What's here vs. what stayed in the kernel

Moved here (microblog-specific): `microblog.ts` (posts/streams/refs), `ownership.ts` (deeds *over posts*),
and the three exposition demos.

Stayed in the kernel (reusable, domain-agnostic primitives): `mint.ts`, `ertp.ts`, `zoe.ts` — money and
offer-safety aren't about microblogs, so they're kernel citizens. moimoi imports them via
`../../kernel/src/…`.

## Honest scope

A deliberately *partial* microblog — it skips everything hard-but-not-illustrative (scale / millions of
caps, real federation consensus, spam at volume, UX, the screenshot attack). Those are *engineering*, not
*exposition*; the full complication roadmap with built/designed status is in [`../../TODO.md`](../../TODO.md).
The point was never to ship a microblog — it was to watch the whole Aegis stack interlock on one coherent
problem, and to discover (docs 08–10) three new unifications along the way.
