-- ==============================================================================
-- Block 6: The Temporal Control Plane (Git for Data)
-- ==============================================================================

-- 1. Native PostgreSQL Trigger (Temporal Tables Fallback)
-- Since the temporal_tables extension isn't available in this image,
-- we use a native trigger to emulate the system versioning.
-- CREATE EXTENSION IF NOT EXISTS temporal_tables;
-- CREATE EXTENSION IF NOT EXISTS periods;

-- ==============================================================================
-- Temporal Time-Travel & System Versioning
-- ==============================================================================

-- 2. Upgrade the active table to support system periods
ALTER TABLE sovereign_users 
  ADD COLUMN sys_period tstzrange NOT NULL DEFAULT tstzrange(current_timestamp, null);

-- 3. Create the immutable History Table (The Append-Only Event Log)
CREATE TABLE sovereign_users_history (LIKE sovereign_users);

-- 4. Bind the tables using a native versioning trigger
CREATE OR REPLACE FUNCTION save_history() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    INSERT INTO sovereign_users_history VALUES (OLD.*);
  END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.sys_period = tstzrange(current_timestamp, null);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER versioning_trigger
  BEFORE UPDATE OR DELETE ON sovereign_users
  FOR EACH ROW EXECUTE PROCEDURE save_history();

-- SELECT periods.add_system_time_period('sovereign_users', 'sys_period');
-- SELECT periods.add_system_versioning('sovereign_users');

-- ==============================================================================
-- Secure Developer Branching (The Obfuscation Bridge)
-- ==============================================================================

-- 5. Create the Developer Role for isolated branch testing
CREATE ROLE developer_branch_role WITH LOGIN PASSWORD 'DevTesting123!';
GRANT CONNECT ON DATABASE sovra_db TO developer_branch_role;
GRANT USAGE ON SCHEMA public TO developer_branch_role;
GRANT SELECT ON TABLE sovereign_users TO developer_branch_role;
GRANT SELECT ON TABLE sovereign_users_history TO developer_branch_role;

-- 6. Enforce Cryptographic Obfuscation on the Active Branch
-- Moved to obfuscation_engine/01_cryptographic_rules.sql to avoid ordering errors.
-- SECURITY LABEL FOR anon ON COLUMN sovereign_users.full_name IS 'MASKED WITH FUNCTION anon.fake_first_name()';

-- 7. Enforce Cryptographic Obfuscation on the History Table
-- Moved to obfuscation_engine/01_cryptographic_rules.sql to avoid ordering errors.
-- SECURITY LABEL FOR anon ON COLUMN sovereign_users_history.full_name IS 'MASKED WITH FUNCTION anon.fake_first_name()';

-- Note: Because Format-Preserving Encryption (FPE) is handled at the Gateway (Block 1),
-- the history log organically inherits the FPE protection for credit cards and SSNs.
-- They were never stored in plaintext to begin with!
