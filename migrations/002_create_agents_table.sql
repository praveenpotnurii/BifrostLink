-- Migration: Create agents table
-- Description: Schema for agent management and tracking

CREATE TABLE IF NOT EXISTS agents (
    id SERIAL PRIMARY KEY,
    agent_id VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster lookups
CREATE INDEX idx_agents_agent_id ON agents(agent_id);

-- Insert sample agents for testing
INSERT INTO agents (agent_id, name, description) VALUES
    ('agent-agent1', 'Primary Agent', 'Main database agent for MySQL operations'),
    ('agent-agent2', 'Secondary Agent', 'Backup agent for high availability')
ON CONFLICT (agent_id) DO NOTHING;

-- Create updated_at trigger function for agents
CREATE TRIGGER update_agents_updated_at
    BEFORE UPDATE ON agents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
