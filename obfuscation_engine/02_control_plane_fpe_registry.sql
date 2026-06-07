-- ==============================================================================
-- Block 3: Cryptographic Obfuscation Engine — Control Plane FPE Registry
--
-- This script wires the Obfuscation Engine into the sovra_control schema,
-- creating the data structures that power the frontend admin and studio pages.
--
-- FRONTEND CONTRACT (derived from frontend_workbench/src/):
--   • admin/page.tsx: "FPE Status" column in the tenant database table
--       → sovra_control.projects.fpe_enabled BOOLEAN
--
--   • studio/tables/page.tsx: per-column FPE toggle in the "Create Table" dialog
--       → sovra_control.fpe_column_policies table
--
--   • admin/vaults/page.tsx: "NIST FF1 keys actively rotating across all
--     1,284 tenant workspaces"
--       → sovra_control.fpe_key_rotations audit table
--
--   • studio/rules/page.tsx: Format-Preserving Encryption card showing
--     "Disabled/Enabled" status
--       → reads fpe_enabled from sovra_control.projects
--
-- DEPENDENCY ORDER:
--   Requires: control_plane/05_sovra_control_schema.sql (sovra_control.projects)
--             obfuscation_engine/01_cryptographic_rules.sql (anon extension active)
-- ==============================================================================


-- ==============================================================================
-- STEP 1: Add fpe_enabled flag to sovra_control.projects
--
-- FRONTEND CONTRACT: admin/page.tsx renders an "FPE Status" column that shows
--   Enabled (orange shield icon) or Disabled per tenant project.
--   studio/rules/page.tsx shows the FPE card as "Disabled" when this is false.
--
-- The Sovereign Gateway (Block 1 / gateway/src/fpe.rs) reads this flag via
-- the API role to decide whether to apply NIST FF1 tokenization on INSERT
-- queries for this tenant's connection.
-- ==============================================================================
ALTER TABLE sovra_control.projects
    ADD COLUMN IF NOT EXISTS fpe_enabled      BOOLEAN   NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS fpe_enabled_at   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS fpe_key_version  INTEGER   NOT NULL DEFAULT 1;

COMMENT ON COLUMN sovra_control.projects.fpe_enabled IS
    'When true, the Sovereign Gateway applies NIST FF1 Format-Preserving '
    'Encryption to all FPE-tagged columns before writing to the storage fabric. '
    'Toggled from studio/rules FPE card. Defaults to false (plaintext storage).';

COMMENT ON COLUMN sovra_control.projects.fpe_key_version IS
    'Monotonically increasing key version. Incremented on every key rotation. '
    'The Sovereign Gateway uses this to select the correct AES key material '
    'from the in-memory key store.';


-- ==============================================================================
-- STEP 2: sovra_control.fpe_column_policies
--
-- FRONTEND CONTRACT: studio/tables/page.tsx "Create Table" dialog has a per-
--   column FPE toggle (the orange "FPE" button). When a tenant marks a column
--   as FPE, this table records which columns the Gateway should tokenize.
--
-- The Sovereign Gateway reads this table at connection startup to build
-- its per-tenant tokenization config (which columns → which FPE type).
--
-- fpe_type options:
--   FF1_NUMERIC  — numeric strings (SSN, card numbers, national IDs)
--   FF1_ALPHA    — alphanumeric strings (reference codes, usernames)
--   IP_PSEUDONYM — IP address fields (ASN-preserving via ipcrypt-rs)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS sovra_control.fpe_column_policies (
    id           UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id   UUID        NOT NULL
                             REFERENCES sovra_control.projects(id)
                             ON DELETE CASCADE,
    table_name   TEXT        NOT NULL
                             CHECK (table_name ~ '^[a-z][a-z0-9_]*$'),
    column_name  TEXT        NOT NULL
                             CHECK (column_name ~ '^[a-z][a-z0-9_]*$'),
    fpe_type     TEXT        NOT NULL DEFAULT 'FF1_NUMERIC'
                             CHECK (fpe_type IN ('FF1_NUMERIC', 'FF1_ALPHA', 'IP_PSEUDONYM')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by   TEXT        NOT NULL DEFAULT current_user,

    -- Composite unique constraint: one policy per (project, table, column)
    UNIQUE (project_id, table_name, column_name)
);

COMMENT ON TABLE sovra_control.fpe_column_policies IS
    'Records which columns the Sovereign Gateway should apply Format-Preserving '
    'Encryption to before writing to the sovereign storage fabric. Populated by '
    'the studio/tables Create Table dialog FPE toggle.';

-- Index for Gateway startup: load all FPE policies for a given project at
-- connection time
CREATE INDEX IF NOT EXISTS idx_fpe_policies_project
    ON sovra_control.fpe_column_policies (project_id);

-- ==============================================================================
-- STEP 3: sovra_control.fpe_key_rotations
--
-- FRONTEND CONTRACT: admin/vaults/page.tsx shows:
--   "NIST FF1 keys are actively rotating across all 1,284 tenant workspaces."
--
-- This table is the audit log for every key rotation event. The vaults page
-- will eventually wire a live query against this table to display the stream.
--
-- Key rotation flow:
--   1. Platform admin triggers rotation via admin API or vaults UI.
--   2. Gateway generates new AES-128 key material, stores it in memory.
--   3. An INSERT is written here as the audit record.
--   4. sovra_control.projects.fpe_key_version is incremented.
--   5. All NEW writes use the new key. Old ciphertext remains queryable
--      via the previous key (kept in memory for the retention_days window).
-- ==============================================================================
CREATE TABLE IF NOT EXISTS sovra_control.fpe_key_rotations (
    id               UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id       UUID        NOT NULL
                                 REFERENCES sovra_control.projects(id)
                                 ON DELETE CASCADE,
    rotated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    rotated_by       TEXT        NOT NULL DEFAULT current_user,
    key_version_from INTEGER     NOT NULL,
    key_version_to   INTEGER     NOT NULL,
    rotation_reason  TEXT,       -- 'scheduled' | 'manual' | 'security_incident'
    retention_days   INTEGER     NOT NULL DEFAULT 30
);

COMMENT ON TABLE sovra_control.fpe_key_rotations IS
    'Audit log for NIST FF1 key rotation events. Displayed on the admin/vaults '
    'page. The Sovereign Gateway reads key_version_to to select active key '
    'material and keeps key_version_from keys alive for retention_days.';

-- Index for vault audit stream: most recent rotations per project
CREATE INDEX IF NOT EXISTS idx_fpe_rotations_project_time
    ON sovra_control.fpe_key_rotations (project_id, rotated_at DESC);


-- ==============================================================================
-- STEP 4: Row-Level Security on FPE tables
--
-- Tenants can only see and modify their own FPE policies.
-- The api_user role (created in control_plane/07_create_api_role.sql) runs
-- the tenant app context; the admin role bypasses RLS (BYPASSRLS).
-- ==============================================================================
ALTER TABLE sovra_control.fpe_column_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE sovra_control.fpe_key_rotations   ENABLE ROW LEVEL SECURITY;

-- api_user can only see policies for the project set in the session GUC
-- app.current_project_id — set by the Sovereign Gateway on connection startup.
CREATE POLICY fpe_policies_tenant_isolation
    ON sovra_control.fpe_column_policies
    FOR ALL
    TO api_user
    USING (
        project_id = current_setting('app.current_project_id', true)::UUID
    );

CREATE POLICY fpe_rotations_tenant_isolation
    ON sovra_control.fpe_key_rotations
    FOR ALL
    TO api_user
    USING (
        project_id = current_setting('app.current_project_id', true)::UUID
    );

-- Grant api_user access to read/write FPE tables
GRANT SELECT, INSERT, UPDATE ON sovra_control.fpe_column_policies TO api_user;
GRANT SELECT, INSERT         ON sovra_control.fpe_key_rotations   TO api_user;

-- The vaults admin page needs read access across all tenants (no RLS bypass)
-- Platform admins connect as sovra_admin which has BYPASSRLS set in the DB.
GRANT SELECT ON sovra_control.fpe_column_policies TO api_user;
GRANT SELECT ON sovra_control.fpe_key_rotations   TO api_user;


-- ==============================================================================
-- STEP 5: Seed the fpe_enabled field for existing projects (demo data)
--
-- Sets representative FPE states for the projects the admin dashboard shows:
--   "Acme Corp Production"      → FPE Enabled   (matches admin/page.tsx row)
--   "Global E-Commerce"         → FPE Enabled   (matches admin/page.tsx row)
--   "Stark Ind - Edge Analytics" → FPE Disabled (matches admin/page.tsx row)
--   "Legacy Migration Test"     → FPE Disabled  (matches admin/page.tsx row)
--   "FinTech App - Staging"     → FPE Enabled   (matches admin/page.tsx row)
--
-- This is a no-op safe UPDATE: only affects rows where company_name matches.
-- In a real deployment, fpe_enabled is toggled by the tenant via the Rules page.
-- ==============================================================================
UPDATE sovra_control.projects
SET    fpe_enabled    = true,
       fpe_enabled_at = NOW()
WHERE  company_name IN ('Acme Corp', 'Global E-Commerce', 'FinTech App');

-- Seed a sample FPE column policy for sovereign_users.ssn (the column the
-- SQL editor sidebar explicitly calls out as "FPE Encrypted")
INSERT INTO sovra_control.fpe_column_policies
    (project_id, table_name, column_name, fpe_type)
SELECT
    p.id,
    'sovereign_users',
    'ssn',
    'FF1_NUMERIC'
FROM sovra_control.projects p
WHERE p.fpe_enabled = true
ON CONFLICT (project_id, table_name, column_name) DO NOTHING;

-- Seed a sample FPE policy for national_id_number (numeric national ID)
INSERT INTO sovra_control.fpe_column_policies
    (project_id, table_name, column_name, fpe_type)
SELECT
    p.id,
    'sovereign_users',
    'national_id_number',
    'FF1_NUMERIC'
FROM sovra_control.projects p
WHERE p.fpe_enabled = true
ON CONFLICT (project_id, table_name, column_name) DO NOTHING;


-- ==============================================================================
-- STEP 6: Health Report
-- ==============================================================================
DO $$
DECLARE
    policy_count   INTEGER;
    rotation_count INTEGER;
    fpe_projects   INTEGER;
BEGIN
    SELECT COUNT(*) INTO policy_count   FROM sovra_control.fpe_column_policies;
    SELECT COUNT(*) INTO rotation_count FROM sovra_control.fpe_key_rotations;
    SELECT COUNT(*) INTO fpe_projects
    FROM sovra_control.projects WHERE fpe_enabled = true;

    RAISE NOTICE '✅ Block 3 Control Plane FPE Registry is ONLINE.';
    RAISE NOTICE '   sovra_control.projects.fpe_enabled: column added.';
    RAISE NOTICE '   sovra_control.fpe_column_policies: % seed policies created.', policy_count;
    RAISE NOTICE '   sovra_control.fpe_key_rotations:  audit table ready.';
    RAISE NOTICE '   Projects with FPE enabled: %', fpe_projects;
    RAISE NOTICE '   RLS: tenant isolation active on both FPE tables.';
    RAISE NOTICE '   Gateway reads: SELECT * FROM sovra_control.fpe_column_policies WHERE project_id = $1;';
END;
$$;

-- ==============================================================================
-- End of Block 3 — Control Plane FPE Registry
-- ==============================================================================
