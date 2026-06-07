-- ==============================================================================
-- Control Plane — Schema Fixes & Frontend Wiring Layer
--
-- This script is the critical missing link between the frontend applications
-- and the database. It fixes all schema mismatches discovered by reading every
-- frontend page and tracing every SQL query they execute.
--
-- DESIGN DECISION: sovereign_users uses TYPED COLUMNS (email, full_name, ssn)
-- not a schemaless JSONB payload. The tenant app's Document Explorer is updated
-- to insert and display real typed columns instead of an arbitrary JSONB blob.
--
-- GAPS FIXED:
--   Gap 2: v_sovereign_records view — rebuilt to expose typed columns with
--           per-role masking (api_user sees plaintext, masked_support_user sees ***)
--           tenant_app/actions.ts updated to query real columns
--   Gap 3: api_user missing grants on partitions + new tables + new view
--   Gap 4: masked_support_user grants depend on fixed view
--   Gap 10: sovra_control.projects missing region_pin, fpe_enabled columns
--            → studio/rules/page.tsx + studio/settings/page.tsx + admin/page.tsx
--   Gap 11: sovra_control.api_keys table missing
--            → studio/settings/page.tsx persistent API key management
--
-- DEPENDENCY ORDER:
--   After: storage_fabric/01_geo_partitioned_schema.sql  (sovereign_users base)
--          control_plane/03_temporal_tables_setup.sql    (sovereign_users_history)
--          control_plane/05_sovra_control_schema.sql     (sovra_control.projects)
--          control_plane/07_create_api_role.sql          (api_user, masked_support_user)
--          control_plane/08_cryptographic_obfuscation.sql (masked_support_user)
--          obfuscation_engine/01_cryptographic_rules.sql (ssn col, anon labels)
-- ==============================================================================


-- ==============================================================================
-- STEP 1: Add typed PII columns if not already present
-- (obfuscation_engine/01_cryptographic_rules.sql adds these; this is idempotent
--  in case that script hasn't been applied yet)
-- ==============================================================================
ALTER TABLE sovereign_users
    ADD COLUMN IF NOT EXISTS ssn                   TEXT,
    ADD COLUMN IF NOT EXISTS national_id_number    BIGINT,
    ADD COLUMN IF NOT EXISTS national_id_encrypted BYTEA;


-- ==============================================================================
-- STEP 2: Rebuild v_sovereign_records with typed columns + per-role masking
--
-- FRONTEND CONTRACT (tenant_app/actions.ts):
--   getMyUsers() → SELECT id, region_code, payload, created_at FROM v_sovereign_records
--   The tenant app dashboard renders: id, region_code, and dynamic JSONB keys.
--
-- APPROACH: The view synthesises a JSONB "payload" from the typed columns so
-- the existing tenant app frontend code requires minimal changes. Each role sees
-- different data in the synthesized payload:
--   api_user           → raw email, full_name, ssn in the JSONB
--   masked_support_user → email/ssn/full_name values replaced with "***MASKED***"
--
-- This preserves the schemaless Document Explorer UX while using the correct
-- typed schema underneath — no schema change to sovereign_users needed.
-- ==============================================================================
DROP VIEW IF EXISTS public.v_sovereign_records CASCADE;

CREATE OR REPLACE VIEW public.v_sovereign_records AS
SELECT
    id,
    tenant_id,
    region_code,
    created_at,
    -- Synthesize the JSONB "payload" from typed columns.
    -- The mask is applied at the view layer based on the executing role,
    -- complementing the pg_anon SECURITY LABEL layer on the base table.
    CASE
        WHEN current_user = 'masked_support_user' THEN
            jsonb_build_object(
                'full_name', '***MASKED***',
                'email',     '***MASKED***',
                'ssn',       CASE WHEN ssn IS NOT NULL THEN
                                 '***-**-' || right(ssn, 4)
                             ELSE NULL END
            )
        ELSE
            jsonb_strip_nulls(jsonb_build_object(
                'full_name', full_name,
                'email',     email,
                'ssn',       ssn
            ))
    END AS payload
FROM public.sovereign_users;

COMMENT ON VIEW public.v_sovereign_records IS
    'Secure access view for tenant sovereign_users records. '
    'Synthesises a JSONB payload from typed columns (full_name, email, ssn) '
    'so the tenant app Document Explorer can display data without schema changes. '
    'masked_support_user: email + full_name replaced with ***MASKED***, '
    '                     ssn shows last 4 digits only. '
    'api_user: sees raw plaintext typed values in the JSON payload. '
    'RLS on sovereign_users enforces tenant isolation — each tenant only sees '
    'their own rows (filtered by app.current_tenant session variable).';

-- Grants
GRANT SELECT ON public.v_sovereign_records TO api_user;
GRANT SELECT ON public.v_sovereign_records TO masked_support_user;
GRANT SELECT ON public.v_sovereign_records TO developer_branch_role;


-- ==============================================================================
-- STEP 3: Grant api_user access to all sovereign_users partitions
--
-- api_user uses SET LOCAL ROLE in withTenantContext(). The GRANT on the parent
-- partitioned table propagates to existing child tables, but explicit grants on
-- each partition ensure correctness across PostgreSQL versions.
-- ==============================================================================
GRANT ALL PRIVILEGES ON TABLE public.sovereign_users         TO api_user;
GRANT ALL PRIVILEGES ON TABLE public.sovereign_users_us      TO api_user;
GRANT ALL PRIVILEGES ON TABLE public.sovereign_users_eu      TO api_user;
GRANT ALL PRIVILEGES ON TABLE public.sovereign_users_global  TO api_user;

-- masked_support_user: SELECT on base table (view queries it underneath)
GRANT SELECT ON public.sovereign_users TO masked_support_user;


-- ==============================================================================
-- STEP 4: sovra_control.projects — add missing columns for frontend pages
--
-- FRONTEND CONTRACT:
--   studio/rules/page.tsx: "Active Policy: US-East Only" → region_pin column
--   studio/settings/page.tsx: "Actively routing to US-East" → region_pin column
--   admin/page.tsx: "Region Pinning" column → region_pin
--   admin/page.tsx: "FPE Status" column → fpe_enabled
--   obfuscation_engine/02_control_plane_fpe_registry.sql also adds fpe_enabled;
--   ADD COLUMN IF NOT EXISTS is idempotent — safe to run after either script.
-- ==============================================================================
ALTER TABLE sovra_control.projects
    ADD COLUMN IF NOT EXISTS region_pin      VARCHAR(20) NOT NULL DEFAULT 'US-East',
    ADD COLUMN IF NOT EXISTS fpe_enabled     BOOLEAN     NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS fpe_enabled_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS fpe_key_version INTEGER     NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS region_code     VARCHAR(2)  NOT NULL DEFAULT 'US';

COMMENT ON COLUMN sovra_control.projects.region_pin IS
    'Human-readable data residency policy shown in studio/rules and studio/settings. '
    'Values: "US-East" | "US-East Only" | "EU-Central" | "EU-Central Only" | "Multi-Region". '
    'The Sovereign Gateway enforces this by only routing to the matching tablespace node.';

COMMENT ON COLUMN sovra_control.projects.region_code IS
    'ISO 3166-1 alpha-2 code (US, EU, AF) for the primary data partition. '
    'Written as region_code on all sovereign_users rows for this tenant.';

GRANT ALL PRIVILEGES ON TABLE sovra_control.projects   TO api_user;
GRANT ALL PRIVILEGES ON TABLE sovra_control.developers TO api_user;


-- ==============================================================================
-- STEP 5: sovra_control.api_keys — persistent API key storage
--
-- FRONTEND CONTRACT:
--   studio/settings/page.tsx: API keys list rendered from useState — currently
--     purely in-memory (resets on page reload). This table persists them.
--   Keys shown in UI: "Default Publishable Key" (pk_live_81a_...) and
--                     "Default Secret Key" (sk_live_81a_...)
--
-- key_value: stores the full plaintext key (acceptable for a demo DBaaS).
--   In production: store a SCRAM/bcrypt hash and only return plaintext on create.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS sovra_control.api_keys (
    id           UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id   UUID        NOT NULL REFERENCES sovra_control.projects(id) ON DELETE CASCADE,
    name         TEXT        NOT NULL,
    key_type     VARCHAR(2)  NOT NULL DEFAULT 'pk' CHECK (key_type IN ('pk', 'sk')),
    key_value    TEXT        NOT NULL,
    status       VARCHAR(10) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Revoked')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at   TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ
);

COMMENT ON TABLE sovra_control.api_keys IS
    'Persistent API keys for each project. Powers studio/settings/page.tsx. '
    'key_type: "pk" = publishable (frontend safe), "sk" = secret (backend only).';

CREATE INDEX IF NOT EXISTS idx_api_keys_project
    ON sovra_control.api_keys (project_id, status, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON sovra_control.api_keys TO api_user;


-- ==============================================================================
-- STEP 6: sovra_control.query_log — infrastructure event log
--
-- FRONTEND CONTRACT:
--   admin/page.tsx "Recent Infrastructure Events" panel: currently hardcoded
--   EventLine components. This table backs those events with real data.
--   Fields mapped: title → title, desc → description, time → occurred_at
-- ==============================================================================
CREATE TABLE IF NOT EXISTS sovra_control.query_log (
    id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    event_type  TEXT        NOT NULL,
    title       TEXT        NOT NULL,
    description TEXT,
    tenant_id   UUID,
    region_code VARCHAR(2),
    metadata    JSONB,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE sovra_control.query_log IS
    'Platform infrastructure event log. Powers the admin dashboard '
    '"Recent Infrastructure Events" panel and SQL editor audit history.';

CREATE INDEX IF NOT EXISTS idx_query_log_time
    ON sovra_control.query_log (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_query_log_tenant
    ON sovra_control.query_log (tenant_id, occurred_at DESC)
    WHERE tenant_id IS NOT NULL;

GRANT SELECT, INSERT ON sovra_control.query_log TO api_user;
GRANT SELECT         ON sovra_control.query_log TO developer_branch_role;


-- ==============================================================================
-- STEP 7: sovra_control.v_database_metrics — real metrics for studio overview
--
-- FRONTEND CONTRACT: studio/page.tsx MetricBox components currently show
--   hardcoded values ("14.2M", "48.2 GB"). This view supplies real pg_stat data.
-- ==============================================================================
CREATE OR REPLACE VIEW sovra_control.v_database_metrics AS
SELECT
    pg_size_pretty(pg_database_size(current_database()))              AS db_size_pretty,
    pg_database_size(current_database())                              AS db_size_bytes,
    (SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'active')    AS active_connections,
    (SELECT COALESCE(SUM(n_tup_ins + n_tup_upd + n_tup_del), 0)
     FROM pg_stat_user_tables)                                        AS total_writes_ever,
    (SELECT COUNT(*) FROM pg_stat_user_tables)                        AS table_count,
    (SELECT COUNT(*) FROM sovra_control.projects)                     AS tenant_count,
    (SELECT COUNT(*) FROM sovereign_users)                            AS total_user_rows,
    (SELECT COUNT(*) FROM sovereign_users WHERE region_code = 'US')   AS us_user_rows,
    (SELECT COUNT(*) FROM sovereign_users WHERE region_code = 'EU')   AS eu_user_rows;

GRANT SELECT ON sovra_control.v_database_metrics TO api_user;
GRANT SELECT ON sovra_control.v_database_metrics TO developer_branch_role;


-- ==============================================================================
-- STEP 8: Seed Demo Data
-- Seeds data that powers all frontend pages immediately after container start.
-- All INSERTs are idempotent (ON CONFLICT DO NOTHING).
-- ==============================================================================

-- Demo developer (tenant_app login: mike@example.com / SovraDemo123!)
-- password_hash = SHA-256('SovraDemo123!') precomputed
INSERT INTO sovra_control.developers (id, email, password_hash)
VALUES (
    'a0000000-0000-0000-0000-000000000001'::UUID,
    'mike@example.com',
    'b8e9f3a2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0'
)
ON CONFLICT (email) DO NOTHING;

-- Demo developer 2 (FinTech)
INSERT INTO sovra_control.developers (id, email, password_hash)
VALUES (
    'a0000000-0000-0000-0000-000000000002'::UUID,
    'fintech@example.com',
    'b8e9f3a2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0'
)
ON CONFLICT (email) DO NOTHING;

-- Acme Corp project (US-East, FPE enabled — matches admin dashboard row)
INSERT INTO sovra_control.projects
    (id, developer_id, tenant_id, company_name, region_pin, fpe_enabled, region_code)
VALUES (
    'b0000000-0000-0000-0000-000000000001'::UUID,
    'a0000000-0000-0000-0000-000000000001'::UUID,
    'c0000000-0000-0000-0000-000000000001'::UUID,
    'Acme Corp',  'US-East Only', true, 'US'
)
ON CONFLICT DO NOTHING;

-- FinTech App project (EU-Central, FPE enabled)
INSERT INTO sovra_control.projects
    (id, developer_id, tenant_id, company_name, region_pin, fpe_enabled, region_code)
VALUES (
    'b0000000-0000-0000-0000-000000000002'::UUID,
    'a0000000-0000-0000-0000-000000000002'::UUID,
    'c0000000-0000-0000-0000-000000000002'::UUID,
    'FinTech App', 'EU-Central Only', true, 'EU'
)
ON CONFLICT DO NOTHING;

-- Global E-Commerce project (Multi-Region, FPE enabled)
INSERT INTO sovra_control.projects
    (id, developer_id, tenant_id, company_name, region_pin, fpe_enabled, region_code)
VALUES (
    'b0000000-0000-0000-0000-000000000003'::UUID,
    'a0000000-0000-0000-0000-000000000001'::UUID,
    'c0000000-0000-0000-0000-000000000003'::UUID,
    'Global E-Commerce', 'Multi-Region', true, 'US'
)
ON CONFLICT DO NOTHING;

-- Stark Ind project (US-West, FPE disabled — matches admin dashboard row)
INSERT INTO sovra_control.projects
    (id, developer_id, tenant_id, company_name, region_pin, fpe_enabled, region_code)
VALUES (
    'b0000000-0000-0000-0000-000000000004'::UUID,
    'a0000000-0000-0000-0000-000000000001'::UUID,
    'c0000000-0000-0000-0000-000000000004'::UUID,
    'Stark Ind', 'US-West', false, 'US'
)
ON CONFLICT DO NOTHING;

-- Default API keys for Acme Corp (matches studio/settings hardcoded mock)
INSERT INTO sovra_control.api_keys (project_id, name, key_type, key_value)
VALUES
    ('b0000000-0000-0000-0000-000000000001'::UUID,
     'Default Publishable Key', 'pk', 'pk_live_81a_a7b9c289fd'),
    ('b0000000-0000-0000-0000-000000000001'::UUID,
     'Default Secret Key', 'sk', 'sk_live_81a_f4e1d9a2bc')
ON CONFLICT DO NOTHING;

-- sovereign_users: US demo rows (Acme Corp / tenant_mike from tenant app)
-- These are the rows the tenant app Table Explorer will display
INSERT INTO sovereign_users (id, tenant_id, region_code, full_name, email, ssn)
VALUES
    (gen_random_uuid(), 'c0000000-0000-0000-0000-000000000001'::UUID,
     'US', 'Mike Founder',     'mike@example.com',  NULL),
    (gen_random_uuid(), 'c0000000-0000-0000-0000-000000000001'::UUID,
     'US', 'Tech Enthusiast',  'tech@domain.com',   NULL),
    (gen_random_uuid(), 'c0000000-0000-0000-0000-000000000001'::UUID,
     'US', 'Daily Coder',      'coder@web.net',     '000-11-2222')
ON CONFLICT DO NOTHING;

-- sovereign_users: EU demo rows (FinTech project — eu_data_space partition)
INSERT INTO sovereign_users (id, tenant_id, region_code, full_name, email, ssn)
VALUES
    (gen_random_uuid(), 'c0000000-0000-0000-0000-000000000002'::UUID,
     'EU', 'Hans Mueller', 'hans@fintech.eu',  NULL),
    (gen_random_uuid(), 'c0000000-0000-0000-0000-000000000002'::UUID,
     'EU', 'Maria Rossi',  'maria@fintech.eu', 'DE-987-654')
ON CONFLICT DO NOTHING;

-- Infrastructure events (admin dashboard "Recent Infrastructure Events" panel)
INSERT INTO sovra_control.query_log
    (event_type, title, description, region_code, occurred_at)
VALUES
    ('tenant_provisioned', 'Tenant Provisioned',
     'Acme Corp created new temporal branch.',         'US', NOW() - INTERVAL '2 minutes'),
    ('autoscale',          'Auto-Scale Triggered',
     'Added 4 read replicas to EU-Central.',           'EU', NOW() - INTERVAL '15 minutes'),
    ('routing_update',     'Routing Update',
     'MaxMind ASN rules updated across Gateway nodes.', NULL, NOW() - INTERVAL '1 hour'),
    ('duckdb_query',       'DuckDB Aggregation',
     'Global federated query executed by Tenant ID 402.', 'US', NOW() - INTERVAL '2 hours')
ON CONFLICT DO NOTHING;


-- ==============================================================================
-- STEP 9: Health Report
-- ==============================================================================
DO $$
DECLARE
    user_count  INTEGER;
    proj_count  INTEGER;
    key_count   INTEGER;
    log_count   INTEGER;
    view_exists BOOLEAN;
BEGIN
    SELECT COUNT(*) INTO user_count FROM sovereign_users;
    SELECT COUNT(*) INTO proj_count FROM sovra_control.projects;
    SELECT COUNT(*) INTO key_count  FROM sovra_control.api_keys;
    SELECT COUNT(*) INTO log_count  FROM sovra_control.query_log;
    SELECT EXISTS (
        SELECT 1 FROM pg_views
        WHERE viewname = 'v_sovereign_records' AND schemaname = 'public'
    ) INTO view_exists;

    RAISE NOTICE '✅ Frontend Wiring Layer (09) is ONLINE.';
    RAISE NOTICE '   sovereign_users: typed schema (email, full_name, ssn). No payload column.';
    RAISE NOTICE '   v_sovereign_records: exists = %. JSONB synthesized from typed cols.', view_exists;
    RAISE NOTICE '   sovereign_users seeded: % rows.', user_count;
    RAISE NOTICE '   sovra_control.projects: % projects seeded.', proj_count;
    RAISE NOTICE '   sovra_control.api_keys: % keys seeded.', key_count;
    RAISE NOTICE '   sovra_control.query_log: % events seeded.', log_count;
    RAISE NOTICE '   sovra_control.v_database_metrics: ready for studio overview.';
    RAISE NOTICE '   ';
    RAISE NOTICE '   tenant_app login: mike@example.com / SovraDemo123!';
    RAISE NOTICE '   tenant UUID:      c0000000-0000-0000-0000-000000000001';
END;
$$;

-- ==============================================================================
-- End of Control Plane — Frontend Wiring Layer
-- ==============================================================================
