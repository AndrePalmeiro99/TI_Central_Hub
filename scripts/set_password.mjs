/**
 * Script para definir senha bcrypt para qualquer usuário do banco.
 * Uso: node scripts/set_password.mjs <email> <nova_senha>
 * Exemplo: node scripts/set_password.mjs andre.palmeiro@cffranquias.com.br MinhaS3nha!
 */
import pg from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

const [,, email, novaSenha] = process.argv;

if (!email || !novaSenha) {
  console.error('❌ Uso: node scripts/set_password.mjs <email> <nova_senha>');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const check = await pool.query('SELECT id, email, role FROM user_profiles WHERE email = $1', [email]);
if (check.rows.length === 0) {
  console.error(`❌ Usuário "${email}" não encontrado no banco.`);
  await pool.end();
  process.exit(1);
}

const hash = await bcrypt.hash(novaSenha, 10);
await pool.query('UPDATE user_profiles SET password_hash = $1 WHERE email = $2', [hash, email]);

console.log(`✅ Senha definida com sucesso para: ${email} (role: ${check.rows[0].role})`);
await pool.end();
