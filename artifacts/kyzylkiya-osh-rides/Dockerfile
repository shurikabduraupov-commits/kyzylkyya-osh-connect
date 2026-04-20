# Single service: Vite build (dist) + Python API on PORT.
# Build from monorepo root (folder that contains artifacts/ and lib/):
#   docker build -f artifacts/kyzylkiya-osh-rides/Dockerfile -t kyzyl-rides .

FROM node:22-bookworm-slim AS frontend
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /workspace
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY .npmrc ./
COPY lib/api-client-react ./lib/api-client-react
COPY artifacts/kyzylkiya-osh-rides ./artifacts/kyzylkiya-osh-rides
ENV CI=true
# Partial monorepo in the image: full --frozen-lockfile fails (lockfile lists all workspace importers).
RUN pnpm install --no-frozen-lockfile
ENV NODE_ENV=production
RUN pnpm --filter @workspace/kyzylkiya-osh-rides run build

FROM python:3.12-slim-bookworm
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1
COPY --from=frontend /workspace/artifacts/kyzylkiya-osh-rides/dist ./dist
COPY --from=frontend /workspace/artifacts/kyzylkiya-osh-rides/server.py ./server.py
COPY --from=frontend /workspace/artifacts/kyzylkiya-osh-rides/custom_settlements.json ./custom_settlements.json
EXPOSE 10000
CMD ["python", "server.py"]
