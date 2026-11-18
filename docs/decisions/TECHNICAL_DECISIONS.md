# Technical decisions

- **pnpm workspaces:** keep frontend, API, and shared contracts in one
  repository with explicit package boundaries and a single dependency lockfile.
- **React, Vite, TypeScript, and Tailwind:** provide a minimal typed web
  application with a fast development server and utility styling.
- **Express and Zod:** keep HTTP composition small and validate configuration
  and shared response contracts.
- **Supabase:** use managed PostgreSQL and Auth with public publishable keys.
  Authorization and row-level access will be enforced with authenticated
  requests and RLS.
- **No Prisma:** Supabase is the planned PostgreSQL access layer; adding an ORM
  now would duplicate that role before data access requirements exist.
- **Separate future AI/OCR processing:** longer-running work should be
  asynchronous and isolated from API request latency and dependencies.
- **Trade-off:** the initial API health route is intentionally shallow; it does
  not imply database availability.
