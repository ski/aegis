import { describe, expect, it } from 'vitest';
import { makeMicroVMTool, microvmAvailable } from '../src/microvm-tool';

// The microVM rung needs WSL2 + /dev/kvm + QEMU + built artifacts. Where present, prove a live boot
// transforms input and labels the boundary; where absent, assert the shape and skip the live boot so
// the suite stays green in CI.
describe('microVM isolation rung', () => {
  it('exposes a capability of the right shape', () => {
    const tool = makeMicroVMTool();
    expect(tool.cap.kind).toBe('microvm_tool');
  });

  it('boots a hardware-isolated guest and labels the boundary (when KVM is available)', async () => {
    if (!microvmAvailable()) {
      expect(microvmAvailable()).toBe(false); // documents the skip
      return;
    }
    const tool = makeMicroVMTool();
    const r = await tool.cap.invoke('Hello MicroVM TEST');
    expect(String((r as { value: unknown }).value).trim()).toBe('hello microvm test');
    expect([...(r as { label: { taints: Set<string> } }).label.taints]).toContain('isolated-microvm');
  }, 90_000);
});
