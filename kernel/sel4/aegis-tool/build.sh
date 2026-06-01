#!/bin/bash
# Build the Aegis-tool seL4 image for one request, then run it on qemu-aarch64 and print the result.
# Usage:  echo "Some Input" | ./build.sh
#
# Requires the Microkit SDK (default ~/sel4/microkit-sdk-2.2.0) and the aarch64-linux-gnu toolchain.
# A fresh image is built per request (the request is baked into aegis_req.h), mirroring the
# fresh-VM-per-call hygiene of the microVM rung. The host reads RESULT: from the verified kernel's
# debug console.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
SDK="${MICROKIT_SDK:-$HOME/sel4/microkit-sdk-2.2.0}"
BOARD=qemu_virt_aarch64
CONFIG=debug
BUILD="$HERE/build"

REQ="$(cat)"
mkdir -p "$BUILD"

# Bake the request into a C header (hex bytes — survives any content, no escaping issues).
python3 - "$REQ" "$BUILD/aegis_req.h" <<'PY'
import sys
req = sys.argv[1].encode()
with open(sys.argv[2], 'w') as f:
    f.write('static const unsigned char REQ[] = {')
    f.write(','.join(str(b) for b in req) if req else '0')
    f.write('};\n')
    f.write(f'#define REQ_LEN {len(req)}\n')
PY

BOARD_DIR="$SDK/board/$BOARD/$CONFIG"
CC=aarch64-linux-gnu-gcc
LD=aarch64-linux-gnu-ld
CFLAGS="-nostdlib -ffreestanding -g -O3 -Wall -Wno-unused-function -mstrict-align -I$BOARD_DIR/include -I$BUILD -I$HERE"

$CC -c $CFLAGS "$HERE/tool.c" -o "$BUILD/tool.o"
$LD -L"$BOARD_DIR/lib" "$BUILD/tool.o" -lmicrokit -Tmicrokit.ld -o "$BUILD/tool.elf"
"$SDK/bin/microkit" "$HERE/tool.system" --search-path "$BUILD" --board "$BOARD" --config "$CONFIG" \
  -o "$BUILD/loader.img" -r "$BUILD/report.txt" >/dev/null

# Boot the verified kernel; extract the tool's answer from the debug console.
timeout 20 qemu-system-aarch64 -machine virt,virtualization=on -cpu cortex-a57 -m 2G \
  -nographic -serial mon:stdio -kernel "$BUILD/loader.img" </dev/null 2>/dev/null \
  | sed -n 's/^RESULT://p' | head -1 | tr -d '\r'
