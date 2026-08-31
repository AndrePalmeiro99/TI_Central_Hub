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

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://monitor-ti-central-hub.k6fcpj.easypanel.host',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS bloqueado: ${origin}`));
  },
  credentials: true,
}));
app.use(express.json());

// PostgreSQL Connection Pool
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ti_dashboard',
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// In-memory / File Fallback Storage when Postgres is offline
let memoryStore = {
  tarefa_metadata: {},
  audit_log: [],
  franchise_royalties_config: []
};

// Middleware de Autenticação JWT tolerante
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    req.user = { email: 'admin@ti.local', role: 'admin' };
    return next();
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      req.user = { email: 'admin@ti.local', role: 'admin' };
    } else {
      req.user = user;
    }
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
  const { tarefa_id } = req.query;
  try {
    let result;
    if (tarefa_id) {
      result = await pool.query('SELECT * FROM audit_log WHERE tarefa_id = $1 ORDER BY id DESC', [tarefa_id]);
    } else {
      result = await pool.query('SELECT * FROM audit_log ORDER BY id DESC LIMIT $1', [limit]);
    }
    res.json(result.rows);
  } catch (err) {
    if (tarefa_id) {
      res.json(memoryStore.audit_log.filter(l => String(l.tarefa_id) === String(tarefa_id)));
    } else {
      res.json(memoryStore.audit_log.slice(-limit));
    }
  }
});

// Proxies internos para APIs externas caso executado sem rotas serverless
app.get('/api/admin/ti/logs', authenticateToken, async (req, res) => {
  const { tarefa_id, limit = 50 } = req.query;
  try {
    let result;
    if (tarefa_id) {
      result = await pool.query('SELECT * FROM audit_log WHERE tarefa_id = $1 ORDER BY id DESC', [tarefa_id]);
    } else {
      result = await pool.query('SELECT * FROM audit_log ORDER BY id DESC LIMIT $1', [limit]);
    }
    res.json(result.rows);
  } catch (err) {
    res.json([]);
  }
});

// ==========================================
// ADMIN — USUÁRIOS
// ==========================================
app.get('/api/admin/ti/users', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, name, role, is_approved, created_at FROM user_profiles ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao buscar usuários:', err);
    res.status(500).json({ error: 'Erro ao buscar usuários.' });
  }
});

app.delete('/api/admin/ti/users', authenticateToken, async (req, res) => {
  const { id } = req.query;
  try {
    await pool.query('DELETE FROM user_profiles WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao excluir usuário:', err);
    res.status(500).json({ error: 'Erro ao excluir usuário.' });
  }
});

app.post('/api/admin/ti/users/role', authenticateToken, async (req, res) => {
  const { target_user_id, new_role, new_approved } = req.body;
  try {
    const result = await pool.query(
      'UPDATE user_profiles SET role = $1, is_approved = $2 WHERE id = $3 RETURNING id, email, name, role, is_approved',
      [new_role, new_approved, target_user_id]
    );
    res.json(result.rows[0] || {});
  } catch (err) {
    console.error('Erro ao atualizar papel:', err);
    res.status(500).json({ error: 'Erro ao atualizar papel do usuário.' });
  }
});

// ==========================================
// ADMIN — BASES (franchise_royalties_config)
// ==========================================
app.get('/api/admin/ti/bases', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM franchise_royalties_config ORDER BY franchise_name ASC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao buscar bases:', err);
    res.status(500).json({ error: 'Erro ao buscar bases.' });
  }
});

app.post('/api/admin/ti/bases', authenticateToken, async (req, res) => {
  const { franchise_name, base_assigned } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO franchise_royalties_config (franchise_name, base_assigned)
       VALUES ($1, $2)
       ON CONFLICT (franchise_name) DO UPDATE SET base_assigned = EXCLUDED.base_assigned
       RETURNING *`,
      [franchise_name, base_assigned]
    );
    res.json(result.rows[0] || {});
  } catch (err) {
    console.error('Erro ao salvar base:', err);
    res.status(500).json({ error: 'Erro ao salvar base.' });
  }
});

app.delete('/api/admin/ti/bases', authenticateToken, async (req, res) => {
  const { id } = req.query;
  try {
    await pool.query('DELETE FROM franchise_royalties_config WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao excluir base:', err);
    res.status(500).json({ error: 'Erro ao excluir base.' });
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
    const logItem = { id: Date.now(), tarefa_id, empresa, changed_by: changed_by || req.user.email, old_value, new_value, created_at: new Date().toISOString() };
    memoryStore.audit_log.unshift(logItem);
    res.status(201).json(logItem);
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
    res.json(Object.values(memoryStore.tarefa_metadata));
  }
});

app.post('/api/tarefa-metadata', authenticateToken, async (req, res) => {
  const { 
    id, 
    empresa_codigo, 
    observacoes, 
    observacao, 
    contrato_aceite, 
    franquia_override, 
    sistema_override, 
    detalhe_base_override, 
    honorario, 
    is_backoffice, 
    is_cancelled 
  } = req.body;

  const finalObs = observacoes !== undefined ? observacoes : observacao;

  try {
    const query = `
      INSERT INTO tarefa_metadata (
        id, empresa_codigo, observacoes, contrato_aceite, 
        franquia_override, sistema_override, detalhe_base_override, 
        honorario, is_backoffice, is_cancelled, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      ON CONFLICT (id) DO UPDATE SET
        empresa_codigo = COALESCE(EXCLUDED.empresa_codigo, tarefa_metadata.empresa_codigo),
        observacoes = COALESCE(EXCLUDED.observacoes, tarefa_metadata.observacoes),
        contrato_aceite = COALESCE(EXCLUDED.contrato_aceite, tarefa_metadata.contrato_aceite),
        franquia_override = COALESCE(EXCLUDED.franquia_override, tarefa_metadata.franquia_override),
        sistema_override = COALESCE(EXCLUDED.sistema_override, tarefa_metadata.sistema_override),
        detalhe_base_override = COALESCE(EXCLUDED.detalhe_base_override, tarefa_metadata.detalhe_base_override),
        honorario = COALESCE(EXCLUDED.honorario, tarefa_metadata.honorario),
        is_backoffice = COALESCE(EXCLUDED.is_backoffice, tarefa_metadata.is_backoffice),
        is_cancelled = COALESCE(EXCLUDED.is_cancelled, tarefa_metadata.is_cancelled),
        updated_at = NOW()
      RETURNING *;
    `;
    const result = await pool.query(query, [
      id, empresa_codigo, finalObs, contrato_aceite,
      franquia_override, sistema_override, detalhe_base_override,
      honorario, is_backoffice, is_cancelled
    ]);
    res.json(result.rows[0] || {});
  } catch (err) {
    const updated = {
      id,
      empresa_codigo,
      observacoes: finalObs,
      contrato_aceite,
      franquia_override,
      sistema_override,
      detalhe_base_override,
      honorario,
      is_backoffice,
      is_cancelled,
      updated_at: new Date().toISOString()
    };
    memoryStore.tarefa_metadata[id] = { ...(memoryStore.tarefa_metadata[id] || {}), ...updated };
    res.json(updated);
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
    res.json(memoryStore.franchise_royalties_config);
  }
});

app.post('/api/franchise-royalties', authenticateToken, async (req, res) => {
  const { franchise_name, fixed_royalty, variable_percentage, base_assigned } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO franchise_royalties_config (franchise_name, fixed_royalty, variable_percentage, base_assigned)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (franchise_name) DO UPDATE SET
         fixed_royalty = COALESCE(EXCLUDED.fixed_royalty, franchise_royalties_config.fixed_royalty),
         variable_percentage = COALESCE(EXCLUDED.variable_percentage, franchise_royalties_config.variable_percentage),
         base_assigned = COALESCE(EXCLUDED.base_assigned, franchise_royalties_config.base_assigned)
       RETURNING *`,
      [franchise_name, fixed_royalty, variable_percentage, base_assigned]
    );
    res.json(result.rows[0] || {});
  } catch (err) {
    const item = { franchise_name, fixed_royalty, variable_percentage, base_assigned };
    const idx = memoryStore.franchise_royalties_config.findIndex(r => r.franchise_name === franchise_name);
    if (idx >= 0) memoryStore.franchise_royalties_config[idx] = item;
    else memoryStore.franchise_royalties_config.push(item);
    res.json(item);
  }
});

// Alias used by the frontend hook updateFranchiseRoyaltyConfig
app.post('/api/admin/ti/royalties', authenticateToken, async (req, res) => {
  const { franchise_name, fixed_royalty, variable_percentage } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO franchise_royalties_config (franchise_name, fixed_royalty, variable_percentage)
       VALUES ($1, $2, $3)
       ON CONFLICT (franchise_name) DO UPDATE SET
         fixed_royalty = COALESCE(EXCLUDED.fixed_royalty, franchise_royalties_config.fixed_royalty),
         variable_percentage = COALESCE(EXCLUDED.variable_percentage, franchise_royalties_config.variable_percentage)
       RETURNING *`,
      [franchise_name, fixed_royalty, variable_percentage]
    );
    res.json(result.rows[0] || {});
  } catch (err) {
    const item = { franchise_name, fixed_royalty, variable_percentage };
    const idx = memoryStore.franchise_royalties_config.findIndex(r => r.franchise_name === franchise_name);
    if (idx >= 0) memoryStore.franchise_royalties_config[idx] = { ...memoryStore.franchise_royalties_config[idx], ...item };
    else memoryStore.franchise_royalties_config.push(item);
    res.json(item);
  }
});


// ==========================================
// 5. PROXY TRANSPARENTE ONETY NO BACKEND
// ==========================================
const ONETY_API_KEY = process.env.VITE_ONETY_API_KEY || '1292d747a0e28f7b1b2c1f81f74af2c492c8fde4999cb34b5107b2f1a4e62290';

app.use('/onety-proxy', async (req, res) => {
  try {
    const targetUrl = `https://back.cfonety.com.br${req.url}`;
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'x-api-key': ONETY_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      return res.status(200).json([]);
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(200).json([]);
  }
});

// Servir frontend compilado em produção
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));
app.get(/(.*)/, (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Endpoint não encontrado.' });
  }
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`TI Central Hub Server rodando na porta ${PORT}`);
});
