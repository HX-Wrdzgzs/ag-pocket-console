# AG Pocket Console Technical Report

## 1. Project position

AG Pocket Console is a mobile approval and supervision console for Google Antigravity and Antigravity IDE.

It is not a remote desktop system and it should not try to mirror the full IDE onto a phone. It is a control plane for human approval, auditability, and safe command execution.

## 2. Product split

The system treats the Antigravity ecosystem as three layers:

```text
Antigravity        = task orchestration layer
Antigravity IDE    = workspace and code execution layer
AG Pocket Console  = mobile supervision and approval layer
```

## 3. Core technical direction

The MVP should start from the shared `PreToolUse` hook mechanism instead of private Antigravity IDE APIs.

The desired command path is:

```text
Antigravity CLI / IDE
        ↓
PreToolUse hook, matcher = run_command
        ↓
AG Pocket hook script
        ↓
ag-pocket-daemon
        ↓
mobile approval UI
        ↓
hook stdout decision JSON
```

## 4. Hook protocol

The hook reads structured JSON from stdin and returns structured JSON on stdout.

Expected input fields include:

- `conversationId`
- `workspacePaths`
- `transcriptPath`
- `artifactDirectoryPath`
- `toolCall.name`
- `toolCall.args`
- `toolCall.args.CommandLine`

The standard stdout decision schema is:

```json
{ "decision": "allow" }
```

```json
{ "decision": "deny", "reason": "Rejected by AG Pocket." }
```

```json
{ "decision": "force_ask", "reason": "Requires local human verification." }
```

`stdout` must contain only the protocol JSON. Diagnostic logs should go to `stderr`.

## 5. Daemon responsibilities

`ag-pocket-daemon` is a local sidecar service.

It should:

- receive hook requests from `/internal/approvals`
- create pending approval records
- expire old approvals
- push new approvals to the mobile UI
- accept approve/reject actions from the mobile UI
- persist audit logs in SQLite
- validate Cloudflare Access JWTs for remote requests
- validate a local shared secret for hook requests

## 6. API boundary

Internal hook API:

```text
POST /internal/approvals
GET  /internal/approvals/:id
```

Remote mobile API:

```text
GET  /api/approvals?status=pending
POST /api/approvals/:id/approve
POST /api/approvals/:id/reject
GET  /ws
```

`/internal/*` is for local hook scripts only.

`/api/*` and `/ws` are for the mobile PWA and must be protected by Cloudflare Access JWT verification.

## 7. Authentication model

Local hook calls require:

- loopback source address
- `Authorization: Bearer <AG_DAEMON_SECRET>`

Remote mobile calls require:

- `Cf-Access-Jwt-Assertion`
- valid Cloudflare issuer
- valid Cloudflare audience
- unexpired token
- allowlisted email

## 8. Approval state machine

Approval states:

```text
pending
approved
rejected
expired
```

The daemon should distinguish `rejected` from `expired` for auditability.

## 9. Timeout model

For MVP mobile approval, use a short wait chain:

```text
Antigravity hook timeout: 60s
daemon approval TTL: 45s
hook polling max: 50s
```

Do not set hook timeout to `0`.

## 10. Security principles

AG Pocket must fail closed.

Deny when:

- the daemon is unavailable
- the hook cannot parse stdin
- the local secret is missing
- approval expires
- Cloudflare JWT validation fails
- the approval record cannot be found

AG Pocket must not be an auto-accept tool.

## 11. MVP priority

The first useful test is not Android and not Cloudflare.

The first useful test is:

1. configure `matcher: run_command`
2. run `pre-tool-use-debug.js`
3. inspect real stdin payloads in `~/.ag-pocket/debug/`
4. test `decision: deny`
5. test `decision: allow`

Only after this works should the daemon and mobile UI be implemented.
