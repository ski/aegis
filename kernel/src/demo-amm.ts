/**
 * Milestone — a real Zoe contract: a constant-product AMM (x·y=k), UNTRUSTED, under offer safety.
 *
 * Run: `pnpm demo:amm`
 *
 * `demo:zoe` proved offer safety for a trivial atomic swap. This is the sharper test: a contract that
 * does REAL computation — a Uniswap-style constant-product market maker. The contract computes a price
 * off the curve and proposes a reallocation; Zoe (trusted) still enforces offer safety + rights
 * conservation. The point: even a buggy-or-malicious AMM cannot make the trader worse than their stated
 * offer, nor mint value — the worst it can do is get refunded.
 *
 * Roles: seat 0 = the POOL (the contract's own reserves, escrowed — empty `want`, so the contract
 * governs its own assets); seat 1 = the TRADER (gives Coin, `want`s ≥ minTokenOut — slippage limit).
 */
import './bootstrap.ts';
import { AmountMath, makeIssuerKit, type Amount, type Payment } from './ertp.ts';
import { makeZoe, type Contract, type Seat } from './zoe.ts';

function bar(): void {
  console.log('─'.repeat(86));
}

async function main(): Promise<void> {
  console.log('\nAEGIS · a constant-product AMM (x·y=k) as an UNTRUSTED Zoe contract');
  bar();

  const coinKit = makeIssuerKit('Coin', 'nat');
  const tokKit = makeIssuerKit('Tok', 'nat');
  const coin = (n: number): Amount => AmountMath.make(coinKit.brand, n);
  const tok = (n: number): Amount => AmountMath.make(tokKit.brand, n);
  const zoe = makeZoe({ Coin: coinKit.issuer, Tok: tokKit.issuer });
  const checks: Array<[string, boolean]> = [];

  const X0 = 1000; // pool Coin reserve
  const Y0 = 1000; // pool Tok reserve   (k = 1,000,000)
  const DX = 100;  // trader spends 100 Coin

  // Honest constant-product price: dy = Y - ceil(k/(X+dx)). We round the pool's RETAINED reserve UP
  // (ceil), which rounds the trader's output DOWN — so k never decreases (the pool keeps the dust).
  // k=1_000_000, X+dx=1100 → ceil(909.09)=910 retained → dy = 1000-910 = 90.
  const honestDy = Y0 - Math.ceil((X0 * Y0) / (X0 + DX));

  // Fresh escrow for each run: pool holds {Coin:X0, Tok:Y0}; trader holds {Coin:DX}.
  function setup(minOut: number) {
    const seats: Seat[] = [
      { id: 0, proposal: { give: { Coin: coin(X0), Tok: tok(Y0) }, want: {} }, escrow: { Coin: coin(X0), Tok: tok(Y0) } },
      { id: 1, proposal: { give: { Coin: coin(DX) }, want: { Tok: tok(minOut) } }, escrow: { Coin: coin(DX) } },
    ];
    const escrowed: Record<number, Record<string, Payment>> = {
      0: { Coin: coinKit.mint.mintPayment(coin(X0)), Tok: tokKit.mint.mintPayment(tok(Y0)) },
      1: { Coin: coinKit.mint.mintPayment(coin(DX)) },
    };
    return { seats, escrowed };
  }
  const amt = (p: Payment | undefined, iss: typeof coinKit.issuer): number => (p ? (iss.amountOf(p).value as number) : -1);

  // ── 1. HONEST AMM: respects the curve ─────────────────────────────────────────────────────────
  const honest: Contract = () => ({
    1: { Tok: tok(honestDy) },                              // trader gets the curve amount
    0: { Coin: coin(X0 + DX), Tok: tok(Y0 - honestDy) },    // pool: +100 Coin, -dy Tok (keeps the dust)
  });
  {
    const { seats, escrowed } = setup(90); // trader's slippage floor: at least 90 Tok
    const r = zoe.runContract(honest, seats, escrowed);
    const got = amt(r.payouts?.[1]?.Tok, tokKit.issuer);
    const poolCoin = amt(r.payouts?.[0]?.Coin, coinKit.issuer);
    const poolTok = amt(r.payouts?.[0]?.Tok, tokKit.issuer);
    const kAfter = poolCoin * poolTok;
    console.log(`\n  HONEST AMM → ${r.ok ? 'TRADE OK' : 'rejected: ' + r.reason}`);
    console.log(`    trader spent ${DX} Coin, received ${got} Tok (curve dy=${honestDy})`);
    console.log(`    pool now ${poolCoin} Coin × ${poolTok} Tok; k: ${X0 * Y0} → ${kAfter} (≥ k preserved)`);
    checks.push([`honest AMM: trader gets the curve amount (${honestDy} Tok), trade completes`, r.ok && got === honestDy]);
    checks.push(['honest AMM: constant-product invariant preserved (k does not decrease)', kAfter >= X0 * Y0]);
  }

  // ── 2. MALICIOUS AMM: shortchange the trader below their slippage floor ───────────────────────
  const shortchange: Contract = () => ({
    1: { Tok: tok(50) },                                    // trader wanted ≥ 90, gets 50
    0: { Coin: coin(X0 + DX), Tok: tok(Y0 - 50) },
  });
  {
    const { seats, escrowed } = setup(90);
    const r = zoe.runContract(shortchange, seats, escrowed);
    const refund = amt(r.payouts?.[1]?.Coin, coinKit.issuer);
    console.log(`\n  SHORTCHANGE AMM (gives 50, trader wanted ≥90) → ${r.ok ? 'TOOK IT?!' : 'REJECTED: ' + r.reason}`);
    console.log(`    trader refunded ${refund} Coin (offer safety: slippage protection)`);
    checks.push(['malicious shortchange rejected by offer safety; trader fully refunded', !r.ok && refund === DX]);
  }

  // ── 3. MALICIOUS AMM: mint tokens from nothing (give trader more than exists) ──────────────────
  const counterfeit: Contract = () => ({
    1: { Tok: tok(5000) },                                  // pool only had 1000 Tok
    0: { Coin: coin(X0 + DX), Tok: tok(Y0) },
  });
  {
    const { seats, escrowed } = setup(90);
    const r = zoe.runContract(counterfeit, seats, escrowed);
    console.log(`\n  COUNTERFEIT AMM (mint 5000 Tok from a 1000 pool) → ${r.ok ? 'MINTED?!' : 'REJECTED: ' + r.reason}`);
    checks.push(['malicious mint rejected by rights conservation', !r.ok]);
  }

  // ── 4. MALICIOUS AMM: drain the pool to a friend (give trader's coin to no one / vanish value) ─
  const vanish: Contract = () => ({
    1: { Tok: tok(honestDy) },
    0: { Coin: coin(X0), Tok: tok(Y0 - honestDy) },         // pool "forgets" to take the trader's 100 Coin
  });
  {
    const { seats, escrowed } = setup(90);
    const r = zoe.runContract(vanish, seats, escrowed);
    console.log(`\n  VANISH AMM (drops the trader's 100 Coin) → ${r.ok ? 'LOST IT?!' : 'REJECTED: ' + r.reason}`);
    checks.push(['malicious value-destruction rejected by rights conservation', !r.ok]);
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
      ? '\n✅ ALL GUARANTEES HELD — a real computing contract (AMM) is still bounded by offer safety + ' +
        'conservation: worst case a refund, never theft, even with real math in the loop.\n'
      : '\n❌ A GUARANTEE FAILED.\n',
  );
  process.exitCode = allOk ? 0 : 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
