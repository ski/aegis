/**
 * Microblog as a capability/IFC system — a microblog is secretly already one, wearing ACL clothes.
 *
 * Core reframes (see the session analysis / docs):
 *   - No god-token. You hold a SET of capabilities — read a stream, compose, share a specific post —
 *     each unforgeable, attenuable, delegatable, revocable. An agent gets exactly what it needs.
 *   - The social graph IS the capability graph: follow = hold a read-cap to a stream; block = revoke.
 *   - Sharing IS capability propagation: a boost introduces your followers to a post. "Only
 *     connectivity begets connectivity."
 *   - Visibility IS an IFC secrecy compartment: `public`, `followers-only`, … A stream is a sink
 *     cleared for an audience; a post carries its audience as a secrecy label. Leaking a private post
 *     to a public stream is an information-flow violation, not an ACL check.
 *   - Re-share depends on DELEGABILITY of the facet propagated, set (max) by the author and narrowable
 *     by each resharer — never wideneable.
 *
 * This module is deliberately small and composable (more complexity to come).
 */
import { harden } from '../../kernel/src/harden.ts';
import { flowCheck, label, sink, type Label } from '../../kernel/src/label.ts';
import { declassify, type Privilege } from '../../kernel/src/privilege.ts';

export type Audience = 'public' | 'followers-only' | string;

export interface Post {
  readonly id: string;
  readonly author: string;
  readonly body: string;
  readonly audience: Audience; // becomes the secrecy label
  /** secrecy/taint label the post's content carries (audience as secrecy tag). */
  readonly contentLabel: Label;
}

/**
 * A reference to a post that you HOLD. `delegable` decides whether you may pass the share onward:
 *   - delegable: true  → you can re-share (introduce others), and they may too (subject to their facet)
 *   - delegable: false → terminal: you can read/boost-to-your-followers, but recipients get a dead-end
 * This is the attenuation lever; the author sets the max, each hop may only narrow.
 */
export interface PostRef {
  readonly post: Post;
  readonly canRead: boolean;
  readonly canShare: boolean;   // may create a boost/quote that introduces others
  readonly delegable: boolean;  // may the introduced reference itself be re-shared?
}

/** A stream (timeline) is a sink cleared for an audience; entries are posts placed into it. */
export interface Stream {
  readonly owner: string;
  readonly clearedFor: ReadonlySet<Audience>;
  readonly entries: PostRef[];
}

let postCounter = 0;

export function makePost(author: string, body: string, audience: Audience): Post {
  postCounter += 1;
  return harden({
    id: `post:${author}:${postCounter}`,
    author,
    body,
    audience,
    contentLabel: audience === 'public' ? label([], []) : label([audience], []),
  });
}

/** The author's original reference to their own post — fully delegable, full authority. */
export function authorRef(post: Post): PostRef {
  return harden({ post, canRead: true, canShare: true, delegable: true });
}

/** Attenuate a reference for handing onward. You can only NARROW (child ⊑ parent). */
export function attenuate(ref: PostRef, opts: { canRead?: boolean; canShare?: boolean; delegable?: boolean }): PostRef {
  return harden({
    post: ref.post,
    canRead: (opts.canRead ?? ref.canRead) && ref.canRead,
    canShare: (opts.canShare ?? ref.canShare) && ref.canShare,
    delegable: (opts.delegable ?? ref.delegable) && ref.delegable,
  });
}

export function makeStream(owner: string, clearedFor: Audience[]): Stream {
  return { owner, clearedFor: new Set(clearedFor), entries: [] };
}

export interface PlaceResult {
  readonly ok: boolean;
  readonly reason?: string;
}

/**
 * Place (post/boost) a PostRef into a stream. Two gates, both must pass:
 *   1. authority: the ref must be shareable to introduce it into a stream others read.
 *   2. IFC: the post's content label must be cleared for the stream's audience — unless the placer
 *      holds a declassify privilege for that audience (the author's lever to go private→public).
 * The reference introduced to the stream's readers is attenuated by `delegable` (terminal if false).
 */
export function placeInStream(stream: Stream, ref: PostRef, opts?: { declassifyWith?: Privilege }): PlaceResult {
  if (!ref.canShare) return { ok: false, reason: 'no share authority on this post reference' };

  // IFC: is the post's audience cleared for this stream?
  let effectiveLabel = ref.post.contentLabel;
  if (opts?.declassifyWith) effectiveLabel = declassify(effectiveLabel, opts.declassifyWith);
  const streamClearance = sink([...stream.clearedFor].filter((a) => a !== 'public'), false);
  const verdict = flowCheck(effectiveLabel, streamClearance);
  if (!verdict.ok) return { ok: false, reason: `IFC: ${verdict.reasons.join('; ')}` };

  // The reference readers of this stream receive: read yes; re-share only if this ref is delegable.
  const introduced = attenuate(ref, { canShare: ref.delegable, delegable: ref.delegable });
  stream.entries.push(introduced);
  return { ok: true };
}

/** What a follower of `stream` can reach: the introduced refs (their attenuated form). */
export function readStream(stream: Stream): readonly PostRef[] {
  return stream.entries;
}

/** Can `viewer` (holding what they hold) see post `id` anywhere they can reach? */
export function canSee(streams: readonly Stream[], postId: string): boolean {
  return streams.some((s) => s.entries.some((e) => e.canRead && e.post.id === postId));
}
