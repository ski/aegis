/**
 * GrammarModelOracle — a model oracle whose output is grammar-constrained at decode time (docs/01).
 *
 * Unlike `ModelOracle` (validate-and-retry against free text), this sends a GBNF grammar to a
 * llama.cpp `llama-server` via the `grammar` field of the OpenAI-compatible `/v1/chat/completions`
 * request. The server constrains the sampler to that grammar, so EVERY completion is, by construction, a
 * valid Aegis tool-call envelope. There is no parse-failure path — constrained decoding is a hard
 * guarantee, not an approximation.
 *
 * The grammar's tool enum is fixed to the names passed in (the agent's held caps), so the model cannot
 * even name a tool outside its capability set. Authority is still re-checked by the vat (naming is not
 * authority) — but the model's *proposals* are now confined too.
 */
import type { Oracle, Turn } from './oracle.ts';
import { buildGrammarSystemPrompt, buildToolGrammar } from './tool-grammar.ts';

export interface GrammarInferenceRecord {
  readonly turn: number;
  readonly rawOutput: string;
  readonly parsed: Turn;
  readonly grammarConstrained: true;
}

export class GrammarModelOracle implements Oracle {
  private turnNo = 0;
  private readonly _log: GrammarInferenceRecord[] = [];
  private readonly grammar: string;
  private readonly system: string;
  // Running conversation so the model REMEMBERS what it already did (without history it loops —
  // a real bug, distinct from small-model weakness). Reset between user requests via resetHistory().
  private readonly history: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  constructor(
    private readonly url: string,
    private readonly toolNames: readonly string[],
  ) {
    this.grammar = buildToolGrammar(toolNames);
    this.system = buildGrammarSystemPrompt(toolNames);
  }

  get log(): readonly GrammarInferenceRecord[] {
    return this._log;
  }

  /** Start a fresh exchange (new user request) — clears the per-request action/observation history. */
  resetHistory(): void {
    this.history.length = 0;
  }

  async next(observation: string): Promise<Turn> {
    this.turnNo += 1;
    const fetchFn = (globalThis as { fetch?: (i: string, init: unknown) => Promise<{ json(): Promise<unknown> }> }).fetch;
    if (!fetchFn) throw new Error('global fetch unavailable');

    this.history.push({ role: 'user', content: `Observation: ${observation}` });
    const res = await fetchFn(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'system', content: this.system }, ...this.history],
        temperature: 0,
        // llama.cpp extension: constrain the sampler to this GBNF grammar.
        grammar: this.grammar,
        n_predict: 512,
        stream: false,
      }),
    });
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = data.choices?.[0]?.message?.content ?? '';

    // The grammar guarantees a well-formed envelope IF generation completes. If the model hit the token
    // cap mid-string, the reply is truncated — degrade to a safe "stand down" turn rather than crash the
    // session. (The length-bounded `thought` field makes this rare.)
    let turn: Turn;
    try {
      const obj = JSON.parse(raw) as { thought?: string; action?: { tool?: string; arg?: unknown }; say?: string };
      turn = obj.action
        ? { thought: obj.thought ?? '', action: { tool: obj.action.tool ?? '', arg: obj.action.arg } }
        : { thought: obj.thought ?? '', say: obj.say ?? '' };
    } catch {
      turn = { thought: 'response was truncated; standing down', say: '(could not complete that step)' };
    }
    // Record the model's own reply so the NEXT turn remembers what it just did (prevents the loop).
    this.history.push({ role: 'assistant', content: raw });

    this._log.push(Object.freeze({ turn: this.turnNo, rawOutput: raw, parsed: turn, grammarConstrained: true }));
    return turn;
  }
}
