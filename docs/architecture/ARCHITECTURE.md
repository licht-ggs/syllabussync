# Architecture

SyllabusSync is a pnpm TypeScript monorepo with a React/Vite web application, an
Express API, and a small shared package.

- `apps/web` owns browser UI, navigation, and browser-side integrations. It only
  receives Vite-prefixed public configuration.
- `apps/api` owns HTTP endpoints, server configuration, and future
  user-scoped application services. Its health endpoint reports process
  availability only.
- `packages/shared` contains cross-app schemas and types; it must not contain
  server secrets or environment-specific behavior.
- Supabase is the PostgreSQL and authentication platform. Both clients use the
  publishable key; future user operations must carry the authenticated user's
  context and rely on PostgreSQL row-level security (RLS).
- Future Python/OpenCV and AI/OCR work belongs in separately deployed,
  asynchronous processing services rather than the request-serving API.

No product workflows, authentication screens, or database schema are included
in this foundation.
