/**
 * Vat — an agent is a vat (docs/03). A single-threaded turn loop that holds a cap set and gates
 * every model-driven action through one membrane. This is where both halves of the dual meet:
 *
 *   1. Authority (ocap): the model named a tool — is it a capability this vat actually holds?
 *   2. Flow (IFC):       given the current turn's label, is this action cleared?
 *
 * Every decision is appended to an audit log — the "structural + auditable" property (issue #4):
 * not a proof the agent couldn't act, but a precise account of what it could do and why each
 * action was allowed or blocked.
 */
import { harden } from './harden';
import type { Capability } from './capability';
import type { Label } from './label';
import { bottom, flowCheck, fmtLabel, join } from './label';
import type { Powerbox } from './powerbox';

export type AuditEvent =
  | 'absorb'
  | 'resolve-fail'
  | 'flow-block'
  | 'invoke-ok'
  | 'grant-request'
  | 'grant-ok'
  | 'grant-denied';

export interface AuditEntry {
  readonly turn: number;
  readonly event: AuditEvent;
  readonly detail: string;
  readonly label: string;
}

export type ActResult =
  | { readonly ok: true; readonly tool: string; readonly value: unknown }
  | { readonly ok: false; readonly blocked: 'no-authority'; readonly tool: string }
  | { readonly ok: false; readonly blocked: 'flow'; readonly tool: string; readonly reasons: readonly string[] }
  | { readonly ok: false; readonly blocked: 'grant-denied'; readonly tool: string; readonly reason: string };

/** The reserved verb a model emits to ask the powerbox for a capability it does not yet hold. */
export const REQUEST_CAPABILITY = 'request_capability';

export class Vat {
  readonly name: string;
  private readonly held = new Map<string, Capability>(); // petname -> cap (the resolver namespace)
  private turnLabel: Label = bottom();
  private turn = 0;
  private readonly _audit: AuditEntry[] = [];

  constructor(name: string) {
    this.name = name;
  }

  private powerbox?: Powerbox;

  /** Endowment (docs/03): the parent decides a child's caps. Bind a held cap under a petname. */
  endow(petname: string, cap: Capability): void {
    this.held.set(petname, cap);
  }

  /**
   * Attach a powerbox facet (itself a held capability). Without one, the vat is pure (a): it can
   * only ever use what it was endowed and cannot even *ask* for more.
   */
  attachPowerbox(pb: Powerbox): void {
    this.powerbox = pb;
  }

  beginTurn(): void {
    this.turn++;
  }

  get audit(): readonly AuditEntry[] {
    return this._audit;
  }

  currentLabel(): Label {
    return this.turnLabel;
  }

  private record(event: AuditEvent, detail: string): void {
    this._audit.push(harden({ turn: this.turn, event, detail, label: fmtLabel(this.turnLabel) }));
  }

  /** Absorb labeled data into the current context — "label the turn, not the token" (docs/04). */
  private absorb(l: Label, why: string): void {
    this.turnLabel = join(this.turnLabel, l);
    this.record('absorb', why);
  }

  private _inbox: unknown = undefined;

  /**
   * Receive an inter-vat message. The value is held in the inbox and its label is absorbed into the
   * turn — so a downstream vat inherits the secrecy/taint of whatever it was handed. This is the
   * edge over which the global flow graph (issue #22) actually carries data at runtime.
   */
  receive(value: unknown, l: Label): void {
    this._inbox = value;
    this.absorb(l, `received inter-vat message ${fmtLabel(l)}`);
  }

  /** The last value handed to this vat — all an injected vat has to work with. */
  lastReceived(): unknown {
    return this._inbox;
  }

  /**
   * The membrane. Every model-proposed action passes through here.
   * `toolName` is a forgeable string the model emitted; authority comes from the held cap it
   * resolves to, never from the name itself.
   */
  async act(toolName: string, arg: unknown, opts?: { endorsed?: boolean }): Promise<ActResult> {
    // Reserved verb: ask the powerbox to broker a capability we don't yet hold.
    if (toolName === REQUEST_CAPABILITY) {
      return this.handleGrantRequest(arg);
    }

    // (a) axiom + resolver: naming is not authority.
    const cap = this.held.get(toolName);
    if (!cap) {
      this.record('resolve-fail', `'${toolName}' is not a held capability — naming is not authority`);
      return harden({ ok: false, blocked: 'no-authority', tool: toolName });
    }

    // Flow gate (global IFC): is the current turn's label cleared for this sink?
    const verdict = flowCheck(this.turnLabel, cap.clearance, opts?.endorsed ?? false);
    if (!verdict.ok) {
      this.record('flow-block', `${cap.kind}: ${verdict.reasons.join(' | ')}`);
      return harden({ ok: false, blocked: 'flow', tool: cap.kind, reasons: verdict.reasons });
    }

    // Both gates passed — perform the effect (with the trusted invocation context), then absorb.
    const result = await cap.invoke(arg, { requesterLabel: this.turnLabel, requester: this.name });
    this.absorb(result.label, `${cap.kind} returned ${fmtLabel(result.label)}`);
    this.record('invoke-ok', `${cap.kind} performed`);
    return harden({ ok: true, tool: cap.kind, value: result.value });
  }

  /**
   * Brokered grant. The model supplies a petname + reason (data); the trusted vat supplies the true
   * taint (the model cannot lie about it). On approval the vat endows itself with the fresh cap.
   */
  private async handleGrantRequest(arg: unknown): Promise<ActResult> {
    const { petname, reason } = (arg ?? {}) as { petname?: string; reason?: string };
    const name = petname ?? '(unnamed)';
    this.record('grant-request', `requested '${name}': ${reason ?? '(no reason)'}`);

    if (!this.powerbox) {
      // Pure (a): no broker cap held — cannot even ask.
      this.record('grant-denied', `'${name}' — no powerbox held; cannot request capabilities`);
      return harden({ ok: false, blocked: 'grant-denied', tool: name, reason: 'no powerbox held' });
    }

    const decision = await this.powerbox.adjudicate({
      petname: name,
      reason: reason ?? '',
      requesterLabel: this.turnLabel, // trusted: read from the vat, not the model
      requester: this.name,
    });

    if (decision.outcome === 'granted') {
      this.held.set(name, decision.cap);
      this.record('grant-ok', `'${name}' granted and endowed`);
      return harden({ ok: true, tool: REQUEST_CAPABILITY, value: `granted '${name}'` });
    }
    this.record('grant-denied', `'${name}' — ${decision.reason}`);
    return harden({ ok: false, blocked: 'grant-denied', tool: name, reason: decision.reason });
  }
}
