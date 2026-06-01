/**
 * Powerbox — the brokered-grant adjudicator (docs/02; issues #7, #17, #20).
 *
 * Recall the (a) axiom: brokering is not an exception to "act only on caps you hold" — a powerbox is
 * itself a held capability whose `adjudicate` *may* return a fresh cap. This models the three
 * non-negotiables from docs/02:
 *
 *   1. attenuated power to request — a facet may grant only caps in its `domain`;
 *   2. provenance gate           — a tainted (untrusted-influenced) request is auto-denied, so a
 *                                  manufactured grant request dies WITHOUT bothering the operator;
 *   3. trusted path              — the operator decides over the CANONICAL description (issue #20),
 *                                  drawn by the trusted base, never the agent's framing. The agent
 *                                  holds no reference to the console and cannot forge approval.
 */
import type { Capability } from './capability.ts';
import type { Label } from './label.ts';

export interface Grantable {
  readonly cap: Capability;
  readonly sensitivity: 'low' | 'high';
  /** The canonical, operator-facing description of the authority — NOT agent-supplied. */
  readonly description: string;
}

export interface GrantRequest {
  readonly petname: string;
  readonly reason: string; // agent-supplied; shown but never the basis of the decision
  readonly requesterLabel: Label; // supplied by the trusted vat, not the model
  readonly requester: string;
}

export type Decision =
  | { readonly outcome: 'granted'; readonly cap: Capability }
  | { readonly outcome: 'denied'; readonly reason: string };

/** The trusted path. In production this is an unspoofable UI; here, a (scripted) operator. */
export interface OperatorConsole {
  decide(canonical: {
    readonly petname: string;
    readonly description: string;
    readonly reason: string;
    readonly requester: string;
  }): boolean | Promise<boolean>;
}

export interface GrantLogEntry {
  readonly petname: string;
  readonly requester: string;
  readonly outcome: string;
}

export class Powerbox {
  private readonly _log: GrantLogEntry[] = [];
  private _operatorConsultations = 0;

  constructor(
    /** What THIS facet may grant — the attenuation of the power to request. */
    private readonly domain: ReadonlyMap<string, Grantable>,
    private readonly console: OperatorConsole,
  ) {}

  get log(): readonly GrantLogEntry[] {
    return this._log;
  }
  get operatorConsultations(): number {
    return this._operatorConsultations;
  }

  async adjudicate(req: GrantRequest): Promise<Decision> {
    const grantable = this.domain.get(req.petname);

    // (1) attenuated power to request — outside the domain, the answer is simply "no such thing here".
    if (!grantable) {
      this.note(req.petname, req.requester, 'denied:out-of-domain');
      return { outcome: 'denied', reason: `'${req.petname}' is outside this powerbox's grantable domain` };
    }

    // (2) provenance gate — a tainted request is a manufactured grant; deny without bothering the human.
    if (req.requesterLabel.taints.size > 0) {
      this.note(req.petname, req.requester, 'denied:tainted');
      return {
        outcome: 'denied',
        reason: `request is tainted by [${[...req.requesterLabel.taints].join(', ')}] — untrusted-influenced grant requests are auto-denied`,
      };
    }

    // (3) trusted path — operator decides over the CANONICAL description, not the agent's words.
    this._operatorConsultations += 1;
    const approved = await this.console.decide({
      petname: req.petname,
      description: grantable.description,
      reason: req.reason,
      requester: req.requester,
    });
    this.note(req.petname, req.requester, approved ? 'granted' : 'denied:operator');
    return approved ? { outcome: 'granted', cap: grantable.cap } : { outcome: 'denied', reason: 'operator declined' };
  }

  private note(petname: string, requester: string, outcome: string): void {
    this._log.push(Object.freeze({ petname, requester, outcome }));
  }
}
