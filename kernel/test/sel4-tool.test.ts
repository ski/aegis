import { describe, expect, it } from 'vitest';
import { makeSel4Tool, sel4Available } from '../src/sel4-tool';

// The verified-floor rung needs the Microkit SDK + aarch64 toolchain + qemu-aarch64. Where present,
// prove a confined PD on the verified kernel transforms input and labels the boundary; where absent,
// assert the shape and skip the live build/boot so the suite stays green in CI.
describe('seL4 verified isolation rung', () => {
  it('exposes a capability of the right shape', () => {
    expect(makeSel4Tool().cap.kind).toBe('sel4_tool');
  });

  it('builds + boots a confined PD on the verified kernel and labels the boundary (when available)', async () => {
    if (!sel4Available()) {
      expect(sel4Available()).toBe(false);
      return;
    }
    const r = await makeSel4Tool().cap.invoke('Hello SEL4 TEST');
    expect(String((r as { value: unknown }).value).trim()).toBe('hello sel4 test');
    expect([...(r as { label: { taints: Set<string> } }).label.taints]).toContain('isolated-sel4-verified');
  }, 150_000);
});
