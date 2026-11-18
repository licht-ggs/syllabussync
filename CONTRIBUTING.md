# Contributing

Keep changes incremental and within the current milestone. Prefer strict
TypeScript, small dependencies, shared schemas where contracts cross app
boundaries, and explicit environment validation. Do not commit credentials or
use a Supabase service-role key for student requests.

Before submitting changes, run the relevant checks:

```sh
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

Add focused tests for new behavior. Do not claim checks passed unless they were
run; document environmental blockers and scope limitations.
