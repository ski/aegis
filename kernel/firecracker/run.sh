#!/bin/bash
# Boot a Firecracker microVM for ONE request/response and exit.
# Usage:  echo "Hello FC" | ./run.sh
#
# Uses Firecracker's --no-api mode with a JSON config so the whole launch is one declarative command
# (no API socket dance). Hardware-isolated by KVM via Firecracker (the AWS-Lambda VMM): own guest
# kernel, no network interface, no extra drives — boot-source cmdline carries the request, console
# carries the response. A fresh VM per call.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
VMLINUX="${FC_VMLINUX:-$HOME/fc/vmlinux}"
REQ="$(cat)"
REQ_HEX="$(printf '%s' "$REQ" | od -An -tx1 | tr -d ' \n')"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cp "$HERE/initramfs.cpio.gz" "$WORK/initrd"

cat > "$WORK/vm.json" <<JSON
{
  "boot-source": {
    "kernel_image_path": "${VMLINUX}",
    "initrd_path": "${WORK}/initrd",
    "boot_args": "console=ttyS0 reboot=k panic=1 quiet rdinit=/init aegis_req=${REQ_HEX}"
  },
  "machine-config": { "vcpu_count": 1, "mem_size_mib": 128 },
  "drives": [],
  "network-interfaces": []
}
JSON

# Boot, capturing the console to a FILE (Firecracker's stdout behaves differently off a tty/pipe),
# then extract the tool's answer.
timeout 30 firecracker --no-api --config-file "$WORK/vm.json" </dev/null >"$WORK/console.log" 2>/dev/null || true
sed -n 's/^RESULT://p' "$WORK/console.log" | head -1 | tr -d '\r'
