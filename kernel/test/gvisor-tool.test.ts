import { describe, expect, it } from 'vitest';
import { gvisorArgs, gvisorAvailable, makeGvisorTool } from '../src/gvisor-tool';

describe('gVisor isolation rung', () => {
  it('the sandbox argv uses runsc with networking disabled', () => {
    const args = gvisorArgs(['sh', '-c', 'tr A-Z a-z']);
    expect(args[0]).toBe('runsc');
    expect(args).toContain('--network=none');
    expect(args).toContain('do');
  });

  it('exposes a capability of the right shape', () => {
    expect(makeGvisorTool().cap.kind).toBe('gvisor_tool');
  });

  it('runs live behind the userspace kernel and labels the boundary (when runsc is available)', async () => {
    if (!gvisorAvailable()) {
      expect(gvisorAvailable()).toBe(false);
      return;
    }
    const r = await makeGvisorTool().cap.invoke('Hello GVISOR TEST');
    expect(String((r as { value: unknown }).value).trim()).toBe('hello gvisor test');
    expect([...(r as { label: { taints: Set<string> } }).label.taints]).toContain('isolated-gvisor');
  }, 90_000);
});
