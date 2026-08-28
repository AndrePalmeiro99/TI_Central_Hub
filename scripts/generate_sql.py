import json
import os

with open(r'src\data\franchiseBases.secret.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

sql = """
-- 1. Create the table
CREATE TABLE IF NOT EXISTS franchise_bases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    franchise_name TEXT UNIQUE NOT NULL,
    base_assigned TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Setup RLS so anyone authenticated can read, but no one can write (except postgres role)
ALTER TABLE franchise_bases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read for auth users" ON franchise_bases;
CREATE POLICY "Allow read for auth users" ON franchise_bases FOR SELECT USING (auth.role() = 'authenticated');

-- 3. Clear existing data to avoid duplicates if re-running
TRUNCATE TABLE franchise_bases;

-- 4. Insert data
INSERT INTO franchise_bases (franchise_name, base_assigned) VALUES
"""

values = []
for k, v in data.items():
    # escape single quotes
    safe_k = k.replace("'", "''")
    safe_v = v.replace("'", "''")
    values.append(f"('{safe_k}', '{safe_v}')")

sql += ',\n'.join(values) + ';\n'

with open(r'docs\architecture\migration_bases.sql', 'w', encoding='utf-8') as f:
    f.write(sql)
print('Migration SQL created')
