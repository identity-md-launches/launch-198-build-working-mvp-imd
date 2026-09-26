#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { campaign } from '../measure-test-quality/scripts/run.mjs';
import { assert, hash, relativePath, noSymlinks, beneath } from '../measure-test-quality/scripts/core.mjs';
import { measurement, markdown } from '../measure-test-quality/scripts/compare.mjs';
import { validateReport, verifyFiles } from '../measure-test-quality/scripts/validate.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
assert(args.length === 2 && args[0] === '--out', 'usage: node scripts/reproduce.mjs --out NEW_OUTPUT_DIRECTORY');
const out = path.resolve(args[1]);
await noSymlinks(out, true);
relativePath(out.slice(1));
const outRelative = path.relative(root, out);
assert(outRelative.startsWith('../') || beneath(outRelative, 'artifacts'), 'benchmark reports must be outside the repository or under artifacts/');
// A fresh directory preserves every previous report, including a failed run.
await fs.mkdir(out);
const commitment = JSON.parse(await fs.readFile(path.join(root, 'artifacts/baseline-hashes.json'), 'utf8'));
const manifest = path.join(root, 'manifests/registry-v1.json');
assert(hash(await fs.readFile(manifest)) === commitment.manifestSha256, 'original mutation definition bytes changed');
const initialProject = await fs.mkdtemp(path.join(os.tmpdir(), 'mtq-initial-'));
try {
  for (const f of commitment.files) {
    relativePath(f.path);
    const bytes = await fs.readFile(path.join(root, f.path));
    assert(hash(bytes) === f.sha256, `frozen baseline changed: ${f.path}`);
    const dest = path.join(initialProject, f.path);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, bytes, { flag: 'wx' });
  }
  const initialFile = path.join(out, 'initial.json');
  const initial = await campaign({ project: initialProject, manifest, output: initialFile, matchPath: 'test/initial/*.t.sol', seed: commitment.seed });
  assert(initial.status === 'complete' && initial.baseline.valid, 'initial campaign incomplete; inspect initial.json');
  const final = await campaign({ project: root, manifest, output: path.join(out, 'final.json'), matchPath: 'test/final/*.t.sol', seed: commitment.seed, baseline: initialFile });
  assert(final.status === 'complete' && final.baseline.valid, 'final campaign incomplete; inspect final.json');
  const report = measurement(initial, final);
  validateReport(report); await verifyFiles(report, root, manifest);
  await fs.writeFile(path.join(out, 'measurement.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  await fs.writeFile(path.join(out, 'measurement.md'), markdown(report), { flag: 'wx' });
  const truncation = final.mutations.find(m => m.id === 'truncate-128');
  const witness = p => JSON.parse(p.stdout)['test/final/RegistryFinal.t.sol:RegistryFinal'].test_results['testFullWidthCounterexample()'];
  const honest = witness(final.baseline.test), mutated = witness(truncation.test);
  assert(honest.decoded_logs.includes('at(0): 340282366920938463463374607431768211463'), 'missing honest witness log');
  assert(mutated.decoded_logs.includes('at(0): 7'), 'missing mutant witness log');
  await fs.writeFile(path.join(out, 'counterexample.json'), JSON.stringify({
    version: 1, mutation: truncation.id, definitionSha256: truncation.definitionSha256,
    initialOutcome: initial.mutations.find(m => m.id === truncation.id).outcome,
    call: 'insert((uint256(1) << 128) + 7), then at(0)',
    honest: { status: honest.status, logs: honest.decoded_logs },
    mutated: { status: mutated.status, reason: mutated.reason, logs: mutated.decoded_logs }
  }, null, 2) + '\n', { flag: 'wx' });
  // Expectations are benchmark assertions, not a relabeling rule in the generic runner.
  assert(initial.summary.counts.killed === 4 && initial.summary.counts.survived === 2, 'initial benchmark result changed');
  assert(final.summary.counts.killed === 6 && final.summary.excluded === 0, 'not every benchmark mutant compiled and failed final assertions');
  console.log(`initial ${initial.summary.counts.killed}/${initial.summary.denominator}, final ${final.summary.counts.killed}/${final.summary.denominator}; reports: ${out}`);
} finally {
  await fs.rm(initialProject, { recursive: true, force: true });
}
