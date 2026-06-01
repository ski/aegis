# aegisd — the real, interactive Aegis agent

`aegisd` is the capstone made *real*: not a scripted demo, but a persistent agent you talk to in your
terminal. A single agent-vat holds a least-authority cap set over a **real workspace directory**, driven
by a **real local model** (Gemma 4 E4B via llama.cpp), with output **grammar-constrained** to valid
tool-calls. Every action passes the dual membrane (authority + information-flow); every decision is
audited; and when the agent wants authority it doesn't hold, it asks **you** over the terminal — the
trusted path the agent cannot forge.

## Run it (natively in Linux / WSL2 — no tsx, no build step)

```bash
# 1. a local model server (see llm/README.md for setup)
~/llama.cpp/build/bin/llama-server -m ~/models/gemma-4-E4B-it-Q4_K_M.gguf --host 0.0.0.0 --port 8080 -c 4096 &

# 2. aegisd, run with bare node (Node 22 transform-types — no tsx/esbuild needed)
cd kernel
AEGIS_LLM_URL=http://127.0.0.1:8080/v1/chat/completions \
  node --experimental-transform-types src/aegisd.ts
```

It seeds `~/aegis-workspace/notes/` with three notes (one confidential) on first run. Then type requests:

```
you › read meeting.txt then write a one-line summary to the summary with write_note, then finish
  ✓ read_file  → Team meeting: shipped aegisd; next is a write-up.
  ✓ write_note → wrote 72 chars to summary.txt
  agent › Task complete.

you › read secret-salaries.txt then write its contents to the summary with write_note
  ✓ read_file  → CONFIDENTIAL: Alice 200k, Bob 180k.
  ⛔ write_note BLOCKED (information-flow): data carries secrecy 'confidential' but sink is not cleared
  agent › I was blocked from writing the confidential salary data... I cannot complete the task.
```

Commands: `/audit` (recent audit trail), `/label` (current turn's IFC label), `/quit`.

## The endowed capabilities (least authority for a document assistant)

| Tool | Kind | Authority |
| --- | --- | --- |
| `read_file` | source | read `notes/` only; files named *secret*/*confidential* are labeled `confidential` |
| `list_notes` | source | list `notes/` |
| `write_note` | sink | write `summary.txt`, cleared for **no** secrecy (confidential content is flow-blocked) |
| `request_capability` | broker | ask the powerbox (i.e. **you**) for a cap not held — e.g. `export_file` |
| `finish` | terminal | end the task with a message |

Anything else: the agent simply doesn't hold it. Naming a tool it lacks → `no-authority`.

## What running it for real taught us (findings no demo caught)

- **Conversation memory is load-bearing.** The first cut sent the model only the latest observation, so it
  had amnesia and **looped** (re-listing notes forever). Carrying per-request history fixed it — the
  model then completed multi-step tasks cleanly. Scripted demos never caught this because their oracles
  are single-shot.
- **Small models need a bounded thought field.** Gemma 4 E4B (4.5B) is verbose; left unbounded it ran
  past the token budget mid-string and emitted truncated JSON. The grammar now length-bounds `thought`,
  and the oracle degrades truncation to a safe stand-down instead of crashing.
- **The security held throughout, untouched by any of this.** Across every run — looping, truncation,
  injection — the agent never escaped its caps, the audit stayed clean, and the IFC membrane blocked
  every attempt to write confidential data to the public sink. Safety came from the kernel, not the model.

## Honest scope

- Gemma 4 E4B is a *weak planner* (a 4.5B model). It completes clear, explicit, few-step tasks; it
  struggles with vague multi-step ones. That's the expected small-model floor (doc 01) — and the whole
  point of the design is that **safety doesn't depend on the model being smart**. A bigger model (or a
  remote frontier cap) would plan better; the kernel guarantees don't change either way.
- Runs inside WSL2-on-Windows here (dev-grade); the design target is a Linux box (ADR 0001).
- The workspace lives at `~/aegis-workspace` (outside the repo). Not persisted beyond the filesystem.
