# Site + API in one image. Build context MUST be the monorepo root (pnpm-lock.yaml here).
# Local:  docker build -t kyzyl-rides .
# Railway: Settings → Source → Root directory = empty (NOT artifacts/...).

FROM node:22-bookworm-slim AS frontend
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /workspace
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY tsconfig.base.json ./
COPY .npmrc ./
COPY lib/api-client-react ./lib/api-client-react
COPY artifacts/kyzylkiya-osh-rides ./artifacts/kyzylkiya-osh-rides
ENV CI=true
# Partial monorepo in the image: full --frozen-lockfile fails (lockfile lists all workspace importers).
RUN pnpm install --no-frozen-lockfile
ENV NODE_ENV=production
# Railway often sets PORT="" during *build*; Vite config must see a valid port for that step.
RUN env PORT=5173 NODE_OPTIONS=--max-old-space-size=3072 pnpm --filter @workspace/kyzylkiya-osh-rides run build

FROM python:3.12-slim-bookworm
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1
COPY --from=frontend /workspace/artifacts/kyzylkiya-osh-rides/dist ./dist
COPY --from=frontend /workspace/artifacts/kyzylkiya-osh-rides/server.py ./server.py
COPY --from=frontend /workspace/artifacts/kyzylkiya-osh-rides/custom_settlements.json ./custom_settlements.json
EXPOSE 10000
CMD ["python", "server.py"]
