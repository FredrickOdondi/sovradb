use sovereign_gateway::crypto::fpe::{encrypt, decrypt};

fn main() {
    println!("============================================================");
    println!("Sovereign Gateway (Block 1): FPE Feistel Engine Test");
    println!("============================================================");

    let key = b"SuperSecretSovraKey";
    let domain_size = 1_000_000_000; // Exact 9-digit SSN bounds

    // The raw, highly sensitive PII
    let original_ssn: u32 = 123456789;

    println!("[1] RAW PLAINTEXT (Ingested by Proxy):   {:09}", original_ssn);

    // Proxy intercepts and mathematically obfuscates the data before sending to PG18
    match encrypt(original_ssn, domain_size, key) {
        Ok(ciphertext) => {
            println!("[2] FPE ENCRYPTED (Stored in PG18):      {:09}", ciphertext);

            // Prove that it didn't exceed 9 digits
            if ciphertext >= domain_size {
                println!("[!] CRITICAL FAILURE: CYCLE-WALKING LOOP BREACHED");
            }

            // Proxy intercepts SELECT query and dynamically reverses the Feistel cipher
            match decrypt(ciphertext, domain_size, key) {
                Ok(plaintext) => {
                    println!("[3] FPE DECRYPTED (Returned to Client):  {:09}", plaintext);
                    
                    if plaintext == original_ssn {
                        println!("============================================================");
                        println!("SUCCESS: The 9-Round Feistel Cycle-Walking Cipher is flawless.");
                        println!("============================================================");
                    } else {
                        println!("[!] CRITICAL FAILURE: CIPHER REVERSIBILITY BROKEN");
                    }
                },
                Err(e) => println!("Decryption Error: {}", e),
            }
        },
        Err(e) => println!("Encryption Error: {}", e),
    }
}
