-- Add type column to databases table
ALTER TABLE databases ADD COLUMN IF NOT EXISTS type VARCHAR(50) NOT NULL DEFAULT 'mysql';

-- Add check constraint to ensure valid database types
ALTER TABLE databases DROP CONSTRAINT IF EXISTS databases_type_check;
ALTER TABLE databases ADD CONSTRAINT databases_type_check
    CHECK (type IN ('mysql', 'postgres', 'mssql', 'mongodb'));

-- Create index on type for faster filtering
CREATE INDEX IF NOT EXISTS idx_databases_type ON databases(type);

-- Update existing records to have explicit type
UPDATE databases SET type = 'mysql' WHERE type = 'mysql' OR type IS NULL;
