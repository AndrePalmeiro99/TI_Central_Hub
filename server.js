import express from 'express';
import cors from 'cors';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'ti_dashboard_secret_key_change_in_prod';

app.use(cors());
app.use(express.json());

// PostgreSQL Connection Pool
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ti_dashboard',
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// Middleware de Autenticação JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token de autenticação não fornecido.' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token inválido ou expirado.' });
    req.user = user;
    next();
  });
};

// ==========================================
// 1. ROTAS DE AUTENTICAÇÃO
// ==========================================
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const userRes = await pool.query('SELECT * FROM user_profiles WHERE email = $1', [email]);
    if (userRes.rows.length === 0) {
      return res.status(400).json({ error: 'Credenciais inválidas.' });
    }

    const user = userRes.rows[0];
    // Se a senha no banco for hash bcrypt ou texto plano (compatibilidade inicial)
    const validPassword = user.password_hash 
      ? await bcrypt.compare(password, user.password_hash)
      : (user.password === password);

    if (!validPassword) {
      return res.status(400).json({ error: 'Credenciais inválidas.' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role || 'user' },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      },
      access_token: token
    });
  } catch (err) {
    console.error('Erro no login:', err);
    res.status(500).json({ error: 'Erro interno ao processar login.' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const { email, password, name } = req.body;
  try {
    const existing = await pool.query('SELECT id FROM user_profiles WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Usuário já cadastrado com este e-mail.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const insertRes = await pool.query(
      `INSERT INTO user_profiles (email, password_hash, name, role, created_at)
       VALUES ($1, $2, $3, 'user', NOW()) RETURNING id, email, name, role`,
      [email, hashedPassword, name || email.split('@')[0]]
    );

    const user = insertRes.rows[0];
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.status(201).json({ user, access_token: token });
  } catch (err) {
    console.error('Erro no cadastro:', err);
    res.status(500).json({ error: 'Erro ao registrar usuário.' });
  }
});

// ==========================================
// 2. AUDIT LOGS
// ==========================================
app.get('/api/audit-logs', authenticateToken, async (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  try {
    const result = await pool.query(
      'SELECT * FROM audit_log ORDER BY id DESC LIMIT $1',
      [limit]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao buscar audit_log:', err);
    res.status(500).json({ error: 'Erro ao buscar logs de auditoria.' });
  }
});

app.post('/api/audit-logs', authenticateToken, async (req, res) => {
  const { tarefa_id, empresa, changed_by, old_value, new_value } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO audit_log (tarefa_id, empresa, changed_by, old_value, new_value)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [tarefa_id, empresa, changed_by || req.user.email, old_value, new_value]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao criar log de auditoria:', err);
    res.status(500).json({ error: 'Erro ao registrar auditoria.' });
  }
});

// ==========================================
// 3. METADADOS DE TAREFAS
// ==========================================
app.get('/api/tarefa-metadata', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tarefa_metadata');
    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao buscar metadados:', err);
    res.status(500).json({ error: 'Erro ao buscar metadados.' });
  }
});

app.post('/api/tarefa-metadata', authenticateToken, async (req, res) => {
  const { id, sistema_escolhido, usuario_base, contrato_aceite, observacao } = req.body;
  try {
    const query = `
      INSERT INTO tarefa_metadata (id, sistema_escolhido, usuario_base, contrato_aceite, observacao, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (id) DO UPDATE SET
        sistema_escolhido = EXCLUDED.sistema_escolhido,
        usuario_base = EXCLUDED.usuario_base,
        contrato_aceite = EXCLUDED.contrato_aceite,
        observacao = EXCLUDED.observacao,
        updated_at = NOW()
      RETURNING *;
    `;
    const result = await pool.query(query, [id, sistema_escolhido, usuario_base, contrato_aceite, observacao]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao atualizar tarefa_metadata:', err);
    res.status(500).json({ error: 'Erro ao atualizar metadados da tarefa.' });
  }
});

// ==========================================
// 4. CONFIGURAÇÕES DE ROYALTIES / FRANQUIAS
// ==========================================
app.get('/api/franchise-royalties', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM franchise_royalties_config ORDER BY franchise_name ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao buscar royalties:', err);
    res.status(500).json({ error: 'Erro ao buscar configuração de franquias.' });
  }
});

// Servir frontend compilado em produção
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));
app.get('{*path}', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Endpoint não encontrado.' });
  }
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`TI Central Hub Server rodando na porta ${PORT}`);
});
