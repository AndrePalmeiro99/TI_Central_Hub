# Multi-stage Dockerfile: Node + Express + PostgreSQL + React
FROM node:18-alpine

WORKDIR /app

# 1. Instalar dependências
COPY package*.json ./
RUN npm ci

# 2. Copiar código fonte
COPY . .

# 3. Compilar React (Frontend)
RUN npm run build

# 4. Expor porta da aplicação
EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

# 5. Iniciar servidor Node.js que conecta no PostgreSQL
CMD ["node", "server.js"]
