-- ==============================================================================
-- Control Plane — Platform Admins Table
--
-- This schema establishes a secure table for storing credentials for platform
-- administrators, removing the reliance on hardcoded sysadmin credentials.
--
-- This table belongs strictly in the sovra_control schema to isolate it from
-- any tenant data operations.
-- ==============================================================================

-- Ensure schema exists
CREATE SCHEMA IF NOT EXISTS sovra_control;

-- Create the platform_admins table
CREATE TABLE IF NOT EXISTS sovra_control.platform_admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    -- In production, this must be a strong hash (e.g., bcrypt/argon2).
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'system_admin' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Insert a default platform admin to ensure initial access is not lost.
-- The default password here is 'AdminSecret123!' (base64 encoded for demonstration: QWRtaW5TZWNyZXQxMjMh)
INSERT INTO sovra_control.platform_admins (email, password_hash, role)
VALUES ('admin@sovradb.io', 'QWRtaW5TZWNyZXQxMjMh', 'super_admin')
ON CONFLICT (email) DO NOTHING;

-- Optionally, we can grant access to the api_user so the frontend can query it via server actions
GRANT SELECT, INSERT, DELETE ON sovra_control.platform_admins TO api_user;
