-- Enable RLS on the global sovereign_users table
ALTER TABLE sovereign_users ENABLE ROW LEVEL SECURITY;

-- Create a policy that restricts access based on the 'app.current_tenant' session variable
-- The 'true' argument in current_setting ensures it returns NULL instead of throwing an error if the variable is missing
CREATE POLICY tenant_isolation_policy 
ON sovereign_users 
FOR ALL 
USING (tenant_id::text = current_setting('app.current_tenant', true));

-- Note: Superusers (like sovra_admin) bypass RLS by default.
-- To force RLS even for the table owner, we would use ALTER TABLE sovereign_users FORCE ROW LEVEL SECURITY;
-- However, we want the Global Admin (Workbench) to see everything, so we leave FORCE off.
