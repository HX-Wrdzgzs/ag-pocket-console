# AG Pocket Console

Mobile approval and supervision console for Google Antigravity agents.

AG Pocket Console is an experimental Codex Mobile-style control surface for Google Antigravity and Antigravity IDE. It focuses on remote human approval, auditability, and safer command execution through the shared `PreToolUse` hook layer instead of private IDE APIs.

The repository is currently in **MVP-1 / local approval loop** work. MVP-0 hook protocol verification is represented by the debug hook, while the daemon and approval hook already contain the first local approval-path skeleton.

## What this is

AG Pocket Console is intended to let a phone or local browser review sensitive Antigravity agent actions before they run.

```text
Antigravity CLI / IDE
        ↓
PreToolUse hook: matcher = run_command
        ↓
AG Pocket hook script
        ↓
ag-pocket-daemon on localhost
        ↓
Local browser first, then Cloudflare Tunnel + Access
        ↓
Android PWA / Android app
```

The target product is a mobile companion console that can show approval cards, command details, workspace context, risk level, pending status, approval expiry, and audit history.

## What this is not

This is not a remote desktop.

This is not an auto-accept extension.

This is not an attempt to depend on private Antigravity IDE APIs for the first MVP.

If the hook cannot safely determine whether an action should proceed, it should fail closed and deny the operation.

## Current implementation

Implemented:

- MVP plan document
- technical report
- debug `PreToolUse` hook that captures raw stdin payloads
- approval `PreToolUse` hook that sends approval requests to a local daemon
- local Fastify daemon
- SQLite-backed `approvals` table
- loopback + bearer-token protection for `/internal/*`
- approval TTL expiry
- risk classification skeleton for command lines
- internal approval creation and status polling endpoints

Not implemented yet:

- browser approval UI
- mobile PWA
- Cloudflare Access JWT verification
- public `/api/*` approval endpoints
- WebSocket approval push
- command masking
- full audit log review UI

## Repository layout

```text
docs/
  MVP_PLAN.md
  TECHNICAL_REPORT.md
packages/
  hook/
    hooks.example.json
    pre-tool-use-debug.js
    pre-tool-use-approval.js
  daemon/
    package.json
    tsconfig.json
    src/index.ts
```

## Hook decision contract

The hook must write only protocol JSON to stdout. Diagnostic logs must go to stderr.

Allow:

```json
{ "decision": "allow" }
```

Deny:

```json
{ "decision": "deny", "reason": "Rejected by AG Pocket." }
```

Force local review:

```json
{ "decision": "force_ask", "reason": "Requires local human verification." }
```

## Quick start: MVP-0 debug hook

Clone the repository:

```bash
git clone https://github.com/HX-Wrdzgzs/ag-pocket-console.git
cd ag-pocket-console
```

Copy the debug hook to a stable local path:

```powershell
mkdir $env:USERPROFILE\.ag-pocket -Force
copy .\packages\hook\pre-tool-use-debug.js $env:USERPROFILE\.ag-pocket\pre-tool-use-debug.js
```

Create or update your Antigravity hooks config.

Global path:

```text
%USERPROFILE%\.gemini\config\hooks.json
```

Example:

```json
{
  "PreToolUse": [
    {
      "type": "command",
      "matcher": "run_command",
      "command": "node C:\\Users\\<user>\\.ag-pocket\\pre-tool-use-debug.js",
      "windows": "node C:\\Users\\<user>\\.ag-pocket\\pre-tool-use-debug.js",
      "timeout": 30
    }
  ]
}
```

Run an Antigravity command that triggers `run_command`, then inspect:

```text
%USERPROFILE%\.ag-pocket\debug\
```

The captured files are the real stdin payloads from Antigravity.

## Quick start: local approval skeleton

Install and start the local daemon:

```bash
cd packages/daemon
npm install
```

PowerShell:

```powershell
$env:AG_DAEMON_SECRET="replace-with-a-long-random-secret"
npm run dev
```

Optional environment variables:

```env
AG_DAEMON_PORT=8787
AG_DAEMON_DB=ag-pocket.sqlite
AG_APPROVAL_TTL_MS=45000
```

Health check:

```text
http://127.0.0.1:8787/healthz
```

Then copy and configure the approval hook:

```powershell
copy .\packages\hook\pre-tool-use-approval.js $env:USERPROFILE\.ag-pocket\pre-tool-use-approval.js
```

Example hook command:

```json
{
  "PreToolUse": [
    {
      "type": "command",
      "matcher": "run_command",
      "command": "node C:\\Users\\<user>\\.ag-pocket\\pre-tool-use-approval.js",
      "windows": "node C:\\Users\\<user>\\.ag-pocket\\pre-tool-use-approval.js",
      "timeout": 60
    }
  ]
}
```

The approval hook requires the same `AG_DAEMON_SECRET` environment variable as the daemon. It posts command context to `/internal/approvals`, polls `/internal/approvals/:id`, and denies when the daemon is unavailable, approval expires, or polling times out.

## Internal API

```text
POST /internal/approvals
GET  /internal/approvals/:id
GET  /healthz
```

`/internal/*` accepts only loopback requests and requires:

```text
Authorization: Bearer <AG_DAEMON_SECRET>
```

## Roadmap

### MVP-0: Hook protocol verification

- Configure `PreToolUse` with `matcher: "run_command"`.
- Run `packages/hook/pre-tool-use-debug.js`.
- Capture real stdin payloads in `~/.ag-pocket/debug/`.
- Test `{ "decision": "allow" }`.
- Test `{ "decision": "deny", "reason": "AG Pocket test deny" }`.

### MVP-1: Local approval loop

```text
Antigravity run_command
        ↓
Hook
        ↓
POST /internal/approvals
        ↓
Local daemon stores pending approval
        ↓
Local browser approves or rejects
        ↓
Hook polls approval status
        ↓
Hook returns decision JSON
```

### MVP-2: Remote mobile approval

- Cloudflare Tunnel
- mobile PWA
- WebSocket approval push
- Cloudflare Access JWT verification
- `GET /api/approvals?status=pending` reconnect recovery

### MVP-3: Safety and audit hardening

- SQLite audit review UI
- command masking
- approval expiry controls
- risk levels
- local shared secret hardening
- Cloudflare email audit
- fail-closed behavior

## Security model

AG Pocket uses two separate trust boundaries.

Local hook boundary:

```text
127.0.0.1 / ::1 + AG_DAEMON_SECRET
```

Remote mobile boundary:

```text
Cloudflare Access JWT + daemon-side issuer/audience validation
```

The remote mobile API must not be treated as trusted only because it is behind a tunnel. The daemon must verify `Cf-Access-Jwt-Assertion` itself before accepting remote approval decisions.

## License

Not selected yet.
