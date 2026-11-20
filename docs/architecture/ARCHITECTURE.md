# Architecture

SyllabusSync is a pnpm TypeScript monorepo with a React/Vite web application, an
Express API, and a small shared package.

- `apps/web` owns browser UI, routing, and the Supabase Auth session. It only
  receives Vite-prefixed public configuration and uses the Supabase
  publishable key.
- `apps/api` owns HTTP endpoints and validates bearer tokens with Supabase Auth.
  Authenticated database requests carry the same user's access token so
  PostgreSQL RLS applies. Academic mutations use authenticated RPC calls;
  the API does not use a service-role key. Its health endpoint reports process
  availability only.
- `packages/shared` contains cross-app authentication, profile, and academic
  Zod schemas and types; it must not contain server secrets or
  environment-specific behavior.
- Supabase provides PostgreSQL and Auth. Profile rows are keyed by
  `auth.users.id`, created by an Auth trigger, and restricted by RLS.
  Academic years, periods, subjects, workspace settings, tasks, and task
  history are owner-scoped; protected mutations are enforced by database
  functions and constraints. Task deadlines preserve date, local time,
  timezone, and resolved instant separately.
- Future Python/OpenCV and AI/OCR work belongs in separately deployed,
  asynchronous processing services rather than the request-serving API.

Authentication routes and the profile foundation are described in
[PHASE_1_2_AUTHENTICATION.md](./PHASE_1_2_AUTHENTICATION.md). The Phase 1.3
academic workspace schema and request flow are described in
[PHASE_1_3_ACADEMIC_WORKSPACE.md](./PHASE_1_3_ACADEMIC_WORKSPACE.md).
The Phase 1.4 database foundation is described in
[PHASE_1_4_DATABASE.md](./PHASE_1_4_DATABASE.md).
