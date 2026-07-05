#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');

function writeDecision(decision) {
  process.stdout.write(JSON.stringify(decision));
}

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  const debugDir = path.join(os.homedir(), '.ag-pocket', 'debug');
  fs.mkdirSync(debugDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(debugDir, `pre-tool-use-${stamp}.json`);
  fs.writeFileSync(file, raw, 'utf8');

  // stdout must contain only the hook protocol JSON.
  writeDecision({ decision: 'allow' });
}

main().catch((err) => {
  writeDecision({
    decision: 'deny',
    reason: `AG Pocket debug hook failed: ${err.message}`,
  });
  process.exit(0);
});
