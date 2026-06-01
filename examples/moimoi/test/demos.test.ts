import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// Each moimoi demo asserts its own guarantees and exits nonzero on failure. We confirm each exits 0.
const demos = ['demo:microblog', 'demo:ownership', 'demo:zoe', 'demo:social'];

describe('moimoi demos exit 0', () => {
  it.each(demos)('pnpm %s', (name) => {
    const r = spawnSync('pnpm', ['-s', name], { shell: true, encoding: 'utf8' });
    if (r.status !== 0) console.error(r.stdout, r.stderr);
    expect(r.status).toBe(0);
  });
});
