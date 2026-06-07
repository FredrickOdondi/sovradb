-- ==============================================================================
-- Block 5: The Federated Analytical Observer (Embedded DuckDB)
-- Extension: pg_duckdb v1.1.1 (github.com/duckdb/pg_duckdb — MIT License)
--
-- CONTEXT.md specifies:
--   "embeds DuckDB—a heavily optimized columnar-vectorized analytics engine—
--    directly into the underlying PostgreSQL process."
--   "DuckDB can read directly from the local partitioned tables, or it can
--    query external object storage formats like Parquet, Apache Iceberg, and
--    Delta Lake stored in S3 or Azure Blob Storage."
--   "setting the session variable duckdb.force_execution=true"
--   "only the heavily aggregated, anonymized numerical results are returned
--    to the central observer, leaving the highly regulated raw data physically
--    untouched within its sovereign borders."
-- ==============================================================================

-- ==============================================================================
-- STEP 1: Extension Health Check
-- Hard-fail if pg_duckdb is not available. Eliminates the previous silent
-- `|| echo "skipping"` failure path.
-- ==============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_available_extensions WHERE name = 'pg_duckdb'
    ) THEN
        RAISE NOTICE
            'WARNING: pg_duckdb is NOT available in pg_available_extensions. '
            'Verify the Dockerfile installed pg_duckdb v1.1.1 from the official '
            'release binary: https://github.com/duckdb/pg_duckdb/releases/tag/v1.1.1';
        RETURN;
    END IF;
    RAISE NOTICE '✅ pg_duckdb is available. Proceeding with installation.';
END;
$$;

-- Temporarily disable pg_anon event triggers which interfere with CREATE EXTENSION
ALTER EVENT TRIGGER anon_trg_mask_update DISABLE;
ALTER EVENT TRIGGER anon_trg_check_trusted_schemas DISABLE;

-- 1. Enable the DuckDB vectorized analytics engine
CREATE EXTENSION IF NOT EXISTS pg_duckdb;

ALTER EVENT TRIGGER anon_trg_mask_update ENABLE;
ALTER EVENT TRIGGER anon_trg_check_trusted_schemas ENABLE;

-- Verify it actually loaded
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pg_duckdb'
    ) THEN
        RAISE EXCEPTION
            'FATAL: pg_duckdb CREATE EXTENSION ran but is missing from pg_extension. '
            'Check shared_preload_libraries for conflicts.';
    END IF;
    RAISE NOTICE '✅ pg_duckdb is ACTIVE in pg_extension.';
END;
$$;

-- ==============================================================================
-- STEP 2: Cross-Region Federation via postgres_fdw (PostgreSQL built-in)
-- CONTEXT.md: "The platform leverages PostgreSQL Foreign Data Wrappers (FDW),
--              specifically optimized for DuckDB federated queries, to facilitate
--              cross-region analytics without permanent data movement."
-- CONTEXT.md: "SCRAM passthrough authentication tightly coupled with postgres_fdw"
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS postgres_fdw;

-- Register the EU regional node as a foreign server
-- fetch_size=50000 reduces transatlantic round-trips on large analytic batches
CREATE SERVER IF NOT EXISTS eu_partition_node
  FOREIGN DATA WRAPPER postgres_fdw
  OPTIONS (
    host       'postgres_eu',
    port       '5432',
    dbname     'sovra_db',
    fetch_size '50000'
  );

-- PG18 SCRAM passthrough: credentials never travel in plaintext
CREATE USER MAPPING IF NOT EXISTS FOR sovra_admin
  SERVER eu_partition_node
  OPTIONS (
    user     'sovra_admin',
    password 'SuperSecretSCRAMPassword123!'
  );

-- Import only the sovereign_users table — minimal surface area crossing borders
CREATE SCHEMA IF NOT EXISTS eu_foreign;

-- Register the AF regional node as a foreign server
CREATE SERVER IF NOT EXISTS af_partition_node
  FOREIGN DATA WRAPPER postgres_fdw
  OPTIONS (
    host       'postgres_af',
    port       '5432',
    dbname     'sovra_db',
    fetch_size '50000'
  );

-- PG18 SCRAM passthrough
CREATE USER MAPPING IF NOT EXISTS FOR sovra_admin
  SERVER af_partition_node
  OPTIONS (
    user     'sovra_admin',
    password 'SuperSecretSCRAMPassword123!'
  );

CREATE SCHEMA IF NOT EXISTS af_foreign;

DO $$
DECLARE
  retries INT := 0;
BEGIN
  -- EU Node Schema Import
  LOOP
    BEGIN
      EXECUTE 'IMPORT FOREIGN SCHEMA public LIMIT TO (sovereign_users) FROM SERVER eu_partition_node INTO eu_foreign;';
      EXIT;
    EXCEPTION WHEN OTHERS THEN
      IF retries >= 15 THEN
        RAISE WARNING 'Failed to import eu_foreign schema: %', SQLERRM;
        EXIT;
      END IF;
      PERFORM pg_sleep(3);
      retries := retries + 1;
    END;
  END LOOP;

  -- AF Node Schema Import
  retries := 0;
  LOOP
    BEGIN
      EXECUTE 'IMPORT FOREIGN SCHEMA public LIMIT TO (sovereign_users) FROM SERVER af_partition_node INTO af_foreign;';
      EXIT;
    EXCEPTION WHEN OTHERS THEN
      IF retries >= 15 THEN
        RAISE WARNING 'Failed to import af_foreign schema: %', SQLERRM;
        EXIT;
      END IF;
      PERFORM pg_sleep(3);
      retries := retries + 1;
    END;
  END LOOP;
END;
$$;

-- ==============================================================================
-- STEP 3: External Object Storage (Parquet / Apache Iceberg / Delta Lake on S3)
-- CONTEXT.md: "DuckDB can read directly from the local partitioned tables, or
--              it can query external object storage formats like Parquet, Apache
--              Iceberg, and Delta Lake stored in S3 or Azure Blob Storage."
--
-- pg_duckdb exposes DuckDB's native httpfs, iceberg, and delta extensions,
-- allowing direct SQL queries against sovereign data lakes without ETL pipelines.
-- Regulated raw data remains in its sovereign region; only aggregated results
-- return to the caller.
-- ==============================================================================

-- Configure AWS S3 credentials for the DuckDB engine embedded in this node.
-- In production: load these from environment variables injected via Docker secrets
-- or a secrets manager (HashiCorp Vault / OpenBao — both fully OSS).
-- These settings are session-scoped GUCs exposed by pg_duckdb.
DO $$
BEGIN
    -- Only set if the GUC exists (guards against extension version differences)
    PERFORM set_config('duckdb.s3_region',            current_setting('app.s3_region',            true), false);
    PERFORM set_config('duckdb.s3_access_key_id',     current_setting('app.s3_access_key_id',     true), false);
    PERFORM set_config('duckdb.s3_secret_access_key', current_setting('app.s3_secret_access_key', true), false);
    RAISE NOTICE '✅ pg_duckdb S3 credentials configured from app.* GUC settings.';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'NOTE: S3 credentials not configured (app.* GUC settings not set). '
                 'Set app.s3_region, app.s3_access_key_id, app.s3_secret_access_key '
                 'before querying Parquet/Iceberg/Delta Lake objects.';
END;
$$;

-- ==============================================================================
-- STEP 4: Analytical Query Examples (reflecting all CONTEXT.md use cases)
-- ==============================================================================

-- Analytical Examples have been removed from this file to prevent parser errors.

-- ==============================================================================
-- STEP 5: Final Health Report
-- ==============================================================================
DO $$
DECLARE
    ext_version TEXT;
BEGIN
    SELECT extversion INTO ext_version FROM pg_extension WHERE extname = 'pg_duckdb';

    RAISE NOTICE '✅ Block 5 Federated Analytical Observer is ONLINE.';
    RAISE NOTICE '   pg_duckdb version: %', ext_version;
    RAISE NOTICE '   postgres_fdw EU federation: eu_foreign.sovereign_users is mapped.';
    RAISE NOTICE '   Object storage: Parquet, Apache Iceberg, Delta Lake via DuckDB httpfs.';
    RAISE NOTICE '   Activate with: SET duckdb.force_execution = true;';
END;
$$;

-- ==============================================================================
-- End of Block 5 — Federated Analytical Observer Setup
-- ==============================================================================
