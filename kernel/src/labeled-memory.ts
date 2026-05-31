/**
 * Labeled memory (issue #16) — close the across-session / across-vat leak.
 *
 * "Label the turn" (docs/04) protects data within a live context, but agents have memory that outlives
 * the turn — history, RAG, summaries. If a secret is written to a plain store its label is lost; on
 * recall it comes back UNLABELED, the flow gate sees no secrecy, and the secret leaks across sessions.
 *
 * Labeled memory stores the label WITH the value and returns it on recall, so the recalling turn
 * re-absorbs the secrecy and the membrane blocks the leak exactly as it would in-turn. It plugs into the
 * kernel with NO vat change:
 *
 *   - the WRITE cap stamps the entry with the writer's current turn label (supplied by the trusted vat
 *     as `ctx.requesterLabel` — the model cannot forge it);
 *   - the RECALL cap returns `{ value, label }`, which the vat already re-absorbs on every invoke.
 *
 * Memory is reached through a capability, so cross-vat recall is mediated, not ambient.
 */
import type { Capability, InvokeContext } from './capability';
import { makeCapability } from './capability';
import type { Label } from './label';
import { bottom, source } from './label';

export interface MemoryEntry {
  readonly value: unknown;
  readonly label: Label;
}

export interface LabeledMemory {
  write(key: string, value: unknown, label: Label): void;
  recall(key: string): MemoryEntry | undefined;
}

export function makeLabeledMemory(): LabeledMemory {
  const store = new Map<string, MemoryEntry>();
  return {
    write(key, value, label) {
      store.set(key, { value, label });
    },
    recall(key) {
      return store.get(key);
    },
  };
}

/** Wrap a labeled memory as a write cap + a recall cap that carry labels through the store. */
export function makeMemoryCaps(memory: LabeledMemory): { write: Capability; recall: Capability } {
  const write = makeCapability({
    kind: 'memory_write',
    clearance: source(), // writing to your own (cap-scoped) memory is not an outbound leak
    invoke: (arg, ctx?: InvokeContext) => {
      const { key, value } = arg as { key: string; value: unknown };
      memory.write(key, value, ctx?.requesterLabel ?? bottom()); // stamp with the writer's current label
      return { value: 'written', label: bottom() };
    },
  });

  const recall = makeCapability({
    kind: 'memory_recall',
    clearance: source(),
    invoke: (arg) => {
      const { key } = arg as { key: string };
      const entry = memory.recall(key);
      // Return the value WITH its stored label → the vat re-absorbs it, re-tainting the turn.
      return entry ? { value: entry.value, label: entry.label } : { value: null, label: bottom() };
    },
  });

  return { write, recall };
}
