-- Fix RLS policy to properly match user IDs
-- The issue is that current_user is 'slack_teamid_userid' but data->>'userId' is just 'userid'
-- We need to extract the userid part from current_user for comparison

-- Drop the existing policy
DROP POLICY IF EXISTS user_job_isolation ON pgboss.job;

-- Create a fixed RLS policy that properly extracts user ID
CREATE POLICY user_job_isolation ON pgboss.job
FOR ALL 
USING (
    -- Allow superusers and system accounts full access
    current_user = 'postgres' 
    OR pg_has_role(current_user, 'postgres', 'MEMBER')
    OR current_user LIKE 'peerbot_%'
    OR
    -- User can access jobs with their user ID in data
    -- Extract the user ID from database username (slack_teamid_userid -> userid)
    (data ? 'userId' AND data->>'userId' = regexp_replace(current_user, '^slack_[^_]+_', ''))
    OR
    -- User can access thread messages for their deployments  
    (name LIKE 'thread_message_%' AND 
     name LIKE 'thread_message_peerbot-worker-%' AND
     data ? 'userId' AND 
     data->>'userId' = regexp_replace(current_user, '^slack_[^_]+_', ''))
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
    -- Extract the user ID from database username for comparison
    (data ? 'userId' AND data->>'userId' = regexp_replace(current_user, '^slack_[^_]+_', ''))
    OR
    (name LIKE 'thread_message_%' AND 
     name LIKE 'thread_message_peerbot-worker-%' AND
     data ? 'userId' AND 
     data->>'userId' = regexp_replace(current_user, '^slack_[^_]+_', ''))
    OR
    (NOT (data ? 'userId'))
);

-- Update the trigger function to handle user ID extraction properly
CREATE OR REPLACE FUNCTION ensure_job_user_context()
RETURNS TRIGGER AS $$
BEGIN
    -- Only modify jobs that have user data
    IF NEW.data ? 'userId' THEN
        -- Extract user ID from database username (format: slack_team_userid)
        DECLARE
            extracted_user_id TEXT;
        BEGIN
            -- Extract the user portion from usernames like 'slack_team_U123456'  
            extracted_user_id := regexp_replace(current_user, '^slack_[^_]+_', '');
            
            -- If we extracted a user ID and it's different from what's in the job data
            -- then update the job data to match (this should rarely happen now)
            IF extracted_user_id != current_user AND NEW.data->>'userId' != extracted_user_id THEN
                NEW.data = jsonb_set(NEW.data, '{userId}', to_jsonb(extracted_user_id));
                RAISE NOTICE 'Updated job userId from % to % for user %', NEW.data->>'userId', extracted_user_id, current_user;
            END IF;
        END;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add comment explaining the fix
COMMENT ON POLICY user_job_isolation ON pgboss.job IS 
'Fixed RLS policy that properly extracts user ID from database username (slack_teamid_userid -> userid) for comparison with job data userId';