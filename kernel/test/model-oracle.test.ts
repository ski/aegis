import { describe, expect, it } from 'vitest';
import { ModelOracle, ReplayOracle } from '../src/model-oracle';

describe('model-as-oracle', () => {
  it('constrains messy text into a tool-call and retries on garbage', async () => {
    let n = 0;
    const completion = (): string => {
      n += 1;
      if (n === 1) return 'sure, happy to help!'; // no JSON → forces a retry
      return 'thinking…\n```json\n{"thought":"go","action":{"tool":"fetch","arg":1}}\n```';
    };
    const o = new ModelOracle(completion);
    const turn = await o.next('(start)');
    expect(turn.action?.tool).toBe('fetch');
    expect(o.log[0]?.attempts).toBe(2);
  });

  it('falls back safely when the model never produces a valid action', async () => {
    const o = new ModelOracle(() => 'never valid json', 2);
    const turn = await o.next('(start)');
    expect(turn.action).toBeUndefined();
    expect(typeof turn.say).toBe('string');
  });

  it('replays a recorded run deterministically', async () => {
    const o = new ModelOracle(() => '{"thought":"x","say":"done"}');
    await o.next('a');
    const replay = new ReplayOracle(o.log);
    expect(replay.next().say).toBe('done');
  });
});
