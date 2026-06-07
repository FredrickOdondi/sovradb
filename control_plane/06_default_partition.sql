-- Create a default partition for the rest of the world (including Africa)
-- This acts as a catch-all for any region_code that isn't 'US' or 'EU'
CREATE TABLE IF NOT EXISTS sovereign_users_global 
    PARTITION OF sovereign_users 
    DEFAULT 
    TABLESPACE us_data_space;
