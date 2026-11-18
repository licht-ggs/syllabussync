# Architecture

SyllabusSync is a pnpm TypeScript monorepo with a React/Vite web application, an
Express API, and a small shared package.

- `apps/web` owns browser UI, routing, and the Supabase Auth session. It only
  receives Vite-prefixed public configuration and uses the Supabase
  publishable key.
- `apps/api` owns HTTP endpoints and validates bearer tokens with Supabase Auth.
  Authenticated database requests carry the same user's access token so
  PostgreSQL RLS applies. Its health endpoint reports process availability
  only.
- `packages/shared` contains cross-app Zod schemas and types; it must not
  contain server secrets or environment-specific behavior.
- Supabase provides PostgreSQL and Auth. Profile rows are keyed by
  `auth.users.id`, created by an Auth trigger, and restricted by RLS.
- Future Python/OpenCV and AI/OCR work belongs in separately deployed,
  asynchronous processing services rather than the request-serving API.

Authentication routes and the profile foundation are described in
[PHASE_1_2_AUTHENTICATION.md](./PHASE_1_2_AUTHENTICATION.md). Academic
workflows and profile onboarding are not included.
