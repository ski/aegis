/**
 * Milestone — a microblog as capabilities + IFC. The Alice → Bob → Eve scenario, exactly.
 *
 * Run: `pnpm demo:microblog`
 *
 *   Alice posts. Bob is granted a share-cap to Alice's post. Eve follows Bob, NOT Alice.
 *   - Before Bob shares: Eve cannot see the post (it isn't in any stream she can reach).
 *   - Bob boosts → Eve reaches it THROUGH Bob's stream (one post, not Alice's whole stream).
 *   - Eve can re-share only if the facet Bob propagated was DELEGABLE; terminal facet stops at Bob's followers.
 *   - If Alice's post is followers-only, boosting it into a PUBLIC stream is IFC-blocked — unless the
 *     placer holds Alice's declassify(followers-only) privilege.
 *   - An injected agent holding only a read-cap can't share at all.
 */
import './bootstrap.ts';
import { makePrivilege } from './privilege.ts';
import {
  attenuate,
  authorRef,
  canSee,
  makePost,
  makeStream,
  placeInStream,
  readStream,
  type PostRef,
} from './microblog.ts';

function bar(): void {
  console.log('─'.repeat(86));
}

async function main(): Promise<void> {
  console.log('\nAEGIS · microblog as capabilities + IFC · Alice → Bob → Eve');
  bar();

  const checks: Array<[string, boolean]> = [];

  // Streams (timelines). A stream is a sink cleared for an audience.
  const aliceStream = makeStream('alice', ['public', 'followers-only']);
  const bobStream = makeStream('bob', ['public', 'followers-only']);
  // Eve follows Bob (she can read Bob's stream), NOT Alice.
  const eveCanReach = [bobStream]; // the streams Eve holds read-caps to

  // ── 1. Alice posts (public, for this first scenario) ──────────────────────────────────────────
  const post = makePost('alice', 'hello from alice', 'public');
  const aliceOwn = authorRef(post);
  placeInStream(aliceStream, aliceOwn); // appears in Alice's own stream
  console.log(`\n  Alice posted '${post.body}' (audience: ${post.audience})`);

  // ── 2. Before Bob shares: can Eve see it? ─────────────────────────────────────────────────────
  const eveSeesBefore = canSee(eveCanReach, post.id);
  console.log(`  Eve follows Bob (not Alice). Before any share → Eve sees the post: ${eveSeesBefore}`);
  checks.push(['before Bob shares, Eve cannot see Alice’s post', eveSeesBefore === false]);

  // ── 3. Alice grants Bob a DELEGABLE share-cap; Bob boosts into his stream ──────────────────────
  const bobRef = attenuate(aliceOwn, { canRead: true, canShare: true, delegable: true });
  const bobBoost = placeInStream(bobStream, bobRef);
  const eveSeesAfter = canSee(eveCanReach, post.id);
  console.log(`  Bob boosts (delegable cap) → Eve sees it through Bob's stream: ${eveSeesAfter} (${bobBoost.ok ? 'boost ok' : bobBoost.reason})`);
  checks.push(['after Bob boosts, Eve reaches the post THROUGH Bob', eveSeesAfter === true]);

  // ── 4. Can Eve RE-SHARE? Only if the introduced facet was delegable ───────────────────────────
  const eveGotRef: PostRef = readStream(bobStream).find((e) => e.post.id === post.id)!;
  const eveStream = makeStream('eve', ['public']);
  const eveReshare = placeInStream(eveStream, eveGotRef);
  console.log(`  Eve re-shares (Bob's facet was delegable) → ${eveReshare.ok ? 'ALLOWED' : 'blocked: ' + eveReshare.reason}`);
  checks.push(['delegable facet ⇒ Eve can re-share onward', eveReshare.ok === true]);

  // ── 5. Now the TERMINAL case: Alice grants Bob a non-delegable share-cap ──────────────────────
  const bobStream2 = makeStream('bob', ['public']);
  const bobTermRef = attenuate(aliceOwn, { canRead: true, canShare: true, delegable: false });
  placeInStream(bobStream2, bobTermRef); // Bob can still boost to his followers
  const eveGotTerminal = readStream(bobStream2).find((e) => e.post.id === post.id)!;
  const eveStream2 = makeStream('eve', ['public']);
  const eveReshareTerminal = placeInStream(eveStream2, eveGotTerminal);
  console.log(`  (terminal facet) Eve can READ via Bob (${eveGotTerminal.canRead}) but re-share → ${eveReshareTerminal.ok ? 'ALLOWED?!' : 'BLOCKED — spread stops at Bob\'s followers'}`);
  checks.push(['terminal facet ⇒ Eve reads but cannot re-share; spread stops at Bob', eveGotTerminal.canRead && !eveReshareTerminal.ok]);

  // ── 6. IFC: a followers-only post can't be boosted to a PUBLIC stream … ───────────────────────
  const privPost = makePost('alice', 'secret plans', 'followers-only');
  const alicePrivRef = authorRef(privPost);
  const bobShareOfPriv = attenuate(alicePrivRef, { canShare: true, delegable: true });
  const publicStream = makeStream('bob-public', ['public']);
  const leak = placeInStream(publicStream, bobShareOfPriv);
  console.log(`\n  Bob boosts a followers-only post into a PUBLIC stream → ${leak.ok ? 'LEAKED?!' : 'BLOCKED: ' + leak.reason}`);
  checks.push(['IFC blocks followers-only → public (no declassify privilege)', leak.ok === false]);

  // ── 7. … unless the placer holds Alice's declassify(followers-only) privilege ─────────────────
  const aliceDeclassify = makePrivilege({ declassifies: ['followers-only'] });
  const publicStream2 = makeStream('bob-public', ['public']);
  const withPriv = placeInStream(publicStream2, bobShareOfPriv, { declassifyWith: aliceDeclassify });
  console.log(`  Same boost, holding Alice's declassify(followers-only) → ${withPriv.ok ? 'ALLOWED (author-sanctioned)' : 'blocked'}`);
  checks.push(['author’s declassify privilege ⇒ followers-only → public is allowed', withPriv.ok === true]);

  // ── 8. An injected agent with only a READ cap cannot share ────────────────────────────────────
  const agentReadOnly = attenuate(aliceOwn, { canRead: true, canShare: false, delegable: false });
  const agentStream = makeStream('agent', ['public']);
  const agentShare = placeInStream(agentStream, agentReadOnly);
  console.log(`  Injected agent holds READ-only → tries to share → ${agentShare.ok ? 'SHARED?!' : 'BLOCKED: ' + agentShare.reason}`);
  checks.push(['read-only cap ⇒ an injected agent structurally cannot share', agentShare.ok === false]);

  bar();
  console.log('\nGUARANTEES:');
  let allOk = true;
  for (const [name, ok] of checks) {
    console.log(`  ${ok ? '✅ PASS' : '❌ FAIL'}  ${name}`);
    allOk &&= ok;
  }
  bar();
  console.log(
    allOk
      ? '\n✅ ALL GUARANTEES HELD — sharing is capability propagation; visibility is IFC; the social graph is the capability graph.\n'
      : '\n❌ A GUARANTEE FAILED.\n',
  );
  process.exitCode = allOk ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
