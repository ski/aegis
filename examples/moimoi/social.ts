/**
 * social.ts — the mechanisms that make the microblog's hard cases work, built on kernel primitives.
 * Each is a thin, honest model of a real-microblog feature mapped onto capabilities + IFC.
 *
 * Grouped to match the complication roadmap (doc 09 §4):
 *   A. propagation graph — boosts as a cap-derivation tree; revocation cascades; mute/block/soft-block.
 *   B. circles (multi-tag audiences), quote-with-commentary (label join), edits, mentions.
 *   C. malicious-quote taint, relationship-gated reach (spam/sybil).
 *   D. sturdyref registry (persistable/revocable caps at scale).
 *   E. leases (paid/subscription), scoped moderation.
 */
import { harden } from '../../kernel/src/harden.ts';
import { join, label, type Label } from '../../kernel/src/label.ts';
import type { Post, PostRef } from './microblog.ts';
import { makePost } from './microblog.ts';

// ─── A. Propagation graph: boosts as a cap-derivation tree (cascading revocation) ────────────────
/**
 * A boost is a node deriving from a parent (who you got the post from). Reachability requires the whole
 * ancestor chain to be live — so revoking any ancestor (delete/block) makes the whole subtree inert at
 * once. This is the microkernel liveChain pattern (transitive revocation, doc 03) applied to sharing.
 */
export interface ShareNode {
  readonly id: string;
  readonly by: string; // who shared (for attribution)
  readonly post: Post;
  readonly parent: ShareNode | null;
  live: boolean;
}

let shareCounter = 0;

export function rootShare(by: string, post: Post): ShareNode {
  shareCounter += 1;
  return { id: `share:${shareCounter}`, by, post, parent: null, live: true };
}

/** Boost a node onward. The new node's parent is the node you boosted (records the chain). */
export function boost(parent: ShareNode, by: string): ShareNode {
  shareCounter += 1;
  return { id: `share:${shareCounter}`, by, post: parent.post, parent, live: true };
}

/** Revoke a node (delete a post / pull a boost). Anything derived from it is severed too — see reachable. */
export function revoke(node: ShareNode): void {
  node.live = false;
}

/** Reachable iff this node AND every ancestor up to the root are still live (cascading revocation). */
export function reachable(node: ShareNode): boolean {
  let n: ShareNode | null = node;
  while (n) {
    if (!n.live) return false;
    n = n.parent;
  }
  return true;
}

/** Attribution: the chain of sharers from the original author down to this node. */
export function attribution(node: ShareNode): string[] {
  const chain: string[] = [];
  let n: ShareNode | null = node;
  while (n) {
    chain.unshift(n.by);
    n = n.parent;
  }
  return chain;
}

// ─── A. Mute / block / soft-block: three revocation shapes ───────────────────────────────────────
export interface Relationship {
  /** A holds a read-cap to B's stream (A follows B). */
  aReadsB: boolean;
  /** B holds a read-cap to A's stream (B follows A). */
  bReadsA: boolean;
  /** A's local view filter: A still holds the cap but hides B's content (mute — B is unaware). */
  aMutesB: boolean;
}

export const block = (r: Relationship): Relationship => harden({ ...r, aReadsB: false, bReadsA: false }); // two-way revoke
export const softBlock = (r: Relationship): Relationship => harden({ ...r, bReadsA: false }); // revoke B's cap to A only
export const mute = (r: Relationship): Relationship => harden({ ...r, aMutesB: true }); // local filter; no cap change

// ─── B. Circles: multi-tag audiences (overlapping compartments) ──────────────────────────────────
/** A post addressed to a set of circles carries each as a secrecy tag (the multi-tag lattice). */
export function makeCirclePost(author: string, body: string, circles: string[]): Post {
  const p = makePost(author, body, circles.join('+'));
  // override the content label to carry each circle as a distinct secrecy tag
  return harden({ ...p, audience: circles.join('+'), contentLabel: label(circles, []) });
}

// ─── B. Quote-with-commentary: the quote's label is the JOIN of commentary + quoted content ──────
export interface Quote {
  readonly post: Post; // the new quote-post (commentary)
  readonly quoted: Post;
  readonly label: Label; // join(commentary, quoted)
}
export function quote(author: string, commentary: string, commentaryAudience: string, quoted: Post): Quote {
  const commentaryPost = makePost(author, commentary, commentaryAudience);
  return harden({ post: commentaryPost, quoted, label: join(commentaryPost.contentLabel, quoted.contentLabel) });
}

// ─── B. Edits: immutable (fork) vs mutable (caretaker-backed cell) ───────────────────────────────
/** Immutable: an edit FORKS a new post; existing boosts keep pointing at the old one. */
export function editImmutable(original: Post, newBody: string): Post {
  return makePost(original.author, newBody, original.audience); // new id — a fork
}
/** Mutable: a cell whose body can change; holders see the update (and must re-gate the new content). */
export interface MutablePost {
  current(): Post;
  edit(newBody: string): void;
}
export function makeMutablePost(author: string, body: string, audience: string): MutablePost {
  let post = makePost(author, body, audience);
  return harden({ current: () => post, edit: (b: string) => { post = harden({ ...post, body: b }); } });
}

// ─── B. Mentions: @-mention grants the mentioned party a read-cap (a deliberate, narrow leak) ────
/** A mention-grant: a read-only PostRef handed to the mentioned account. Attenuable by policy. */
export function mentionGrant(post: Post): PostRef {
  return harden({ post, canRead: true, canShare: false, delegable: false });
}

// ─── C. Relationship-gated reach (spam/sybil): you only accept mentions/DMs you hold a relation for ─
export function acceptsMentionFrom(myFollowers: ReadonlySet<string>, from: string, policy: 'anyone' | 'followers-only'): boolean {
  return policy === 'anyone' || myFollowers.has(from);
}

// ─── D. Sturdyref registry: persistable, restorable, revocable caps (the millions-of-caps shape) ─
/**
 * A live cap dies with its process; a *sturdyref* is a string you can write down and later restore to a
 * live cap — with revocation. This is the capability-database the "millions of caps" problem needs.
 */
export interface SturdyRefRegistry<T> {
  mint(value: T): string;          // returns a sturdyref string
  restore(ref: string): T | null;  // null if revoked/unknown
  revoke(ref: string): void;
}
export function makeSturdyRefRegistry<T>(): SturdyRefRegistry<T> {
  const table = new Map<string, T>();
  let n = 0;
  return harden({
    mint(value: T) { n += 1; const ref = `sturdy:${n}`; table.set(ref, value); return ref; },
    restore(ref: string) { return table.get(ref) ?? null; },
    revoke(ref: string) { table.delete(ref); },
  });
}

// ─── E. Lease: a read-cap that expires against a trusted clock (subscriptions) ───────────────────
export interface Lease<T> {
  get(): T | null; // the value while live; null once expired
}
export function makeLease<T>(value: T, expiresAt: number, clock: () => number): Lease<T> {
  return harden({ get: () => (clock() < expiresAt ? value : null) });
}

// ─── E. Scoped moderation: a takedown cap bound to one community; reports are requests ───────────
export interface ModeratorCap {
  readonly community: string;
  takedown(post: Post): boolean; // succeeds only for posts in this community
}
export function makeModeratorCap(community: string, taken: Set<string>): ModeratorCap {
  return harden({
    community,
    takedown(post: Post) {
      if (post.audience !== community && !post.audience.includes(community)) return false; // out of scope
      taken.add(post.id);
      return true;
    },
  });
}
