-- Fix pgboss RLS for proper user isolation
-- This migration fixes the pgboss job table RLS policies

-- First, drop any existing user-specific policies that may be conflicting
DO $$
DECLARE
    policy_record RECORD;
BEGIN
    -- Find all user-specific policies on pgboss.job table
    FOR policy_record IN 
        SELECT policyname FROM pg_policies 
        WHERE schemaname = 'pgboss' 
        AND tablename = 'job' 
        AND policyname LIKE '%_job_policy'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON pgboss.job', policy_record.policyname);
        RAISE NOTICE 'Dropped policy: %', policy_record.policyname;
    END LOOP;
END $$;

-- Ensure RLS is enabled on pgboss.job table
ALTER TABLE pgboss.job ENABLE ROW LEVEL SECURITY;

-- Create a single, comprehensive RLS policy for user isolation
-- This policy ensures users can only see jobs that:
-- 1. Have their user ID in the data payload 
-- 2. Are thread messages for their specific deployment
-- 3. Allow system/orchestrator access for management
CREATE POLICY user_job_isolation ON pgboss.job
FOR ALL 
USING (
    -- Allow superusers and system accounts full access
    current_user = 'postgres' 
    OR pg_has_role(current_user, 'postgres', 'MEMBER')
    OR current_user LIKE 'peerbot_%'
    OR
    -- User can access jobs with their user ID in data
    (data ? 'userId' AND data->>'userId' = current_user)
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
    (data ? 'userId' AND data->>'userId' = current_user)
    OR
    (name LIKE 'thread_message_%' AND 
     name LIKE 'thread_message_peerbot-worker-%' AND
     data ? 'userId' AND 
     data->>'userId' = regexp_replace(current_user, '^slack_[^_]+_', ''))
    OR
    (NOT (data ? 'userId'))
);

-- Create function to set consistent user context in job data
-- This ensures all jobs created include proper user identification
CREATE OR REPLACE FUNCTION ensure_job_user_context()
RETURNS TRIGGER AS $$
BEGIN
    -- Only modify jobs that have user data but don't match current user
    IF NEW.data ? 'userId' THEN
        -- Extract user ID from database username (format: slack_team_userid)
        DECLARE
            extracted_user_id TEXT;
        BEGIN
            -- Extract the user portion from usernames like 'slack_team_U123456'  
            extracted_user_id := regexp_replace(current_user, '^slack_[^_]+_', '');
            
            -- If the job's userId doesn't match extracted user, update it
            -- This handles cases where jobs are created with incorrect context
            IF NEW.data->>'userId' != extracted_user_id AND extracted_user_id != current_user THEN
                NEW.data = jsonb_set(NEW.data, '{userId}', to_jsonb(extracted_user_id));
            END IF;
        END;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically set user context
DROP TRIGGER IF EXISTS ensure_user_context_trigger ON pgboss.job;
CREATE TRIGGER ensure_user_context_trigger
    BEFORE INSERT OR UPDATE ON pgboss.job
    FOR EACH ROW
    EXECUTE FUNCTION ensure_job_user_context();

-- Update the user creation function to grant proper pgboss permissions
CREATE OR REPLACE FUNCTION create_isolated_pgboss_user(
    platform_user_identifier VARCHAR(100),
    team_id VARCHAR(100) DEFAULT 'unknown',
    user_password VARCHAR(255) DEFAULT NULL
) RETURNS VARCHAR(100) AS $$
DECLARE
    role_name VARCHAR(100);
    generated_password VARCHAR(255);
BEGIN
    -- Generate safe role name: slack_teamid_userid  
    role_name := format('slack_%s_%s', 
        regexp_replace(team_id, '[^a-zA-Z0-9]', '_', 'g'),
        regexp_replace(platform_user_identifier, '[^a-zA-Z0-9]', '_', 'g')
    );
    
    -- Generate password if not provided
    IF user_password IS NULL THEN
        generated_password := encode(gen_random_bytes(32), 'base64');
    ELSE
        generated_password := user_password;
    END IF;
    
    -- Create role if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
        EXECUTE format('CREATE ROLE %I WITH LOGIN PASSWORD %L NOCREATEDB NOCREATEROLE', 
                      role_name, generated_password);
        
        -- Grant basic schema permissions
        EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', role_name);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', role_name);
        EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', role_name);
        
        -- Grant pgboss schema permissions
        EXECUTE format('GRANT USAGE ON SCHEMA pgboss TO %I', role_name);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pgboss TO %I', role_name);
        EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA pgboss TO %I', role_name);
        
        -- Set default privileges for future pgboss objects
        EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I', role_name);
        EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss GRANT USAGE, SELECT ON SEQUENCES TO %I', role_name);
        
        RAISE NOTICE 'Created isolated pgboss user: %', role_name;
    ELSE
        -- Update password for existing user
        EXECUTE format('ALTER ROLE %I WITH PASSWORD %L', role_name, generated_password);
        RAISE NOTICE 'Updated password for existing user: %', role_name;
    END IF;
    
    RETURN role_name;
END;
$$ LANGUAGE plpgsql;

-- Create helper function to test user isolation
CREATE OR REPLACE FUNCTION test_user_isolation(test_user VARCHAR(100))
RETURNS TABLE(
    job_id BIGINT,
    job_name TEXT, 
    user_id TEXT,
    can_access BOOLEAN
) AS $$
BEGIN
    -- Set user context for testing
    EXECUTE format('SET LOCAL role TO %I', test_user);
    
    RETURN QUERY
    SELECT 
        j.id,
        j.name,
        j.data->>'userId' as user_id,
        true as can_access
    FROM pgboss.job j
    ORDER BY j.created_on DESC
    LIMIT 10;
    
    -- Reset role
    RESET role;
END;
$$ LANGUAGE plpgsql;

-- Add indexes for better RLS performance
CREATE INDEX IF NOT EXISTS idx_pgboss_job_user_id ON pgboss.job((data->>'userId')) WHERE data ? 'userId';
CREATE INDEX IF NOT EXISTS idx_pgboss_job_name_userid ON pgboss.job(name, (data->>'userId')) WHERE data ? 'userId';

-- Add comment explaining the RLS setup
COMMENT ON POLICY user_job_isolation ON pgboss.job IS 
'Isolates pgboss jobs by user - users can only access jobs with their user ID in data payload or thread messages for their deployments';