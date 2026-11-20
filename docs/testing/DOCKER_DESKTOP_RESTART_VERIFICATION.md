# Docker Desktop Restart and Networking Verification

Date/time: 2026-11-20 00:08:42 UTC+08:00 investigation window

## 1. Authorization and scope

The user authorized:

- Restarting Docker Desktop only through the Docker Desktop graphical interface.
- Read-only verification of existing containers, endpoints, and application
  availability.

The authorization explicitly prohibited restarting or stopping the Supabase
stack, resetting the database, deleting or recreating volumes, changing Docker
or WSL configuration, changing firewall settings, and modifying application
source or configuration.

No action outside this scope was taken.

## 2. Pre-restart container status

The pre-restart container status could not be recorded reliably by the
sandboxed shell. Docker CLI commands received `permission denied` when connecting
to the Docker Desktop named pipe, and WSL/Windows CIM calls received
access-denied results.

Previously supplied known state remained the basis for the operation:

- `supabase_db_syllabussync`
- `supabase_kong_syllabussync`
- `supabase_studio_syllabussync`
- `supabase_inbucket_syllabussync`
- Existing SyllabusSync Supabase containers and named Docker resources

The existing containers had previously been observed running and the relevant
container health checks had passed. This report does not claim that live
pre-restart container status was independently re-confirmed.

## 3. Docker Desktop restart attempt

The Docker Desktop UI launch was attempted with Computer Use through the
installed `Docker.DockerForWindows.Settings` launch target.

The launch request returned success, but no Docker Desktop window appeared in
the available Windows window inventory. A subsequent app inventory check
reported Docker Desktop with no running window.

**The Docker Desktop UI did not expose a reachable Troubleshoot/Restart control,
and the restart itself was not confirmed.**

No process stop/start command, Docker CLI restart command, Supabase command,
container command, or alternative recovery operation was used.

## 4. Post-restart container and resource status

Container, Docker network, and named-volume status could not be confirmed
through Docker CLI or UI because Docker Desktop access was unavailable in the
tool sandbox.

No Docker volumes or networks were deleted, recreated, or modified.

## 5. Endpoint verification

The post-attempt browser and PowerShell checks are summarized below.

| Service | URL | Result |
| --- | --- | --- |
| Studio | `http://127.0.0.1:54323/` | Browser: failed to load (`ERR_FAILED`) |
| Mailpit | `http://127.0.0.1:54324/` | Browser: failed to load (`ERR_FAILED`) |
| Supabase Auth health | `http://127.0.0.1:54321/auth/v1/health` | Browser: failed to load; PowerShell: unable to connect |
| API health | `http://localhost:3000/api/health` | PowerShell: unable to connect |
| Frontend | `http://localhost:5173/` | Browser displayed SyllabusSync and redirected to `/sign-in` |

PowerShell `Invoke-WebRequest` reported unable-to-connect errors for Studio,
Mailpit, Supabase Auth, and API endpoints. This differs from the browser
behavior observed before this attempt, when Kong port 54321 could return Auth
health and the frontend remained accessible.

The browser result for Studio or Mailpit cannot be interpreted as an application
HTTP status because the browser returned a top-level loading failure rather than
an HTTP response.

## 6. Mailpit and Studio accessibility

- Mailpit: not accessible in the browser verification.
- Studio: not accessible in the browser verification.
- Kong root 404 behavior was not evaluated as a success/failure criterion.
- No test email was sent.

## 7. Frontend and API availability

- Frontend: accessible in the browser and rendered SyllabusSync at
  `http://localhost:5173/sign-in`.
- API health: not reachable through native Windows HTTP verification during
  this post-attempt check.

## 8. Errors and unresolved issues

- Docker Desktop was not controllable through the exposed Computer Use UI
  because no Docker Desktop window surfaced.
- Docker CLI access was denied in the sandbox by the Docker named pipe.
- WSL and Windows CIM access were denied.
- Post-attempt Windows HTTP checks for Supabase and the API were unable to
  connect.
- Pre-restart container and resource status could not be independently
  confirmed.
- Mailpit and Studio remained inaccessible.
- The frontend remained accessible.

## 9. Destructive-operation confirmation

Confirmed that none of the following occurred:

- Supabase stack restart or stop
- `supabase db reset`
- Docker container deletion or recreation
- Docker network deletion or recreation
- Docker volume deletion or recreation
- Docker image pruning
- Container reset or individual container restart
- Docker Desktop factory reset or data purge
- Migration or seed operation
- Application source or environment-file modification
- Supabase configuration modification
- Firewall, port-proxy, WSL, or Docker networking configuration change

## 10. Final verdict

**FAIL**

Docker Desktop could not be confirmed as restarted, and the relevant endpoint
verification did not return a healthy service state.

The result does not prove the root cause and does not establish that a Docker
Desktop restart would or would not fix the networking issue. No further
remediation was attempted.

## 11. Required next approval

Because the Docker Desktop UI was unavailable and the endpoint checks remained
unsuccessful, no Supabase stack operation or networking change was attempted.

A separate explicit authorization is required before the next recovery step,
such as a later Docker Desktop UI restart attempt or, only if separately
approved, a normal `supabase stop`/`supabase start` operation.
