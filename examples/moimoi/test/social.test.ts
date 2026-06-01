import { describe, expect, it } from 'vitest';
import { flowCheck, sink } from '../../../kernel/src/label.ts';
import { makePost } from '../microblog.ts';
import {
  acceptsMentionFrom, attribution, block, boost, editImmutable, makeCirclePost, makeLease,
  makeModeratorCap, makeSturdyRefRegistry, mentionGrant, mute, quote, reachable, rootShare,
  revoke, softBlock,
} from '../social.ts';

describe('A. propagation graph', () => {
  it('revocation cascades through the boost chain', () => {
    const root = rootShare('alice', makePost('alice', 'p', 'public'));
    const eve = boost(boost(root, 'bob'), 'eve');
    expect(reachable(eve)).toBe(true);
    revoke(root);
    expect(reachable(eve)).toBe(false);
  });
  it('attribution survives N hops; audience label is carried unchanged', () => {
    let n = rootShare('alice', makePost('alice', 'p', 'followers-only'));
    for (const w of ['bob', 'carol', 'dave']) n = boost(n, w);
    expect(attribution(n)).toEqual(['alice', 'bob', 'carol', 'dave']);
    expect(n.post.contentLabel.secrecy.has('followers-only')).toBe(true);
  });
  it('block / soft-block / mute are distinct revocation shapes', () => {
    const r = { aReadsB: true, bReadsA: true, aMutesB: false };
    expect(block(r)).toMatchObject({ aReadsB: false, bReadsA: false });
    expect(softBlock(r)).toMatchObject({ aReadsB: true, bReadsA: false });
    expect(mute(r)).toMatchObject({ aReadsB: true, bReadsA: true, aMutesB: true });
  });
});

describe('B. audience & IFC', () => {
  it('circle posts are visible only to a reader cleared for all their circles', () => {
    const p = makeCirclePost('a', 'x', ['close-friends', 'family']);
    expect(flowCheck(p.contentLabel, sink(['work'], false)).ok).toBe(false);
    expect(flowCheck(p.contentLabel, sink(['close-friends'], false)).ok).toBe(false); // family uncleared
    expect(flowCheck(p.contentLabel, sink(['close-friends', 'family'], false)).ok).toBe(true);
  });
  it('quote label is the join; a followers-only quote cannot go public', () => {
    const q = quote('bob', 'c', 'public', makePost('a', 's', 'followers-only'));
    expect(q.label.secrecy.has('followers-only')).toBe(true);
    expect(flowCheck(q.label, sink([], false)).ok).toBe(false);
  });
  it('immutable edit forks; mention grants read-not-share', () => {
    const o = makePost('a', 'v1', 'public');
    expect(editImmutable(o, 'v2').id).not.toBe(o.id);
    const g = mentionGrant(o);
    expect(g.canRead && !g.canShare && !g.delegable).toBe(true);
  });
});

describe('C/D/E. adversaries, scale, money/mod', () => {
  it('relationship-gated reach blocks a no-relationship sybil', () => {
    const followers = new Set(['f1']);
    expect(acceptsMentionFrom(followers, 'sybil', 'followers-only')).toBe(false);
    expect(acceptsMentionFrom(followers, 'f1', 'followers-only')).toBe(true);
  });
  it('sturdyref restores then revokes', () => {
    const reg = makeSturdyRefRegistry<string>();
    const ref = reg.mint('cap');
    expect(reg.restore(ref)).toBe('cap');
    reg.revoke(ref);
    expect(reg.restore(ref)).toBeNull();
  });
  it('a lease expires against the clock', () => {
    let now = 0;
    const l = makeLease('x', 100, () => now);
    expect(l.get()).toBe('x');
    now = 200;
    expect(l.get()).toBeNull();
  });
  it('a scoped moderator cap works only in its community', () => {
    const mod = makeModeratorCap('cx', new Set());
    expect(mod.takedown(makePost('u', 's', 'cx'))).toBe(true);
    expect(mod.takedown(makePost('u', 's', 'cy'))).toBe(false);
  });
});
