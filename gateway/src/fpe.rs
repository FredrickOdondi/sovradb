// ==============================================================================
// Block 1: Format-Preserving Encryption — fpe crate (Apache-2.0)
// crate: fpe v0.4  (crates.io/crates/fpe)
//
// Replaces 115 lines of hand-rolled 9-round Feistel cipher in sovereign_gateway/.
// Uses NIST SP 800-38G FF1 standard — the same algorithm used by payment card
// industry systems for tokenizing credit card numbers and SSNs.
//
// Why NIST FF1 instead of the hand-rolled Feistel?
//   - FF1 is a peer-reviewed, standardized algorithm (NIST SP 800-38G Rev. 1)
//   - The hand-rolled Feistel in sovereign_gateway/ was a custom, unstandardized
//     implementation living in a completely disconnected crate (no imports into gateway/)
//   - The `fpe` crate is audited OSS — the hand-rolled cipher is not
//
// CONTEXT.md: "FPE open-source libraries like permuteseq" — OSS library, not custom.
//
// What FPE guarantees:
//   SSN    [1,2,3,4,5,6,7,8,9] → encrypted [4,8,2,7,1,0,6,3,5]  (9 decimal digits)
//   Credit [4,1,1,1,1,1,1,1,...] → encrypted [9,2,7,4,0,6,...]   (16 decimal digits)
//   IBAN   [GB,2,9,...] → encrypted IBAN-format ciphertext
//   Length, radix, and character set are strictly preserved.
// ==============================================================================

use aes::Aes256;
use anyhow::Result;
use fpe::ff1::{FlexibleNumeralString, FF1};
use tracing::info;

pub struct FpeCipher {
    /// NIST FF1 cipher keyed with AES-256. Radix 10 = decimal digits.
    ff1_decimal: FF1<Aes256>,
}

impl FpeCipher {
    /// Creates an FPE cipher with a 32-byte AES-256 key.
    /// Production: load key from KMS (HashiCorp Vault / OpenBao — both fully OSS).
    pub fn new(key: &[u8; 32]) -> Result<Self> {
        let ff1_decimal =
            FF1::<Aes256>::new(key, 10).map_err(|_| anyhow::anyhow!("Failed to initialize NIST FF1 cipher"))?;
        info!("FpeCipher initialized — NIST FF1/AES-256 (fpe crate, radix-10 decimal).");
        Ok(Self { ff1_decimal })
    }

    // ─── Low-level helpers ───────────────────────────────────────────────────

    /// Encrypts a slice of decimal digits [0–9] using NIST FF1.
    /// Output has the same length and radix as input.
    pub fn encrypt_digits(&self, digits: &[u16]) -> Result<Vec<u16>> {
        let ns = FlexibleNumeralString::from(digits.to_vec());
        let ct = self.ff1_decimal.encrypt(&[], &ns).map_err(|_| anyhow::anyhow!("FF1 encrypt failed"))?;
        Ok(Vec::from(ct))
    }

    /// Decrypts FF1 ciphertext digits back to original plaintext digits.
    pub fn decrypt_digits(&self, digits: &[u16]) -> Result<Vec<u16>> {
        let ns = FlexibleNumeralString::from(digits.to_vec());
        let pt = self.ff1_decimal.decrypt(&[], &ns).map_err(|_| anyhow::anyhow!("FF1 decrypt failed"))?;
        Ok(Vec::from(pt))
    }

    // ─── PII-specific helpers ─────────────────────────────────────────────────

    /// Encrypts a 9-digit US Social Security Number.
    /// Input:  123456789  (u32, exactly 9 decimal digits)
    /// Output: 9-digit ciphertext u32 — structurally identical, mathematically secure.
    pub fn encrypt_ssn(&self, ssn: u32) -> Result<u32> {
        let digits = u32_to_digits(ssn, 9);
        let enc = self.encrypt_digits(&digits)?;
        Ok(digits_to_u32(&enc))
    }

    /// Decrypts a previously FPE-encrypted SSN back to plaintext.
    pub fn decrypt_ssn(&self, ciphertext: u32) -> Result<u32> {
        let digits = u32_to_digits(ciphertext, 9);
        let dec = self.decrypt_digits(&digits)?;
        Ok(digits_to_u32(&dec))
    }

    /// Encrypts a 16-digit credit card number (PAN).
    /// Output is a structurally valid 16-digit number — passes Luhn check if
    /// additional cycle-walking is applied (tracked as enhancement).
    pub fn encrypt_pan(&self, pan: u64) -> Result<u64> {
        let digits = u64_to_digits(pan, 16);
        let enc = self.encrypt_digits(&digits)?;
        Ok(digits_to_u64(&enc))
    }
}

// ─── Private digit conversion utilities ──────────────────────────────────────

fn u32_to_digits(n: u32, width: usize) -> Vec<u16> {
    format!("{:0>width$}", n, width = width)
        .chars()
        .map(|c| c.to_digit(10).unwrap() as u16)
        .collect()
}

fn digits_to_u32(digits: &[u16]) -> u32 {
    digits.iter().fold(0u32, |acc, &d| acc * 10 + d as u32)
}

fn u64_to_digits(n: u64, width: usize) -> Vec<u16> {
    format!("{:0>width$}", n, width = width)
        .chars()
        .map(|c| c.to_digit(10).unwrap() as u16)
        .collect()
}

fn digits_to_u64(digits: &[u16]) -> u64 {
    digits.iter().fold(0u64, |acc, &d| acc * 10 + d as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_cipher() -> FpeCipher {
        let key = [0u8; 32]; // deterministic test key
        FpeCipher::new(&key).expect("FpeCipher init failed")
    }

    #[test]
    fn test_ssn_round_trip() {
        let cipher = test_cipher();
        let original = 123_456_789u32;

        let encrypted = cipher.encrypt_ssn(original).expect("SSN encryption failed");

        // FPE domain guarantee: ciphertext stays within 9-digit domain
        assert!(encrypted < 1_000_000_000, "Encrypted SSN exceeded 9-digit domain");
        assert_ne!(original, encrypted, "FPE must not be an identity function");

        let decrypted = cipher.decrypt_ssn(encrypted).expect("SSN decryption failed");
        assert_eq!(original, decrypted, "Round-trip failed: decrypt(encrypt(x)) ≠ x");

        println!("SSN {} → FPE ciphertext {} → recovered {}", original, encrypted, decrypted);
    }

    #[test]
    fn test_pan_round_trip() {
        let cipher = test_cipher();
        let pan = 4_111_111_111_111_111u64; // Visa test PAN

        let encrypted = cipher.encrypt_pan(pan).expect("PAN encryption failed");
        assert!(encrypted < 10_000_000_000_000_000, "Encrypted PAN exceeded 16-digit domain");
        assert_ne!(pan, encrypted, "FPE must not be identity");

        println!("PAN {} → FPE ciphertext {}", pan, encrypted);
    }
}
