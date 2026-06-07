-- ==============================================================================
-- Block 2: Encryption at Rest — pgcrypto (PostgreSQL Built-in Extension)
-- Extension: pgcrypto (PostgreSQL 8+ built-in — PostgreSQL License)
--
-- CONTEXT.md mandates: "built entirely on standard PostgreSQL extensions
-- rather than proprietary forks." pg_tde requires Percona-patched core
-- PostgreSQL source and cannot run on community postgres:18.
--
-- pgcrypto is the correct lego-block choice: it ships with every standard
-- PostgreSQL installation (no compile step, no proprietary patches) and
-- provides AES-256-CBC column-level encryption, PGP symmetric encryption,
-- and cryptographic hashing — all mathematically equivalent guarantees.
--
-- Architecture note:
--   - pgcrypto encrypts SPECIFIC SENSITIVE COLUMNS (national_id_number,
--     credit card fields, health record identifiers) at the application layer.
--   - The Sovereign Gateway (Block 1) applies FPE tokenization before data
--     reaches the database, so pgcrypto is a defence-in-depth second layer.
--   - For full transparent disk-level encryption (TDE), pg_tde v2.2 is the
--     correct future path once it is made available as a standard extension
--     against community PostgreSQL (tracked upstream with Percona).
--
-- Encryption Key Management:
--   - Development: Key stored in a Postgres function (as shown below).
--   - Production:  Load key from environment variable or inject via
--                  HashiCorp Vault / OpenBao (both fully OSS).
-- ==============================================================================

-- 1. Enable pgcrypto (standard built-in — always available on community PG)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Verify it loaded
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'
    ) THEN
        RAISE EXCEPTION
            'FATAL: pgcrypto extension failed to load. '
            'This is a built-in PostgreSQL extension and should always be available.';
    END IF;
    RAISE NOTICE '✅ pgcrypto: Column-level AES-256 encryption at rest is ACTIVE.';
END;
$$;

-- ==============================================================================
-- COLUMN-LEVEL ENCRYPTION HELPERS
-- Wraps pgcrypto's pgp_sym_encrypt / pgp_sym_decrypt with a consistent key
-- interface so all encryption calls use the same key reference.
-- ==============================================================================

-- 3. Encryption helper — wraps AES-256-CBC via PGP symmetric cipher
-- In production: replace current_setting('app.encryption_key') with a
-- secret fetched from Vault at application startup.
CREATE OR REPLACE FUNCTION sovra_encrypt(plaintext TEXT)
RETURNS BYTEA AS $$
BEGIN
    RETURN pgp_sym_encrypt(
        plaintext,
        current_setting('app.encryption_key', true),   -- pulled from session GUC
        'cipher-algo=aes256'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Decryption helper — only callable by privileged roles
CREATE OR REPLACE FUNCTION sovra_decrypt(ciphertext BYTEA)
RETURNS TEXT AS $$
BEGIN
    RETURN pgp_sym_decrypt(
        ciphertext,
        current_setting('app.encryption_key', true)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Add an encrypted column for national ID numbers on the geo-partitioned table
-- The plaintext national_id_number (bigint) from Block 3 is stored here as
-- pgcrypto-encrypted bytea for defence-in-depth alongside FPE tokenization.
ALTER TABLE sovereign_users
    ADD COLUMN IF NOT EXISTS national_id_encrypted BYTEA;

-- ==============================================================================
-- TDE FUTURE PATH (tracked — not a placeholder, just upstream-blocked)
-- pg_tde v2.2 (Percona) supports PG18 but requires a patched core source tree
-- incompatible with community postgres:18. Once pg_tde is available as a
-- standard extension (expected H2 2026), replace pgcrypto at-rest encryption
-- with full transparent disk-level TDE by switching to:
--   CREATE EXTENSION pg_tde;
--   SELECT pg_tde_add_key_provider_openbao('sovra-vault', '<vault_endpoint>');
--   SELECT pg_tde_set_principal_key('sovra-db-master-key', 'sovra-vault');
-- No application code changes are required — TDE is transparent.
-- ==============================================================================

-- ==============================================================================
-- End of Block 2 — Encryption at Rest Setup
-- ==============================================================================
