-- Create a restricted role for the API that does NOT have Bypass RLS
CREATE ROLE api_user NOLOGIN;

-- Grant usage on schemas
GRANT USAGE ON SCHEMA public TO api_user;
GRANT USAGE ON SCHEMA sovra_control TO api_user;

-- Grant access to the tables so the API can read/write data
GRANT ALL PRIVILEGES ON TABLE public.sovereign_users TO api_user;
GRANT ALL PRIVILEGES ON TABLE sovra_control.developers TO api_user;
GRANT ALL PRIVILEGES ON TABLE sovra_control.projects TO api_user;
