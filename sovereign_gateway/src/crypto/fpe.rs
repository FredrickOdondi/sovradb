use sha2::{Sha256, Digest};

const ROUNDS: usize = 9;

/// The Pseudo-Random Function for the Feistel Network.
/// Takes the Right half (`u16`), a round index, and a master key.
/// Returns a 16-bit hash value to XOR against the Left half.
fn feistel_round_function(r: u16, round_idx: u8, key: &[u8]) -> u16 {
    let mut hasher = Sha256::new();
    hasher.update(key);
    hasher.update(&[round_idx]);
    hasher.update(&r.to_be_bytes());
    let result = hasher.finalize();
    // Use the first 2 bytes of the SHA-256 hash as the PRF output
    u16::from_be_bytes([result[0], result[1]])
}

/// A single pass of the balanced 32-bit (16L, 16R) Feistel block cipher.
fn feistel_encrypt(mut val: u32, key: &[u8]) -> u32 {
    let mut l = (val >> 16) as u16;
    let mut r = (val & 0xFFFF) as u16;

    for i in 0..ROUNDS {
        let f_out = feistel_round_function(r, i as u8, key);
        let next_l = r;
        let next_r = l ^ f_out;
        l = next_l;
        r = next_r;
    }

    ((l as u32) << 16) | (r as u32)
}

/// Decrypts a single pass of the Feistel block cipher by running rounds in reverse.
fn feistel_decrypt(mut val: u32, key: &[u8]) -> u32 {
    let mut l = (val >> 16) as u16;
    let mut r = (val & 0xFFFF) as u16;

    for i in (0..ROUNDS).rev() {
        let next_r = l;
        let f_out = feistel_round_function(next_r, i as u8, key);
        let next_l = r ^ f_out;
        l = next_l;
        r = next_r;
    }

    ((l as u32) << 16) | (r as u32)
}

/// Encrypts a numeric value strictly within a domain `[0, domain_size - 1]`
/// using Format-Preserving Encryption via Cycle-Walking.
/// 
/// For example, a 9-digit SSN has a domain size of 1,000,000,000.
pub fn encrypt(plaintext: u32, domain_size: u32, key: &[u8]) -> Result<u32, &'static str> {
    if plaintext >= domain_size {
        return Err("Plaintext is outside the bounds of the domain size");
    }

    let mut current = plaintext;
    loop {
        current = feistel_encrypt(current, key);
        if current < domain_size {
            return Ok(current);
        }
    }
}

/// Decrypts a cycle-walked ciphertext strictly back into its original plaintext domain.
pub fn decrypt(ciphertext: u32, domain_size: u32, key: &[u8]) -> Result<u32, &'static str> {
    if ciphertext >= domain_size {
        return Err("Ciphertext is outside the bounds of the domain size");
    }

    let mut current = ciphertext;
    loop {
        current = feistel_decrypt(current, key);
        if current < domain_size {
            return Ok(current);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fpe_cycle_walking() {
        let key = b"SuperSecretGatewayKey";
        let domain_size = 1_000_000_000; // 9-digit SSN bounds
        
        let original_ssn = 123456789;
        let encrypted = encrypt(original_ssn, domain_size, key).expect("Encryption failed");
        
        // Assert it strictly stays within the exact domain bounds
        assert!(encrypted < domain_size, "Ciphertext exceeded domain!");
        
        // Assert avalanche/encryption worked (not the same)
        assert_ne!(original_ssn, encrypted, "Ciphertext is identical to plaintext");
        
        // Test reversibility
        let decrypted = decrypt(encrypted, domain_size, key).expect("Decryption failed");
        assert_eq!(original_ssn, decrypted, "Decryption failed to reverse cipher");
    }
    
    #[test]
    fn test_out_of_bounds_validation() {
        let key = b"Key";
        let domain_size = 1_000_000_000;
        let out_of_bounds = 1_000_000_001;
        assert!(encrypt(out_of_bounds, domain_size, key).is_err());
        assert!(decrypt(out_of_bounds, domain_size, key).is_err());
    }
}
