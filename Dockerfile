FROM mcr.microsoft.com/playwright:v1.50.0-noble

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .
RUN npm run build

EXPOSE 3000

ENV NODE_ENV=production
ENV HOST=0.0.0.0

CMD ["node", "src/server.js"]
