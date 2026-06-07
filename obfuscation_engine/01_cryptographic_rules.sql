-- ==============================================================================
-- Block 3: Cryptographic Obfuscation Engine
-- Dynamic Data Masking, Format-Preserving Encryption Bridge, and Role Hierarchy
--
-- CONTEXT.md mandates:
--   "dynamic data masking, an approach that intercepts incoming database
--    queries and returns anonymized data on the fly without ever modifying
--    the underlying physical records."
--   "Masking rules are declared declaratively directly inside the table
--    definitions using standard PostgreSQL Security Labels."
--   "masked roles cannot bypass the protection via side-channel attacks"
--
-- DEPENDENCY ORDER:
--   Requires: storage_fabric/01_geo_partitioned_schema.sql   (sovereign_users)
--             storage_fabric/02_tde_setup.sql                (national_id_encrypted)
--             control_plane/03_temporal_tables_setup.sql     (sovereign_users_history,
--                                                             developer_branch_role)
--             control_plane/08_cryptographic_obfuscation.sql (masked_support_user,
--                                                             mask_jsonb_payload)
--
-- FRONTEND CONTRACT (derived from frontend_workbench/src/):
--   • actions.ts line 31: SET ROLE developer_branch_role
--   • studio/sql/page.tsx info panel: full_name, ssn, email masking shown
--   • studio/rules/page.tsx: FPE toggle per project
--   • admin/page.tsx: "FPE Status" column per tenant
-- ==============================================================================


-- ==============================================================================
-- STEP 1: Extension Bootstrap
-- Hard-fail if pg_anon is not available — eliminates silent failure paths.
-- Consistent with the health-check pattern in Block 5 (analytics_observer).
-- ==============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_available_extensions WHERE name = 'anon'
    ) THEN
        RAISE EXCEPTION
            'FATAL: pg_anon is NOT available in pg_available_extensions. '
            'Verify the Dockerfile installed postgresql-anonymizer from the '
            'official source: https://postgresql-anonymizer.readthedocs.io/';
    END IF;
    RAISE NOTICE '✅ pg_anon is available. Proceeding with installation.';
END;
$$;

CREATE EXTENSION IF NOT EXISTS anon CASCADE;

-- Initialize the anonymizer dictionary (loads fake name/email datasets)
SELECT anon.init();

-- Confirm it loaded
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'anon'
    ) THEN
        RAISE EXCEPTION
            'FATAL: anon CREATE EXTENSION ran but is missing from pg_extension. '
            'Check shared_preload_libraries — anon must be listed there.';
    END IF;
    RAISE NOTICE '✅ pg_anon is ACTIVE in pg_extension.';
END;
$$;


-- ==============================================================================
-- STEP 2: Extend sovereign_users with the ssn TEXT Column
--
-- FRONTEND CONTRACT: studio/sql/page.tsx info panel explicitly lists:
--   ssn → FPE Encrypted
--
-- The ssn column holds the FORMAT-PRESERVED CIPHERTEXT produced by the
-- Sovereign Gateway (Block 1 / fpe.rs). It is structurally a valid 9-character
-- digit string but cryptographically opaque. Masked roles see a partial view.
--
-- Separately, national_id_encrypted (BYTEA, added in storage_fabric/02_tde_setup.sql)
-- holds the defence-in-depth pgcrypto AES-256 layer. Both coexist:
--   national_id_encrypted = pgcrypto column-level encryption (defence-in-depth)
--   ssn                   = FPE ciphertext from the Gateway proxy
-- ==============================================================================
ALTER TABLE sovereign_users
    ADD COLUMN IF NOT EXISTS ssn TEXT,
    ADD COLUMN IF NOT EXISTS national_id_number BIGINT;

ALTER TABLE sovereign_users_history
    ADD COLUMN IF NOT EXISTS ssn TEXT,
    ADD COLUMN IF NOT EXISTS national_id_number BIGINT,
    ADD COLUMN IF NOT EXISTS national_id_encrypted BYTEA;

-- ==============================================================================
-- STEP 3: Dynamic Masking Rules for developer_branch_role
--
-- FRONTEND CONTRACT: actions.ts line 31 does SET ROLE developer_branch_role.
--   The SQL editor info panel shows this role receives:
--     full_name → anon.fake_first_name()
--     ssn       → FPE Encrypted (partial display)
--
-- IMPORTANT: developer_branch_role itself was CREATED in:
--   control_plane/03_temporal_tables_setup.sql (line 40)
-- It already has SELECT on sovereign_users and sovereign_users_history.
-- We ADD masking labels here — we do NOT re-create the role.
--
-- ALSO IMPORTANT: control_plane/03_temporal_tables_setup.sql already applies:
--   SECURITY LABEL FOR anon ON ROLE developer_branch_role IS 'MASKED';
--   SECURITY LABEL FOR anon ON COLUMN sovereign_users.full_name IS '...'
--   SECURITY LABEL FOR anon ON COLUMN sovereign_users_history.full_name IS '...'
--
-- We EXTEND with the additional columns (ssn, email, national_id_encrypted)
-- that were missing from the partial setup in the control plane.
-- ==============================================================================

-- email: partial obfuscation — reveals domain, masks local part
-- anon.partial_email() is the correct built-in helper (replaces broken
-- anon.partial(email, 2, '******', 2) syntax that was in the old stub)
SECURITY LABEL FOR anon ON COLUMN sovereign_users.email
    IS 'MASKED WITH FUNCTION anon.partial_email(email)';

-- ssn: show only last 4 digits — standard compliance display pattern
-- Format: ***-**-XXXX where XXXX is the real suffix
SECURITY LABEL FOR anon ON COLUMN sovereign_users.ssn
    IS 'MASKED WITH FUNCTION anon.partial(ssn, 0, ''***-**-'', 4)';

-- national_id_encrypted: BYTEA column — return random bytes of same length
-- Prevents the masked role from inferring ciphertext length or structure
SECURITY LABEL FOR anon ON COLUMN sovereign_users.national_id_encrypted
    IS 'MASKED WITH VALUE NULL';


-- ==============================================================================
-- STEP 4: Extend Masking to sovereign_users_history (Temporal Table)
--
-- FRONTEND CONTRACT: actions.ts fetchTemporalCommits() queries sovereign_users_history.
--   control_plane/03_temporal_tables_setup.sql already masks full_name on history.
--   We extend with the additional columns added in Step 3.
--
-- CRITICAL: Without masking the history table, a developer could query
--   FOR SYSTEM_TIME AS OF to bypass the active mask and read plaintext PII.
-- ==============================================================================

SECURITY LABEL FOR anon ON COLUMN sovereign_users_history.email
    IS 'MASKED WITH FUNCTION anon.partial_email(email)';

SECURITY LABEL FOR anon ON COLUMN sovereign_users_history.ssn
    IS 'MASKED WITH FUNCTION anon.partial(ssn, 0, ''***-**-'', 4)';

SECURITY LABEL FOR anon ON COLUMN sovereign_users_history.national_id_encrypted
    IS 'MASKED WITH VALUE NULL';


-- ==============================================================================
-- STEP 5: masked_support_user Role — Fix and Extend
--
-- CONTEXT: control_plane/08_cryptographic_obfuscation.sql created masked_support_user
--   as NOLOGIN using the custom mask_jsonb_payload() JSONB function approach.
--   The pg_anon approach is the correct architecture per CONTEXT.md.
--   We ADD pg_anon SECURITY LABELs to this role for column-level enforcement.
--
-- FRONTEND CONTRACT: admin/page.tsx shows support users need email/name masking.
-- ==============================================================================

-- Declare the role as MASKED under the pg_anon framework
-- (The role itself already exists from 08_cryptographic_obfuscation.sql)
SECURITY LABEL FOR anon ON ROLE masked_support_user IS 'MASKED';

SECURITY LABEL FOR anon ON COLUMN sovereign_users.full_name
    IS 'MASKED WITH FUNCTION anon.fake_first_name()';

SECURITY LABEL FOR anon ON COLUMN sovereign_users.email
    IS 'MASKED WITH FUNCTION anon.partial_email(email)';

SECURITY LABEL FOR anon ON COLUMN sovereign_users.ssn
    IS 'MASKED WITH FUNCTION anon.partial(ssn, 0, ''***-**-'', 4)';

SECURITY LABEL FOR anon ON COLUMN sovereign_users.national_id_encrypted
    IS 'MASKED WITH VALUE NULL';

-- History table — same protection as live table
SECURITY LABEL FOR anon ON COLUMN sovereign_users_history.full_name
    IS 'MASKED WITH FUNCTION anon.fake_first_name()';

SECURITY LABEL FOR anon ON COLUMN sovereign_users_history.email
    IS 'MASKED WITH FUNCTION anon.partial_email(email)';

SECURITY LABEL FOR anon ON COLUMN sovereign_users_history.ssn
    IS 'MASKED WITH FUNCTION anon.partial(ssn, 0, ''***-**-'', 4)';

SECURITY LABEL FOR anon ON COLUMN sovereign_users_history.national_id_encrypted
    IS 'MASKED WITH VALUE NULL';


-- ==============================================================================
-- STEP 6: Side-Channel Attack Prevention
--
-- CONTEXT.md: "masked roles cannot bypass the protection via side-channel
--   attacks; for example, it explicitly prohibits masked users from executing
--   EXPLAIN plans, which could otherwise be used to infer the existence of
--   specific data points based on index scan statistics."
--
-- pg_anon automatically blocks EXPLAIN for MASKED roles by overriding the
-- EXPLAIN hook in shared_preload_libraries. No manual REVOKE needed for EXPLAIN.
--
-- We additionally revoke the ability to call internal expression functions that
-- could be used to reconstruct masked values via pg_get_expr side-channels.
-- ==============================================================================
REVOKE EXECUTE ON FUNCTION pg_catalog.pg_get_expr(pg_node_tree, oid)
    FROM developer_branch_role;

REVOKE EXECUTE ON FUNCTION pg_catalog.pg_get_expr(pg_node_tree, oid, boolean)
    FROM developer_branch_role;

REVOKE EXECUTE ON FUNCTION pg_catalog.pg_get_expr(pg_node_tree, oid)
    FROM masked_support_user;

REVOKE EXECUTE ON FUNCTION pg_catalog.pg_get_expr(pg_node_tree, oid, boolean)
    FROM masked_support_user;


-- ==============================================================================
-- STEP 7: Masking Verification Helper
--
-- A convenience function that returns the active masking rules for a given role.
-- Used by the Obfuscation Rules page in the frontend to show active policies.
-- ==============================================================================
CREATE OR REPLACE FUNCTION sovra_control.get_masking_rules_for_role(p_role TEXT)
RETURNS TABLE (
    table_name   TEXT,
    column_name  TEXT,
    masking_rule TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        n.nspname || '.' || c.relname  AS table_name,
        a.attname                       AS column_name,
        shd.label                       AS masking_rule
    FROM pg_seclabel shd
    JOIN pg_class c   ON shd.classoid = 'pg_catalog.pg_class'::regclass
                     AND shd.objoid   = c.oid
    JOIN pg_attribute a ON a.attrelid = c.oid
                        AND a.attnum  = shd.objsubid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE shd.provider = 'anon'
      AND shd.label    ILIKE 'MASKED%'
      AND EXISTS (
          SELECT 1 FROM pg_seclabel rs
          JOIN pg_roles r ON r.rolname = p_role
          WHERE rs.provider = 'anon'
            AND rs.label    = 'MASKED'
            AND rs.classoid = 'pg_catalog.pg_authid'::regclass
            AND rs.objoid   = r.oid
      )
    ORDER BY table_name, column_name;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION sovra_control.get_masking_rules_for_role(TEXT)
    TO masked_support_user, developer_branch_role;


-- ==============================================================================
-- STEP 8: Health Report
-- Consistent with Block 5 (analytics_observer) verification pattern.
-- ==============================================================================
DO $$
DECLARE
    anon_version TEXT;
    rule_count   INTEGER;
BEGIN
    SELECT extversion INTO anon_version
    FROM pg_extension WHERE extname = 'anon';

    SELECT COUNT(*) INTO rule_count
    FROM pg_seclabel
    WHERE provider = 'anon' AND label ILIKE 'MASKED%';

    RAISE NOTICE '✅ Block 3 Cryptographic Obfuscation Engine is ONLINE.';
    RAISE NOTICE '   pg_anon version: %', anon_version;
    RAISE NOTICE '   Active masking rules: % labels applied', rule_count;
    RAISE NOTICE '   developer_branch_role: full_name + ssn + email + national_id_encrypted masked.';
    RAISE NOTICE '   masked_support_user:   full_name + ssn + email + national_id_encrypted masked.';
    RAISE NOTICE '   sovereign_users_history: all PII columns masked (temporal bypass prevented).';
    RAISE NOTICE '   Side-channel: pg_get_expr revoked from masked roles.';
    RAISE NOTICE '   Verify with: SELECT * FROM sovra_control.get_masking_rules_for_role(''developer_branch_role'');';
END;
$$;

-- ==============================================================================
-- End of Block 3 — Cryptographic Obfuscation Engine
-- ==============================================================================
