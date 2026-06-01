/**
 * Mini-Zoe — the offer-safety framework (Agoric / Mark Miller), in miniature.
 *
 * The deepest unification in the project. Zoe is the FINANCIAL DUAL of the Aegis membrane:
 *
 *   Aegis:  the MODEL is never a principal — it PROPOSES, the capability graph DISPOSES; the worst case
 *           of a prompt injection is misuse of least authority, never escalation.
 *   Zoe:    the CONTRACT is never trusted with assets — it PROPOSES a reallocation, Zoe DISPOSES (checks
 *           it); the worst case of a malicious contract is a REFUND, never theft.
 *
 * How: each party makes an offer = a `proposal` ({ give, want }) plus the `payments` they're giving. Zoe
 * ESCROWS the payments (so the contract never touches real assets — it sees only Amounts, descriptions).
 * The untrusted contract proposes a `reallocation` (who should end up with what). Zoe enforces
 * **OFFER SAFETY** before paying out:
 *
 *   for every seat, EITHER it gets everything it `want`ed, OR it gets back everything it `give`-d (refund).
 *   AND the reallocation must CONSERVE total escrowed value (rights conservation).
 *
 * If the contract's proposed reallocation violates either, Zoe rejects it and refunds everyone. A buggy
 * or malicious contract cannot make you worse off than your stated offer.
 */
import { harden } from './harden.ts';
import { AmountMath, type Amount, type Issuer, type Payment } from './ertp.ts';

export interface Proposal {
  readonly give: Record<string, Amount>; // keyword -> amount you put in
  readonly want: Record<string, Amount>; // keyword -> amount you must get out (or be refunded)
}

export interface Seat {
  readonly id: number;
  readonly proposal: Proposal;
  /** escrowed amounts by keyword (what Zoe holds for this seat right now). */
  escrow: Record<string, Amount>;
}

/** A reallocation: for each seat id, the amounts (by keyword) it should end up with. */
export type Reallocation = Record<number, Record<string, Amount>>;

export interface ZoeResult {
  readonly ok: boolean;
  readonly reason?: string;
  /** payouts by seat id (only on success); each is the assets that seat walks away with. */
  readonly payouts?: Record<number, Record<string, Payment>>;
}

/** A contract is UNTRUSTED code: given the seats, it proposes a reallocation. It never holds assets. */
export type Contract = (seats: readonly Seat[]) => Reallocation;

export function makeZoe(issuersByKeyword: Record<string, Issuer>) {
  function offerSafe(seat: Seat, got: Record<string, Amount>): boolean {
    // got everything wanted?
    const gotAllWanted = Object.entries(seat.proposal.want).every(([kw, want]) => {
      const g = got[kw];
      return g !== undefined && AmountMath.isGTE(g, want);
    });
    if (gotAllWanted) return true;
    // else: got back everything given (full refund)?
    const fullRefund = Object.entries(seat.proposal.give).every(([kw, gave]) => {
      const g = got[kw];
      return g !== undefined && AmountMath.isGTE(g, gave);
    });
    return fullRefund;
  }

  return harden({
    /**
     * Run `contract` over the seats whose payments are escrowed. Enforces offer safety + conservation.
     * `seats` carry their escrowed payments separately so the contract sees only Amounts, never Payments.
     */
    runContract(contract: Contract, seats: Seat[], escrowedPayments: Record<number, Record<string, Payment>>): ZoeResult {
      // 1. The untrusted contract proposes a reallocation — it cannot touch the escrowed Payments.
      let realloc: Reallocation;
      try {
        realloc = contract(harden(seats.map((s) => harden({ ...s }))));
      } catch (e) {
        return refundAll(`contract threw: ${(e as Error).message}`);
      }

      // 2. Zoe checks OFFER SAFETY for every seat against the proposed reallocation.
      for (const seat of seats) {
        const got = realloc[seat.id] ?? {};
        if (!offerSafe(seat, got)) {
          return refundAll(`offer safety violated for seat ${seat.id}`);
        }
      }

      // 3. Zoe checks RIGHTS CONSERVATION per keyword: total out == total escrowed in.
      for (const kw of Object.keys(issuersByKeyword)) {
        const brand = issuersByKeyword[kw]!.brand;
        let totalIn = AmountMath.make(brand, brand.kind === 'nat' ? 0 : []);
        let totalOut = AmountMath.make(brand, brand.kind === 'nat' ? 0 : []);
        for (const seat of seats) if (seat.escrow[kw]) totalIn = AmountMath.add(totalIn, seat.escrow[kw]!);
        for (const seat of seats) { const g = (realloc[seat.id] ?? {})[kw]; if (g) totalOut = AmountMath.add(totalOut, g); }
        if (!(AmountMath.isGTE(totalIn, totalOut) && AmountMath.isGTE(totalOut, totalIn))) {
          return refundAll(`rights conservation violated for '${kw}' (the contract tried to create or destroy value)`);
        }
      }

      // 4. Safe — pay out the reallocation by withdrawing from escrow per seat/keyword.
      const payouts: Record<number, Record<string, Payment>> = {};
      const escrowPurses = makeEscrowPurses();
      for (const seat of seats) {
        payouts[seat.id] = {};
        for (const [kw, amt] of Object.entries(realloc[seat.id] ?? {})) {
          payouts[seat.id]![kw] = escrowPurses[kw]!.withdraw(amt);
        }
      }
      return harden({ ok: true, payouts });

      // ---- helpers (closures over this run) ----
      function makeEscrowPurses(): Record<string, ReturnType<Issuer['makeEmptyPurse']>> {
        const purses: Record<string, ReturnType<Issuer['makeEmptyPurse']>> = {};
        for (const kw of Object.keys(issuersByKeyword)) purses[kw] = issuersByKeyword[kw]!.makeEmptyPurse();
        for (const seat of seats) for (const [kw, pmt] of Object.entries(escrowedPayments[seat.id] ?? {})) purses[kw]!.deposit(pmt);
        return purses;
      }
      function refundAll(reason: string): ZoeResult {
        const payouts: Record<number, Record<string, Payment>> = {};
        const purses = makeEscrowPurses();
        for (const seat of seats) {
          payouts[seat.id] = {};
          for (const [kw, amt] of Object.entries(seat.escrow)) payouts[seat.id]![kw] = purses[kw]!.withdraw(amt);
        }
        return harden({ ok: false, reason, payouts });
      }
    },
  });
}
