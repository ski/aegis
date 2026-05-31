import { describe, expect, it } from 'vitest';
import { dockerRunArgs } from '../src/docker-tool';

describe('docker isolation rung (#D2)', () => {
  it('the run argv hardens the container — no caps, no network, read-only, bounded', () => {
    const args = dockerRunArgs({ image: 'busybox', cmd: ['echo', 'hi'] });
    expect(args).toContain('--cap-drop=ALL');
    expect(args).toContain('--security-opt=no-new-privileges');
    expect(args).toContain('--network=none'); // the tool's only channel is the cap
    expect(args).toContain('--read-only');
    expect(args.some((a) => a.startsWith('--pids-limit='))).toBe(true);
    expect(args.some((a) => a.startsWith('--memory='))).toBe(true);
    expect(args).toContain('busybox');
    expect(args.slice(-2)).toEqual(['echo', 'hi']);
  });
});
