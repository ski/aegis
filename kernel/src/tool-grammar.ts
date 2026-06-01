/**
 * GBNF grammar for Aegis tool-calls — constrained decoding as a HARD guarantee (docs/01, ADR 0001).
 *
 * The design says: "constrained decoding forces valid tool-call shapes, so the model needn't be smart
 * enough to emit valid JSON — it only has to pick the right cap and fill plausible args." Until now the
 * `ModelOracle` approximated that with validate-and-retry (parse, reject, ask again). With llama.cpp's
 * GBNF grammar support we can make it STRUCTURAL: the sampler is constrained to the grammar at decode
 * time, so the model is *incapable* of emitting a token sequence outside it. There is nothing to retry —
 * an invalid action is unreachable.
 *
 * The grammar below admits exactly one shape:
 *   {"thought": "<text>", "action": {"tool": "<one of the allowed tools>", "arg": "<text>"}}
 * or a terminal:
 *   {"thought": "<text>", "say": "<text>"}
 *
 * Crucially the `tool` field is constrained to a FIXED ENUM of the caps the agent actually holds — so the
 * model cannot even *name* a tool outside its capability set. (Naming is still not authority — the vat
 * re-checks — but constraining the enum means injection can't even propose an escalation by name.)
 */

/** Build a GBNF grammar whose tool enum is exactly the held tool names. */
export function buildToolGrammar(toolNames: readonly string[]): string {
  const toolAlt = toolNames.map((n) => `"\\"${n}\\""`).join(' | ');
  return [
    'root        ::= "{" ws "\\"thought\\"" ws ":" ws string ws "," ws body ws "}"',
    'body        ::= action | say',
    'action      ::= "\\"action\\"" ws ":" ws "{" ws "\\"tool\\"" ws ":" ws tool ws "," ws "\\"arg\\"" ws ":" ws string ws "}"',
    'say         ::= "\\"say\\"" ws ":" ws string',
    `tool        ::= ${toolAlt}`,
    // a conservative JSON string (no control chars, basic escapes)
    'string      ::= "\\"" ([^"\\\\] | "\\\\" ["\\\\/bfnrt])* "\\""',
    'ws          ::= [ \\t\\n]*',
  ].join('\n');
}

/** The system prompt that pairs with the grammar — tells the model the contract + its tools. */
export function buildGrammarSystemPrompt(toolNames: readonly string[]): string {
  return [
    'You are an agent confined by object-capabilities. Respond with ONLY a single JSON object.',
    'Either take an action with one of your tools, or finish with a final message.',
    `Your available tools are EXACTLY: ${toolNames.join(', ')}.`,
    'Shape: {"thought": "...", "action": {"tool": "<one of your tools>", "arg": "..."}}',
    'or:    {"thought": "...", "say": "..."}',
  ].join('\n');
}
