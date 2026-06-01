/**
 * Money as capabilities — the mint & purse pattern (Mark Miller, the E language).
 *
 * A *currency* is a mint that issues *purses*. The security property that makes this money rather than
 * a number: a purse's BALANCE lives in a closure-private ledger keyed by the purse's identity — NOT in
 * the reference. So copying a purse reference copies *access*, not *value*; you cannot forge money by
 * passing a reference around, and the mint conserves total value. Payment is `dst.deposit(amount, src)`,
 * where the mint verifies `src` is one of its own purses and moves balance atomically within one turn.
 *
 * This is the foundation for the "money" half of the microblog (doc 09 §4.6) and for selling ownership.
 */
import { harden } from './harden.ts';

export interface Purse {
  readonly currency: string;
  getBalance(): number;
  /** Move `amount` from `src` into this purse. Throws if src isn't this currency or has insufficient funds. */
  deposit(amount: number, src: Purse): void;
  /** Split off a new purse holding `amount`, drawn from this purse. */
  withdraw(amount: number): Purse;
  /** A fresh empty purse of the same currency (for receiving). */
  makeEmpty(): Purse;
}

export interface Mint {
  readonly currency: string;
  /** Mint authority: create a purse with an initial balance (inflation — held only by the currency owner). */
  issue(initial: number): Purse;
}

export function makeMint(currency: string): Mint {
  // The entire money supply's truth. Closure-private — unreachable from any purse reference.
  const ledger = new WeakMap<Purse, number>();

  const makePurse = (initial: number): Purse => {
    const purse: Purse = harden({
      currency,
      getBalance: () => ledger.get(purse) ?? 0,
      deposit(amount: number, src: Purse) {
        if (amount < 0) throw new Error('negative deposit');
        if (!ledger.has(src)) throw new Error('source is not a purse of this currency');
        const srcBal = ledger.get(src)!;
        if (srcBal < amount) throw new Error('insufficient funds');
        ledger.set(src, srcBal - amount);
        ledger.set(purse, (ledger.get(purse) ?? 0) + amount);
      },
      withdraw(amount: number) {
        const p = makePurse(0);
        p.deposit(amount, purse);
        return p;
      },
      makeEmpty: () => makePurse(0),
    });
    ledger.set(purse, initial);
    return purse;
  };

  return harden({ currency, issue: (initial: number) => makePurse(initial) });
}
