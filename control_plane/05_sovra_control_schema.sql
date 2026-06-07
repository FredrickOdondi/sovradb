-- Create the strict Control Plane schema (isolated from the public Data Plane)
CREATE SCHEMA IF NOT EXISTS sovra_control;

-- The Developers Table: Accounts for the engineers signing up to use SovraDB
CREATE TABLE IF NOT EXISTS sovra_control.developers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- The Projects Table: Defines the strict logical boundaries (Tenants)
CREATE TABLE IF NOT EXISTS sovra_control.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    developer_id UUID NOT NULL REFERENCES sovra_control.developers(id) ON DELETE CASCADE,
    tenant_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    company_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    UNIQUE(developer_id, company_name)
);

-- Note: In a real DBaaS, there would also be tables for Billing, API Keys, and Usage Metrics.
