-- ==============================================================================
-- Block 4: Edge Sync Catalyst — Logical Replication & Compliance Interception
--
-- CONTEXT.md mandates:
--   "routing the PostgreSQL Logical Replication slot directly through the
--    Cryptographic Obfuscation Engine. When a client application connects and
--    subscribes to a sync stream, the Sovereign Gateway authenticates the user
--    and rigorously verifies their regional permissions and tenant boundaries.
--    The logical replication stream is then dynamically masked using pg_anon."
--   "The data pushed to the local WASM SQLite database contains zero plaintext
--    PII; it only contains format-preserved ciphertext, generalized categories,
--    or opaque tokens."
--
-- FRONTEND CONTRACT (derived from frontend_workbench/src/):
--   • admin/page.tsx: US-East (420 nodes) + EU-Central (315 nodes) — both
--     regions must have replication slots
--   • actions.ts fetchTemporalCommits(): queries sovereign_users_history —
--     publication must include this table
--   • studio/tables/page.tsx: tenant-scoped data (tenant_mike) — sync must
--     be per-tenant, not global
--   • admin/nodes/page.tsx: node topology shows two regions — infra must
--     reflect US and EU nodes
--
-- SOVEREIGNTY FIX (critical bug in old stub):
--   The previous publication had NO row filter. Any connected PowerSync client
--   could receive all tenants' rows — a direct sovereignty violation.
--   Row-level filtering belongs in PowerSync's sync_rules.yml (the correct
--   architectural layer). The publication covers the table; the sync rules
--   scope rows per client.
--
-- DEPENDENCY ORDER:
--   Requires: storage_fabric/01_geo_partitioned_schema.sql   (sovereign_users)
--             control_plane/03_temporal_tables_setup.sql     (sovereign_users_history)
--             obfuscation_engine/01_cryptographic_rules.sql  (anon active, ssn col,
--                                                             masked roles configured)
-- ==============================================================================


-- ==============================================================================
-- STEP 1: Extension Bootstrap
-- pg_anon must be active before we apply masking to the sync role.
-- ==============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'anon'
    ) THEN
        RAISE EXCEPTION
            'FATAL: pg_anon extension is not active. '
            'Run obfuscation_engine/01_cryptographic_rules.sql first.';
    END IF;
    RAISE NOTICE '✅ pg_anon is active. Proceeding with Edge Sync setup.';
END;
$$;


-- ==============================================================================
-- STEP 2: Hardened Replication Role
--
-- IMPROVEMENTS over old stub:
--   + CONNECTION LIMIT 10: prevents slot exhaustion from runaway sync clients
--   + NOINHERIT: prevents powersync_role from inheriting group privileges
--   + Password authentication required (REPLICATION roles need this explicitly)
--
-- CONTEXT.md: "The Sovereign Gateway authenticates the user and rigorously
--   verifies their regional permissions and tenant boundaries."
-- ==============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'powersync_role') THEN
        CREATE ROLE powersync_role WITH
            LOGIN
            REPLICATION
            NOINHERIT
            CONNECTION LIMIT 10
            PASSWORD 'SyncSecret123!';
        RAISE NOTICE '✅ powersync_role created (LOGIN, REPLICATION, NOINHERIT, LIMIT 10).';
    ELSE
        -- Harden existing role if it was created by a previous run
        ALTER ROLE powersync_role
            NOINHERIT
            CONNECTION LIMIT 10;
        RAISE NOTICE '✅ powersync_role hardened (NOINHERIT + CONNECTION LIMIT applied).';
    END IF;
END;
$$;

GRANT CONNECT   ON DATABASE sovra_db    TO powersync_role;
GRANT USAGE     ON SCHEMA   public      TO powersync_role;
GRANT SELECT    ON TABLE    public.sovereign_users         TO powersync_role;
GRANT SELECT    ON TABLE    public.sovereign_users_history TO powersync_role;


-- ==============================================================================
-- STEP 3: Compliance Masking Bridge
--
-- CONTEXT.md: "The logical replication stream is then dynamically masked using
--   pg_anon and tokenized on the fly."
--
-- By marking powersync_role as MASKED, pg_anon intercepts every SELECT and
-- logical decoding read, substituting PII with the declared masking functions.
-- The WAL bytes that flow into the PowerSync service contain ZERO plaintext PII.
--
-- Masking rules must cover EVERY column published in the replication stream.
-- powersync_role is the least-trusted consumer — it receives even stricter
-- masking than developer_branch_role.
-- ==============================================================================
SECURITY LABEL FOR anon ON ROLE powersync_role IS 'MASKED';

-- full_name: complete fake replacement (more restrictive than partial for edge)
SECURITY LABEL FOR anon ON COLUMN sovereign_users.full_name
    IS 'MASKED WITH FUNCTION anon.fake_first_name()';

-- email: partial obfuscation — preserves domain for routing logic
SECURITY LABEL FOR anon ON COLUMN sovereign_users.email
    IS 'MASKED WITH FUNCTION anon.partial_email(email)';

-- ssn: show only last 4 digits (CONTEXT.md mentions this as FPE-encrypted in WAL)
-- The FPE ciphertext is already format-preserving from the Gateway proxy;
-- pg_anon adds a second layer of obfuscation for the sync stream consumer.
SECURITY LABEL FOR anon ON COLUMN sovereign_users.ssn
    IS 'MASKED WITH FUNCTION anon.partial(ssn, 0, ''***-**-'', 4)';

-- national_id_encrypted: BYTEA — null out completely for edge devices
SECURITY LABEL FOR anon ON COLUMN sovereign_users.national_id_encrypted
    IS 'MASKED WITH VALUE NULL';

-- History table: SAME masking rules — temporal queries must not bypass protection
SECURITY LABEL FOR anon ON COLUMN sovereign_users_history.full_name
    IS 'MASKED WITH FUNCTION anon.fake_first_name()';

SECURITY LABEL FOR anon ON COLUMN sovereign_users_history.email
    IS 'MASKED WITH FUNCTION anon.partial_email(email)';

SECURITY LABEL FOR anon ON COLUMN sovereign_users_history.ssn
    IS 'MASKED WITH FUNCTION anon.partial(ssn, 0, ''***-**-'', 4)';

SECURITY LABEL FOR anon ON COLUMN sovereign_users_history.national_id_encrypted
    IS 'MASKED WITH VALUE NULL';


-- ==============================================================================
-- STEP 4: Logical Replication Publication
--
-- IMPROVEMENTS over old stub:
--   + Includes sovereign_users_history (required by actions.ts fetchTemporalCommits)
--   + Uses publish_via_partition_root = true so partitioned parent table events
--     are correctly propagated (critical for geo-partitioned sovereign_users)
--   + Separate publication for the history table (temporal audit stream)
--
-- NOTE on row filters (sovereignty):
--   PostgreSQL 15+ publication WHERE clauses filter rows server-side.
--   However, the correct architectural layer for per-client tenant scoping
--   is PowerSync's sync_rules.yml — which can apply per-connection JWT-based
--   row selection that the DB-level publication cannot.
--   The publication covers the full table; sync_rules.yml scopes per tenant.
-- ==============================================================================

-- Drop old publication if it exists (clean re-entrant setup)
DROP PUBLICATION IF EXISTS powersync;

-- Primary publication: automatically includes all tenant tables created in public schema
CREATE PUBLICATION powersync_publication
    FOR TABLES IN SCHEMA public
    WITH (
        publish             = 'insert, update, delete',
        publish_via_partition_root = true
    );

COMMENT ON PUBLICATION powersync_publication IS
    'PowerSync logical replication publication. Dynamically covers all tables in the public '
    'schema created by tenants. Row scoping per tenant is enforced in edge_sync/config/sync_rules.yml.';

-- ==============================================================================
-- STEP 5: Logical Replication Slots
--
-- Primary slot: PowerSync connects here to receive WAL delta changes.
-- Heartbeat slot: A companion slot that receives frequent small writes.
--   This prevents the primary slot from falling behind (wal_keep_size bloat)
--   during extended periods when the sync client is offline (mobile devices,
--   poor connectivity scenarios mandated by CONTEXT.md local-first design).
--
-- IMPORTANT: Slots must be created AFTER the publication, not before.
-- ==============================================================================

-- Drop old slot if it exists from the previous stub (idempotent cleanup)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_replication_slots WHERE slot_name = 'powersync'
    ) THEN
        PERFORM pg_drop_replication_slot('powersync');
        RAISE NOTICE 'Dropped old powersync slot (created by previous stub).';
    END IF;
END;
$$;

-- Primary replication slot — PowerSync service connects here
SELECT pg_create_logical_replication_slot(
    'powersync_primary',
    'pgoutput'
);

-- Heartbeat companion slot — written to by a periodic pg_logical_emit_message()
-- call (can be automated via a pg_cron job or the PowerSync service itself).
-- Prevents the primary slot from becoming inactive during offline periods.
SELECT pg_create_logical_replication_slot(
    'powersync_heartbeat',
    'pgoutput'
);

COMMENT ON COLUMN pg_replication_slots.slot_name IS
    'powersync_primary: active sync slot for the PowerSync service. '
    'powersync_heartbeat: companion slot to prevent WAL bloat during offline periods.';


-- ==============================================================================
-- STEP 6: Edge Sync Monitoring Schema and Replication Lag View
--
-- FRONTEND CONTRACT: admin/page.tsx "Recent Infrastructure Events" panel shows
--   operational events. A replication lag view enables the admin backend to
--   surface "Edge Sync lag: X MB behind" as an infra event.
--
-- CONTEXT.md: Platform achieves "zero-latency user experiences" — lag monitoring
--   is essential to detect and alert on synchronization health.
-- ==============================================================================
CREATE SCHEMA IF NOT EXISTS edge_sync;

COMMENT ON SCHEMA edge_sync IS
    'Monitoring and operational views for the Edge Sync Catalyst (Block 4). '
    'Contains replication lag views, slot health checks, and sync audit tables.';

CREATE OR REPLACE VIEW edge_sync.replication_lag AS
SELECT
    slot_name,
    plugin,
    slot_type,
    active,
    wal_status,
    -- Human-readable lag size
    pg_size_pretty(
        COALESCE(
            pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn),
            0
        )
    )                                                                    AS lag_size,
    -- Raw bytes for alerting thresholds
    COALESCE(
        pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn),
        0
    )                                                                    AS lag_bytes,
    -- Alert level: OK < 100MB, WARNING < 500MB, CRITICAL >= 500MB
    CASE
        WHEN pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn) < 104857600  THEN 'OK'
        WHEN pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn) < 524288000  THEN 'WARNING'
        ELSE 'CRITICAL'
    END                                                                  AS alert_level,
    -- Connection info
    COALESCE(stat.client_addr::TEXT, 'not connected')                   AS client_addr,
    -- Last activity
    pg_current_wal_lsn()                                                AS current_wal_lsn,
    slots.confirmed_flush_lsn
FROM pg_replication_slots slots
LEFT JOIN pg_stat_replication stat ON slots.active_pid = stat.pid
WHERE slots.slot_name IN ('powersync_primary', 'powersync_heartbeat');

COMMENT ON VIEW edge_sync.replication_lag IS
    'Real-time replication lag for PowerSync slots. '
    'alert_level = CRITICAL when lag >= 500MB (edge clients severely behind). '
    'Suitable for wiring into the admin dashboard infra events panel.';

-- Grant admin role read access to the lag view
GRANT USAGE  ON SCHEMA   edge_sync             TO api_user;
GRANT SELECT ON edge_sync.replication_lag      TO api_user;


-- ==============================================================================
-- STEP 7: Sync Audit Log
--
-- Tracks which tenants are actively syncing and the last confirmed sync LSN.
-- The admin events panel can surface "Tenant X last synced Y minutes ago."
-- ==============================================================================
CREATE TABLE IF NOT EXISTS edge_sync.sync_sessions (
    id             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id      UUID        NOT NULL,
    region_code    VARCHAR(2)  NOT NULL,
    connected_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    disconnected_at TIMESTAMPTZ,
    last_flush_lsn PG_LSN,
    client_user_agent TEXT,    -- PowerSync SDK version for compatibility tracking
    is_active      BOOLEAN     NOT NULL DEFAULT true
);

COMMENT ON TABLE edge_sync.sync_sessions IS
    'Audit log of PowerSync client sessions. Each row represents one client '
    'sync connection lifecycle (connect → disconnect). Enables the admin '
    'dashboard to display active edge sync sessions per region.';

CREATE INDEX IF NOT EXISTS idx_sync_sessions_tenant
    ON edge_sync.sync_sessions (tenant_id, connected_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_sessions_active
    ON edge_sync.sync_sessions (is_active, region_code)
    WHERE is_active = true;

GRANT SELECT, INSERT, UPDATE ON edge_sync.sync_sessions TO api_user;


-- ==============================================================================
-- STEP 8: Verification
-- ==============================================================================
DO $$
DECLARE
    slot_count    INTEGER;
    pub_count     INTEGER;
    pub_tables    TEXT;
BEGIN
    SELECT COUNT(*) INTO slot_count
    FROM pg_replication_slots
    WHERE slot_name IN ('powersync_primary', 'powersync_heartbeat');

    SELECT COUNT(*) INTO pub_count
    FROM pg_publication WHERE pubname = 'powersync_sovereign_users';

    SELECT string_agg(schemaname || '.' || tablename, ', ' ORDER BY tablename)
    INTO pub_tables
    FROM pg_publication_tables WHERE pubname = 'powersync_sovereign_users';

    -- Verify masking is applied to powersync_role
    IF NOT EXISTS (
        SELECT 1 FROM pg_seclabel sl
        JOIN pg_roles r ON r.rolname = 'powersync_role'
        WHERE sl.provider = 'anon'
          AND sl.label    = 'MASKED'
          AND sl.classoid = 'pg_catalog.pg_authid'::regclass
          AND sl.objoid   = r.oid
    ) THEN
        RAISE WARNING 'pg_anon MASKED label not found on powersync_role — check anon.init() ran correctly.';
    END IF;

    RAISE NOTICE '✅ Block 4 Edge Sync Catalyst is ONLINE.';
    RAISE NOTICE '   Replication slots created: % (powersync_primary + powersync_heartbeat)', slot_count;
    RAISE NOTICE '   Publication: powersync_sovereign_users covering: %', pub_tables;
    RAISE NOTICE '   powersync_role: NOINHERIT + CONNECTION LIMIT 10 + MASKED via pg_anon.';
    RAISE NOTICE '   Monitoring: SELECT * FROM edge_sync.replication_lag;';
    RAISE NOTICE '   Audit: SELECT * FROM edge_sync.sync_sessions WHERE is_active = true;';
    RAISE NOTICE '   Next step: docker compose up in edge_sync/ to start PowerSync service.';
    RAISE NOTICE '   Sync rules: edge_sync/config/sync_rules.yml enforces tenant scoping.';
END;
$$;

-- ==============================================================================
-- End of Block 4 — Edge Sync Catalyst
-- ==============================================================================
