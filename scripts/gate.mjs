#!/usr/bin/env node
// scripts/gate.mjs — cong do khong can DB/LLM (TESTING-ACCEPTANCE.md §1).
// Chay tuan tu, dung o lenh do dau tien, exit != 0 neu co do.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const nodeCmd = process.execPath;

const STEPS = [
  { label: 'typecheck', cmd: npmCmd, args: ['run', 'typecheck'] },
  { label: 'build', cmd: npmCmd, args: ['run', 'build'] },
  { label: 'test', cmd: npmCmd, args: ['test'] },
  { label: 'check_adapter_boundary', cmd: nodeCmd, args: ['scripts/check_adapter_boundary.mjs'] },
  { label: 'check_agent_tools', cmd: nodeCmd, args: ['scripts/check_agent_tools.mjs'] },
];

for (const step of STEPS) {
  console.log(`\n=== gate: ${step.label} ===`);
  const result = spawnSync(step.cmd, step.args, { stdio: 'inherit', cwd: ROOT, shell: true });
  const code = result.status ?? 1;
  if (code !== 0) {
    console.error(`GATE_FAIL: buoc "${step.label}" exit ${code}`);
    process.exit(code);
  }
}

console.log('\nGATE_OK: tat ca cac buoc deu xanh.');
process.exit(0);
