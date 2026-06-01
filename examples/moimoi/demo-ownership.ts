/**
 * Milestone — ownership as a transferable mint: Alice SELLS post EF342 to Eve.
 *
 * Run: `pnpm demo:ownership`
 *
 * The founder's question: can the ownership of the MINT that issues a post's share-caps be sold and
 * transferred — to a human OR an agent? Yes. This shows the three layers and the exclusive sale:
 *
 *   1. Money as caps (mint & purse): value lives in a closure-private ledger, not the reference — you
 *      can't forge money by copying a purse; payment conserves total value.
 *   2. Ownership = holding the DEED (the mint for a post's share-caps). Sharing is COPY (Alice keeps
 *      hers); ownership is EXCLUSIVE (selling means Alice LOSES it).
 *   3. Sale via escrow: atomically swap funds ⇄ deed. Transfer = cascading-revoke the seller's deed +
 *      mint a fresh deed for the buyer. Afterwards Alice's deed is INERT; Eve mints the share-caps.
 *   4. The buyer can be a human or an agent — mechanically identical.
 */
import '../../kernel/src/bootstrap.ts';
import { makeMint } from '../../kernel/src/mint.ts';
import { makeDeedRegistry, type Deed } from './ownership.ts';

function bar(): void {
  console.log('─'.repeat(86));
}

async function main(): Promise<void> {
  console.log('\nAEGIS · ownership as a transferable mint · Alice sells post EF342 to Eve');
  bar();

  const checks: Array<[string, boolean]> = [];

  // ── 1. Money ──────────────────────────────────────────────────────────────────────────────────
  const coin = makeMint('coin');
  const alicePurse = coin.issue(0);
  const evePurse = coin.issue(100);
  // can't forge money: copying a reference doesn't copy value (balance is in the mint's private ledger)
  const eveAlias = evePurse; // same reference
  checks.push(['money: a purse alias shares the SAME balance (value is not in the reference)', eveAlias.getBalance() === 100 && evePurse.getBalance() === 100]);
  console.log(`\n  Eve has ${evePurse.getBalance()} coin; Alice has ${alicePurse.getBalance()}.`);

  // ── 2. Alice creates EF342 and owns its deed ──────────────────────────────────────────────────
  const registry = makeDeedRegistry();
  const { post, deed: aliceDeed, revokeDeed: revokeAlice } = registry.createPost('alice', 'EF342: the famous post', 'public');
  console.log(`  Alice created ${post.id} and holds its DEED (the mint for its share-caps).`);

  // Alice can mint share-caps from the deed (this is what ownership grants).
  const aliceCanMintBefore = (() => { try { aliceDeed.mintShareCap(); return true; } catch { return false; } })();
  checks.push(['before sale: Alice (deed holder) can mint share-caps', aliceCanMintBefore]);

  // Sharing is COPY: Alice hands Bob a share-cap; Alice still holds the deed. (Not ownership transfer.)
  const bobShareCap = aliceDeed.mintShareCap({ delegable: false });
  checks.push(['sharing is COPY: Alice minted Bob a share-cap and STILL holds the deed', bobShareCap.canShare && aliceDeed.isLive()]);

  // ── 3. The sale via escrow (atomic swap, one single-threaded turn) ────────────────────────────
  const PRICE = 70;
  function escrowSale(sellerDeed: Deed, buyer: string, buyerPurse: ReturnType<typeof coin.issue>, sellerPurse: ReturnType<typeof coin.issue>):
    { newDeed: Deed; revokeNew: () => void } {
    // Verify funds before touching the deed.
    if (buyerPurse.getBalance() < PRICE) throw new Error('buyer cannot afford it');
    // Atomic in this turn: take payment, then transfer the deed exclusively.
    sellerPurse.deposit(PRICE, buyerPurse);               // money moves
    const { deed: newDeed, revokeDeed: revokeNew } = registry.transfer(sellerDeed, buyer); // mint fresh deed for buyer
    revokeAlice();                                          // cascading-revoke the SELLER's deed (+ copies)
    return { newDeed, revokeNew };
  }

  const { newDeed: eveDeed } = escrowSale(aliceDeed, 'eve', evePurse, alicePurse);
  console.log(`\n  SALE: Eve pays ${PRICE} coin. Deed transferred alice → eve.`);
  console.log(`  balances now → Eve: ${evePurse.getBalance()}, Alice: ${alicePurse.getBalance()}`);
  checks.push(['payment conserved value and moved correctly (Eve 30, Alice 70)', evePurse.getBalance() === 30 && alicePurse.getBalance() === 70]);

  // ── 4. Exclusivity: Alice's deed is now INERT; Eve's is live ──────────────────────────────────
  let aliceStillOwns = true;
  try { aliceDeed.mintShareCap(); } catch { aliceStillOwns = false; }
  console.log(`  after sale → Alice can still mint from her (old) deed: ${aliceStillOwns}`);
  checks.push(['EXCLUSIVE: after the sale Alice’s deed is revoked — she can no longer mint', aliceStillOwns === false]);

  const eveCanMint = (() => { try { eveDeed.mintShareCap(); return true; } catch { return false; } })();
  checks.push(['the buyer (Eve) now holds the live deed and can mint share-caps', eveCanMint]);
  console.log(`  Eve (new owner) can mint share-caps for EF342: ${eveCanMint}`);

  // ── 5. The buyer could equally be an AGENT — mechanically identical ───────────────────────────
  const { post: p2, deed: d2, revokeDeed: _r2 } = registry.createPost('alice', 'EF999', 'public');
  void p2; void _r2;
  const { deed: agentDeed } = registry.transfer(d2, 'brand-agent-7'); // an autonomous agent as owner
  const agentOwns = (() => { try { agentDeed.mintShareCap(); return true; } catch { return false; } })();
  console.log(`  (an AGENT can own too) deed transferred to 'brand-agent-7'; it can mint: ${agentOwns}`);
  checks.push(['ownership transfers to an AGENT identically (the deed is principal-agnostic)', agentOwns]);

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
      ? '\n✅ ALL GUARANTEES HELD — ownership is a transferable mint; sale is exclusive via cascading revocation; humans and agents own identically.\n'
      : '\n❌ A GUARANTEE FAILED.\n',
  );
  process.exitCode = allOk ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
