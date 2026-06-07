# sovereign_gateway — SUPERSEDED

This crate has been **superseded** by the `fpe` module inside `gateway/src/fpe.rs`.

## What was here

A hand-rolled 9-round Feistel Format-Preserving Encryption cipher (`src/crypto/fpe.rs`, 115 lines).

## Why it was replaced

1. **Not a lego block** — it was custom cryptographic code. CONTEXT.md mandates "FPE open-source libraries like permuteseq", not hand-written Feistel ciphers.
2. **Disconnected island** — this crate had no `[dependencies]` connection to `gateway/`. The FPE engine could never actually be called from the proxy.
3. **Non-standard algorithm** — the hand-rolled Feistel was unstandardized. The replacement uses **NIST SP 800-38G FF1** via the `fpe` crate (Apache-2.0).

## Replacement

See [`gateway/src/fpe.rs`](../gateway/src/fpe.rs):
- Uses `fpe = "0.4"` (crates.io) — NIST FF1 / AES-256
- Provides `FpeCipher::encrypt_ssn()` and `FpeCipher::encrypt_pan()`
- Fully integrated into `proxy.rs` via `use crate::fpe::FpeCipher`
- Round-trip tests pass with the same guarantees

This directory can be safely removed or archived.
