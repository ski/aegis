import { describe, expect, it } from 'vitest';
import { AmountMath, makeIssuerKit, type Amount, type Payment } from '../src/ertp.ts';
import { makeZoe, type Contract, type Seat } from '../src/zoe.ts';

describe('ERTP — assets cannot be forged or double-spent', () => {
  it('a payment is one-time-use (burned on deposit)', () => {
    const kit = makeIssuerKit('Coin', 'nat');
    const p = kit.mint.mintPayment(AmountMath.make(kit.brand, 50));
    const purse = kit.issuer.makeEmptyPurse();
    purse.deposit(p);
    expect(purse.getCurrentAmount().value).toBe(50);
    expect(() => purse.deposit(p)).toThrow(); // already used — can't double-spend
  });
  it('rejects a foreign-brand payment', () => {
    const a = makeIssuerKit('A'); const b = makeIssuerKit('B');
    const pb = b.mint.mintPayment(AmountMath.make(b.brand, 5));
    expect(() => a.issuer.makeEmptyPurse().deposit(pb)).toThrow();
  });
});

describe('Zoe — offer safety + rights conservation against an untrusted contract', () => {
  const coinKit = makeIssuerKit('Coin', 'nat');
  const deedKit = makeIssuerKit('Deed', 'set');
  const coin = (n: number) => AmountMath.make(coinKit.brand, n);
  const deed = (ids: string[]) => AmountMath.make(deedKit.brand, ids);
  const zoe = makeZoe({ Coin: coinKit.issuer, Deed: deedKit.issuer });

  const setup = () => {
    const seats: Seat[] = [
      { id: 0, proposal: { give: { Deed: deed(['X']) }, want: { Coin: coin(70) } }, escrow: { Deed: deed(['X']) } },
      { id: 1, proposal: { give: { Coin: coin(70) }, want: { Deed: deed(['X']) } }, escrow: { Coin: coin(70) } },
    ];
    const escrowed: Record<number, Record<string, Payment>> = {
      0: { Deed: deedKit.mint.mintPayment(deed(['X'])) },
      1: { Coin: coinKit.mint.mintPayment(coin(70)) },
    };
    return { seats, escrowed };
  };
  const amt = (p: Payment | undefined, iss: typeof coinKit.issuer): Amount | undefined => (p ? iss.amountOf(p) : undefined);

  it('honest atomic swap completes', () => {
    const honest: Contract = (s) => ({ 0: { Coin: s[1]!.escrow.Coin! }, 1: { Deed: s[0]!.escrow.Deed! } });
    const { seats, escrowed } = setup();
    const r = zoe.runContract(honest, seats, escrowed);
    expect(r.ok).toBe(true);
    expect(amt(r.payouts![0]!.Coin, coinKit.issuer)!.value).toBe(70);
    expect(amt(r.payouts![1]!.Deed, deedKit.issuer)!.value).toEqual(['X']);
  });

  it('a thief contract (one party gets nothing) is rejected; both refunded', () => {
    const thief: Contract = (s) => ({ 0: { Coin: s[1]!.escrow.Coin!, Deed: s[0]!.escrow.Deed! }, 1: {} });
    const { seats, escrowed } = setup();
    const r = zoe.runContract(thief, seats, escrowed);
    expect(r.ok).toBe(false);
    expect(amt(r.payouts![1]!.Coin, coinKit.issuer)!.value).toBe(70); // Eve made whole
  });

  it('a counterfeiter contract (mint from nothing) is rejected by conservation', () => {
    const cf: Contract = (s) => ({ 0: { Deed: s[0]!.escrow.Deed! }, 1: { Coin: coin(1000) } });
    const { seats, escrowed } = setup();
    expect(zoe.runContract(cf, seats, escrowed).ok).toBe(false);
  });

  it('a contract that throws refunds everyone', () => {
    const boom: Contract = () => { throw new Error('x'); };
    const { seats, escrowed } = setup();
    const r = zoe.runContract(boom, seats, escrowed);
    expect(r.ok).toBe(false);
    expect(amt(r.payouts![0]!.Deed, deedKit.issuer)!.value).toEqual(['X']);
    expect(amt(r.payouts![1]!.Coin, coinKit.issuer)!.value).toBe(70);
  });
});
