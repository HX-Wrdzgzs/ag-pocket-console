#!/usr/bin/env node

const SECRET = process.env.AG_DAEMON_SECRET;
const DAEMON_URL = process.env.AG_DAEMON_URL || 'http://127.0.0.1:8787';
const POLL_MS = Number(process.env.AG_HOOK_POLL_MS || 1000);
const MAX_WAIT_MS = Number(process.env.AG_HOOK_MAX_WAIT_MS || 50000);

function allow() {
  return { decision: 'allow' };
}

function deny(reason) {
  return {
    decision: 'deny',
    reason: reason || 'Denied by AG Pocket.',
  };
}

function writeDecision(decision) {
  process.stdout.write(JSON.stringify(decision));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assessRisk(commandLine) {
  const highRiskPatterns = [
    /rm\s+-rf/i,
    /del\s+\/[sq]/i,
    /format\s+/i,
    /git\s+push/i,
    /npm\s+publish/i,
    /kubectl\s+delete/i,
    /docker\s+rm/i,
    /curl\s+.*\|\s*(bash|sh|powershell)/i,
    /wget\s+.*\|\s*(bash|sh|powershell)/i,
  ];

  if (highRiskPatterns.some((pattern) => pattern.test(commandLine || ''))) {
    return 'high';
  }

  return 'medium';
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SECRET}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`daemon returned ${res.status}`);
  }

  return await res.json();
}

async function getJson(url) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${SECRET}`,
    },
  });

  if (!res.ok) {
    throw new Error(`daemon returned ${res.status}`);
  }

  return await res.json();
}

async function main() {
  if (!SECRET) {
    return deny('AG_DAEMON_SECRET is not configured.');
  }

  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  const ctx = JSON.parse(raw);

  const toolName = ctx.toolCall?.name || 'unknown';
  const toolArgs = ctx.toolCall?.args || {};
  const commandLine = toolArgs.CommandLine || toolArgs.command || '';

  const created = await postJson(`${DAEMON_URL}/internal/approvals`, {
    conversation_id: ctx.conversationId,
    workspace_paths: ctx.workspacePaths || [],
    transcript_path: ctx.transcriptPath,
    artifact_directory_path: ctx.artifactDirectoryPath,
    tool_name: toolName,
    tool_input: toolArgs,
    command_line: commandLine,
    risk: assessRisk(commandLine),
  });

  const deadline = Date.now() + MAX_WAIT_MS;

  while (Date.now() < deadline) {
    await sleep(POLL_MS);

    const approval = await getJson(`${DAEMON_URL}/internal/approvals/${created.id}`);

    if (approval.status === 'approved') {
      return allow();
    }

    if (approval.status === 'rejected') {
      return deny(approval.result || 'Rejected by AG Pocket.');
    }

    if (approval.status === 'expired') {
      return deny('AG Pocket approval expired.');
    }
  }

  return deny('AG Pocket approval timed out.');
}

main()
  .then((decision) => {
    writeDecision(decision);
    process.exit(0);
  })
  .catch((err) => {
    writeDecision(deny(err.message));
    process.exit(0);
  });
