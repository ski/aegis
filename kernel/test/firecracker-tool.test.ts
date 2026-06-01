import { describe, expect, it } from 'vitest';
import { firecrackerAvailable, makeFirecrackerTool } from '../src/firecracker-tool';

// The Firecracker rung needs firecracker + /dev/kvm + a vmlinux + built artifacts. Where present, prove
// a live boot transforms input and labels the boundary; where absent, assert the shape and skip.
describe('Firecracker microVM rung', () => {
  it('exposes a capability of the right shape', () => {
    expect(makeFirecrackerTool().cap.kind).toBe('firecracker_tool');
  });

  it('boots a Firecracker microVM and labels the boundary (when available)', async () => {
    if (!firecrackerAvailable()) {
      expect(firecrackerAvailable()).toBe(false);
      return;
    }
    const r = await makeFirecrackerTool().cap.invoke('Hello Firecracker TEST');
    expect(String((r as { value: unknown }).value).trim()).toBe('hello firecracker test');
    expect([...(r as { label: { taints: Set<string> } }).label.taints]).toContain('isolated-firecracker');
  }, 90_000);
});
