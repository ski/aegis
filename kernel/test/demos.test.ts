import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// Integration: every demo runs under real SES lockdown and asserts its own guarantees, exiting
// nonzero on failure. We just confirm each exits 0 — full end-to-end coverage of the lockdown path.
const demos = [
  'demo',
  'demo:compartments',
  'demo:powerbox',
  'demo:wasm',
  'demo:model',
  'demo:hardened',
  'demo:distribution',
  'demo:microkernel',
];

describe('demos exit 0 (integration, under lockdown)', () => {
  it.each(demos)('pnpm %s', (name) => {
    const r = spawnSync('pnpm', ['-s', name], { shell: true, encoding: 'utf8' });
    if (r.status !== 0) console.error(r.stdout, r.stderr);
    expect(r.status).toBe(0);
  });
});
