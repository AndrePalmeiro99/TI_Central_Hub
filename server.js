import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

// Modular Routers
import { createAuthRouter } from './server/routes/auth.routes.js';
import { createLgpdRouter } from './server/routes/lgpd.routes.js';
import { createAdminRouter } from './server/routes/admin.routes.js';
import { createMetadataRouter } from './server/routes/metadata.routes.js';
import { createOnetyRouter, createOnetyProxy } from './server/routes/onety.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3000;

// Configuração SMTP Dinâmica
const smtpTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },
  tls: {
    rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED !== 'false'
  },
  connectionTimeout: 10000,
  greetingTimeout: 5000,
  socketTimeout: 10000
});

if (process.env.SMTP_USER && process.env.SMTP_PASS) {
  smtpTransporter.verify()
    .then(() => console.log('[SMTP] Conexão e autenticação OK'))
    .catch(err => console.error(`[SMTP] Falha no verify: ${err.code || ''} ${err.message}`));
}

const allowedOrigins = [
  'https://monitor-ti-central-hub.k6fcpj.easypanel.host',
  'https://centralhub.onith.com.br',
  process.env.FRONTEND_URL,
  process.env.FRONTEND_URL2,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (
      !origin ||
      allowedOrigins.includes(origin) ||
      /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(origin)
    ) {
      return callback(null, true);
    }
    callback(new Error(`CORS bloqueado: ${origin}`));
  },
  credentials: true,
}));

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cookieParser());
app.use(express.json());

// PostgreSQL Connection Pool
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ti_dashboard',
  ssl: process.env.DATABASE_SSL === 'true' ? true : false,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  max: 10
});

pool.on('error', (err) => {
  console.error('Erro inesperado no pool do PostgreSQL:', err.message);
});

// Auto-migration defensiva de colunas
pool.query(`
  ALTER TABLE tarefa_metadata 
  ADD COLUMN IF NOT EXISTS colaborador_override TEXT,
  ADD COLUMN IF NOT EXISTS status_override TEXT;
`).catch(err => console.debug('[DB] Migração tarefa_metadata colunas extras:', err.message));

// In-memory / Fallback Storage
const memoryStore = {
  tarefa_metadata: {},
  audit_log: [],
  franchise_royalties_config: []
};

// ==========================================
// REGISTRO DE ROTAS MODULARES
// ==========================================
app.use('/api/auth', createAuthRouter({ pool, smtpTransporter, memoryStore, PORT }));
app.use('/api/lgpd', createLgpdRouter({ pool }));
app.use('/api', createAdminRouter({ pool, memoryStore }));
app.use('/api', createMetadataRouter({ pool, memoryStore }));
app.use('/api', createOnetyRouter({ pool }));
app.use('/onety-proxy', createOnetyProxy());

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
