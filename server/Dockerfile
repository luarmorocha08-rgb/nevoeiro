# Servidor de jogo do Nevoeiro. Build a partir da RAIZ do monorepo:
#   docker build -f server/Dockerfile -t nevoeiro-server .
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --workspace server --include-workspace-root --ignore-scripts
COPY shared shared
COPY server server
RUN npm run build -w server

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=2567
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --workspace server --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/server/dist server/dist
WORKDIR /app/server
EXPOSE 2567
CMD ["node", "dist/index.cjs"]
