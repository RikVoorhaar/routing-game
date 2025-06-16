-- Create database and user with proper permissions
-- Note: POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD are already handled by the postgres image

-- Grant all necessary permissions to the routing_user
GRANT ALL PRIVILEGES ON DATABASE routing_game TO routing_user;

-- Create schema if needed and grant permissions
GRANT USAGE, CREATE ON SCHEMA public TO routing_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO routing_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO routing_user;

-- Ensure future tables and sequences also have the right permissions
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO routing_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO routing_user; 