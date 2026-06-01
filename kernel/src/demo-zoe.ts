/**
 * Milestone — offer safety: an UNTRUSTED contract, a TRUSTED framework (Agoric's Zoe, miniature).
 *
 * Run: `pnpm demo:zoe`
 *
 * The financial dual of the whole Aegis thesis. Alice sells post EF342's deed to Eve via a smart
 * contract — but the CONTRACT IS UNTRUSTED. It proposes a reallocation; Zoe (trusted) escrows the assets
 * and enforces offer safety + rights conservation before paying out.
 *
 *   - An honest atomic-swap contract completes the trade (Eve gets the deed, Alice gets the coin).
 *   - A MALICIOUS contract that tries to give Eve's coin to itself AND keep the deed → REJECTED, both
 *     refunded. A contract that tries to mint value from nothing → REJECTED (conservation).
 *
 * Worst case of a malicious contract = a refund, never theft — exactly as the worst case of a
 * prompt-injected model is misuse of least authority, never escalation. Same move, AI ⟷ DeFi.
 */
import './bootstrap.ts';
import { AmountMath, makeIssuerKit, type Amount, type Payment } from './ertp.ts';
import { makeZoe, type Contract, type Seat } from './zoe.ts';

function bar(): void {
  console.log('─'.repeat(86));
}

async function main(): Promise<void> {
  console.log('\nAEGIS · Zoe offer safety · an UNTRUSTED contract sells post EF342, trustlessly');
  bar();

  // Two assets: fungible Coin, and a non-fungible Deed (the post's ownership, as a 'set' brand).
  const coinKit = makeIssuerKit('Coin', 'nat');
  const deedKit = makeIssuerKit('Deed', 'set');

  const coin = (n: number): Amount => AmountMath.make(coinKit.brand, n);
  const deed = (ids: string[]): Amount => AmountMath.make(deedKit.brand, ids);

  const zoe = makeZoe({ Coin: coinKit.issuer, Deed: deedKit.issuer });
  const checks: Array<[string, boolean]> = [];

  // Set up the two parties' offers for a sale of deed EF342 at price 70.
  // Seat 0 = Alice (gives the Deed, wants Coin). Seat 1 = Eve (gives Coin, wants the Deed).
  function setup() {
    const aliceDeedPmt = deedKit.mint.mintPayment(deed(['EF342']));
    const eveCoinPmt = coinKit.mint.mintPayment(coin(70));
    const seats: Seat[] = [
      { id: 0, proposal: { give: { Deed: deed(['EF342']) }, want: { Coin: coin(70) } }, escrow: { Deed: deed(['EF342']) } },
      { id: 1, proposal: { give: { Coin: coin(70) }, want: { Deed: deed(['EF342']) } }, escrow: { Coin: coin(70) } },
    ];
    const escrowed: Record<number, Record<string, Payment>> = {
      0: { Deed: aliceDeedPmt },
      1: { Coin: eveCoinPmt },
    };
    return { seats, escrowed };
  }

  const amtOf = (p: Payment | undefined, issuer: typeof coinKit.issuer): string => {
    if (!p) return '∅';
    try { const a = issuer.amountOf(p); return JSON.stringify(a.value); } catch { return '∅'; }
  };

  // ── 1. The HONEST atomic-swap contract ────────────────────────────────────────────────────────
  const honest: Contract = (seats) => ({
    0: { Coin: seats[1]!.escrow.Coin! },   // Alice gets Eve's coin
    1: { Deed: seats[0]!.escrow.Deed! },   // Eve gets Alice's deed
  });
  {
    const { seats, escrowed } = setup();
    const r = zoe.runContract(honest, seats, escrowed);
    const aliceGot = amtOf(r.payouts?.[0]?.Coin, coinKit.issuer);
    const eveGot = amtOf(r.payouts?.[1]?.Deed, deedKit.issuer);
    console.log(`\n  HONEST contract → ${r.ok ? 'TRADE COMPLETED' : 'rejected: ' + r.reason}`);
    console.log(`    Alice received Coin: ${aliceGot}; Eve received Deed: ${eveGot}`);
    checks.push(['honest swap completes: Alice gets 70 coin, Eve gets the EF342 deed', r.ok && aliceGot === '70' && eveGot === '["EF342"]']);
  }

  // ── 2. A MALICIOUS contract: try to give Eve's coin to the contract's friend AND keep the deed ─
  const thief: Contract = (seats) => ({
    0: { Coin: seats[1]!.escrow.Coin!, Deed: seats[0]!.escrow.Deed! }, // Alice keeps deed AND takes coin
    1: {},                                                            // Eve gets NOTHING
  });
  {
    const { seats, escrowed } = setup();
    const r = zoe.runContract(thief, seats, escrowed);
    // Eve must be made whole: refunded her 70 coin.
    const eveRefund = amtOf(r.payouts?.[1]?.Coin, coinKit.issuer);
    console.log(`\n  THIEF contract (Eve gets nothing) → ${r.ok ? 'SUCCEEDED?!' : 'REJECTED: ' + r.reason}`);
    console.log(`    Eve refunded Coin: ${eveRefund} (offer safety: she got back what she gave)`);
    checks.push(['malicious "Eve gets nothing" REJECTED by offer safety, Eve fully refunded', !r.ok && eveRefund === '70']);
  }

  // ── 3. A MALICIOUS contract: try to MINT value from nothing (give Eve 1000 coin) ───────────────
  const counterfeiter: Contract = (seats) => ({
    0: { Deed: seats[0]!.escrow.Deed! }, // Alice refunded her deed
    1: { Coin: coin(1000) },             // Eve gets 1000 coin that was never escrowed
  });
  {
    const { seats, escrowed } = setup();
    const r = zoe.runContract(counterfeiter, seats, escrowed);
    console.log(`\n  COUNTERFEITER contract (mint 1000 from nothing) → ${r.ok ? 'SUCCEEDED?!' : 'REJECTED: ' + r.reason}`);
    checks.push(['malicious "mint from nothing" REJECTED by rights conservation', !r.ok]);
  }

  // ── 4. A contract that just THROWS → everyone refunded ────────────────────────────────────────
  const buggy: Contract = () => { throw new Error('kaboom'); };
  {
    const { seats, escrowed } = setup();
    const r = zoe.runContract(buggy, seats, escrowed);
    const aliceRefund = amtOf(r.payouts?.[0]?.Deed, deedKit.issuer);
    const eveRefund = amtOf(r.payouts?.[1]?.Coin, coinKit.issuer);
    console.log(`\n  BUGGY contract (throws) → ${r.ok ? 'SUCCEEDED?!' : 'REJECTED: ' + r.reason}`);
    console.log(`    refunds → Alice Deed: ${aliceRefund}, Eve Coin: ${eveRefund}`);
    checks.push(['a contract that throws refunds everyone (assets never at risk)', !r.ok && aliceRefund === '["EF342"]' && eveRefund === '70']);
  }

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
      ? '\n✅ ALL GUARANTEES HELD — the contract is untrusted, Zoe is trusted; worst case is a refund, never theft.\n' +
        '   (the financial dual of: the model proposes, the capability graph disposes.)\n'
      : '\n❌ A GUARANTEE FAILED.\n',
  );
  process.exitCode = allOk ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
