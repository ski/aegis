# Aegis microVM rung

The strongest isolation rung in the kernel: an untrusted tool running inside a **hardware-virtualized
guest** (its own kernel, isolated by KVM), wrapped as an Aegis capability. Driven by
[`../src/microvm-tool.ts`](../src/microvm-tool.ts) / [`pnpm demo:microvm`](../src/demo-microvm.ts).

Isolation ladder: child process (shared kernel) < Docker (namespaces) < gVisor (user-kernel) <
**microVM (own guest kernel via KVM)**.

## What's here

| File | Role |
| --- | --- |
| `guest-init.c` | the guest's PID 1 — the untrusted tool. Reads its request from the kernel cmdline (`aegis_req=<hex>`), lowercases it, writes `RESULT:` to the serial console, powers off. |
| `build.sh` | compiles `guest-init.c` statically, packs an initramfs (python, no `cpio` needed), copies the WSL2 kernel as the guest kernel. **Zero downloads.** |
| `run.sh` | boots the microVM for one request/response (`echo "Hi" \| ./run.sh`). |

Build artifacts (`init`, `initramfs.cpio.gz`, `guest-kernel`) are gitignored — rebuild them.

## Build + run (inside WSL2)

```bash
bash kernel/microvm/build.sh
echo "Hello From The MicroVM" | bash kernel/microvm/run.sh   # -> hello from the microvm
```

Then from the kernel (Windows or WSL): `pnpm demo:microvm`.

## The guest's only channels

No network device, no disk, no shared filesystem. The request enters via the **kernel command line**
(hex-encoded, decoded from `/proc/cmdline` — deterministic, no serial-input race) and the response
leaves via the **serial console**. That serial line is the capability boundary, at
hardware-virtualization strength. A fresh VM boots per call, so no state survives between invocations.

## Honest caveat

On this machine the VM runs inside WSL2 (where `/dev/kvm` + QEMU live), so the trust chain is long:
**Windows → Hyper-V → WSL2 → nested KVM → QEMU**. That makes this a genuine, demonstrable microVM rung
for *development and proof* — but **not** a production substrate. The real target is a Linux box with
direct KVM (and eventually the seL4 floor), per [ADR 0001](../../docs/decisions/0001-substrate.md).
