# Native Windows Docker / WSL2 Networking Investigation

## 1. Environment summary

- Host: Windows 11, native Windows repository
- Repository: `C:\Users\nyxai\Projects\syllabussync`
- Docker Desktop: 4.99.0
- WSL: 3.0.5.0
- WSL distributions:
  - `Ubuntu`: Running, WSL2
  - `docker-desktop`: Running, WSL2
- Docker context: `desktop-linux`
- Docker Linux engine
- Node.js: 26.13.0
- pnpm: 12.21.0
- Host memory: 8 GB RAM
- Working application ports:
  - Vite: `http://localhost:5173`
  - API: `http://localhost:3000`

Relevant Supabase published mappings:

| Service | Container target | Published host port |
| --- | --- | --- |
| Kong | `8000/tcp` | `54321` |
| Studio | `3000/tcp` | `54323` |
| Mailpit/Inbucket | `8025/tcp` | `54324` |

Supabase containers observed as running and healthy include
`supabase_kong_syllabussync`, `supabase_studio_syllabussync`,
`supabase_inbucket_syllabussync`, and `supabase_db_syllabussync`.

This investigation did not change application source, Supabase configuration,
migrations, environment variables, Docker volumes, containers, networks,
Windows firewall rules, WSL configuration, or port-proxy state.

## 2. Diagnostics performed

All tests in this report were read-only unless they are explicitly identified as
not completed because of the tool sandbox.

### Container and application health

- Mailpit responded with HTTP 200 and its HTML page to
  `wget http://127.0.0.1:8025/` from inside the container.
- Mailpit reached Studio through the Docker network and received a Studio
  HTTP 307 response followed by HTTP 200.
- Kong returned HTTP 404 at `/`, which is consistent with the gateway having no
  root route. It also has the healthy GoTrue/Auth response reported below.
- The container health checks for the relevant services passed.

### Windows published-port behavior

The following behavior was observed:

| Probe | Result | Interpretation |
| --- | --- | --- |
| `Test-NetConnection 127.0.0.1 -Port 54324` | TCP succeeded | A host listener accepted the TCP connection |
| `curl.exe --noproxy "*" -v --max-time 5 http://127.0.0.1:54324/` | Curl 52, empty reply | The listener closed without a valid HTTP response |
| `http://localhost:54324/` | Empty reply | Same as IPv4 loopback failure |
| `http://127.0.0.1:54323/` | Empty reply | Studio relay/published-port response fails |
| `http://127.0.0.1:54321/` | HTTP 404 JSON, not an abort in browser verification | Kong root route is intentionally/unexpectedly absent |
| `http://127.0.0.1:54321/auth/v1/health` | HTTP 200, GoTrue status JSON | Kong published-port forwarding is operational |
| `http://localhost:54321/rest/v1/` | HTTP failure/404 from browser verification | No REST root route; this is not evidence of a stopped API gateway |
| Ubuntu WSL IP `http://172.18.131.69:54324/` | Connection reset | Failure also reaches the WSL-route path |
| Windows LAN IP on the published ports | Failed | Not limited to loopback forwarding |

The host can serve the application at ports 5173 and 3000. Kong's Auth endpoint
is reachable through its published port, while Studio and Mailpit published-port
responses are not. This is evidence of a per-published-service relay problem or
a service/relay response failure, not evidence that the entire Docker network
is unavailable.

### Host listener and forwarding state

Known host-listener observations:

- Windows listeners for ports 54321, 54323, and 54324 have been associated with
  `com.docker.backend.exe` and `wslrelay.exe`.
- Ubuntu `ss -ltnp` showed listeners on 54321, 54323, and 54324, but no owning
  process information was reported.
- `sudo fuser -v 54324/tcp` returned no process information.
- `netsh interface portproxy show all` returned no configured port-proxy rules.
- No custom `%USERPROFILE%\.wslconfig` exists.

`localhost` resolves to both `::1` and `127.0.0.1`, and HTTP proxy bypass did
not change the failing results. In the investigation shell, host proxy variables
were present for `127.0.0.1:50295`, but direct `curl.exe --noproxy "*"` testing
and the browser probes still showed the same failures.

### Docker Desktop and WSL diagnostics availability

The following read-only Docker/WSL commands were attempted from the current
sandboxed session:

- `docker context show`
- `docker version`
- `docker ps`
- `docker inspect`
- `wsl.exe --status`
- `wsl.exe -l -v`
- Docker Desktop service and log-location checks

The Docker CLI received `permission denied` while connecting to the Docker
Desktop named pipe, and WSL/Windows CIM calls received access-denied results.
Docker Desktop log locations resolved inside the sandbox package area rather
than the real user profile and contained no usable Docker Desktop diagnostics.
These restrictions prevent a lower-level Docker Engine socket trace or live
Docker log collection in this session. They do not alter or disable the running
containers.

Host firewall profile inspection was also restricted in the sandbox, so no
conclusion is drawn from that incomplete check.

## 3. Findings and evidence

### Published-port forwarding is partially operational

The Kong Auth health endpoint returned HTTP 200 through host port 54321, which
shows that Docker Desktop publishing and at least one WSL relay path can carry
valid HTTP traffic. Therefore:

- Docker Engine connectivity is not wholly absent.
- Kong container routing is functioning.
- A blanket inability for Windows to connect to every Docker published port is
  not supported by the evidence.

### The Docker Desktop published-port state is inconsistent for Studio and Mailpit

The strongest evidence is the split behavior:

1. Mailpit responds on container port 8025 internally.
2. Studio and Mailpit can communicate internally.
3. Studio is reachable internally and responds 307/200 from its container
   network path.
4. Host TCP can connect to 54324.
5. HTTP then receives an empty reply or reset instead of Mailpit or Studio data.
6. Host WSL and LAN routes to 54324 reset as well.

This pattern is more consistent with a broken/stale published-port relay for
54323/54324 or an HTTP forwarding mismatch than with a down application service.

### Multiple forwarding mechanisms may be visible, but overlap is not proven

Both `com.docker.backend.exe` and `wslrelay.exe` can appear in Docker Desktop/
WSL forwarding architectures. Their presence on the host does not by itself prove
a port collision or duplicate ownership.

The evidence does establish that multiple forwarding components are involved or
visible in the host/WSL networking stack. It also establishes that a Windows
port-proxy rule is not configured. The exact ownership of each TCP listener could
not be verified from the restricted sandbox, and Ubuntu listener ownership was
also unavailable.

### 8 GB of memory is not the leading evidence

Containers are healthy and Kong is reachable, so memory pressure is not strongly
supported as the primary cause. It can still make a Docker Desktop restart or
stack recreation slower, which is why the lowest-risk proposal avoids launching
additional processes or tools.

## 4. Root-cause assessment

### Most likely root cause

**Medium-confidence assessment:** Docker Desktop/WSL published-port forwarding
has stale or broken relay state for ports 54323 and 54324. Mailpit and Studio
remain healthy in the Linux engine, but Windows traffic is not reaching a valid
HTTP response through those host forwarding paths.

Confidence: **Medium (65%)**.

Supporting evidence:

- Container HTTP checks are healthy.
- Internal Docker-network HTTP checks are healthy.
- Kong port 54321 proves partial published-port forwarding is working.
- 54323 and 54324 accept TCP but close/reset HTTP traffic.
- WSL LAN/IP and loopback routes fail, while no Windows port-proxy rule exists.
- Proxy bypass did not resolve the issue.

### Alternative explanations

1. **Per-container port/publishing configuration issue**
   - Likelihood: low-to-medium.
   - Docker mappings are present and container health checks pass. The failure
     may still involve Docker Desktop failing to deliver the HTTP stream to
     these two mappings.

2. **Mailpit or Studio protocol/service defect**
   - Likelihood: low.
   - Both services return HTTP content successfully inside or across the Docker
     network. Mailpit could still have a host-listener-only problem, but the
     split behavior is less consistent with application failure.

3. **WSL localhost forwarding conflict or stale relay**
   - Likelihood: low-to-medium.
   - WSL and Docker forwarding components are visible and 54324 fails from WSL
     and LAN routes. This remains plausible because exact listener ownership
     could not be collected. Docker Desktop listener coexistence should not
     automatically be treated as a conflict.

4. **Windows firewall, Smart App Control, or endpoint filtering**
   - Likelihood: low.
   - A TCP listener accepts 54324 and Kong 54321 traffic works. If filtering
     were the cause, the current evidence does not explain the per-port split
     well enough to justify changing security settings.

5. **System proxy**
   - Likelihood: low.
   - Proxy bypass was explicitly tested and did not change the known curl
     behavior. The host proxy variable seen in this session is not enough to
     explain Kong working while 54323/54324 fail.

## 5. Recommended remediation

Stop and wait for approval before applying remediation. No source or network
configuration change is needed before the first recovery attempt.

### Lowest-risk first step: restart Docker Desktop

This is the lowest-risk action because it targets the likely stale Docker/
WSL forwarding state and does not reset containers, volumes, migrations, or
application files.

#### UI steps

1. Open Docker Desktop.
2. Open **Troubleshoot**.
3. Select **Restart Docker Desktop**.
4. Wait until Docker Engine reports **Running**.
5. Do not choose **Reset to factory defaults**, **Wipe data**, or
   **Clean / Purge data**.

After restart, verify Docker Desktop reports the Linux engine and the existing
Supabase containers return to running/healthy. Avoid running a database reset.

#### Expected impact

- Containers and WSL forwarding state may restart.
- The running Supabase containers may stop and be recreated or temporarily enter
  unhealthy/restarting states while the engine returns.
- Docker named volumes and persistent database data are not deleted by a
  Docker Desktop restart.
- Application code, migrations, and environment files remain unchanged.
- A compose stack or Supabase CLI process may need to be started again if Docker
  Desktop does not restore it automatically.

#### Rollback

There is no data rollback to perform: no persistent configuration or volume
change is proposed. Reopen Docker Desktop or wait for the engine to become
healthy. Do not reset Docker Desktop to rollback.

### If restart does not restore ports

The next proposed step would be a Supabase stack stop/start, not a database
reset:

```powershell
supabase stop
supabase start
```

Run these only after explicit approval. This recreates Supabase containers from
the existing stack configuration and leaves Docker volumes in place. It may
briefly interrupt all local Supabase clients but is not a volume deletion or
database reset.

Do not run `supabase db reset`, `docker compose down -v`,
`docker volume rm`, `docker system prune`, or `docker network prune`.

### Changes explicitly not recommended

Do not change these before a restart has been tested:

- Windows firewall rules
- Smart App Control or related security features
- `netsh interface portproxy`
- `%USERPROFILE%\.wslconfig`
- WSL networking mode
- Docker Desktop resource settings
- Ubuntu shutdown or unregistration
- Container/volume/network deletion
- Supabase configuration or migrations

## 6. Risks and rollback

| Action | Risk | Data impact | Rollback |
| --- | --- | --- | --- |
| Restart Docker Desktop | Brief container outage; network state and in-memory state reset | Persistent Docker volumes are preserved | Reopen Docker Desktop; no configuration changes were made |
| `supabase stop && supabase start` | Brief Supabase outage; containers recreated | Database volumes are not deleted by a normal stop/start | Start Supabase again; no configuration or volume deletion |
| Firewall/portproxy/WSL changes | High risk of unrelated networking regressions | None directly, but network access interruption | No proposed change or rollback |
| `supabase db reset` or volume deletion | Irreversible database loss | Prohibited and must not be used | None; database reset is excluded |

The 8 GB memory limit makes a full Docker/Desktop data reset especially
inadvisable. A restart or normal stop/start is preferable because both preserve
the existing database volume and avoid heavy rebuild work.

## 7. Verification checklist

Run these checks only after the approved remediation is complete.

### Mailpit

- [ ] Open `http://localhost:54324/`.
- [ ] Confirm Mailpit HTML or its dashboard loads with HTTP 200.
- [ ] Confirm direct curl succeeds:

  ```powershell
  curl.exe --noproxy "*" -v --max-time 5 http://127.0.0.1:54324/
  ```

- [ ] Repeat by name:

  ```powershell
  curl.exe --noproxy "*" -v --max-time 5 http://localhost:54324/
  ```

### Supabase Studio

- [ ] Open `http://localhost:54323/`.
- [ ] Confirm Studio loads and can access the local project.
- [ ] Confirm direct curl no longer returns an empty reply.

### Supabase API and Auth

- [ ] The application API remains healthy:

  ```powershell
  curl.exe --noproxy "*" -v --max-time 5 http://127.0.0.1:3000/api/health
  ```

- [ ] Kong root behavior is understood:
  `/` may return 404 because Kong has no root route.
- [ ] Auth health responds:

  ```powershell
  curl.exe --noproxy "*" --max-time 5 http://127.0.0.1:54321/auth/v1/health
  ```

- [ ] Supabase REST is reachable through a real API path used by the application,
  or by an authenticated REST request with the local publishable key if required.
- [ ] No credential or service-role key appears in command output, screenshots,
  logs, or this report.

### Email confirmation

- [ ] Create a throwaway local test account using the email signup flow.
- [ ] Confirm a signup confirmation message appears in Mailpit.
- [ ] Open the confirmation link and confirm the browser returns to the
  configured SyllabusSync callback.
- [ ] Remove or disable the throwaway test account after verification if the
  workflow requires cleanup. Do not remove unrelated database records.

### Persistent database content

Before remediation, if direct read-only access is available, record a baseline
count for existing application tables. For example:

```sql
select count(*) as profile_count from public.profiles;
```

After remediation, run the same read-only count and compare it with the baseline.
Use the Table Editor or SQL Editor in Studio if direct CLI access is unavailable.

- [ ] Baseline data counts are known.
- [ ] The same read-only counts remain unchanged after remediation.
- [ ] Existing tasks, profiles, and other application records remain accessible.
- [ ] No migration, database reset, volume deletion, or volume replacement was
  performed.
