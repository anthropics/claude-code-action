-- Fix case sensitivity issue in RLS policy
-- The issue is that dispatcher creates jobs with uppercase user IDs (U095ZLHKP98)
-- but database usernames are lowercase (slack_t09513hdq77_u095zlhkp98)
-- We need case-insensitive comparison

-- Drop the existing policy
DROP POLICY IF EXISTS user_job_isolation ON pgboss.job;

-- Create a case-insensitive RLS policy
CREATE POLICY user_job_isolation ON pgboss.job
FOR ALL 
USING (
    -- Allow superusers and system accounts full access
    current_user = 'postgres' 
    OR pg_has_role(current_user, 'postgres', 'MEMBER')
    OR current_user LIKE 'peerbot_%'
    OR
    -- User can access jobs with their user ID in data (case-insensitive)
    -- Extract the user ID from database username (slack_teamid_userid -> userid)
    (data ? 'userId' AND UPPER(data->>'userId') = UPPER(regexp_replace(current_user, '^slack_[^_]+_', '')))
    OR
    -- User can access thread messages for their deployments (case-insensitive)
    (name LIKE 'thread_message_%' AND 
     name LIKE 'thread_message_peerbot-worker-%' AND
     data ? 'userId' AND 
     UPPER(data->>'userId') = UPPER(regexp_replace(current_user, '^slack_[^_]+_', '')))
    OR
    -- Allow access to jobs without user context (system jobs)
    (NOT (data ? 'userId'))
)
WITH CHECK (
    -- Same conditions for INSERT/UPDATE
    current_user = 'postgres' 
    OR pg_has_role(current_user, 'postgres', 'MEMBER')
    OR current_user LIKE 'peerbot_%'
    OR
    -- Extract the user ID from database username for comparison (case-insensitive)
    (data ? 'userId' AND UPPER(data->>'userId') = UPPER(regexp_replace(current_user, '^slack_[^_]+_', '')))
    OR
    (name LIKE 'thread_message_%' AND 
     name LIKE 'thread_message_peerbot-worker-%' AND
     data ? 'userId' AND 
     UPPER(data->>'userId') = UPPER(regexp_replace(current_user, '^slack_[^_]+_', '')))
    OR
    (NOT (data ? 'userId'))
);

-- Update the trigger function to normalize case
CREATE OR REPLACE FUNCTION ensure_job_user_context()
RETURNS TRIGGER AS $$
BEGIN
    -- Only modify jobs that have user data
    IF NEW.data ? 'userId' THEN
        -- Extract user ID from database username (format: slack_team_userid)
        DECLARE
            extracted_user_id TEXT;
            current_job_user_id TEXT;
        BEGIN
            -- Extract the user portion from usernames like 'slack_team_U123456'  
            extracted_user_id := regexp_replace(current_user, '^slack_[^_]+_', '');
            current_job_user_id := NEW.data->>'userId';
            
            -- If we have a user ID mismatch (case-insensitive), normalize to uppercase
            IF extracted_user_id != current_user AND UPPER(current_job_user_id) != UPPER(extracted_user_id) THEN
                -- Use the uppercase version for consistency
                NEW.data = jsonb_set(NEW.data, '{userId}', to_jsonb(UPPER(extracted_user_id)));
                RAISE NOTICE 'Updated job userId from % to % for user %', current_job_user_id, UPPER(extracted_user_id), current_user;
            END IF;
        END;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add comment explaining the case-insensitive fix
COMMENT ON POLICY user_job_isolation ON pgboss.job IS 
'Case-insensitive RLS policy that properly extracts user ID from database username (slack_teamid_userid -> userid) for comparison with job data userId';