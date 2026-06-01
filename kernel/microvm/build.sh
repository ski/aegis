#!/bin/bash
# Build the Aegis microVM artifacts INSIDE WSL (zero downloads):
#   - compile guest-init.c statically -> the guest's PID 1 (the untrusted tool)
#   - pack it into an initramfs.cpio.gz by hand (python, since cpio isn't installed)
#   - copy the WSL2 kernel bzImage as the guest kernel
# Idempotent; re-run to rebuild. Outputs into this directory.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

echo "[build] compiling static guest-init…"
gcc -static -Os -s -o init guest-init.c
echo "[build] init = $(stat -c%s init) bytes"

echo "[build] packing initramfs (newc cpio via python)…"
python3 - "$HERE/init" "$HERE/initramfs.cpio.gz" <<'PY'
import sys, gzip, os, struct
init_path, out_path = sys.argv[1], sys.argv[2]
def cpio_entry(name, data, mode):
    name_b = name.encode() + b'\0'
    hdr = b'070701'
    fields = [0, mode, 0,0,1,0, len(data), 0,0,0,0, len(name_b), 0]
    hdr += b''.join(b'%08X' % f for f in fields)
    pad = lambda b, a=4: b + b'\0' * (-len(b) % a)
    return pad(hdr + name_b) + (pad(data) if data else b'')
blob = b''
blob += cpio_entry('.', b'', 0o040755)
with open(init_path, 'rb') as f:
    blob += cpio_entry('init', f.read(), 0o100755)
# trailer
trailer = b'070701' + b''.join(b'%08X'%f for f in [0,0,0,0,1,0,0,0,0,0,0,11,0]) + b'TRAILER!!!\0'
blob += trailer + b'\0' * (-len(trailer) % 4)
with gzip.open(out_path, 'wb') as f:
    f.write(blob)
print('[build] initramfs =', os.path.getsize(out_path), 'bytes')
PY

echo "[build] copying WSL2 kernel as the guest kernel…"
cp "/mnt/c/Program Files/WSL/tools/kernel" "$HERE/guest-kernel"
echo "[build] guest-kernel = $(stat -c%s guest-kernel) bytes"
echo "[build] done: guest-kernel + initramfs.cpio.gz ready"
