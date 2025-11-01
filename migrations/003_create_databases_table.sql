-- Migration: Create databases table
-- Description: Schema for database management with agent associations

CREATE TABLE IF NOT EXISTS databases (
    id SERIAL PRIMARY KEY,
    database_name VARCHAR(255) NOT NULL UNIQUE,
    agent_id VARCHAR(255) NOT NULL,
    host VARCHAR(255) NOT NULL,
    port VARCHAR(10) NOT NULL,
    username VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    db_name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (agent_id) REFERENCES agents(agent_id) ON DELETE CASCADE
);

-- Create index for faster lookups
CREATE INDEX idx_databases_database_name ON databases(database_name);
CREATE INDEX idx_databases_agent_id ON databases(agent_id);

-- Insert sample database for testing
INSERT INTO databases (database_name, agent_id, host, port, username, password, db_name, description) VALUES
    ('Local MySQL', 'agent-agent1', 'mysql', '3306', 'root', 'rootpassword', 'testdb', 'Local MySQL database for testing')
ON CONFLICT (database_name) DO NOTHING;

-- Create updated_at trigger for databases
CREATE TRIGGER update_databases_updated_at
    BEFORE UPDATE ON databases
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
