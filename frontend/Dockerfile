FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN pnpm install --frozen-lockfile --filter @scm/frontend...
COPY frontend frontend
ARG VITE_API_URL=/api
ARG VITE_SOCKET_URL=
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL
RUN pnpm --filter @scm/frontend build

FROM nginx:1.27-alpine
LABEL org.opencontainers.image.source="https://github.com/rolandobryanmunozante/scm-global"
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
