# AG Pocket Console

Mobile approval and supervision console for Google Antigravity agents.

AG Pocket Console is an experimental Codex Mobile-style control surface for Google Antigravity and Antigravity IDE. It focuses on remote human approval, auditability, and safe command execution through the shared `PreToolUse` hook layer.

This repository is currently in the **MVP-0 / protocol verification** stage. The first goal is to prove that Antigravity can invoke a hook before `run_command`, pass structured JSON through stdin, and accept a structured decision through stdout.

## What this is

AG Pocket Console is intended to let a phone review and approve sensitive Antigravity agent actions.

```text
Antigravity CLI / IDE
        ↓
PreToolUse hook: matcher = run_command
        ↓
AG Pocket hook script
        ↓
ag-pocket-daemon on localhost
        ↓
Cloudflare Tunnel + Access
        ↓
Android PWA / Android app
```

The target product is a mobile companion console that can show approval cards, command details, workspace context, risk level, and audit history.

## What this is not

This is not a remote desktop.

This is not an auto-accept extension.

This is not an attempt to depend on private Antigravity IDE APIs for the first MVP.

If the hook cannot safely determine whether an action should proceed, it should fail closed and deny the operation.

## MVP roadmap

### MVP-0: Hook protocol verification

Prove the basic Antigravity hook protocol.

- Configure `PreToolUse` with `matcher: "run_command"`.
- Run `packages/hook/pre-tool-use-debug.js`.
- Capture real stdin payloads in `~/.ag-pocket/debug/`.
- Test `{ "decision": "allow" }`.
- Test `{ "decision": "deny", "reason": "AG Pocket test deny" }`.

### MVP-1: Local approval loop

Build the local approval path.

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

Expose the daemon through Cloudflare Tunnel and Cloudflare Access.

- Mobile PWA
- WebSocket approval push
- Cloudflare Access JWT verification
- `GET /api/approvals?status=pending` reconnect recovery

### MVP-3: Safety and audit hardening

- SQLite audit logs
- command masking
- approval expiry
- risk levels
- local shared secret
- Cloudflare email audit
- fail-closed behavior

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

The hook should write only protocol JSON to stdout.

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

Diagnostic logs should go to stderr, not stdout.

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

## Local daemon skeleton

The daemon currently exposes the internal approval API skeleton.

```bash
cd packages/daemon
npm install
$env:AG_DAEMON_SECRET="replace-with-a-long-random-secret"
npm run dev
```

Health check:

```text
http://127.0.0.1:8787/healthz
```

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

The remote mobile API must not be treated as trusted only because it is behind a tunnel. The daemon must verify `Cf-Access-Jwt-Assertion` itself.

## Current status

Implemented:

- MVP plan document
- technical report
- debug hook
- approval hook skeleton
- daemon package skeleton
- local `/internal/approvals` API skeleton

Not implemented yet:

- mobile PWA
- Cloudflare Access JWT verification
- WebSocket push
- browser approval UI
- command masking
- full audit log table

## License

Not selected yet.
