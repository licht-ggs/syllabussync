# SyllabusSync

**Understand your workload. Own your semester.**

SyllabusSync is an AI-powered academic workload management platform for
university and college students. This repository currently contains the Phase
1.1 infrastructure foundation: a minimal React/Vite application, an Express
API, and shared TypeScript contracts.

## Quick start

Prerequisites: Node.js 26 and pnpm 12.21.0.

```sh
pnpm install
pnpm dev
```

The web app runs on Vite's default port (5173); the API defaults to port 3000.
`GET /api/health` reports API process status only, not database health.

Copy `.env.example` to `.env` to configure the optional Supabase clients. Use
only the publishable key; never put a service-role key in frontend code.
Additional setup details are in [docs/development/LOCAL_SETUP.md](docs/development/LOCAL_SETUP.md).

## Workspace

- `apps/web` — React, TypeScript, Vite, Tailwind, and routing foundation.
- `apps/api` — Express API, environment validation, and health route.
- `packages/shared` — shared Zod schemas and types.
- `supabase` — reserved for future CLI configuration and migrations.

See [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md) and
[CONTRIBUTING.md](CONTRIBUTING.md).
