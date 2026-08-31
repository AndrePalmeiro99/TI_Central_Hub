import pg from 'pg';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// 1. Adicionar coluna base_assigned se não existir
console.log('Adicionando coluna base_assigned...');
await pool.query(`
  ALTER TABLE franchise_royalties_config 
  ADD COLUMN IF NOT EXISTS base_assigned TEXT
`);
console.log('Coluna criada OK');

// 2. Adicionar unique constraint em franchise_name se não existir
console.log('Verificando constraint em franchise_name...');
await pool.query(`
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'franchise_royalties_config_franchise_name_key'
    ) THEN
      ALTER TABLE franchise_royalties_config ADD CONSTRAINT franchise_royalties_config_franchise_name_key UNIQUE (franchise_name);
    END IF;
  END$$
`).catch(e => console.log('Constraint já existe ou erro:', e.message));

// 3. Bulk insert de todos os dados do JSON
const data = JSON.parse(readFileSync('./src/data/franchiseBases.json', 'utf8'));
const entries = Object.entries(data);
console.log(`Importando ${entries.length} franquias em bulk...`);

// Quebrar em lotes de 100 para evitar limite de parâmetros
const BATCH = 100;
let total = 0;
for (let i = 0; i < entries.length; i += BATCH) {
  const batch = entries.slice(i, i + BATCH);
  const placeholders = batch.map((_, j) => `($${j*2+1}, $${j*2+2})`).join(',');
  const params = batch.flatMap(([name, base]) => [name.trim().toUpperCase(), base]);
  await pool.query(
    `INSERT INTO franchise_royalties_config (franchise_name, base_assigned) 
     VALUES ${placeholders}
     ON CONFLICT (franchise_name) DO UPDATE SET base_assigned = EXCLUDED.base_assigned`,
    params
  );
  total += batch.length;
  console.log(`  ${total}/${entries.length} inseridas...`);
}

const count = await pool.query('SELECT COUNT(*) FROM franchise_royalties_config');
console.log(`\nTotal no banco: ${count.rows[0].count}`);
await pool.end();
