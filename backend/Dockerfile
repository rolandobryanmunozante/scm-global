FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json

FROM base AS build
RUN pnpm install --frozen-lockfile --filter @scm/backend...
COPY backend/tsconfig.json backend/tsconfig.json
COPY backend/src backend/src
RUN pnpm --filter @scm/backend build

FROM base AS runtime
ENV NODE_ENV=production
LABEL org.opencontainers.image.source="https://github.com/rolandobryanmunozante/scm-global"
RUN pnpm install --frozen-lockfile --prod --filter @scm/backend...
COPY --from=build /app/backend/dist /app/backend/dist
WORKDIR /app/backend
EXPOSE 4000
CMD ["node", "dist/src/server.js"]
