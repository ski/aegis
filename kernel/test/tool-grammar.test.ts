import { describe, expect, it } from 'vitest';
import { buildGrammarSystemPrompt, buildToolGrammar } from '../src/tool-grammar';

describe('tool-call GBNF grammar', () => {
  const tools = ['fetch_page', 'read_customer_db', 'send_external'];
  const grammar = buildToolGrammar(tools);

  it('has a root rule and an action/say body', () => {
    expect(grammar).toMatch(/^root\s*::=/m);
    expect(grammar).toContain('body        ::= action | say');
  });

  it('locks the `tool` field to exactly the held caps (enum)', () => {
    expect(grammar).toContain('"\\"fetch_page\\""');
    expect(grammar).toContain('"\\"read_customer_db\\""');
    expect(grammar).toContain('"\\"send_external\\""');
    // a tool NOT in the set must not appear as a grammar alternative
    expect(grammar).not.toContain('admin_delete_all');
  });

  it('length-bounds the thought field so a verbose model cannot overrun the token budget', () => {
    expect(grammar).toContain('shortstring');
    expect(grammar).toMatch(/\{0,\d+\}/); // a bounded repetition
    expect(grammar).toContain('"\\"thought\\"" ws ":" ws shortstring');
  });

  it('uses a well-formed JSON string rule (correct backslash escaping)', () => {
    // the char-class must be [^"\\] (escaped backslash), not [^"\]
    expect(grammar).toContain('string      ::= "\\"" ([^"\\\\]');
  });

  it('the system prompt names exactly the held tools', () => {
    const sys = buildGrammarSystemPrompt(tools);
    for (const t of tools) expect(sys).toContain(t);
    expect(sys).not.toContain('admin_delete_all');
  });
});
