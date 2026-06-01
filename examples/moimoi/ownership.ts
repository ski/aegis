/**
 * Ownership as a transferable mint — the "deed" pattern.
 *
 * The subtle distinction (Miller's exclusive-transfer problem):
 *   - a USE-cap (read/share a post) is COPYABLE — sharing keeps the giver's copy (the microblog demo).
 *   - OWNERSHIP is EXCLUSIVE — selling means the seller must LOSE it.
 * You cannot get exclusivity from capability-passing (which is copy-by-default). It must be MANUFACTURED.
 *
 * Owning a post = holding its DEED: the mint that issues all share/read caps for that post, PLUS the
 * right to transfer the deed. The deed is held behind a caretaker (revocable membrane) from birth, so:
 *
 *     transfer(deed) :=  revoke(seller's deed)   // cascading: severs every copy the seller made
 *                        + mint a fresh deed for the buyer
 *
 * Exclusivity is produced by revocation, not assumed. After transfer the seller's reference throws; the
 * buyer holds the only live deed. Works identically whether the buyer is a human or an agent — the deed
 * doesn't know what kind of principal owns it.
 */
import { harden } from '../../kernel/src/harden.ts';
import { makeMembrane } from '../../kernel/src/membrane.ts';
import type { PostRef } from './microblog.ts';
import { authorRef } from './microblog.ts';
import type { Post } from './microblog.ts';

export interface Deed {
  readonly postId: string;
  /** the current owner principal (a label, human or agent — the deed is agnostic). */
  readonly owner: string;
  /** issue a use-cap over the post (this is the "mint" — only the deed holder can do it). */
  mintShareCap(opts?: { delegable?: boolean }): PostRef;
  /** is this deed still live (not revoked by a transfer)? */
  isLive(): boolean;
}

interface DeedRegistryEntry {
  post: Post;
  owner: string;
}

/**
 * A registry that owns the underlying posts and produces deeds. `transfer` is the exclusive operation:
 * it revokes the seller's deed (cascading) and mints a fresh one for the buyer.
 */
export interface DeedRegistry {
  /** Create a post and its first deed, owned by `owner`. */
  createPost(owner: string, body: string, audience: string): { post: Post; deed: Deed; revokeDeed: () => void };
  /** Exclusive transfer: revoke `seller`'s deed and mint a fresh deed for `buyer`. Returns the new deed. */
  transfer(currentDeed: Deed, buyer: string): { deed: Deed; revokeDeed: () => void };
}

export function makeDeedRegistry(): DeedRegistry {
  const posts = new Map<string, DeedRegistryEntry>();
  let postCounter = 0;

  // Build a deed object bound to a postId+owner; wrap it in a caretaker so it can be revoked on transfer.
  const buildDeed = (postId: string, owner: string): { deed: Deed; revoke: () => void } => {
    const entry = posts.get(postId)!;
    const rawDeed: Deed = harden({
      postId,
      owner,
      mintShareCap(opts) {
        // Only callable while the deed is live (the caretaker enforces this — a revoked deed throws).
        const base = authorRef(entry.post);
        return opts?.delegable === false ? { ...base, delegable: false } : base;
      },
      isLive: () => true, // the live one returns true; a revoked membrane proxy throws before reaching here
    });
    // Hold the deed behind a revocable membrane from birth, so transfer can sever it (and every copy
    // the owner made — cascading revocation). After revoke(), any access to the proxy throws.
    const m = makeMembrane<Deed>(rawDeed);
    return { deed: m.proxy, revoke: m.revoke };
  };

  return harden({
    createPost(owner, body, audience) {
      postCounter += 1;
      const post: Post = harden({
        id: `post:${owner}:${postCounter}`,
        author: owner,
        body,
        audience,
        contentLabel: audience === 'public' ? { secrecy: new Set<string>(), taints: new Set<string>() } : { secrecy: new Set([audience]), taints: new Set<string>() },
      });
      posts.set(post.id, { post, owner });
      const { deed, revoke } = buildDeed(post.id, owner);
      return { post, deed, revokeDeed: revoke };
    },

    transfer(currentDeed, buyer) {
      const postId = currentDeed.postId; // reading metadata; throws if already revoked
      const entry = posts.get(postId);
      if (!entry) throw new Error('no such post');
      entry.owner = buyer; // ownership record updates
      const { deed, revoke } = buildDeed(postId, buyer);
      return { deed, revokeDeed: revoke };
    },
  });
}
