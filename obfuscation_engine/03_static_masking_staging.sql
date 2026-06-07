-- ==============================================================================
-- Block 3: Cryptographic Obfuscation Engine — Static Masking for Staging
--
-- CONTEXT.md masking strategy table:
--   Static Masking: "Permanently replaces data in the table according to
--   predefined rules. Primary Use Case: Creating sanitized staging or
--   testing environments."
--
-- FRONTEND CONTRACT (derived from frontend_workbench/src/):
--   studio/tables/page.tsx has a Production / Development environment switcher.
--   When the developer switches to "Development" and selects a branch like
--   "feat/add-user-profiles", they are working against a sanitized clone of
--   production data — not the live data.
--
--   This script produces that sanitized clone. The Temporal Control Plane
--   (Block 6) handles the zero-copy CoW snapshot mechanics; this script
--   handles the pg_anon permanent anonymization step that sanitizes the clone
--   before developers can access it.
--
-- WORKFLOW:
--   1. Temporal branch is created (studio/branches — CoW snapshot).
--   2. This script is run against the branch to permanently anonymize PII.
--   3. developer_branch_role is granted access to the anonymized branch.
--   4. Developers query freely with no risk of PII exposure.
--
-- DEPENDENCY ORDER:
--   Requires: storage_fabric/01_geo_partitioned_schema.sql  (sovereign_users)
--             control_plane/03_temporal_tables_setup.sql    (sovereign_users_history)
--             obfuscation_engine/01_cryptographic_rules.sql (anon active, ssn col)
-- ==============================================================================


-- ==============================================================================
-- STEP 1: Create the Staging Schema
--
-- The staging tables live in a dedicated schema, separate from the live public
-- schema. This prevents accidental cross-contamination between live and staging.
-- ==============================================================================
CREATE SCHEMA IF NOT EXISTS staging;

COMMENT ON SCHEMA staging IS
    'Statically anonymized copies of production tables for developer branch '
    'access. Created by Block 3 obfuscation_engine/03_static_masking_staging.sql. '
    'Never contains plaintext PII — safe for developer access without masking roles.';


-- ==============================================================================
-- STEP 2: Create the Anonymized Staging Table
--
-- We CREATE TABLE AS SELECT with pg_anon masking functions applied directly
-- in the SELECT. This produces a table that is permanently anonymized —
-- no SECURITY LABEL interception needed at query time.
--
-- This is "static masking" as defined in CONTEXT.md: the anonymization
-- is baked into the table itself, not applied dynamically.
-- ==============================================================================
DROP TABLE IF EXISTS staging.sovereign_users_snapshot;

CREATE TABLE staging.sovereign_users_snapshot AS
SELECT
    -- Non-PII fields: preserved exactly as-is
    id,
    tenant_id,
    region_code,
    created_at,

    -- PII fields: permanently replaced with synthetic data
    anon.fake_first_name() || ' ' || anon.fake_last_name()
        AS full_name,

    -- email: anonymized but structurally valid (preserves domain pattern)
    anon.fake_email()
        AS email,

    -- ssn: replaced with structurally valid random 9-digit string
    -- Preserves the format the application expects without real PII
    lpad(floor(random() * 1000000000)::TEXT, 9, '0')
        AS ssn,

    -- national_id_number: replaced with random bigint in valid range
    (floor(random() * 899999999) + 100000000)::BIGINT
        AS national_id_number,

    -- national_id_encrypted: nulled out (BYTEA column — no valid fake needed)
    NULL::BYTEA
        AS national_id_encrypted,

    -- sys_period: preserved for temporal query compatibility
    sys_period

FROM public.sovereign_users;

COMMENT ON TABLE staging.sovereign_users_snapshot IS
    'Statically anonymized snapshot of public.sovereign_users. '
    'All PII permanently replaced with synthetic data. '
    'Safe for developer access without dynamic masking roles. '
    'Regenerate by re-running obfuscation_engine/03_static_masking_staging.sql.';


-- ==============================================================================
-- STEP 3: Create Anonymized Staging History Table
--
-- The history table must also be anonymized — a developer with access to the
-- staging snapshot must not be able to access real historical PII via
-- FOR SYSTEM_TIME AS OF queries on the history table.
-- ==============================================================================
DROP TABLE IF EXISTS staging.sovereign_users_history_snapshot;

CREATE TABLE staging.sovereign_users_history_snapshot AS
SELECT
    id,
    tenant_id,
    region_code,
    created_at,
    sys_period,

    -- Same permanent anonymization as the live table
    anon.fake_first_name() || ' ' || anon.fake_last_name()  AS full_name,
    anon.fake_email()                                        AS email,
    lpad(floor(random() * 1000000000)::TEXT, 9, '0')         AS ssn,
    (floor(random() * 899999999) + 100000000)::BIGINT        AS national_id_number,
    NULL::BYTEA                                              AS national_id_encrypted

FROM public.sovereign_users_history;

COMMENT ON TABLE staging.sovereign_users_history_snapshot IS
    'Statically anonymized snapshot of sovereign_users_history. '
    'Prevents PII leakage via temporal history queries in development branches.';


-- ==============================================================================
-- STEP 4: Grant developer_branch_role Access to Staging Tables
--
-- FRONTEND CONTRACT: studio/tables/page.tsx environment switcher routes to
--   Development branch. The developer_branch_role is the authenticated role
--   (from actions.ts SET ROLE developer_branch_role). They see the staging
--   snapshot with no dynamic masking overhead — the data is already clean.
-- ==============================================================================
GRANT USAGE ON SCHEMA staging TO developer_branch_role;
GRANT SELECT ON staging.sovereign_users_snapshot         TO developer_branch_role;
GRANT SELECT ON staging.sovereign_users_history_snapshot TO developer_branch_role;

-- masked_support_user also gets read access for support tooling
GRANT USAGE ON SCHEMA staging TO masked_support_user;
GRANT SELECT ON staging.sovereign_users_snapshot         TO masked_support_user;
GRANT SELECT ON staging.sovereign_users_history_snapshot TO masked_support_user;


-- ==============================================================================
-- STEP 5: Convenience View — Unified Developer Access
--
-- Provides a single query point that respects the branch context.
-- In production: reads from public.sovereign_users (dynamic masking via anon)
-- In staging: reads from staging.sovereign_users_snapshot (static masking)
--
-- The Sovereign Gateway sets app.environment = 'staging' | 'production'
-- based on the ?branch= query parameter in the connection string.
-- ==============================================================================
CREATE OR REPLACE VIEW public.v_developer_users AS
SELECT
    id, tenant_id, region_code, full_name, email, ssn,
    national_id_number, national_id_encrypted, created_at, sys_period
FROM (
    SELECT *, current_setting('app.environment', true) AS env
    FROM public.sovereign_users
) live
WHERE live.env IS DISTINCT FROM 'staging'

UNION ALL

SELECT
    id, tenant_id, region_code, full_name, email, ssn,
    national_id_number, national_id_encrypted, created_at, sys_period
FROM (
    SELECT *, current_setting('app.environment', true) AS env
    FROM staging.sovereign_users_snapshot
) snap
WHERE snap.env = 'staging';

COMMENT ON VIEW public.v_developer_users IS
    'Unified developer view that serves static staging data when '
    'app.environment = ''staging'' (set by the Gateway on ?branch= connections) '
    'and live dynamic-masked data otherwise.';

GRANT SELECT ON public.v_developer_users TO developer_branch_role;


-- ==============================================================================
-- STEP 6: Health Report
-- ==============================================================================
DO $$
DECLARE
    live_count    INTEGER;
    staging_count INTEGER;
    history_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO live_count    FROM public.sovereign_users;
    SELECT COUNT(*) INTO staging_count FROM staging.sovereign_users_snapshot;
    SELECT COUNT(*) INTO history_count FROM staging.sovereign_users_history_snapshot;

    RAISE NOTICE '✅ Block 3 Static Masking Staging is ONLINE.';
    RAISE NOTICE '   staging.sovereign_users_snapshot: % rows anonymized from % live rows.',
        staging_count, live_count;
    RAISE NOTICE '   staging.sovereign_users_history_snapshot: % rows anonymized.', history_count;
    RAISE NOTICE '   developer_branch_role: READ on staging schema granted.';
    RAISE NOTICE '   v_developer_users: routes to staging when app.environment = ''staging''.';
    RAISE NOTICE '   Refresh staging: re-run obfuscation_engine/03_static_masking_staging.sql';
END;
$$;

-- ==============================================================================
-- End of Block 3 — Static Masking for Staging
-- ==============================================================================
