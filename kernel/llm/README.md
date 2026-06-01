# Aegis local LLM — grammar-constrained tool-calling

Drives the kernel with a **real local model** (Gemma 4 E4B via llama.cpp), whose output is
**grammar-constrained at decode time** so every action it emits is, by construction, a valid Aegis
tool-call whose `tool` is one of the agent's held capabilities. This is the design's "constrained
decoding" (ADR 0001, doc 01) made structural — not validate-and-retry.

Driven by [`../src/grammar-oracle.ts`](../src/grammar-oracle.ts) +
[`../src/tool-grammar.ts`](../src/tool-grammar.ts) / [`pnpm demo:grammar`](../src/demo-grammar.ts).

## Why llama.cpp (not Ollama)

Ollama wraps llama.cpp; we use llama.cpp directly because: it builds from the toolchain we already
have (no daemon), its `llama-server` speaks the OpenAI-compatible API our `httpModel` adapter already
targets (zero code change), and — the decisive reason — it has first-class **GBNF grammar** support
exposed in the server API, so we can make invalid tool-calls *structurally unreachable*.

## One-time setup (in WSL2 / Linux)

```bash
# build llama.cpp (uses cmake + ninja + gcc — already present)
cd ~ && git clone --depth 1 https://github.com/ggml-org/llama.cpp
cd llama.cpp && cmake -B build -DGGML_NATIVE=ON && cmake --build build -j --target llama-server

# a laptop-sized GGUF (~5 GB) — Gemma 4 E4B (native function calling), from the llama.cpp team's org
mkdir -p ~/models && cd ~/models
wget -O gemma-4-E4B-it-Q4_K_M.gguf \
  https://huggingface.co/ggml-org/gemma-4-E4B-it-GGUF/resolve/main/gemma-4-E4B-it-Q4_K_M.gguf
```

## Run

```bash
# start the server (stays running; ~5 GB RAM, loads in ~15s)
~/llama.cpp/build/bin/llama-server -m ~/models/gemma-4-E4B-it-Q4_K_M.gguf \
  --host 0.0.0.0 --port 8080 -c 4096 --no-webui &

# drive the kernel against it (WSL2 mirrors :8080 to Windows localhost)
AEGIS_LLM_URL=http://127.0.0.1:8080/v1/chat/completions pnpm demo:grammar
```

Without a server, `pnpm demo:grammar` verifies the grammar shape offline and skips the live model.

## What we verified

- **The grammar is genuinely enforced.** Sent `root ::= "ALWAYS_THIS_EXACT_STRING"`, the model emits
  exactly that despite being told to "say anything." Told to "reply in plain English only," our tool
  grammar forces it into a `{"thought":…, …}` envelope — it cannot escape to prose.
- **A subtle, honest boundary.** The grammar locks the **`tool` field** to the held-cap enum, so an
  out-of-set tool (e.g. `admin_delete_all`) is *uncallable*. The model can still *mention* such a name
  inside the free-text `thought`/`say` fields — that's harmless: mentioning is not calling, and the vat
  re-checks authority anyway (naming is not authority).
- **A GBNF gotcha that bit us.** A malformed char-class (`[^"\]` instead of `[^"\\]`) makes llama.cpp
  *silently drop the grammar and fall back to unconstrained* — no error returned. Always verify
  enforcement with an adversarial prompt, never assume the field was honored. The module's `string` rule
  uses the correct `[^"\\]`.

## Honest caveat

Gemma 4 E4B (~4.5B effective) is a small model — a competent tool-router, not a frontier reasoner, which
is exactly what the design wants (the membrane provides safety; the model only proposes). Runs CPU-only
on this 16 GB laptop inside WSL2; a 24B+ model is the "remote frontier cap" tier (ADR 0001), not local.
