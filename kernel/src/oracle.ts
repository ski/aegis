/**
 * Oracle — the model, as an external nondeterministic oracle (docs/03). The vat feeds it the last
 * observation and it returns the next turn. Phase-1a ships a *scripted* oracle so the security
 * property is deterministic and testable; a real small CPU model swaps in behind this same
 * interface later (treating its sampling as the nondeterministic input that gets logged for replay).
 */
export interface Action {
  readonly tool: string;
  readonly arg?: unknown;
}

export interface Turn {
  /** The model's reasoning for this turn (streamed to the strip in a real UI). */
  readonly thought: string;
  /** The action it wants to take, if any. */
  readonly action?: Action;
  /** A final message to the human, if the turn is terminal. */
  readonly say?: string;
}

export interface Oracle {
  next(observation: string): Turn | Promise<Turn>;
}

/**
 * A scripted oracle standing in for a prompt-INJECTED model. Each scripted turn represents what
 * the model "decided" — turns 2–4 below are the injection talking, not the operator. The point of
 * Aegis is that it does not matter *why* the model wants to do these things; the structure blocks
 * the dangerous ones regardless.
 */
export class ScriptedOracle implements Oracle {
  private i = 0;
  constructor(private readonly script: readonly Turn[]) {}
  next(_observation: string): Turn {
    const turn = this.script[this.i] ?? { thought: '(no more turns)', say: '' };
    this.i++;
    return turn;
  }
}
