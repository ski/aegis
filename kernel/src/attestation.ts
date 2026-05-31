/**
 * Supply-chain attestation (issue #29).
 *
 * Runtime confinement does nothing about a *compromised build of the confiner* — or a tampered tool /
 * model artifact. So before the trusted base admits an artifact, it verifies the artifact's content
 * digest against a pinned expected hash. A mismatch (tampered build) is refused at admission. This is
 * the operator's tool-admission ritual from ADR 0002, made concrete: pin the hash, verify on admit.
 */
import { createHash } from 'node:crypto';

/** Content digest of an artifact (sha256, hex). */
export function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export interface Attestation {
  readonly ok: boolean;
  readonly expected: string;
  readonly actual: string;
}

export function attest(bytes: Uint8Array, expectedHash: string): Attestation {
  const actual = digest(bytes);
  return { ok: actual === expectedHash, expected: expectedHash, actual };
}

/** Admit an artifact only if it attests against the pinned hash; otherwise refuse. */
export function admitArtifact(bytes: Uint8Array, expectedHash: string): Uint8Array {
  const a = attest(bytes, expectedHash);
  if (!a.ok) {
    throw new Error(`attestation failed: expected ${a.expected.slice(0, 12)}… got ${a.actual.slice(0, 12)}…`);
  }
  return bytes;
}
