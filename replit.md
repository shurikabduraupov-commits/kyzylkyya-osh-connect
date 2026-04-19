# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5 plus Python HTTP server for the rides app
- **Database**: PostgreSQL + Drizzle ORM available; rides app currently uses in-memory Python storage
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle), Vite for web artifacts

## Current Artifacts

- **Кызыл-Кия — Ош** (`artifacts/kyzylkiya-osh-rides`): mobile-first ride request web app for passengers and drivers across Kyrgyzstan.
  - Frontend: React + Vite at `/`
  - Backend: Python standard-library HTTP server at `/rides-api`
  - Main flow: passenger selects an origin settlement, destination settlement, pickup address, and seat count; driver sees active requests with route details, can filter by origin/destination, accepts with name and phone, and passenger sees driver contact details.
  - UI language: Kyrgyz in Cyrillic script.

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
