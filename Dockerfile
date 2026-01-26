# Use a imagem oficial do Playwright da Microsoft
# Versão TRAVADA para garantir compatibilidade
FROM mcr.microsoft.com/playwright:v1.50.0-noble

# Define o diretório de trabalho
WORKDIR /app

# Copia arquivos de configuração primeiro para cache eficiente
COPY package.json ./

# Instala dependências do projeto
# Usamos npm ci para uma instalação limpa baseada no package-lock (se existisse) ou npm install
RUN npm install

# Copia o restante do código fonte
COPY . .

# Build do Frontend (Vite)
RUN npm run build

# Expõe a porta que o Node.js vai usar
EXPOSE 3000
EXPOSE 5173

# Variável de ambiente para indicar produção
ENV NODE_ENV=production

# Comando de inicialização
# Inicia o servidor Node para gerar PDF e serve os estáticos do Vite (se buildado)
# Para simplificar neste setup híbrido, vamos rodar apenas o servidor Node
# O ideal seria buildar o frontend e servir estaticamente, mas para manter simples:
CMD ["node", "src/server-node.js"]
