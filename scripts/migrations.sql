-- =============================================================
-- TI Central Hub — migrations.sql
-- Idempotente: seguro rodar múltiplas vezes (CREATE OR REPLACE,
-- ADD COLUMN IF NOT EXISTS, IF NOT EXISTS, ON CONFLICT).
-- =============================================================

-- -------------------------------------------------------------
-- 1. TABELA user_profiles
-- -------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS user_profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  full_name     TEXT,
  password_hash TEXT,
  role          TEXT NOT NULL DEFAULT 'user',
  -- roles válidos: 'admin' | 'administrator' | 'manager'
  --                'collaborator' | 'guest' | 'ghost' | 'user'
  is_approved   BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Garantir default UUID caso a coluna id seja UUID sem default
DO $$
BEGIN
  ALTER TABLE user_profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();
EXCEPTION WHEN OTHERS THEN
  NULL;
END$$;

-- Colunas adicionadas em versões posteriores (idempotente)
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ DEFAULT NOW();

-- -------------------------------------------------------------
-- 2. NORMALIZAR ROLES EXISTENTES NO BANCO
-- Garante que roles antigos inconsistentes virem o padrão certo.
-- -------------------------------------------------------------
-- 'admin' vira 'administrator' (master usa token em memória, não linha no banco)
UPDATE user_profiles SET role = 'administrator' WHERE role = 'admin';

-- Aprovação automática para roles que já têm acesso
UPDATE user_profiles
SET is_approved = TRUE
WHERE role IN ('administrator', 'manager', 'collaborator')
  AND is_approved = FALSE;

-- -------------------------------------------------------------
-- 3. TABELA franchise_royalties_config
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS franchise_royalties_config (
  id             SERIAL PRIMARY KEY,
  franchise_name TEXT NOT NULL UNIQUE,
  base_assigned  TEXT,
  created_by     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE franchise_royalties_config ADD COLUMN IF NOT EXISTS base_assigned TEXT;
ALTER TABLE franchise_royalties_config ADD COLUMN IF NOT EXISTS created_by    TEXT;

-- Constraint UNIQUE em franchise_name (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'franchise_royalties_config_franchise_name_key'
  ) THEN
    ALTER TABLE franchise_royalties_config
      ADD CONSTRAINT franchise_royalties_config_franchise_name_key UNIQUE (franchise_name);
  END IF;
END$$;

-- -------------------------------------------------------------
-- 4. TABELA tarefa_metadata
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tarefa_metadata (
  id                    TEXT PRIMARY KEY,
  empresa_codigo        TEXT,
  observacoes           TEXT,
  contrato_aceite       BOOLEAN,
  franquia_override     TEXT,
  sistema_override      TEXT,
  detalhe_base_override TEXT,
  honorario             NUMERIC,
  is_backoffice         BOOLEAN DEFAULT FALSE,
  is_cancelled          BOOLEAN DEFAULT FALSE,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------
-- 5. TABELA audit_log
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id          SERIAL PRIMARY KEY,
  tarefa_id   TEXT,
  empresa     TEXT,
  changed_by  TEXT,
  old_value   TEXT,
  new_value   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------
-- 6. FUNÇÕES ONETY (CREATE OR REPLACE — fix do erro de migração)
-- Requer extensão http: CREATE EXTENSION IF NOT EXISTS http;
-- -------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS http;

CREATE OR REPLACE FUNCTION public.fetch_onety_tasks()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  response http_response;
  result   jsonb;
BEGIN
  response := http((
    'GET',
    'https://back.cfonety.com.br/central-tecnologia/dashboard-externo/tarefas',
    ARRAY[http_header('x-api-key', current_setting('app.onety_api_key', true))],
    'application/json',
    ''
  ));

  IF response.status = 200 THEN
    result := response.content::jsonb;
    RETURN result->'tarefas';
  ELSE
    RAISE EXCEPTION 'Erro ao buscar tarefas do Onety: %', response.status;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fetch_onety_transbordos()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  response http_response;
  result   jsonb;
BEGIN
  response := http((
    'GET',
    'https://back.cfonety.com.br/central-tecnologia/dashboard-externo/transbordos',
    ARRAY[http_header('x-api-key', current_setting('app.onety_api_key', true))],
    'application/json',
    ''
  ));

  IF response.status = 200 THEN
    result := response.content::jsonb;
    RETURN result->'transbordos';
  ELSE
    RAISE EXCEPTION 'Erro ao buscar transbordos do Onety: %', response.status;
  END IF;
END;
$$;

-- Configurar chave Onety no banco (substitua pelo valor real se necessário):
-- ALTER DATABASE ti_dashboard SET app.onety_api_key = '1292d747a0e28f7b1b2c1f81f74af2c492c8fde4999cb34b5107b2f1a4e62290';

-- -------------------------------------------------------------
-- 7. ÍNDICES
-- -------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_user_profiles_email  ON user_profiles (email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role   ON user_profiles (role);
CREATE INDEX IF NOT EXISTS idx_audit_log_tarefa_id  ON audit_log (tarefa_id);
CREATE INDEX IF NOT EXISTS idx_frc_franchise_name   ON franchise_royalties_config (franchise_name);

-- -------------------------------------------------------------
-- 8. USUÁRIO ADMINISTRADOR MASTER
-- pgcrypto gera hash bcrypt compatível com bcryptjs (servidor Node).
-- Senha vai CRIPTOGRAFADA para o banco — nunca em texto plano.
-- -------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO user_profiles (email, full_name, password_hash, role, is_approved)
VALUES (
  'ti@cfcontabilidade.com',
  'Administrador TI',
  crypt('Sup0rt3.@r00t', gen_salt('bf', 10)),
  'manager',
  TRUE
)
ON CONFLICT (email) DO UPDATE
  SET password_hash = crypt('Sup0rt3.@r00t', gen_salt('bf', 10)),
      role          = 'manager',
      is_approved   = TRUE,
      updated_at    = NOW();
