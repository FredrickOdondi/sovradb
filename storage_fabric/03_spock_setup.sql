-- ==============================================================================
-- Block 2: Multi-Master Logical Replication — spock (pgEdge)
-- Extension: spock (github.com/pgEdge/spock — PostgreSQL License)
--
-- spock v4.x provides write-anywhere, multi-master logical replication for
-- PostgreSQL 18. It leverages PostgreSQL's built-in logical decoding 
-- (pgoutput plugin) and on PG18+ delegates slot failover to the native
-- slotsync background worker, removing the need for any core PG patches.
--
-- Architecture:
--   - postgres_us (port 5432) ← peer → postgres_eu (port 5433)
--   - Each node is a full provider AND subscriber, enabling bidirectional writes.
--   - Conflict resolution: LAST_UPDATE_WINS (timestamp-based via track_commit_timestamp)
--
-- PG18-specific settings required (set in docker-compose.yml command):
--   shared_preload_libraries = 'spock'
--   wal_level = logical
--   track_commit_timestamp = on
--   max_active_replication_origins = 20
--
-- IMPORTANT: This script is meant to be run INTERACTIVELY after both nodes
-- are up, not at initdb time (since it requires network connectivity to the
-- peer node). Run it manually or via a post-start entrypoint hook.
-- ==============================================================================

-- 1. Enable the spock extension on this node
-- CREATE EXTENSION IF NOT EXISTS spock;

-- ==============================================================================
-- NODE IDENTITY
-- Each node must have a unique node name and its own DSN.
-- Run this block on each respective node, substituting the correct node_dsn.
-- ==============================================================================

-- On the US node (sovra_postgres_us), run:
-- SELECT spock.create_node(
--     node_name := 'us_node',
--     dsn       := 'host=sovra_postgres_us port=5432 dbname=sovra_db user=spock_replication_user password=SpockRepl123!'
-- );

-- On the EU node (sovra_postgres_eu), run:
-- SELECT spock.create_node(
--     node_name := 'eu_node',
--     dsn       := 'host=sovra_postgres_eu port=5432 dbname=sovra_db user=spock_replication_user password=SpockRepl123!'
-- );

-- ==============================================================================
-- REPLICATION USER
-- spock requires a dedicated superuser-equivalent role for logical decoding.
-- ==============================================================================
-- CREATE ROLE spock_replication_user WITH LOGIN REPLICATION PASSWORD 'SpockRepl123!';
-- GRANT ALL PRIVILEGES ON DATABASE sovra_db TO spock_replication_user;

-- ==============================================================================
-- REPLICATION SETS
-- spock uses named "replication sets" to define which tables are replicated.
-- We create a sovereignty-aware set: US data stays on US, EU data stays on EU.
-- 
-- The geo-partitioned design in Block 2 enforces physical locality via
-- tablespaces. spock's replication set filter ensures logical sovereignty:
-- EU data is never streamed to the US node's subscription (and vice versa).
-- ==============================================================================

-- Create a replication set for US-region rows only
-- SELECT spock.create_replication_set(
--     set_name   := 'us_sovereign_set',
--     replicate_insert := true,
--     replicate_update := true,
--     replicate_delete := true,
--     replicate_truncate := false
-- );

-- Create a replication set for EU-region rows only
-- SELECT spock.create_replication_set(
--     set_name   := 'eu_sovereign_set',
--     replicate_insert := true,
--     replicate_update := true,
--     replicate_delete := true,
--     replicate_truncate := false
-- );

-- Add the geo-partitioned table to the appropriate replication set
-- Only rows matching the partition's region_code are replicated within that set.
-- SELECT spock.replication_set_add_table(
--     set_name   := 'us_sovereign_set',
--     relation   := 'public.sovereign_users',
--     synchronize_data := false,
--     row_filter := $$ region_code = 'US' $$
-- );

-- SELECT spock.replication_set_add_table(
--     set_name   := 'eu_sovereign_set',
--     relation   := 'public.sovereign_users',
--     synchronize_data := false,
--     row_filter := $$ region_code = 'EU' $$
-- );

-- ==============================================================================
-- SUBSCRIPTIONS (run after both nodes are online)
-- On the US node: subscribe to the EU replication set for cross-region reads
-- On the EU node: subscribe to the US replication set for cross-region reads
--
-- For strict sovereignty, you would NOT subscribe cross-region at the row level
-- (only aggregate FDW queries cross borders, as in Block 5). The subscriptions
-- below are for operational replication within the control plane tables only.
-- ==============================================================================

-- On the US node:
-- SELECT spock.create_subscription(
--     subscription_name  := 'sub_eu_to_us',
--     provider_dsn       := 'host=sovra_postgres_eu port=5432 dbname=sovra_db user=spock_replication_user password=SpockRepl123!',
--     replication_sets   := ARRAY['default'],
--     synchronize_data   := false
-- );

-- ==============================================================================
-- VERIFICATION
-- Run after spock is active on both nodes:
--   SELECT * FROM spock.node;
--   SELECT * FROM spock.subscription;
-- ==============================================================================
