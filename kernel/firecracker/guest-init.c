/*
 * guest-init — PID 1 inside the Aegis Firecracker microVM (substrate phase 2, the production VMM).
 *
 * Firecracker is the minimal KVM-based VMM behind AWS Lambda — same isolation idea as the QEMU microVM
 * rung, but the VMM the design names. This init is the untrusted tool: it reads its request from the
 * kernel cmdline (aegis_req=<hex>, decoded from /proc/cmdline — deterministic, no serial race),
 * lowercases it, writes RESULT: to the console, and powers the VM off.
 *
 * The guest has no network device, no extra disks, no shared filesystem — only the kernel cmdline
 * (request in) and the console (response out). That is the capability boundary, at Firecracker-grade
 * hardware-virtualization isolation.
 */
#include <unistd.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <sys/mount.h>
#include <sys/reboot.h>
#include <linux/reboot.h>

static void wr(const char *s, unsigned n) { (void)write(1, s, n); }
static int hexval(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
}

int main(void) {
    wr("AEGIS-FIRECRACKER-READY\n", 24);

    mkdir("/proc", 0555);
    mount("proc", "/proc", "proc", 0, 0);

    char cmd[4096];
    int n = 0;
    int fd = open("/proc/cmdline", O_RDONLY);
    if (fd >= 0) { n = (int)read(fd, cmd, sizeof(cmd) - 1); close(fd); }
    if (n < 0) n = 0;
    cmd[n] = '\0';

    const char *marker = "aegis_req=";
    int mlen = 10, len = 0;
    char buf[1024];
    for (int i = 0; i + mlen <= n; i++) {
        int match = 1;
        for (int j = 0; j < mlen; j++) if (cmd[i + j] != marker[j]) { match = 0; break; }
        if (!match) continue;
        int p = i + mlen;
        while (p + 1 < n && len < (int)sizeof(buf) - 1) {
            int hi = hexval(cmd[p]), lo = hexval(cmd[p + 1]);
            if (hi < 0 || lo < 0) break;
            buf[len++] = (char)((hi << 4) | lo);
            p += 2;
        }
        break;
    }

    for (int i = 0; i < len; i++) {
        if (buf[i] >= 'A' && buf[i] <= 'Z') buf[i] = (char)(buf[i] + 32);
    }

    wr("RESULT:", 7);
    wr(buf, (unsigned)len);
    wr("\n", 1);

    /* let the serial console drain before powering off (avoids truncating the last line) */
    fsync(1);
    for (volatile unsigned long i = 0; i < 50000000UL; i++) { }

    sync();
    reboot(LINUX_REBOOT_CMD_POWER_OFF);
    for (;;) pause();
    return 0;
}
