#!/bin/bash
# Build the Firecracker guest artifacts (init + initramfs). Zero downloads beyond the one-time vmlinux.
# Reuses the static-C-init + python-cpio technique from the QEMU microVM rung.
# The vmlinux is expected at ~/fc/vmlinux (Firecracker's CI kernel; see firecracker/README.md).
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

gcc -static -Os -s -o init guest-init.c
echo "[build] init = $(stat -c%s init) bytes"

python3 - "$HERE/init" "$HERE/initramfs.cpio.gz" <<'PY'
import sys, gzip
init_path, out_path = sys.argv[1], sys.argv[2]
def entry(name, data, mode):
    nb = name.encode() + b'\0'
    hdr = b'070701' + b''.join(b'%08X' % f for f in
        [0, mode, 0,0,1,0, len(data), 0,0,0,0, len(nb), 0])
    pad = lambda b: b + b'\0' * (-len(b) % 4)
    return pad(hdr + nb) + (pad(data) if data else b'')
blob = entry('.', b'', 0o040755)
with open(init_path, 'rb') as f:
    blob += entry('init', f.read(), 0o100755)
blob += b'070701' + b''.join(b'%08X'%f for f in [0,0,0,0,1,0,0,0,0,0,0,11,0]) + b'TRAILER!!!\0'
blob += b'\0' * (-len(blob) % 4)
with gzip.open(out_path, 'wb') as f:
    f.write(blob)
PY
echo "[build] initramfs = $(stat -c%s initramfs.cpio.gz) bytes"
echo "[build] done (vmlinux expected at ~/fc/vmlinux)"
