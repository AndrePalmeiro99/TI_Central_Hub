import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// Check table columns
const cols = await pool.query(
  "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'user_profiles'"
);
console.log('=== COLUNAS user_profiles ===');
console.log(cols.rows.map(r => `${r.column_name} (${r.data_type})`).join('\n'));

// Check password field for a sample user
const sample = await pool.query(
  "SELECT email, role, password_hash, password FROM user_profiles LIMIT 3"
).catch(() => pool.query("SELECT email, role, password_hash FROM user_profiles LIMIT 3"));
console.log('\n=== AMOSTRA USUÁRIOS ===');
console.log(JSON.stringify(sample.rows, null, 2));

await pool.end();
