/*
 * Aegis tool as an seL4 Microkit protection domain — the VERIFIED isolation rung.
 *
 * This runs as a confined component on the formally-verified seL4 microkernel. It is the untrusted
 * tool: on init it reads its request (baked into the image as REQ/REQ_LEN by the host), lowercases it
 * (mirroring every other rung — process / Docker / gVisor / microVM), and prints "RESULT:<lower>" to
 * the debug console. The host boots the image, reads that line, and wraps the whole thing as an Aegis
 * capability.
 *
 * Why this rung is different: seL4 is a separation kernel with machine-checked proofs of isolation, so
 * the confinement here is *proven*, not merely structural. The PD has exactly the authority Microkit's
 * static system description grants it — nothing ambient.
 */
#include <stdint.h>
#include <microkit.h>
#include "aegis_req.h" /* host-generated: static const unsigned char REQ[]; #define REQ_LEN N */

void init(void)
{
    char buf[REQ_LEN + 1];
    for (unsigned i = 0; i < REQ_LEN; i++) {
        char c = (char)REQ[i];
        if (c >= 'A' && c <= 'Z') c = (char)(c + 32);
        buf[i] = c;
    }
    buf[REQ_LEN] = '\0';

    microkit_dbg_puts("RESULT:");
    microkit_dbg_puts(buf);
    microkit_dbg_puts("\n");
}

void notified(microkit_channel ch)
{
    (void)ch;
}
