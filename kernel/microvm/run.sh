#!/bin/bash
# Boot the Aegis microVM for ONE request/response and exit (substrate phase 2 rung).
# Reads the request on stdin, writes "RESULT:<lowercased>" on stdout. Hardware-isolated by KVM:
# own guest kernel, no network, no disk, no shared fs — the serial console is the only channel.
#
# Usage: echo "Hello MicroVM" | ./run.sh
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
REQ="$(cat)"

# Pass the request deterministically via the kernel cmdline, hex-encoded (survives spaces/specials,
# no serial-input race). The guest decodes aegis_req=<hex> from /proc/cmdline.
REQ_HEX="$(printf '%s' "$REQ" | od -An -tx1 | tr -d ' \n')"

# -nodefaults + no -netdev + no drive => the guest has no devices but the console.
OUT="$(timeout 30 qemu-system-x86_64 \
  -enable-kvm -m 128 -smp 1 \
  -kernel "$HERE/guest-kernel" \
  -initrd "$HERE/initramfs.cpio.gz" \
  -append "console=ttyS0 panic=1 quiet rdinit=/init aegis_req=${REQ_HEX}" \
  -nodefaults -no-reboot -nographic \
  -serial stdio -display none < /dev/null 2>/dev/null)"

# Extract the tool's answer from the boot log.
printf '%s\n' "$OUT" | sed -n 's/^RESULT://p' | head -1
