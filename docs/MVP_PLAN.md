# AG Pocket Console MVP Plan

This document defines the minimal implementation path for AG Pocket Console.

## Scope

AG Pocket Console is a mobile approval and supervision console for Google Antigravity agents. The MVP must not depend on private Antigravity IDE APIs. It targets the shared `PreToolUse` hook layer first.

## Milestones

### MVP-0: Hook protocol verification

Goal: prove that Antigravity invokes the hook before `run_command` execution.

Tasks:

1. Configure `PreToolUse` with `matcher: "run_command"`.
2. Run a debug hook that writes stdin to `~/.ag-pocket/debug/`.
3. Confirm the real payload contains `conversationId`, `workspacePaths`, `toolCall.name`, and `toolCall.args.CommandLine`.
4. Return `{ "decision": "allow" }` and confirm the command runs.
5. Return `{ "decision": "deny", "reason": "AG Pocket test deny" }` and confirm the command is blocked.

### MVP-1: Local approval loop

Goal: build the local approval loop without Cloudflare.

Flow:

```text
Antigravity run_command
        ↓
PreToolUse hook
        ↓
POST /internal/approvals
        ↓
local daemon stores pending approval
        ↓
local web page approves or rejects
        ↓
hook polls /internal/approvals/:id
        ↓
hook returns decision JSON
```

### MVP-2: Remote mobile approval

Goal: expose the daemon through Cloudflare Tunnel and Access.

Add:

- Cloudflare Tunnel
- Cloudflare Access JWT verification
- mobile PWA approval cards
- WebSocket push
- `GET /api/approvals?status=pending` for reconnect recovery

### MVP-3: Security hardening

Add:

- SQLite audit logs
- command masking
- approval expiry
- risk level classification
- local shared secret
- Cloudflare email audit
- fail-closed behavior

### MVP-4: Async approval mode

Later, support ticket-based approval where the hook immediately denies with a reason and the agent retries after external approval.

## Timeout chain

Use a short wait model for the first mobile approval MVP.

```text
Antigravity hook timeout: 60s
daemon approval TTL: 45s
hook polling max: 50s
```

Do not set `timeout: 0`.

## API split

Internal hook APIs:

```text
POST /internal/approvals
GET  /internal/approvals/:id
```

Mobile APIs:

```text
GET  /api/approvals?status=pending
POST /api/approvals/:id/approve
POST /api/approvals/:id/reject
GET  /ws
```

## Authentication

`/internal/*` requires:

- local loopback source
- `Authorization: Bearer <AG_DAEMON_SECRET>`

`/api/*` and `/ws` require:

- `Cf-Access-Jwt-Assertion`
- verified issuer
- verified audience
- valid expiration
- allowlisted email

## Fail-closed rules

The hook must deny when:

- daemon is unavailable
- stdin cannot be parsed
- local secret is missing
- approval expires
- polling times out
- daemon returns an unexpected status
