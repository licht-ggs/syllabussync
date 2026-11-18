# Local setup

## Prerequisites

- Node.js 26
- pnpm 12.21.0

## Install and configure

1. Run `pnpm install`.
2. Copy `.env.example` to `.env` and set the Supabase URL and publishable keys
   only if you need to exercise the client foundations. Never use a secret or
   service-role key in the browser or commit real credentials. Both apps read
   the root `.env`; frontend variables must begin with `VITE_`.

The API starts without Supabase credentials for its health endpoint. If either
backend Supabase setting is supplied, both must be supplied.

## Commands

- `pnpm dev` — run web and API concurrently.
- `pnpm dev:web` / `pnpm dev:api` — run an app independently.
- `pnpm test` — run focused unit and API tests.
- `pnpm typecheck`, `pnpm lint`, `pnpm build` — quality checks.

The web development server is provided by Vite (default port 5173); the API
defaults to port 3000 and serves `GET /api/health`.

## Troubleshooting

- If pnpm reports an unsupported package manager version, enable Corepack or
  install pnpm 12.21.0.
- If the API reports invalid configuration, check `PORT` and ensure both
  `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are set together.
- The health endpoint does not test Supabase connectivity.
