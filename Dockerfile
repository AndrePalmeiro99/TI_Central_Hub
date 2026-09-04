FROM node:20-alpine

WORKDIR /app

# Instala dependências
COPY package*.json ./
RUN npm install

# Copia código fonte
COPY . .

# Gera o build do frontend (dist/)
RUN npm run build

# Expõe a porta do servidor
EXPOSE 3000

# Inicia o backend Express (que também serve o frontend compilado)
CMD ["node", "server.js"]
