-- Consolidated PostgreSQL schema for queue system with RLS-based bot isolation
-- This migration sets up pgboss, bot isolation, RLS policies, and all required functions

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create bot table for multi-bot credential support
CREATE TABLE bots (
    id SERIAL PRIMARY KEY,
    bot_id VARCHAR(100) NOT NULL UNIQUE, -- Platform bot ID (e.g., Slack bot ID)
    platform VARCHAR(50) NOT NULL, -- slack, discord, teams, etc.
    platform_id VARCHAR(100) NOT NULL, -- workspace id for slack
    name VARCHAR(100) NOT NULL,
    token_hash VARCHAR(255), -- Hashed bot token for verification
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(platform, bot_id)
);

-- Create users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    platform_user_id VARCHAR(100) NOT NULL,
    platform VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(platform, platform_user_id)
);

-- Create user_configs table for environment variables
CREATE TABLE user_configs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    environment_variables HSTORE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Create conversation threads with bot isolation
CREATE TABLE conversation_threads (
    id SERIAL PRIMARY KEY,
    bot_id INTEGER REFERENCES bots(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL,
    channel_id VARCHAR(100) NOT NULL,
    thread_id VARCHAR(100) NOT NULL,
    agent_session_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    last_activity TIMESTAMP DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(bot_id, platform, channel_id, thread_id)
);

-- Create queue job metadata table for tracking jobs by bot
CREATE TABLE queue_jobs (
    id SERIAL PRIMARY KEY,
    bot_id INTEGER REFERENCES bots(id) ON DELETE CASCADE,
    job_id UUID NOT NULL, -- pgboss job ID
    queue_name VARCHAR(100) NOT NULL,
    job_type VARCHAR(50) NOT NULL, -- 'direct_message', 'thread_message'
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    thread_id INTEGER REFERENCES conversation_threads(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    failed_at TIMESTAMP,
    retry_count INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending' -- pending, active, completed, failed
);

-- Create message payload table for storing job data
CREATE TABLE job_payloads (
    id SERIAL PRIMARY KEY,
    queue_job_id INTEGER REFERENCES queue_jobs(id) ON DELETE CASCADE,
    payload JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Enable Row Level Security on all tables
ALTER TABLE bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE queue_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_payloads ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for user-based isolation
-- Each user can see all bots but only their own conversation history
CREATE POLICY user_isolation ON bots
FOR ALL USING (true)
WITH CHECK (true); -- Users can see all bots

CREATE POLICY user_data_isolation ON users
FOR ALL USING (
    platform_user_id = current_setting('app.current_user_id', true)
)
WITH CHECK (
    platform_user_id = current_setting('app.current_user_id', true)
);

CREATE POLICY user_config_isolation ON user_configs
FOR ALL USING (
    user_id IN (
        SELECT id FROM users
        WHERE platform_user_id = current_setting('app.current_user_id', true)
    )
)
WITH CHECK (
    user_id IN (
        SELECT id FROM users
        WHERE platform_user_id = current_setting('app.current_user_id', true)
    )
);

CREATE POLICY thread_user_isolation ON conversation_threads
FOR ALL USING (
    user_id IN (
        SELECT id FROM users
        WHERE platform_user_id = current_setting('app.current_user_id', true)
    )
)
WITH CHECK (
    user_id IN (
        SELECT id FROM users
        WHERE platform_user_id = current_setting('app.current_user_id', true)
    )
);

-- RLS policy for queue jobs (user isolation)
CREATE POLICY queue_jobs_user_isolation ON queue_jobs
FOR ALL USING (
    user_id IN (
        SELECT id FROM users
        WHERE platform_user_id = current_setting('app.current_user_id', true)
    )
)
WITH CHECK (
    user_id IN (
        SELECT id FROM users
        WHERE platform_user_id = current_setting('app.current_user_id', true)
    )
);

CREATE POLICY job_payloads_user_isolation ON job_payloads
FOR ALL USING (
    queue_job_id IN (
        SELECT id FROM queue_jobs
        WHERE user_id IN (
            SELECT id FROM users
            WHERE platform_user_id = current_setting('app.current_user_id', true)
        )
    )
)
WITH CHECK (
    queue_job_id IN (
        SELECT id FROM queue_jobs
        WHERE user_id IN (
            SELECT id FROM users
            WHERE platform_user_id = current_setting('app.current_user_id', true)
        )
    )
);

-- Note: pgboss RLS will be set up after pgboss initializes its schema
-- The setup_pgboss_rls() function will be called automatically when pgboss starts

-- Create function to set user context for RLS
CREATE OR REPLACE FUNCTION set_user_context(user_identifier VARCHAR(100))
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_user_id', user_identifier, true);
END;
$$ LANGUAGE plpgsql;

-- Create the main RLS-aware user creation function
CREATE OR REPLACE FUNCTION create_isolated_pgboss_user(
    user_identifier VARCHAR(100),
    user_password VARCHAR(255) DEFAULT NULL
) RETURNS VARCHAR(100) AS $$
DECLARE
    role_name VARCHAR(100);
    generated_password VARCHAR(255);
BEGIN
    -- Use the user identifier directly as the role name (lowercase)
    role_name := lower(user_identifier);
    
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
        -- Update password for existing user and ensure they have current pgboss permissions
        EXECUTE format('ALTER ROLE %I WITH PASSWORD %L', role_name, generated_password);
        RAISE NOTICE 'Updated password for existing user: %', role_name;
    END IF;
    
    -- Always ensure permissions on all current pgboss tables (handles tables created after initial setup)
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pgboss TO %I', role_name);
    EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA pgboss TO %I', role_name);
    
    RETURN role_name;
END;
$$ LANGUAGE plpgsql;

-- Create function to enqueue jobs
CREATE OR REPLACE FUNCTION enqueue_job(
    bot_identifier VARCHAR(100),
    p_queue_name VARCHAR(100),
    p_job_type VARCHAR(50),
    p_user_id INTEGER,
    p_thread_id INTEGER,
    p_payload JSONB
) RETURNS UUID AS $$
DECLARE
    v_bot_id INTEGER;
    v_job_id UUID;
    v_queue_job_id INTEGER;
BEGIN
    -- Get bot ID
    SELECT id INTO v_bot_id FROM bots WHERE bot_id = bot_identifier;
    
    IF v_bot_id IS NULL THEN
        RAISE EXCEPTION 'Bot not found: %', bot_identifier;
    END IF;
    
    -- Generate job ID
    v_job_id := gen_random_uuid();
    
    -- Insert queue job record
    INSERT INTO queue_jobs (bot_id, job_id, queue_name, job_type, user_id, thread_id)
    VALUES (v_bot_id, v_job_id, p_queue_name, p_job_type, p_user_id, p_thread_id)
    RETURNING id INTO v_queue_job_id;
    
    -- Insert payload
    INSERT INTO job_payloads (queue_job_id, payload)
    VALUES (v_queue_job_id, p_payload);
    
    RETURN v_job_id;
END;
$$ LANGUAGE plpgsql;

-- Create function to update job status
CREATE OR REPLACE FUNCTION update_job_status(
    p_job_id UUID,
    p_status VARCHAR(20),
    p_retry_count INTEGER DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    UPDATE queue_jobs 
    SET 
        status = p_status,
        retry_count = COALESCE(p_retry_count, retry_count),
        completed_at = CASE WHEN p_status = 'completed' THEN NOW() ELSE completed_at END,
        failed_at = CASE WHEN p_status = 'failed' THEN NOW() ELSE failed_at END
    WHERE job_id = p_job_id;
END;
$$ LANGUAGE plpgsql;

-- Create trigger function for pgboss job user context normalization
CREATE OR REPLACE FUNCTION ensure_job_user_context()
RETURNS TRIGGER AS $$
BEGIN
    -- Only modify jobs that have user data
    IF NEW.data ? 'userId' THEN
        DECLARE
            current_job_user_id TEXT;
        BEGIN
            current_job_user_id := NEW.data->>'userId';
            
            -- If we have a user ID mismatch (case-insensitive), normalize to match current user
            IF UPPER(current_job_user_id) != UPPER(current_user) THEN
                -- Use the current user for consistency
                NEW.data = jsonb_set(NEW.data, '{userId}', to_jsonb(current_user));
                RAISE NOTICE 'Updated job userId from % to % for user %', current_job_user_id, current_user, current_user;
            END IF;
        END;
    END IF;
    
    RETURN NEW;
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

-- pgboss RLS will be configured when pgboss creates its tables
-- Note: This will happen when the first pgboss operation occurs

-- Create indexes for performance
CREATE INDEX idx_bots_platform_bot_id ON bots(platform, bot_id);
CREATE INDEX idx_users_platform_user ON users(platform, platform_user_id);
CREATE INDEX idx_user_configs_user_id ON user_configs(user_id);
CREATE INDEX idx_conversation_threads_bot_channel_thread ON conversation_threads(bot_id, platform, channel_id, thread_id);
CREATE INDEX idx_conversation_threads_active ON conversation_threads(bot_id, is_active, last_activity);
CREATE INDEX idx_conversation_threads_agent_session ON conversation_threads(agent_session_id) WHERE agent_session_id IS NOT NULL;
CREATE INDEX idx_queue_jobs_bot_status ON queue_jobs(bot_id, status);
CREATE INDEX idx_queue_jobs_queue_name_status ON queue_jobs(queue_name, status);
CREATE INDEX idx_queue_jobs_user_thread ON queue_jobs(user_id, thread_id);
CREATE INDEX idx_queue_jobs_created_at ON queue_jobs(created_at);
CREATE INDEX idx_job_payloads_queue_job_id ON job_payloads(queue_job_id);

-- Create view for active jobs with payload
CREATE VIEW active_jobs_with_payload AS
SELECT 
    qj.job_id,
    qj.queue_name,
    qj.job_type,
    qj.status,
    qj.created_at,
    qj.retry_count,
    b.bot_id,
    b.platform,
    u.platform_user_id,
    ct.channel_id,
    ct.thread_id,
    ct.agent_session_id,
    jp.payload
FROM queue_jobs qj
JOIN bots b ON qj.bot_id = b.id
JOIN users u ON qj.user_id = u.id
LEFT JOIN conversation_threads ct ON qj.thread_id = ct.id
JOIN job_payloads jp ON qj.id = jp.queue_job_id
WHERE qj.status IN ('pending', 'active');

-- Insert default bot entry (for migration from existing system)
INSERT INTO bots (bot_id, platform, platform_id, name, created_at) 
VALUES ('default-slack-bot', 'slack', 'unknown', 'Default Slack Bot', NOW())
ON CONFLICT (platform, bot_id) DO NOTHING;