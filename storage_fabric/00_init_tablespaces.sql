-- ==============================================================================
-- Block 2: Physical Storage Boundaries (Tablespaces)
-- ==============================================================================

-- Create physical tablespaces to pin data to isolated geographic storage volumes.
-- These abstractly map to distinct regional SSDs in production environments.

CREATE TABLESPACE us_data_space LOCATION '/var/lib/postgresql/data_us';
CREATE TABLESPACE eu_data_space LOCATION '/var/lib/postgresql/data_eu';
CREATE TABLESPACE af_data_space LOCATION '/var/lib/postgresql/data_af';
