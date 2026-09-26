#!/usr/bin/env node
// Historical replay only. Current operator campaigns must use the skill's current runner.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { campaign } from '../artifacts/history/runner-v0/run.mjs';
import { hash, assert } from '../measure-test-quality/scripts/core.mjs';
import { validateReport } from '../measure-test-quality/scripts/validate.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
assert(process.argv.length === 4 && process.argv[2] === '--out', 'usage: node scripts/replay-pilot.mjs --out NEW_REPORT.json');
const recorded = JSON.parse(await fs.readFile(path.join(root, 'artifacts/history/initial-pilot.json'), 'utf8'));
for (const [name, sha] of Object.entries(recorded.frozen.runnerSha256)) assert(hash(await fs.readFile(path.join(root, 'artifacts/history/runner-v0', name))) === sha, 'historical runner bytes changed');
const project = await fs.mkdtemp(path.join(os.tmpdir(), 'mtq-pilot-'));
try {
  for (const f of recorded.frozen.files) {
    const bytes = await fs.readFile(path.join(root, f.path));
    assert(hash(bytes) === f.sha256, `historical input changed: ${f.path}`);
    await fs.mkdir(path.dirname(path.join(project, f.path)), { recursive: true });
    await fs.writeFile(path.join(project, f.path), bytes, { flag: 'wx' });
  }
  const report = await campaign({ project, manifest: path.join(root, 'manifests/registry-v1.json'), output: path.resolve(process.argv[3]), matchPath: recorded.frozen.matchPath, seed: recorded.frozen.seed });
  validateReport(report);
  assert(report.status === 'complete' && report.baseline.valid, 'pilot replay incomplete');
  assert(report.frozen.projectSha256 === recorded.frozen.projectSha256 && report.frozen.manifestSha256 === recorded.frozen.manifestSha256 && report.frozen.toolchainSha256 === recorded.frozen.toolchainSha256, 'pilot input/tool hashes differ');
  assert(JSON.stringify(report.frozen.runnerSha256) === JSON.stringify(recorded.frozen.runnerSha256), 'pilot runner hashes differ');
  assert(JSON.stringify(report.summary) === JSON.stringify(recorded.summary), 'pilot outcomes differ');
  console.log('historical pilot reproduced: 4/6 kills; source, manifest, runner and toolchain hashes match');
} finally { await fs.rm(project, { recursive: true, force: true }); }
