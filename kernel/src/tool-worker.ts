/**
 * Isolated tool worker — runs in its OWN OS process (issue #D2; substrate phase 2).
 *
 * It has no reference to the parent's capabilities or memory; it speaks only a line-delimited JSON
 * protocol over stdio. This is the isolation-plane boundary at the *process* level — a microVM
 * (Firecracker) is the hardware-isolated version of exactly this shape, reachable the same way.
 *
 * The "tool" itself is a trivial pure transform (normalize text); the point is the boundary.
 */
let buf = '';
process.stdin.on('data', (d: Buffer) => {
  buf += d.toString();
  let idx: number;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx);
    buf = buf.slice(idx + 1);
    if (!line.trim()) continue;
    try {
      const { id, input } = JSON.parse(line) as { id: number; input: unknown };
      const output = String(input).trim().toLowerCase();
      process.stdout.write(`${JSON.stringify({ id, output, pid: process.pid })}\n`);
    } catch {
      /* ignore malformed line */
    }
  }
});
process.stdin.resume();
