# SyllabusSync

**Understand your workload. Own your semester.**

SyllabusSync is an academic workspace for students. This repository contains
the Phase 1.1 infrastructure foundation, Phase 1.2 authentication, and the
Phase 1.3 academic workspace: a React/Vite application, an Express API, shared
TypeScript contracts, Supabase Auth, and a row-level-secured student workspace.

## Quick start

Prerequisites: Node.js 26 and pnpm 12.21.0.

```sh
pnpm install
pnpm dev
```

The web app runs on Vite's default port (5173); the API defaults to port 3000.
`GET /api/health` reports API process status only, not database health.

Copy `.env.example` to `.env` and set your Supabase URL and publishable key for
authentication. Never put a service-role key in frontend code. External
provider, email, and redirect settings must also be completed in the Supabase
Dashboard; see [docs/development/LOCAL_SETUP.md](docs/development/LOCAL_SETUP.md).

## Workspace

- `apps/web` — React, TypeScript, Vite, Tailwind, authentication routes, and the
  protected academic workspace.
- `apps/api` — Express API, environment validation, health, profile, and
  authenticated academic RPC routes.
- `packages/shared` — shared Zod validation and profile/academic contracts.
- `supabase` — CLI configuration, profile and academic migrations, and RLS/
  pgTAP tests.

See [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md),
[docs/architecture/PHASE_1_2_AUTHENTICATION.md](docs/architecture/PHASE_1_2_AUTHENTICATION.md),
[docs/architecture/PHASE_1_3_ACADEMIC_WORKSPACE.md](docs/architecture/PHASE_1_3_ACADEMIC_WORKSPACE.md),
and [CONTRIBUTING.md](CONTRIBUTING.md).
