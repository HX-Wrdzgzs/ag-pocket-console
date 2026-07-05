import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import { z } from 'zod';

const PORT = Number(process.env.AG_DAEMON_PORT || 8787);
const LOCAL_SECRET = process.env.AG_DAEMON_SECRET;
const DB_PATH = process.env.AG_DAEMON_DB || 'ag-pocket.sqlite';
const APPROVAL_TTL_MS = Number(process.env.AG_APPROVAL_TTL_MS || 45_000);

if (!LOCAL_SECRET) {
  throw new Error('AG_DAEMON_SECRET is required');
}

const app = Fastify({ logger: true });
await app.register(websocket);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  conversation_id TEXT,
  tool_name TEXT NOT NULL,
  command_line TEXT,
  tool_input_json TEXT NOT NULL,
  workspace_json TEXT,
  transcript_path TEXT,
  artifact_directory_path TEXT,
  risk_level TEXT NOT NULL,
  status TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  responded_at TEXT,
  expires_at TEXT NOT NULL,
  result TEXT,
  responded_by_email TEXT
);
`);

const createApprovalSchema = z.object({
  conversation_id: z.string().optional(),
  workspace_paths: z.array(z.string()).optional().default([]),
  transcript_path: z.string().optional(),
  artifact_directory_path: z.string().optional(),
  tool_name: z.string(),
  tool_input: z.unknown(),
  command_line: z.string().optional().default(''),
  risk: z.enum(['low', 'medium', 'high']).optional().default('medium'),
});

function isLoopback(ip: string) {
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function requireLocalAuth(request: any, reply: any) {
  const auth = request.headers.authorization;
  if (!isLoopback(request.ip)) {
    return reply.code(403).send({ error: 'local only' });
  }
  if (auth !== `Bearer ${LOCAL_SECRET}`) {
    return reply.code(401).send({ error: 'invalid local secret' });
  }
}

function expireApproval(id: string) {
  const now = new Date().toISOString();
  const row = db.prepare('SELECT * FROM approvals WHERE id = ?').get(id) as any;
  if (!row || row.status !== 'pending') return;

  db.prepare(
    `UPDATE approvals
     SET status = 'expired', responded_at = ?, result = ?
     WHERE id = ? AND status = 'pending'`
  ).run(now, 'approval timeout', id);
}

app.post('/internal/approvals', async (request, reply) => {
  const denied = requireLocalAuth(request, reply);
  if (denied) return denied;

  const body = createApprovalSchema.parse(request.body);
  const id = nanoid();
  const requestedAt = new Date();
  const expiresAt = new Date(requestedAt.getTime() + APPROVAL_TTL_MS);

  db.prepare(
    `INSERT INTO approvals (
      id, conversation_id, tool_name, command_line, tool_input_json,
      workspace_json, transcript_path, artifact_directory_path,
      risk_level, status, requested_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
  ).run(
    id,
    body.conversation_id || null,
    body.tool_name,
    body.command_line,
    JSON.stringify(body.tool_input),
    JSON.stringify(body.workspace_paths),
    body.transcript_path || null,
    body.artifact_directory_path || null,
    body.risk,
    requestedAt.toISOString(),
    expiresAt.toISOString()
  );

  setTimeout(() => expireApproval(id), APPROVAL_TTL_MS + 500);

  return reply.code(201).send({ id });
});

app.get('/internal/approvals/:id', async (request, reply) => {
  const denied = requireLocalAuth(request, reply);
  if (denied) return denied;

  const params = z.object({ id: z.string() }).parse(request.params);
  const row = db.prepare('SELECT * FROM approvals WHERE id = ?').get(params.id) as any;
  if (!row) return reply.code(404).send({ error: 'not found' });

  return reply.send({
    id: row.id,
    status: row.status,
    result: row.result,
  });
});

app.get('/healthz', async () => ({ ok: true }));

app.listen({ port: PORT, host: '127.0.0.1' });
