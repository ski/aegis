/**
 * Label privileges — declassification and endorsement as CAPABILITIES (decentralized IFC).
 *
 * The hardest question in information-flow control is: *who may lower a secrecy tag, or clear a taint?*
 * doc 04 frets that "the declassifier is the most security-critical thing." Aegis's own structure
 * answers it: **the right to declassify a tag is itself a capability** — a least-authority privilege,
 * scoped to specific tags, minted by the trusted base and handed out like any other cap.
 *
 * This is the HiStar / Flume / Myers–Liskov decentralized-IFC tradition, and it UNIFIES the two halves
 * of Aegis: the capability graph (least *authority*) and the label lattice (least *knowledge*) are the
 * same graph. A capability may grant *action*-authority (send email) OR *label*-authority (declassify
 * `medical`). The (a) axiom — you can only do what you hold — now governs IFC too: you can only lower a
 * tag you hold the privilege for.
 *
 * Key safety property: a privilege is SCOPED. Holding declassify(['medical']) lets you lower `medical`
 * and *nothing else* — it cannot touch `salaries`. Least authority, applied to declassification.
 */
import { harden } from './harden.ts';
import type { Label } from './label.ts';
import { label } from './label.ts';

export interface Privilege {
  readonly id: string;
  /** secrecy tags this privilege may REMOVE from a label (declassify). */
  readonly declassifies: ReadonlySet<string>;
  /** taint tags this privilege may CLEAR from a label (endorse). */
  readonly endorses: ReadonlySet<string>;
}

let counter = 0;

/** Mint a label privilege. Minting is a trusted-base act; the privilege is then handed out as a cap. */
export function makePrivilege(opts: { declassifies?: string[]; endorses?: string[] }): Privilege {
  counter += 1;
  return harden({
    id: `priv:${counter}`,
    declassifies: new Set(opts.declassifies ?? []),
    endorses: new Set(opts.endorses ?? []),
  });
}

/**
 * Declassify: remove from `data`'s secrecy ONLY the tags this privilege owns. Tags it doesn't own are
 * left untouched — so a `medical`-only privilege cannot lower `salaries`. Returns a new (lower) label.
 */
export function declassify(data: Label, priv: Privilege): Label {
  const secrecy = [...data.secrecy].filter((t) => !priv.declassifies.has(t));
  return label(secrecy, [...data.taints]);
}

/** Endorse: clear from `data`'s taints ONLY the tags this privilege owns. Returns a new label. */
export function endorse(data: Label, priv: Privilege): Label {
  const taints = [...data.taints].filter((t) => !priv.endorses.has(t));
  return label([...data.secrecy], taints);
}

/** Combine privileges (e.g. when an agent holds several). Union of what each may declassify/endorse. */
export function combinePrivileges(...privs: Privilege[]): Privilege {
  counter += 1;
  return harden({
    id: `priv:${counter}`,
    declassifies: new Set(privs.flatMap((p) => [...p.declassifies])),
    endorses: new Set(privs.flatMap((p) => [...p.endorses])),
  });
}
