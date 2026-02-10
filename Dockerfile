# Stage 1: Build (Frontend compilation)
FROM node:20-slim AS builder
WORKDIR /app
COPY package.json ./
# Instalamos todas as dependências (incluindo Vite)
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Production Runtime
FROM mcr.microsoft.com/playwright:v1.50.0-noble
WORKDIR /app

# Copiamos apenas os arquivos necessários para produção
COPY package.json ./
RUN npm install --omit=dev

# Copiamos o build do frontend gerado no Stage 1
COPY --from=builder /app/dist ./dist

# Copiamos apenas o código fonte do servidor
COPY src ./src

EXPOSE 3000

ENV NODE_ENV=production
ENV HOST=0.0.0.0

CMD ["node", "src/server.js"]
