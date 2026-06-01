/**
 * Model-as-oracle — milestone 4 (ADR 0001 inference contract; docs/03, docs/01).
 *
 * The model is an external, nondeterministic oracle. This adapter does three things the design calls for:
 *
 *   1. constrained decoding — the model's raw text is validated into a well-formed tool-call, retrying
 *      on malformed output (docs/01: "the model needn't be smart enough to emit valid JSON"). A
 *      grammar-native model tightens this; harness-level validate-and-retry is the portable floor.
 *   2. inference logging   — every call (prompt, raw output, attempts, parsed turn) is recorded, so the
 *      run can be replayed deterministically despite the model's sampling (docs/03 replay).
 *   3. swappability        — because the *membrane* enforces safety, not the model, you can point this
 *      at any model and the guarantees are unchanged. `httpModel` is a real OpenAI-compatible adapter.
 */
import type { Oracle, Turn } from './oracle.ts';

export type CompletionFn = (prompt: string) => string | Promise<string>;

export interface InferenceRecord {
  readonly turn: number;
  readonly attempts: number;
  readonly rawOutput: string;
  readonly parsed: Turn;
}

const SYSTEM = [
  'You are an agent. Respond with ONLY a single JSON object, one of:',
  '  {"thought": string, "action": {"tool": string, "arg"?: any}}',
  '  {"thought": string, "say": string}',
].join('\n');

export class ModelOracle implements Oracle {
  private turnNo = 0;
  private readonly _log: InferenceRecord[] = [];

  constructor(
    private readonly complete: CompletionFn,
    private readonly maxAttempts = 3,
  ) {}

  get log(): readonly InferenceRecord[] {
    return this._log;
  }

  async next(observation: string): Promise<Turn> {
    this.turnNo += 1;
    let lastError = '';
    let raw = '';
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const prompt =
        `${SYSTEM}\n\nObservation: ${observation}` +
        (lastError ? `\n\nYour previous reply was invalid (${lastError}). Reply with ONLY the JSON object.` : '');
      raw = await this.complete(prompt);
      const parsed = parseTurn(raw);
      if (parsed.ok) {
        this._log.push(Object.freeze({ turn: this.turnNo, attempts: attempt, rawOutput: raw, parsed: parsed.turn }));
        return parsed.turn;
      }
      lastError = parsed.error;
    }
    // Constrained decoding failed — stand down safely rather than act on garbage.
    const fallback: Turn = { thought: 'could not produce a valid action; standing down', say: '' };
    this._log.push(Object.freeze({ turn: this.turnNo, attempts: this.maxAttempts, rawOutput: raw, parsed: fallback }));
    return fallback;
  }
}

/** Replays a recorded run without calling the model — the run is deterministic given the log. */
export class ReplayOracle implements Oracle {
  private i = 0;
  constructor(private readonly records: readonly InferenceRecord[]) {}
  next(): Turn {
    const rec = this.records[this.i];
    this.i += 1;
    return rec?.parsed ?? { thought: '(end of log)', say: '' };
  }
}

type Parsed = { ok: true; turn: Turn } | { ok: false; error: string };

function parseTurn(raw: string): Parsed {
  const obj = extractJson(raw);
  if (!obj) return { ok: false, error: 'no JSON object found' };
  if (typeof obj.thought !== 'string') return { ok: false, error: 'missing string "thought"' };
  if (obj.action !== undefined) {
    const a = obj.action as { tool?: unknown; arg?: unknown };
    if (typeof a !== 'object' || a === null || typeof a.tool !== 'string') {
      return { ok: false, error: 'action must have a string "tool"' };
    }
    return { ok: true, turn: { thought: obj.thought, action: { tool: a.tool, arg: a.arg } } };
  }
  if (typeof obj.say === 'string') return { ok: true, turn: { thought: obj.thought, say: obj.say } };
  return { ok: false, error: 'must contain "action" or "say"' };
}

function extractJson(raw: string): Record<string, unknown> | null {
  const tryParse = (s: string): Record<string, unknown> | null => {
    try {
      const v: unknown = JSON.parse(s);
      return v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };
  const whole = tryParse(raw.trim());
  if (whole) return whole;
  const a = raw.indexOf('{');
  const b = raw.lastIndexOf('}');
  if (a >= 0 && b > a) return tryParse(raw.slice(a, b + 1));
  return null;
}

/**
 * Real adapter: an OpenAI-compatible chat endpoint (Ollama, llama.cpp server, LM Studio, …).
 * Point a small local CPU model at it and the guarantees are unchanged — set AEGIS_MODEL_URL.
 */
export function httpModel(url: string, model = 'local'): CompletionFn {
  return async (prompt: string): Promise<string> => {
    const fetchFn = (globalThis as { fetch?: (i: string, init: unknown) => Promise<{ json(): Promise<unknown> }> }).fetch;
    if (!fetchFn) throw new Error('global fetch unavailable in this runtime');
    const res = await fetchFn(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0, stream: false }),
    });
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content ?? '';
  };
}
