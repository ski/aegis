# Aegis seL4 rung — the verified floor

The **assurance** rung: an untrusted tool running as a confined protection domain on the
**formally-verified seL4 microkernel** (via the seL4 Microkit, booted on qemu-aarch64), wrapped as an
Aegis capability. Driven by [`../src/sel4-tool.ts`](../src/sel4-tool.ts) / [`pnpm demo:sel4`](../src/demo-sel4.ts).

Every rung below (process, Docker, gVisor, microVM) provides *strong but unverified* isolation — a bug
in the mechanism escapes. seL4 has **machine-checked proofs of isolation**, so the confinement here is
*proven*, not merely structural. This is ADR 0001's phase-3 verified floor and doc 06's "verified floor".

```
mechanism ladder:  process < container < gVisor < microVM (KVM)   — stronger isolation, all UNVERIFIED
assurance:                                          < seL4         — PROVEN isolation (separation kernel)
```

## What's here

| File | Role |
| --- | --- |
| `aegis-tool/tool.c` | the untrusted tool as a Microkit protection domain: reads its baked-in request, lowercases it, prints `RESULT:` to the verified kernel's debug console. |
| `aegis-tool/tool.system` | the Microkit system description — one PD with exactly its own program image, no ambient authority. |
| `aegis-tool/build.sh` | per request: bakes it into a C header, cross-compiles the PD, links it against seL4 via the Microkit tool into a bootable image, boots it on qemu-aarch64, extracts `RESULT:`. |

Build artifacts (`aegis-tool/build/`) are gitignored.

## One-time setup (in WSL2 / Linux)

```bash
# toolchain
sudo apt-get install -y gcc-aarch64-linux-gnu binutils-aarch64-linux-gnu qemu-system-arm

# the prebuilt Microkit SDK 2.2.0 (includes the verified seL4 kernel)
mkdir -p ~/sel4 && cd ~/sel4
wget https://github.com/seL4/microkit/releases/download/2.2.0/microkit-sdk-2.2.0-linux-x86-64.tar.gz
tar xzf microkit-sdk-2.2.0-linux-x86-64.tar.gz
```

Then: `echo "Hello From SEL4" | bash kernel/sel4/aegis-tool/build.sh` → `hello from sel4`, or `pnpm demo:sel4`.

## The QEMU incantation that matters

The `qemu_virt_aarch64` build ships in *hypervisor* config and must start at exception level **EL2**, so
the CPU and machine must support virtualization:

```
qemu-system-aarch64 -machine virt,virtualization=on -cpu cortex-a57 -m 2G \
  -nographic -serial mon:stdio -kernel loader.img
```

(With a plain `-cpu cortex-a53` it boots at EL1 and the loader aborts:
`seL4 configured as a hypervisor, but not in EL2`.)

## Honest caveats — what "verified" does and doesn't mean here

- **The proof covers the kernel, not our stack.** seL4's machine-checked theorems are about the
  *microkernel's* isolation. Our protection domain, the Microkit tooling, and everything above remain
  unverified. seL4 gives a *proven floor*; it does not verify the things standing on it (issue #4).
- **Dev-grade host.** qemu-aarch64 runs inside WSL2-on-Windows (long trust chain), and we use the
  *prebuilt* SDK rather than rebuilding the kernel from source + re-checking the proofs. This
  *demonstrates* the verified rung; it is not a hardened production deployment.
- **Emulated, not on real hardware.** Running under QEMU (TCG, no nested-KVM for aarch64 here), so this
  is functional proof of the rung, not a performance or bare-metal claim.
