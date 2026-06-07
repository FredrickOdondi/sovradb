-- ==============================================================================
-- Block 2: Geo-Partitioned Multi-Tenant Schema (PostgreSQL 18 Native)
-- ==============================================================================

-- 1. Create the Multi-Tenant Base Table (Declarative Partitioning)
-- Utilizing native PostgreSQL 18 uuidv7() function as the primary key default 
-- to prevent B-tree index fragmentation in high-write environments.
CREATE TABLE sovereign_users (
    id UUID DEFAULT uuidv7() NOT NULL,
    tenant_id UUID NOT NULL,
    region_code VARCHAR(2) NOT NULL,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    PRIMARY KEY (region_code, id)
) PARTITION BY LIST (region_code);

-- 2. Physically Bind Partitions to Geographic Tablespaces
-- The database engine natively routes INSERT operations based on region_code, 
-- physically pinning the tuples to the encrypted geographic SSDs.

-- European Union Partition
CREATE TABLE sovereign_users_eu 
    PARTITION OF sovereign_users 
    FOR VALUES IN ('EU') 
    TABLESPACE eu_data_space;

-- Africa Partition
CREATE TABLE sovereign_users_af
    PARTITION OF sovereign_users
    FOR VALUES IN ('AF')
    TABLESPACE af_data_space;

-- United States Partition
CREATE TABLE sovereign_users_us 
    PARTITION OF sovereign_users 
    FOR VALUES IN ('US') 
    TABLESPACE us_data_space;
