/**
 * GatewayModelOracle — drive the kernel with a REMOTE FRONTIER model via an OpenAI-compatible gateway
 * (e.g. Cloudflare AI Gateway → Vertex/Gemini). The "stronger model" fork: a far better planner than a
 * local 4B, while the membrane guarantees stay IDENTICAL — safety never depended on the model.
 *
 * SECRETS: this file reads everything from the environment. No token, key, account id, or URL is ever
 * hard-coded — aegis is a public repo. Configure via env:
 *   AEGIS_GW_URL      full chat/completions URL (e.g. https://gateway.ai.cloudflare.com/v1/<acct>/<gw>/compat/chat/completions)
 *   AEGIS_GW_MODEL    model id (e.g. google-vertex-ai/google/gemini-3.5-flash)
 *   AEGIS_GW_TOKEN    bearer token for the gateway (sent as cf-aig-authorization)
 *   AEGIS_GW_BYOK     optional cf-aig-byok-alias value
 *
 * Note on constraint mechanism: a hosted model can't do llama.cpp's sampler-level GBNF. We use the
 * provider's JSON/structured-output where offered, else fall back to validate-and-retry. This is the
 * RIGHT test of the thesis — the model's own output-constraint is itself untrusted; the kernel membrane
 * enforces safety regardless of whether the model formats correctly.
 */
import type { Oracle, Turn } from './oracle.ts';
import { buildGrammarSystemPrompt } from './tool-grammar.ts';

export interface GatewayConfig {
  url: string;
  model: string;
  token?: string;
  byokAlias?: string;
}

/** Read gateway config from env; returns null if not configured (so demos can skip cleanly). */
export function gatewayConfigFromEnv(): GatewayConfig | null {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
  const url = env['AEGIS_GW_URL'];
  const model = env['AEGIS_GW_MODEL'];
  if (!url || !model) return null;
  return { url, model, token: env['AEGIS_GW_TOKEN'], byokAlias: env['AEGIS_GW_BYOK'] };
}

export interface GatewayInferenceRecord {
  readonly turn: number;
  readonly attempts: number;
  readonly rawOutput: string;
  readonly parsed: Turn;
}

export class GatewayModelOracle implements Oracle {
  private turnNo = 0;
  private readonly _log: GatewayInferenceRecord[] = [];
  private readonly history: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
  private readonly system: string;

  constructor(
    private readonly cfg: GatewayConfig,
    private readonly toolNames: readonly string[],
    private readonly maxAttempts = 3,
  ) {
    this.system = buildGrammarSystemPrompt(toolNames);
  }

  get log(): readonly GatewayInferenceRecord[] {
    return this._log;
  }
  resetHistory(): void {
    this.history.length = 0;
  }

  async next(observation: string): Promise<Turn> {
    this.turnNo += 1;
    this.history.push({ role: 'user', content: `Observation: ${observation}` });
    const fetchFn = (globalThis as { fetch?: typeof fetch }).fetch;
    if (!fetchFn) throw new Error('global fetch unavailable');

    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.cfg.token) headers['cf-aig-authorization'] = `Bearer ${this.cfg.token}`;
    if (this.cfg.byokAlias) headers['cf-aig-byok-alias'] = this.cfg.byokAlias;

    let raw = '';
    let lastErr = '';
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const messages = [
        { role: 'system' as const, content: this.system + (lastErr ? `\n\nYour previous reply was invalid (${lastErr}). Reply with ONLY the JSON object.` : '') },
        ...this.history,
      ];
      const res = await fetchFn(this.cfg.url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: this.cfg.model,
          messages,
          temperature: 0,
          // Provider-side structured output (JSON mode) where supported — best-effort, not sampler-level.
          response_format: { type: 'json_object' },
        }),
      });
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; error?: unknown };
      raw = data.choices?.[0]?.message?.content ?? '';
      const parsed = parseTurn(raw);
      if (parsed.ok) {
        this.history.push({ role: 'assistant', content: raw });
        this._log.push(Object.freeze({ turn: this.turnNo, attempts: attempt, rawOutput: raw, parsed: parsed.turn }));
        return parsed.turn;
      }
      lastErr = parsed.error;
    }
    const fallback: Turn = { thought: 'could not produce a valid action; standing down', say: '' };
    this._log.push(Object.freeze({ turn: this.turnNo, attempts: this.maxAttempts, rawOutput: raw, parsed: fallback }));
    return fallback;
  }
}

type Parsed = { ok: true; turn: Turn } | { ok: false; error: string };
function parseTurn(raw: string): Parsed {
  const obj = extractJson(raw);
  if (!obj) return { ok: false, error: 'no JSON object found' };
  if (typeof obj.thought !== 'string') return { ok: false, error: 'missing string "thought"' };
  if (obj.action !== undefined) {
    const a = obj.action as { tool?: unknown; arg?: unknown };
    if (typeof a !== 'object' || a === null || typeof a.tool !== 'string') return { ok: false, error: 'action needs string "tool"' };
    return { ok: true, turn: { thought: obj.thought, action: { tool: a.tool, arg: a.arg } } };
  }
  if (typeof obj.say === 'string') return { ok: true, turn: { thought: obj.thought, say: obj.say } };
  return { ok: false, error: 'must contain "action" or "say"' };
}
function extractJson(raw: string): Record<string, unknown> | null {
  const tryParse = (s: string): Record<string, unknown> | null => {
    try {
      const v: unknown = JSON.parse(s);
      return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
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
