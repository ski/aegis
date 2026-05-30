# Glossary

Quick reference for the vocabulary used across the Aegis docs.

- **Ambient authority** — authority a program holds by virtue of *who/what it is* (its uid, its
  position in a global namespace), exercisable by *naming* a target. The original sin Aegis abolishes.

- **Capability (cap)** — an unforgeable reference that *combines designation and authority*: to hold it
  is to be permitted to use the object it names. The only way to act in Aegis.

- **The axiom (a)** — an agent can only act on capabilities it already holds. The single law; everything
  else is a pattern built from it.

- **Confused deputy** — a program with more authority than its client, tricked into wielding that
  authority on the client's behalf. Prompt injection is this problem reborn.

- **Connectivity begets connectivity** — you can only obtain a new cap by being given it (introduction),
  creating the object (parenthood), or holding it from the start (endowment). No other path.

- **Powerbox** — a trusted broker (human- or policy-rooted) reachable as a capability, which may grant
  fresh caps under adjudication. The (b) "brokered request" is a held cap to a powerbox.

- **Petname** — a per-principal, human-legible label for a cap. The human's private namespace. Forgeable
  and authority-free; the projection of the cap graph onto names. The model traffics in petnames to
  *talk*, in caps to *act*.

- **Resolver** — the trusted layer mapping petnames → caps under policy; the membrane between the "names"
  register and the "caps" register.

- **Facet** — one of several differently-attenuated capabilities to the *same* underlying object (e.g. a
  calendar's human-UI facet vs. its read-only API facet). How POLA is expressed ergonomically.

- **Vat** — a single-threaded event loop holding a cap set, communicating only by async message. An
  agent *is* a vat; a turn is one reasoning step.

- **Membrane** — a transitive attenuation boundary wrapping a cap such that every cap reachable *through*
  it is wrapped the same way. The mechanism for read-only/revocable/budgeted delegation, and the
  single chokepoint where authority and flow are both checked.

- **Caretaker** — a revocable membrane: hand out a forwarder, keep the off-switch. Dropping it revokes
  everything that flowed through, transitively (cascading revocation).

- **Attenuation** — handing over strictly less authority than you hold. A child can never exceed its
  parent; the model can only propose narrowing.

- **Endowment** — the initial cap set a parent vat grants a child at creation. The base case of (a).

- **Sturdyref** — a persistent, restorable capability you can write down and reconnect to later (vs. a
  live cap that dies with its connection). A remote inference box is a sturdyref.

- **OCapN / CapTP** — the object-capability network protocol: cap-passing over the wire, with promise
  pipelining and sturdyrefs. The distribution layer.

- **Promise pipelining** — messaging a cap returns a promise immediately, and you may message that
  promise before it resolves — collapsing dependent multi-step plans into one round trip.

- **IFC (information-flow control)** — tracking data labels/provenance to bound where information may
  flow. The confidentiality/integrity dual of ocaps' authority bounding.

- **Label / clearance** — a datum's label says where it came from / how secret it is; a sink's clearance
  says what it may receive. A send passes only if `data_label ⊑ sink_clearance`.

- **Label-the-turn** — because the context window mixes everything, IFC labels the whole inference call
  (`output = ⊔(all inputs)`), not individual tokens.

- **Declassify** — a trusted operation lowering a confidentiality label ("cleared to leave"). Never the
  model; logged; preferably structural.

- **Endorse** — a trusted operation raising trust on untrusted-tainted data ("this action is
  sanctioned"). The integrity-side declassifier.

- **Compartmentalization** — splitting secret-reading authority and outbound channels across different
  vats so no single vat is both high-secret and sink-capable. Dissolves IFC label-creep. Same act as
  authority decomposition.

- **POLA** — Principle of Least Authority: every component holds exactly the authority its job needs and
  no more. In Aegis it falls out of handing the right facet, not from writing a policy.
