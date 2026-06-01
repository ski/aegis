/**
 * Mini-ERTP — the Electronic Rights Transfer Protocol (Agoric / Mark Miller), in miniature.
 *
 * The production refinement of our `mint.ts`. ERTP separates three roles that our simple mint conflated:
 *   - **Brand**  — identifies a *kind* of asset (and its math: `nat` fungible, or `set` non-fungible).
 *   - **Mint**   — the authority to CREATE new value of a brand (held only by the issuer's owner).
 *   - **Issuer** — the authority to VALIDATE and operate on assets of a brand (anyone can hold it; it
 *                  is the trusted source of truth that a payment is genuine and not double-spent).
 *
 * An **Amount** is `{ brand, value }` — a *description* of assets, freely copyable, carries no value.
 * A **Payment** is the bearer of actual assets *in transit* — one-time-use; using it burns it. A
 * **Purse** holds assets at rest. Value lives in the issuer's closure-private ledger, never in a
 * reference — so you cannot forge assets by copying a Payment or an Amount.
 */
import { harden } from './harden.ts';

export type AmountValue = number | readonly string[];
export interface Brand {
  readonly name: string;
  readonly kind: 'nat' | 'set';
}
export interface Amount {
  readonly brand: Brand;
  readonly value: AmountValue;
}

/** AmountMath — pure operations on Amounts of one brand. (Agoric's AmountMath, miniature.) */
export const AmountMath = harden({
  make(brand: Brand, value: AmountValue): Amount {
    return harden({ brand, value });
  },
  isEmpty(a: Amount): boolean {
    return a.brand.kind === 'nat' ? (a.value as number) === 0 : (a.value as string[]).length === 0;
  },
  isGTE(a: Amount, b: Amount): boolean {
    if (a.brand !== b.brand) throw new Error('brand mismatch');
    if (a.brand.kind === 'nat') return (a.value as number) >= (b.value as number);
    const set = new Set(a.value as string[]);
    return (b.value as string[]).every((x) => set.has(x));
  },
  add(a: Amount, b: Amount): Amount {
    if (a.brand !== b.brand) throw new Error('brand mismatch');
    if (a.brand.kind === 'nat') return harden({ brand: a.brand, value: (a.value as number) + (b.value as number) });
    return harden({ brand: a.brand, value: [...new Set([...(a.value as string[]), ...(b.value as string[])])] });
  },
  subtract(a: Amount, b: Amount): Amount {
    if (a.brand !== b.brand) throw new Error('brand mismatch');
    if (a.brand.kind === 'nat') {
      const v = (a.value as number) - (b.value as number);
      if (v < 0) throw new Error('subtract underflow');
      return harden({ brand: a.brand, value: v });
    }
    const remove = new Set(b.value as string[]);
    return harden({ brand: a.brand, value: (a.value as string[]).filter((x) => !remove.has(x)) });
  },
});

export interface Payment {
  readonly brand: Brand;
}
export interface Purse {
  readonly brand: Brand;
  getCurrentAmount(): Amount;
  deposit(payment: Payment): Amount;
  withdraw(amount: Amount): Payment;
}
export interface Issuer {
  readonly brand: Brand;
  makeEmptyPurse(): Purse;
  /** Validate + consume a payment, returning its amount (used by trusted code like Zoe to escrow). */
  burn(payment: Payment): Amount;
  amountOf(payment: Payment): Amount;
}
export interface Mint {
  readonly brand: Brand;
  mintPayment(amount: Amount): Payment;
}

export interface IssuerKit {
  readonly brand: Brand;
  readonly issuer: Issuer;
  readonly mint: Mint;
}

export function makeIssuerKit(name: string, kind: 'nat' | 'set' = 'nat'): IssuerKit {
  const brand: Brand = harden({ name, kind });
  // The single source of truth: which payments/purses exist and the amount each holds. Closure-private.
  const ledger = new WeakMap<Payment | Purse, Amount>();
  const empty = (): Amount => AmountMath.make(brand, kind === 'nat' ? 0 : []);

  const mkPayment = (amount: Amount): Payment => {
    const p: Payment = harden({ brand });
    ledger.set(p, amount);
    return p;
  };

  const issuer: Issuer = harden({
    brand,
    amountOf(payment) {
      const a = ledger.get(payment);
      if (!a) throw new Error('not a payment of this issuer (or already used)');
      return a;
    },
    burn(payment) {
      const a = ledger.get(payment);
      if (!a) throw new Error('not a payment of this issuer (or already used)');
      ledger.delete(payment); // one-time use
      return a;
    },
    makeEmptyPurse() {
      const purse: Purse = harden({
        brand,
        getCurrentAmount: () => ledger.get(purse) ?? empty(),
        deposit(payment) {
          const a = issuer.burn(payment); // validates + consumes
          if (a.brand !== brand) throw new Error('wrong brand');
          ledger.set(purse, AmountMath.add(ledger.get(purse) ?? empty(), a));
          return ledger.get(purse)!;
        },
        withdraw(amount) {
          const bal = ledger.get(purse) ?? empty();
          if (!AmountMath.isGTE(bal, amount)) throw new Error('insufficient funds in purse');
          ledger.set(purse, AmountMath.subtract(bal, amount));
          return mkPayment(amount);
        },
      });
      ledger.set(purse, empty());
      return purse;
    },
  });

  const mint: Mint = harden({ brand, mintPayment: (amount: Amount) => mkPayment(amount) });
  return harden({ brand, issuer, mint });
}
