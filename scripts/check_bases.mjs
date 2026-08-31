import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const cols = await pool.query(
  "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'franchise_royalties_config'"
);
console.log('=== COLUNAS franchise_royalties_config ===');
console.log(cols.rows.map(r => `${r.column_name} (${r.data_type})`).join('\n'));

const sample = await pool.query('SELECT * FROM franchise_royalties_config LIMIT 2');
console.log('\n=== AMOSTRA ===');
console.log(JSON.stringify(sample.rows, null, 2));

await pool.end();
