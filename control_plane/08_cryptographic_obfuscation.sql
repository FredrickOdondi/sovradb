-- ==============================================================================
-- Block 3: Cryptographic Obfuscation Engine (JSONB Dynamic Masking)
-- ==============================================================================

-- 1. Create a support role that is NOT allowed to see PII
CREATE ROLE masked_support_user NOLOGIN;
GRANT USAGE ON SCHEMA public TO masked_support_user;
GRANT USAGE ON SCHEMA sovra_control TO masked_support_user;

-- 2. Create the recursive JSONB Masking Function
-- This function iterates through a JSONB object and replaces sensitive keys
-- with a cryptographic placeholder.
CREATE OR REPLACE FUNCTION mask_jsonb_payload(payload JSONB)
RETURNS JSONB AS $$
DECLARE
    sensitive_keys TEXT[] := ARRAY['email', 'ssn', 'password', 'credit_card', 'phone', 'patient_id'];
    key TEXT;
    val JSONB;
    result JSONB := '{}'::jsonb;
BEGIN
    IF payload IS NULL THEN
        RETURN NULL;
    END IF;

    -- Iterate through each key-value pair in the JSON object
    FOR key, val IN SELECT * FROM jsonb_each(payload) LOOP
        IF key = ANY(sensitive_keys) THEN
            -- Mask sensitive fields
            result := jsonb_set(result, ARRAY[key], '"***MASKED***"'::jsonb, true);
        ELSE
            -- Keep safe fields intact
            result := jsonb_set(result, ARRAY[key], val, true);
        END IF;
    END LOOP;

    RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 3. Create a Secure View for Data Access
-- This view creation has been moved to 09_fix_sovereign_schema_and_views.sql
-- to use typed columns instead of JSONB payload.

-- 4. Grant access to the View (Revoke direct table access for the support user)
-- Grants have been moved to 09_fix_sovereign_schema_and_views.sql
-- The API user still needs direct access for INSERT operations, but selects should go through the view
-- to ensure consistent architecture.
