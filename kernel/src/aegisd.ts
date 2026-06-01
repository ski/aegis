/**
 * aegisd — a persistent, interactive Aegis agent you run natively in a Linux/WSL2 terminal.
 *
 *   node --experimental-strip-types src/aegisd.ts [workspace-dir]
 *   (or: pnpm aegisd)
 *
 * This is the capstone made real: not a scripted demo, but a daemon you talk to. A single agent-vat
 * holds a least-authority cap set over a REAL workspace directory, driven by the REAL local model
 * (Gemma 4 E4B via llama.cpp), with output grammar-constrained to valid tool-calls. Every action passes
 * the dual membrane (authority + information-flow); every decision is audited; and when the agent wants
 * authority it doesn't hold, it asks YOU over the terminal — the trusted path the agent cannot forge.
 *
 * Tools the agent is endowed with (least authority for a document assistant):
 *   read_file   — SOURCE, scoped to <workspace>/notes/. Files named *secret* are labeled confidential.
 *   write_note  — SINK to <workspace>/summary.txt, cleared for NO secrecy (can't write secrets out).
 *   list_notes  — SOURCE, lists notes/.
 *   finish      — terminal: say a final message.
 * NOT endowed: anything else. The agent may `request_capability` via the powerbox; you decide.
 *
 * The point of running it for real: the design's open tensions (POLA-vs-usability, the human-attention
 * budget) only show up under sustained real use. This is how we find out if it's livable.
 */
import './bootstrap.ts';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { makeCapability } from './capability.ts';
import { bottom, fmtLabel, label, sink, source } from './label.ts';
import { GrammarModelOracle } from './grammar-oracle.ts';
import { Powerbox, type Grantable, type OperatorConsole } from './powerbox.ts';
import { Vat } from './vat.ts';

const LLM_URL = process.env['AEGIS_LLM_URL'] ?? 'http://127.0.0.1:8080/v1/chat/completions';
const WORKSPACE = resolve(process.argv[2] ?? join(process.env['HOME'] ?? '.', 'aegis-workspace'));

function banner(s: string): void {
  console.log(`\n\x1b[36m${'─'.repeat(78)}\n${s}\n${'─'.repeat(78)}\x1b[0m`);
}

/** Seed a real workspace with a couple of notes (incl. a confidential one) if empty. */
function seedWorkspace(): void {
  const notes = join(WORKSPACE, 'notes');
  mkdirSync(notes, { recursive: true });
  if (readdirSync(notes).length === 0) {
    writeFileSync(join(notes, 'meeting.txt'), 'Team meeting: shipped aegisd; next is a write-up.');
    writeFileSync(join(notes, 'ideas.txt'), 'Idea: a labeled-space coordination fabric across machines.');
    writeFileSync(join(notes, 'secret-salaries.txt'), 'CONFIDENTIAL: Alice 200k, Bob 180k.');
    console.log(`  seeded ${notes} with 3 notes (one confidential).`);
  }
}

function buildTools(): { caps: Map<string, ReturnType<typeof makeCapability>>; notesDir: string } {
  const notesDir = resolve(WORKSPACE, 'notes');
  const summaryPath = join(WORKSPACE, 'summary.txt');

  const inScope = (p: string): boolean => p === notesDir || p.startsWith(notesDir + sep);

  const read_file = makeCapability({
    kind: 'read_file',
    clearance: source(),
    invoke: (arg) => {
      const name = String((arg as { arg?: unknown })?.arg ?? arg ?? '');
      const p = resolve(notesDir, name);
      if (!inScope(p)) throw new Error(`'${name}' is outside the notes/ scope`);
      const content = readFileSync(p, 'utf8');
      const secrecy = /secret|confidential/i.test(name) ? ['confidential'] : [];
      return { value: content, label: label(secrecy, []) };
    },
  });

  const list_notes = makeCapability({
    kind: 'list_notes',
    clearance: source(),
    invoke: () => ({ value: readdirSync(notesDir).join(', '), label: bottom() }),
  });

  const write_note = makeCapability({
    kind: 'write_note',
    clearance: sink([], false), // cleared for no secrecy → confidential content is flow-blocked
    invoke: (arg) => {
      const text = String((arg as { arg?: unknown })?.arg ?? arg ?? '');
      writeFileSync(summaryPath, text);
      return { value: `wrote ${text.length} chars to summary.txt`, label: bottom() };
    },
  });

  const caps = new Map([
    ['read_file', read_file],
    ['list_notes', list_notes],
    ['write_note', write_note],
  ]);
  return { caps, notesDir };
}

async function main(): Promise<void> {
  banner('AEGIS · aegisd — a real capability-confined agent (native, in your terminal)');
  console.log(`  workspace : ${WORKSPACE}`);
  console.log(`  model     : ${LLM_URL}`);
  seedWorkspace();

  const rl = createInterface({ input: stdin, output: stdout });

  // The trusted path: grant prompts are answered by YOU at this real TTY (agent can't forge it).
  const operator: OperatorConsole = {
    async decide(c) {
      const ans = await rl.question(
        `\n\x1b[33m[powerbox] the agent requests capability '${c.petname}'\n` +
          `  what it would grant: ${c.description}\n` +
          `  agent's stated reason: ${c.reason}\n` +
          `  GRANT this? [y/N] \x1b[0m`,
      );
      return ans.trim().toLowerCase() === 'y';
    },
  };
  // A powerbox that can broker exactly one extra capability: a wider write. (Demonstrates brokering.)
  const summaryPath = join(WORKSPACE, 'export.txt');
  const exportCap = makeCapability({
    kind: 'export_file',
    clearance: sink([], true),
    invoke: (arg) => {
      writeFileSync(summaryPath, String((arg as { arg?: unknown })?.arg ?? arg ?? ''));
      return { value: `exported to export.txt`, label: bottom() };
    },
  });
  const domain = new Map<string, Grantable>([
    ['export_file', { cap: exportCap, sensitivity: 'high', description: 'Write to export.txt (an outbound-ish sink)' }],
  ]);
  const powerbox = new Powerbox(domain, operator);

  const { caps } = buildTools();
  const vat = new Vat('assistant');
  for (const [name, cap] of caps) vat.endow(name, cap);
  vat.attachPowerbox(powerbox);

  const toolNames = [...caps.keys(), 'request_capability', 'finish'];
  const oracle = new GrammarModelOracle(LLM_URL, toolNames);

  console.log(`\n  endowed tools: ${[...caps.keys()].join(', ')}`);
  console.log('  also available: request_capability (asks you), finish');
  console.log('\n  Type a request (e.g. "summarize my meeting notes"), or "/quit", "/audit", "/label".\n');

  for (;;) {
    let userMsg: string;
    try {
      userMsg = (await rl.question('\x1b[32myou ›\x1b[0m ')).trim();
    } catch {
      break; // readline closed (EOF / piped input ended) — exit cleanly
    }
    if (!userMsg) continue;
    if (userMsg === '/quit') break;
    if (userMsg === '/audit') {
      for (const e of vat.audit.slice(-12)) console.log(`  t${e.turn} ${e.event.padEnd(13)} ${e.label.padEnd(40)} ${e.detail}`);
      continue;
    }
    if (userMsg === '/label') {
      console.log(`  current turn label: ${fmtLabel(vat.currentLabel())}`);
      continue;
    }

    // Drive the agent for a few steps on this request (grammar-constrained throughout).
    oracle.resetHistory(); // fresh exchange per request; the oracle carries history within it
    let observation = userMsg;
    const seenActions = new Set<string>(); // detect the small-model loop (repeated identical actions)
    for (let step = 0; step < 6; step++) {
      vat.beginTurn();
      let turn;
      try {
        turn = await oracle.next(observation);
      } catch (e) {
        console.log(`  \x1b[31m[model error] ${(e as Error).message}\x1b[0m`);
        break;
      }
      if (turn.thought) console.log(`  \x1b[90m· ${turn.thought.slice(0, 100)}\x1b[0m`);

      if (!turn.action || turn.action.tool === 'finish') {
        console.log(`\x1b[35magent ›\x1b[0m ${turn.say ?? turn.action?.arg ?? '(done)'}`);
        break;
      }

      // Small models loop: if it repeats an identical action, nudge it to move on or finish.
      const sig = `${turn.action.tool}:${JSON.stringify(turn.action.arg ?? '')}`;
      if (seenActions.has(sig)) {
        console.log(`  \x1b[33m↻ repeated ${turn.action.tool} — nudging the agent to progress or finish\x1b[0m`);
        observation = `You already did ${turn.action.tool} with that argument and saw the result. Do NOT repeat it. Take the NEXT step toward the user's goal, or use 'finish' if done.`;
        continue;
      }
      seenActions.add(sig);

      const r = await vat.act(turn.action.tool, turn.action);
      if (r.ok) {
        console.log(`  \x1b[34m✓ ${r.tool}\x1b[0m → ${String(r.value).slice(0, 160)}`);
        observation = `Result of ${r.tool}: ${String(r.value).slice(0, 400)}`;
      } else if (r.blocked === 'flow') {
        console.log(`  \x1b[31m⛔ ${r.tool} BLOCKED (information-flow): ${r.reasons.join('; ')}\x1b[0m`);
        observation = `Your ${r.tool} was blocked by the information-flow gate: ${r.reasons.join('; ')}. Do not retry with secret data.`;
      } else if (r.blocked === 'no-authority') {
        console.log(`  \x1b[31m⛔ ${r.tool} BLOCKED (no such capability held)\x1b[0m`);
        observation = `You do not hold '${r.tool}'. Use request_capability to ask, or use a tool you have.`;
      } else if (r.blocked === 'grant-denied') {
        console.log(`  \x1b[31m⛔ capability request denied: ${r.reason}\x1b[0m`);
        observation = `Your capability request was denied: ${r.reason}.`;
      } else {
        console.log(`  \x1b[31m⛔ ${r.tool} BLOCKED (${r.blocked})\x1b[0m`);
        observation = `'${r.tool}' was blocked.`;
      }
    }
  }

  rl.close();
  banner('aegisd stopped. Audit trail this session:');
  for (const e of vat.audit) console.log(`  t${e.turn} ${e.event.padEnd(13)} ${e.label.padEnd(40)} ${e.detail}`);
  console.log();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
