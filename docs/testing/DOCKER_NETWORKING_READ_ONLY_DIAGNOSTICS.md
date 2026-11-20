# Docker Networking Read-Only Diagnostics

Date/time: 2026-11-20 00:19:02 UTC+08:00 investigation window

## 1. Environment summary

- Host: Windows 11
- Repository: `C:\Users\nyxai\Projects\syllabussync`
- Docker Desktop: 4.99.0
- WSL: 3.0.5.0
- WSL distributions previously observed:
  - `Ubuntu`: Running, WSL2
  - `docker-desktop`: Running, WSL2
- Docker Linux engine
- Docker context previously observed: `desktop-linux`
- Docker Desktop client version observed in this session: 29.9.3
- Node.js: 26.13.0
- pnpm: 12.21.0
- Host memory: 8 GB RAM

Existing known Supabase published mappings:

| Service | Container target | Host port |
| --- | --- | --- |
| Kong | `8000/tcp` | `54321` |
| Studio | `3000/tcp` | `54323` |
| Mailpit/Inbucket | `8025/tcp` | `54324` |

No source, environment, migration, Docker, WSL, firewall, port-proxy, container,
network, or volume operation was performed.

## 2. Docker engine and UI status

### Docker engine

The Docker CLI reported:

```text
docker context show
default

docker version
Client:
  Version: 29.9.3
  API version: 1.56

Server:
permission denied while trying to connect to the Docker API
at npipe:////./pipe/docker_engine
```

The active context printed by the CLI was `default`, not `desktop-linux`. This
could be the sandbox's Docker CLI environment and must not be treated as proof
that the real user context changed. The Docker configuration file under the
real user profile was also reported as access denied.

The sandbox could not read Docker server version or connect to the Docker engine.
Therefore, no independent live confirmation of Engine Running or Linux-engine
state was possible in this session.

### Docker Desktop UI process

The Docker Desktop launch target was previously attempted in the earlier
restart-verification task. It reported launch success but no visible Docker
Desktop window appeared in the window inventory.

For this diagnostics task:

- No Docker Desktop window was available for rebinding or UI inspection.
- A read-only process inventory returned no matching Docker, WSL, or WSL relay
  process records in the sandbox shell.
- The absence of process records is not proof that Docker Desktop and WSL are
  absent from the real host; process and CIM access were incomplete.
- No Docker Desktop process was terminated or relaunched.

The Docker Desktop UI initialization problem observed previously remains
unresolved, but it has not been linked to engine networking by evidence.

### Docker Desktop reports log

The real `%APPDATA%\Docker\reports.log` path was readable and contained only a
single opaque hash-like line:

```text
1795046379-ed56b87fd5068b62c4a0644738dc7738a086b4d9a202d1fa5386250ffd8951b74
```

This file provided no visible UI initialization, networking, or container error
information.

## 3. Existing container, network, and volume status

Live container state could not be collected because Docker API access was denied
by the sandbox.

Previously observed state remains relevant but is not re-confirmed:

- `supabase_db_syllabussync`
- `supabase_kong_syllabussync`
- `supabase_studio_syllabussync`
- `supabase_inbucket_syllabussync`

The existing containers had previously been reported as running and healthy.
Their current running/health state could not be independently verified in this
session.

Likewise, live Docker network membership and named-volume presence could not be
read. No container, network, or volume was modified.

## 4. Host-published endpoint results

All direct HTTP probes used proxy bypass with `curl.exe --noproxy "*"`.

| Service | Endpoint | TCP/HTTP result | Timing/error |
| --- | --- | --- | --- |
| Studio | `http://127.0.0.1:54323/` | HTTP unavailable; connection failed | 1309 ms; exit 7 |
| Mailpit | `http://127.0.0.1:54324/` | HTTP unavailable; connection failed | 1023 ms; exit 7 |
| Supabase Auth | `http://127.0.0.1:54321/auth/v1/health` | HTTP unavailable; connection failed | 1031 ms; exit 7 |
| API | `http://localhost:3000/api/health` | HTTP unavailable; connection failed | 1038 ms; exit 7 |
| Frontend | `http://localhost:5173/` | Browser loaded SyllabusSync and redirected to `/sign-in` | Browser result successful |

The curl failures reported:

```text
Failed to connect to 127.0.0.1:54323: Bad access
Failed to connect to 127.0.0.1:54324: Bad access
Failed to connect to 127.0.0.1:54321: Bad access
Failed to connect to localhost:3000: Bad access
Failed to connect to localhost:5173: Bad access
```

For Studio and Mailpit, the browser returned `ERR_FAILED (-2)` rather than an
HTTP status or empty/aborted HTTP response.

For the Auth health endpoint and API health endpoint, the browser and PowerShell
could not establish a connection.

The frontend loaded successfully in an existing browser page. A direct curl
probe of port 5173 also reported `Bad access`, so browser shell/network
visibility differs from direct sandbox curl visibility.

This distinction matters: `Bad access` in a restricted sandbox is not a
confirmed host firewall or application refusal. It may indicate sandbox socket
restrictions rather than endpoint state.

## 5. Prior host-port evidence

The earlier read-only investigation and restart-verification tasks recorded
additional evidence:

- TCP to 54324 had previously succeeded.
- `curl.exe` to 54324 had previously received curl `(52) Empty reply from server`.
- 54323 had previously received an empty reply.
- 54321 had previously served Kong 404 at `/` and HTTP 200 at `/auth/v1/health`.
- 54324 had previously reset through the Ubuntu WSL IP and Windows LAN IP.
- Proxy bypass did not resolve the earlier empty/rejected responses.
- Windows listeners had previously been associated with
  `com.docker.backend.exe` and `wslrelay.exe`.
- Ubuntu `ss -ltnp` had shown listeners for 54321, 54323, and 54324 but did not
  identify the process.
- `netsh interface portproxy show all` had reported no configured port-proxy
  rules.
- No custom `%USERPROFILE%\.wslconfig` had been observed.
- Kong, Studio, and Mailpit container mappings were previously observed.

These earlier observations are more useful than the current curl `Bad access`
result because they showed that an HTTP stack previously existed on the host
ports.

## 6. Internal versus host connectivity

### Previously confirmed internal connectivity

The earlier investigation observed:

- Mailpit responded with HTTP 200 to `wget http://127.0.0.1:8025/` inside the
  existing Mailpit container.
- Mailpit reached Studio through the Docker network and received Studio HTTP
  307 followed by 200.
- Kong returned HTTP 404 at `/`; this is not evidence that the gateway is down.
- Relevant container health checks passed.

The internal checks were not repeated in this session because Docker exec access
was denied. The above are retained as previously supplied evidence.

### Comparison

The earlier evidence established an internal-versus-host split:

- Container HTTP services were healthy internally.
- At least Kong's `/auth/v1/health` endpoint worked through published port 54321.
- 54323 and 54324 failed or closed host HTTP traffic despite container HTTP
  availability.

This split is consistent with published-port relay degradation or a
container-specific forwarding problem, not a confirmed global engine outage.

The current diagnostics cannot independently confirm container health,
container port mappings, Docker network addresses, or named-volume presence.

## 7. Listener and process findings

The earlier read-only investigation found:

- Host listeners on 54321, 54323, and 54324.
- Associations with `com.docker.backend.exe` and `wslrelay.exe`.
- Ubuntu listeners on 54321, 54323, and 54324.
- No Windows port-proxy rule.

No exact PID-to-port ownership was confirmed by this session because
process/CIM/listener access was restricted.

A TCP-listener overlap remains plausible but is not proven. Presence of
`com.docker.backend.exe` and `wslrelay.exe` does not itself prove duplicate
ownership or that both processes compete for the same socket.

## 8. Ranked evidence-based causes

### 1. Docker Desktop/WSL published-port relay is unavailable or stale

Confidence: **Medium (55%)**.

Evidence:

- Earlier host probes showed TCP listening plus empty/reset HTTP responses.
- Auth on 54321 previously worked while Studio and Mailpit failed.
- Container-internal HTTP checks previously passed.
- No Windows port-proxy rule was observed.

The current session's `Bad access` and Docker named-pipe denial are limited by
the sandbox and cannot independently confirm this ranking.

### 2. Docker Desktop UI state is separate from engine networking

Confidence: **Medium (50%)**.

Evidence:

- Docker Desktop previously reported Engine Running.
- Its UI window did not appear in the earlier window inventory.
- The UI launch target reported no running window.
- The Docker reports log contained no useful diagnostic text.

This may be an UI/service initialization issue, but no evidence shows that it
caused Studio or Mailpit forwarding failures.

### 3. Container-specific published-port forwarding for 54323/54324

Confidence: **Low-to-medium (40%)**.

Evidence:

- Kong 54321 previously responded successfully.
- Studio 54323 and Mailpit 54324 failed from the host while internal HTTP
  health remained good.

This could indicate Docker forwarding for those mappings, but live port-mapping
and Docker inspect data could not be re-collected.

### 4. WSL localhost or relay forwarding issue

Confidence: **Low-to-medium (35%)**.

Evidence:

- WSL relay components were associated with prior host listener observations.
- 54324 previously failed through loopback and WSL LAN/IP routes.

No live WSL status or listener ownership was available in this session.

### 5. Host listener conflict

Confidence: **Low (25%)**.

Evidence:

- Docker and WSL forwarding components may both be visible.
- No exact listener ownership or duplicate binding was confirmed.
- No port-proxy rule was found.

This hypothesis lacks enough live evidence to rank higher.

### 6. Windows firewall or security filtering

Confidence: **Low (20%)**.

Evidence:

- No proxy bypass effect was observed earlier.
- TCP or HTTP behavior differed by port in earlier evidence.

Firewall state could not be inspected in the current sandbox, and no firewall
change is proposed.

### 7. Container application failure

Confidence: **Low (15%)**.

Evidence:

- Mailpit and Studio had healthy container-level HTTP behavior in earlier
  checks.
- Their host failures were empty, reset, or connection-level rather than normal
  HTTP application errors.

Container-specific application failure remains possible but is weak compared
with the internal-versus-host evidence.

## 9. Confirmed facts

The following are confirmed for this diagnostics session:

- No Docker, WSL, Supabase, network, firewall, source, or database state was
  changed.
- Docker CLI access to `npipe:////./pipe/docker_engine` was denied.
- Docker context output was `default` in the sandbox environment.
- Docker server version could not be collected.
- WSL process and status access was denied.
- Windows API/process access was incomplete due to CIM and filesystem
  restrictions.
- Proxy-bypassed curl could not connect to 54323, 54324, 54321, 3000, or 5173
  because the sandbox socket reported `Bad access`.
- The frontend loaded in the browser at `http://localhost:5173/sign-in`.
- Browser access also failed for Studio, Mailpit, Auth health, and API health.
- Docker Desktop UI launch previously left no visible Docker Desktop window.

## 10. Unresolved questions

1. Is Docker Desktop Engine currently running and configured for the
   `desktop-linux` context in the real host session?
2. Are the existing Supabase containers still running and healthy?
3. Do Docker named volumes and the existing Supabase network remain present?
4. Which exact PIDs own listeners on 54321, 54323, and 54324?
5. Does Docker publish a destination mapping for each service in the live engine?
6. Can Docker exec reach the existing Mailpit, Studio, and Kong containers?
7. Is Docker Desktop UI present but off-screen/minimized, or is it actually
   not running?
8. Are the current browser failures caused by host networking or sandbox/browser
   process restrictions?

## 11. Recommended next action

No remediation was performed.

The next action requiring user approval would be either:

1. Run diagnostics from a host tool context with Docker named-pipe and WSL
   access permitted, using only read-only commands such as `docker ps`,
   `docker inspect`, `docker network inspect`, `wsl.exe --status`, and listener
   inspection.

2. If a later Docker Desktop UI restart is separately authorized, restart it
   through the Docker Desktop UI and rerun the endpoint verification.

Do not restart Docker Desktop, WSL, or Supabase based on this report without
separate explicit approval. Do not alter firewall, portproxy, WSL, Docker,
Supabase, container, network, or volume state.
