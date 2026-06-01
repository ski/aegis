/*
 * guest-init — PID 1 inside the Aegis microVM (substrate phase 2, the microVM rung).
 *
 * This runs as the ONLY userspace process in a hardware-virtualized guest (its own kernel, isolated by
 * KVM). It is the untrusted tool: it reads its request DETERMINISTICALLY from the kernel command line
 * (/proc/cmdline, after an "aegis_req=" marker — no serial-input timing race), performs a trivial pure
 * transform (uppercase → lowercase, mirroring demo:docker / demo:isolation), writes one response line
 * to the serial console, then powers the VM off. The host wraps this whole boot as an Aegis capability.
 *
 * The guest has no network device, no disk, no shared filesystem — its ONLY channels are the kernel
 * cmdline (request in) and the serial line (response out). That is the capability boundary, now at
 * hardware-virtualization strength.
 *
 * Encoding: the host hex-encodes the request into aegis_req=<hex> so spaces/specials survive the cmdline.
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
    wr("AEGIS-MICROVM-READY\n", 20);

    /* mount /proc so /proc/cmdline is readable (bare initramfs has nothing mounted) */
    mkdir("/proc", 0555);
    mount("proc", "/proc", "proc", 0, 0);

    /* read the whole kernel command line */
    char cmd[4096];
    int n = 0;
    int fd = open("/proc/cmdline", O_RDONLY);
    if (fd >= 0) { n = (int)read(fd, cmd, sizeof(cmd) - 1); close(fd); }
    if (n < 0) n = 0;
    cmd[n] = '\0';

    /* find "aegis_req=" and hex-decode the token after it (until space/newline/end) */
    const char *marker = "aegis_req=";
    int mlen = 10;
    char buf[1024];
    int len = 0;
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

    /* the "tool": lowercase the request */
    for (int i = 0; i < len; i++) {
        if (buf[i] >= 'A' && buf[i] <= 'Z') buf[i] = (char)(buf[i] + 32);
    }

    wr("RESULT:", 7);
    wr(buf, (unsigned)len);
    wr("\n", 1);

    /* power off the VM — clean shutdown, the boot is one request/response */
    sync();
    reboot(LINUX_REBOOT_CMD_POWER_OFF);
    for (;;) pause();
    return 0;
}
