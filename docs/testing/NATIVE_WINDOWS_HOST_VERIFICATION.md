# Native Windows Host Verification

Date/time: 2026-11-20 00:26:24 UTC+08:00 investigation window

## 1. Execution context

The diagnostics ran in Windows PowerShell 5.1:

| Item | Result |
| --- | --- |
| PowerShell executable | `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe` |
| PowerShell edition/version | Desktop, 5.1.26100.9818 |
| User | `nyxai` |
| Computer | `LICHT` |
| Repository | `C:\Users\nyxai\Projects\syllabussync` |
| Docker config | `$env:USERPROFILE\.docker\config.json` exists |
| Docker named pipe | `\\.\pipe\docker_engine` |

The PowerShell process is native Windows PowerShell rather than WSL or an Ubuntu
shell. However, this tool environment still denied access to host Docker,
WSL, and Windows CIM resources. It therefore could not perform the requested
actual-host Docker-engine verification reliably.

No credentials, environment secrets, or tokens were recorded.

## 2. Docker engine status

Docker CLI commands reported:

```text
docker context show
default

docker version
Client:
  Version: 29.9.3
  API version: 1.56
  Context: default

Server:
permission denied while trying to connect to the Docker API
at npipe:////./pipe/docker_engine
```

`docker info --format '{{json .}}'` reported client information but no usable
server fields:

- Containers: 0
- ContainersRunning: 0
- ServerVersion: empty
- Docker context: `default`
- Docker named-pipe connection: denied

This does not prove that the real host context is `default` or that the Docker
engine is stopped. It proves that the restricted execution environment cannot
access the Docker named pipe or Docker Desktop plugin executables.

Commands blocked:

- `docker context show`
- `docker version`
- `docker info`
- Docker plugin discovery

Exact limitation:

- `open C:\Users\nyxai\.docker\config.json: Access is denied`
- `permission denied while trying to connect to ...\pipe\docker_engine`
- Docker CLI plugin executables under `%USERPROFILE%\.docker\cli-plugins`
  returned `Access is denied`

Docker Desktop process status could not be confirmed independently. Windows
process/CIM inventory returned `Access to a CIM resource was not available`.

## 3. Supabase containers

Live container status could not be read. The command:

```powershell
docker ps -a --filter 'name=supabase_' --format '{{json .}}'
```

was blocked by denied Docker named-pipe access.

The following information remains based on earlier supplied observations, not
live verification in this run:

| Container | Previously observed status |
| --- | --- |
| `supabase_db_syllabussync` | Running and healthy |
| `supabase_kong_syllabussync` | Running and healthy |
| `supabase_studio_syllabussync` | Running and healthy |
| `supabase_inbucket_syllabussync` | Running and healthy |

The current restart count, health state, and live port mappings could not be
re-confirmed.

Previously observed mappings:

| Service | Container target | Published host port |
| --- | --- | --- |
| Kong | `8000/tcp` | `54321` |
| Studio | `3000/tcp` | `54323` |
| Mailpit/Inbucket | `8025/tcp` | `54324` |

No container was stopped, started, restarted, recreated, or inspected through
`docker exec`.

## 4. Network and storage

The following read-only commands were blocked:

```powershell
docker network ls
docker volume ls
docker network inspect
docker volume inspect
```

All failed with denied access to `npipe:////./pipe/docker_engine`.

No existing Supabase Docker network or named volume could be inspected live.
No network or volume was modified.

## 5. Host listeners

The listener query using `Get-NetTCPConnection` was blocked by a Windows CIM
access-denied error.

A native `netstat -ano -p tcp` probe returned no matching rows for ports:

- 54321
- 54322
- 54323
- 54324
- 3000
- 5173

The absence of rows cannot be interpreted as proof that no listeners exist,
because the restricted environment could not perform a successful listener
ownership/CIM query. No process was terminated or started.

## 6. Internal container connectivity

No `docker exec` checks were possible because Docker named-pipe access was
denied.

The following checks were not run:

- Mailpit `127.0.0.1:8025`
- Studio `127.0.0.1:3000`
- Kong `127.0.0.1:8000/auth/v1/health`

This is because no container HTTP client or Docker exec access was available
through this environment.

Previously supplied evidence remains:

- Mailpit had returned HTTP 200 inside the container on port 8025.
- Mailpit had reached Studio and received HTTP 307 followed by HTTP 200.
- Kong had returned HTTP 404 at `/`, with `/auth/v1/health` previously reachable.
- Container health checks had passed.

Those observations were not re-confirmed in this session.

## 7. Native Windows host connectivity

Proxy-bypassed PowerShell HTTP requests were used against the five requested
endpoints.

| Service | Endpoint | Result | Timing |
| --- | --- | --- | --- |
| Supabase Auth | `http://127.0.0.1:54321/auth/v1/health` | Unable to connect | 55 ms |
| Studio | `http://127.0.0.1:54323/` | Unable to connect | 1 ms |
| Mailpit | `http://127.0.0.1:54324/` | Unable to connect | 1 ms |
| API | `http://localhost:3000/api/health` | Unable to connect | 8 ms |
| Frontend | `http://localhost:5173/` | Unable to connect in native PowerShell | 2 ms |

All native PowerShell probes returned connection failure rather than HTTP
status. No endpoint produced an HTTP 404 or 200 response in this run.

An existing browser page continued to display SyllabusSync at
`http://localhost:5173/sign-in`, so frontend browser reachability differs from
the restricted PowerShell probe. The browser state does not establish Docker
or Supabase service reachability.

The Kong root route was not evaluated as a success criterion.

## 8. TCP and HTTP differences

Earlier native Windows evidence remains distinct from this run:

- Earlier TCP to 54324 had succeeded.
- Earlier curl to 54324 had returned curl `(52) Empty reply from server`.
- Earlier 54323 had returned an empty HTTP reply.
- Earlier 54321 had returned Kong HTTP 404 at `/` and HTTP 200 for Auth health.
- Earlier 54324 had reset through the Ubuntu WSL IP and Windows LAN IP.

In the current restricted run:

- Native PowerShell HTTP access to all tested ports failed quickly.
- No TCP listener ownership information was available.
- No Docker or WSL relay process state was available.
- No HTTP status was available because connections could not be established.

## 9. Confirmed facts versus hypotheses

### Confirmed facts

- This run used native Windows PowerShell 5.1.
- Docker CLI was present and returned client version 29.9.3.
- Docker CLI could not access `npipe:////./pipe/docker_engine`.
- Docker CLI config and Docker plugin access were denied.
- Windows CIM process/listener access was denied.
- Live container, network, volume, port mapping, and `docker exec` checks were
  blocked.
- Native PowerShell could not connect to the requested host endpoints.
- No Docker, WSL, Supabase, network, volume, firewall, portproxy, source,
  environment, migration, or database operation was performed.

### Hypotheses

1. **Docker named-pipe and host API access failure**
   - Could explain why the Docker CLI, container, network, and volume checks
     were unavailable.
   - Confidence: high for the restricted environment.
   - Not proven as a real host Docker engine outage.

2. **Docker Desktop/WSL relay forwarding failure**
   - Supported by earlier TCP/listener and empty/reset host observations.
   - Confidence: medium.
   - Live confirmation was blocked.

3. **Host listener conflict**
   - Previously possible because Docker and WSL forwarding components were
     visible.
   - Confidence: low until exact PID ownership is available.

4. **Container-specific published-port forwarding failure**
   - Supported earlier by Kong working while Studio and Mailpit failed.
   - Confidence: low-to-medium.

5. **Windows sandbox or security restriction**
   - Strongly supported for this session by direct access-denied results.
   - It may not represent host firewall or security behavior.

## 10. Recommended next step

No remediation was performed and no state-changing command is authorized.

The next step requires a terminal context that has permission to access:

- `npipe:////./pipe/docker_engine`
- Docker plugin executables under `%USERPROFILE%\.docker\cli-plugins`
- Windows process and listener APIs
- WSL process/status APIs

If that access is granted, rerun only read-only commands:

```powershell
docker context show
docker version
docker info
docker ps -a --filter "name=supabase_"
Get-NetTCPConnection -State Listen
```

Then inspect the existing containers, mappings, network, and volumes through
`docker inspect`/`docker network inspect`/`docker volume ls` without changes.

No Docker Desktop restart, WSL restart, container restart, Supabase command,
database reset, migration, network change, volume change, firewall change,
portproxy change, or application/configuration change is recommended in this
report until separate approval.
