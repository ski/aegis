# Aegis Firecracker rung

The **production microVM** rung: an untrusted tool running inside a [Firecracker](https://firecracker-microvm.github.io/)
microVM — the minimal KVM VMM behind AWS Lambda and Fargate — wrapped as an Aegis capability. Driven by
[`../src/firecracker-tool.ts`](../src/firecracker-tool.ts) / [`pnpm demo:firecracker`](../src/demo-firecracker.ts).

Same hardware-virtualization isolation as the QEMU [`../microvm/`](../microvm/) rung (own guest kernel),
but Firecracker is the VMM the design names: tiny device model (virtio-over-MMIO, no BIOS/PCI),
millisecond boots, built for exactly this "confine an untrusted workload in a throwaway VM" job.

## What's here

| File | Role |
| --- | --- |
| `guest-init.c` | the guest's PID 1 — reads its request from the kernel cmdline (`aegis_req=<hex>`), lowercases it, prints `RESULT:` to the console, drains, powers off. |
| `build.sh` | compiles `guest-init.c` statically + packs an initramfs (python, no `cpio`). Zero downloads. |
| `run.sh` | boots one Firecracker microVM via `--no-api --config-file` (declarative JSON), captures the console to a file, extracts `RESULT:`. |

Build artifacts (`init`, `initramfs.cpio.gz`) are gitignored.

## One-time setup (in WSL2 / Linux)

```bash
# firecracker binary
cd /tmp && wget https://github.com/firecracker-microvm/firecracker/releases/download/v1.15.1/firecracker-v1.15.1-x86_64.tgz
tar xzf firecracker-v1.15.1-x86_64.tgz && sudo cp release-*/firecracker-v1.15.1-x86_64 /usr/local/bin/firecracker

# a Firecracker-compatible uncompressed vmlinux (its CI kernel), placed at ~/fc/vmlinux
mkdir -p ~/fc && cd ~/fc
wget -O vmlinux https://s3.amazonaws.com/spec.ccfc.min/firecracker-ci/v1.11/x86_64/vmlinux-6.1.102

# build the guest artifacts
bash kernel/firecracker/build.sh
```

Then: `echo "Hello From Firecracker" | bash kernel/firecracker/run.sh` → `hello from firecracker`,
or `pnpm demo:firecracker`.

## Notes from getting it working

- **Firecracker needs an uncompressed ELF `vmlinux`**, not a bzImage. (We tried reusing the WSL2 kernel
  via `extract-vmlinux`; it wouldn't decompress, so we use Firecracker's published CI kernel.)
- **Capture the console to a file, not a pipe.** Firecracker's stdout behaves differently off a tty, and
  the guest powers off immediately after printing — so `run.sh` redirects the console to a file and the
  guest `fsync()`s + briefly spins before `reboot()` to let the last line drain. Without both, the
  `RESULT:` line was intermittently lost.

## Honest caveat

On this machine Firecracker runs inside WSL2 (where `/dev/kvm` lives), so the trust chain is long:
**Windows → Hyper-V → WSL2 → nested KVM → Firecracker** — a dev-grade demonstration of the production
VMM, not a production substrate. The real target is a Linux box with direct KVM (ADR 0001).
