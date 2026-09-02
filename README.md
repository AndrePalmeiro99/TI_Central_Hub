# Enterprise TI & Operations Analytics Dashboard

Plataforma unificada para monitoramento operacional, gestão de chamados, controle de transbordos e análise de volumetria em tempo real para times de Tecnologia e Operações.

---

## Principais Funcionalidades

### 1. Painel Operacional e Gestão de Tarefas
- **Acompanhamento de Status**: Métricas em tempo real de chamados concluídos, em andamento, pendentes e cancelados.
- **Detecção de Gargalos**: Identificação de tempo de espera, filas de transbordo e tarefas travadas.
- **Filtros Avançados**: Segmentação por período, responsável, tipo de demanda, base operacional e status.

### 2. Análise de Desempenho e Produtividade
- **Distribuição de Carga**: Visualização do volume de trabalho distribuído por equipe e colaborador.
- **Histórico Mensal e Sazonalidade**: Gráficos comparativos de desempenho mês a mês.
- **Auditoria de Operações**: Rastreamento de ações, SLA de atendimento e métricas de resolução.

### 3. Segurança e Privacidade
- **Camada de Anonimização**: Filtro automático de dados sensíveis para proteção de privacidade de clientes e identificadores internos.
- **Autenticação Segura**: Controle de sessão e controle de acesso baseado em perfis (RBAC / Admin).
- **Proteção contra Abusos**: Mecanismos de rate limiting nas requisições.

### 4. Arquitetura Híbrida (Web & Desktop)
- Aplicação web moderna com suporte a empacotamento nativo desktop multiplataforma via Tauri.

---

## Tecnologias Utilizadas

- **Frontend**: React 18, Vite, Lucide Icons, Framer Motion, Recharts
- **Desktop Runtime**: Rust, Tauri v2
- **Backend / APIs**: Node.js / Express
- **Banco de Dados & Autenticação**: PostgreSQL, JWT, BCrypt

---

## Estrutura do Projeto

```text
├── api/                  # Serverless API routes (proxies e agregadores)
├── src/
│   ├── components/       # Componentes de UI, modais, gráficos e painéis
│   ├── hooks/            # Custom hooks para consumo e sincronização de dados
│   ├── security/         # Utilitários de controle de acesso e rate limit
│   ├── services/         # Clientes de integração de APIs e banco de dados
│   └── utils/            # Formatadores e filtros de privacidade
├── src-tauri/            # Configuração e código nativo Rust/Tauri
└── scripts/              # Scripts auxiliares para processamento e exportação de dados
```

---

## Configuração e Instalação

### Pré-requisitos
- Node.js 18+
- PostgreSQL
- Rust & Cargo (caso deseje compilar versão Desktop)

### 1. Instalar dependências
```bash
npm install
```

### 2. Configurar variáveis de ambiente
Crie um arquivo `.env` na raiz do projeto com base no arquivo `.env.example`:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ti_dashboard
JWT_SECRET=seu_jwt_secret_seguro
PORT=3000
VITE_ONETY_API_KEY=sua_chave_de_integracao_api
```

### 3. Rodar em ambiente de desenvolvimento

**Modo Web:**
```bash
npm run dev
```

**Modo Desktop (Tauri):**
```bash
npm run tauri dev
```

### 4. Build para produção

**Build Web:**
```bash
npm run build
```

**Build Desktop (Executável):**
```bash
npm run tauri build
```

---

## Licença

Projeto desenvolvido para uso institucional interno. Todos os direitos reservados.
