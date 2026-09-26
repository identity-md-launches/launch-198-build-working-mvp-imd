#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { assert, canonical, hash, LIMITS, validateManifest, snapshot, isolatedCopy, replaceOnce, noSymlinks, relativePath, beneath, cleanEnv, runProcess, processOK, parseTests, classify, summarize } from './core.mjs';
import { validateReport } from './validate.mjs';

export async function findSolc(supplied) {
  const candidates = supplied ? [path.resolve(supplied)] : [path.join(os.homedir(), '.local/share/svm/0.8.24/solc-0.8.24'), path.join(os.homedir(), '.svm/0.8.24/solc-0.8.24')];
  for (const p of candidates) { try { await fs.access(p, fs.constants.X_OK); return p; } catch {} }
  throw new Error('installed Solidity 0.8.24 not found; supply --solc /absolute/path/to/solc-0.8.24');
}
async function scriptHashes() {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const result = {};
  for (const f of (await fs.readdir(dir)).filter(x => x.endsWith('.mjs') && !x.endsWith('.test.mjs')).sort()) result[f] = hash(await fs.readFile(path.join(dir, f)));
  return result;
}
function configSafety(c, m) {
  for (const key of ['src', 'test', 'script', 'out', 'cache_path']) relativePath(c[key]);
  assert(m.sourceRoots.includes(c.src) && m.testRoots.includes(c.test), 'configured src/test must be declared roots');
  for (const p of c.libs || []) { relativePath(p); assert(m.supportPaths.some(r => beneath(p, r)), 'library must be copied'); }
  for (const p of c.remappings || []) { const at = p.lastIndexOf('='); assert(at > 0, 'invalid remapping'); relativePath(p.slice(at + 1).replace(/\/$/, '')); }
  assert(!(c.allow_paths?.length || c.include_paths?.length), 'external compiler paths forbidden');
  assert(c.ffi === false && c.fs_permissions?.length === 0, 'FFI and filesystem permissions must be disabled');
  assert(!c.eth_rpc_url && !Object.keys(c.rpc_endpoints || {}).length && !c.fork_block_number, 'RPC/fork configuration forbidden');
  const inputs = [...m.sourceRoots, ...m.testRoots, ...m.supportPaths];
  for (const p of [c.out, c.cache_path]) assert(inputs.every(r => !beneath(p, r) && !beneath(r, p)), 'build output overlaps project input');
}
export async function campaign(options) {
  const { project: projectArg, manifest: manifestArg, output: outputArg } = options;
  assert(projectArg && manifestArg && outputArg, 'project, manifest, output are required');
  const project = path.resolve(projectArg), manifestPath = path.resolve(manifestArg), output = path.resolve(outputArg);
  const timeoutMs = Number(options.timeoutMs ?? 30000), campaignMs = Number(options.campaignMs ?? 300000);
  assert(Number.isInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= LIMITS.timeoutMs, 'timeout must be 1..120000 ms');
  assert(Number.isInteger(campaignMs) && campaignMs >= 1 && campaignMs <= LIMITS.campaignMs, 'campaign deadline must be 1..600000 ms');
  const seed = options.seed ?? '0x5eed';
  assert(/^0x[0-9a-fA-F]{1,64}$/.test(seed), 'seed must be 1..64 hex digits');
  const matchPath = options.matchPath ?? 'test/**/*.t.sol';
  assert(typeof matchPath === 'string' && !matchPath.startsWith('-') && matchPath.length < 512 && !matchPath.includes('\0'), 'invalid match path');
  await noSymlinks(manifestPath); await noSymlinks(output, true);
  const manifestBytes = await fs.readFile(manifestPath);
  assert(manifestBytes.length <= LIMITS.fileBytes, 'manifest too large');
  const manifest = validateManifest(JSON.parse(manifestBytes));
  const files = await snapshot(project, manifest);
  // No output can overwrite inputs, a manifest, an earlier report or a protected path.
  relativePath(path.relative(path.parse(output).root, output).split(path.sep).join('/'));
  assert(output !== manifestPath && output !== path.resolve(options.baseline || manifestPath), 'output overlaps provenance input');
  const outputRel = path.relative(project, output).split(path.sep).join('/');
  assert([...manifest.sourceRoots, ...manifest.testRoots, ...manifest.supportPaths].every(r => !beneath(outputRel, r)), 'output overlaps frozen input');
  let initialReport = null;
  if (options.baseline) {
    await noSymlinks(path.resolve(options.baseline));
    const initial = validateReport(JSON.parse(await fs.readFile(options.baseline, 'utf8')));
    assert(initial.version === 1 && initial.baseline?.valid === true, 'reference baseline is invalid');
    initialReport = initial;
    assert(initial.frozen.manifestSha256 === hash(manifestBytes) && initial.frozen.seed === seed, 'manifest or seed differs from initial');
    for (const f of initial.frozen.files) assert(files.some(now => now.path === f.path && now.sha256 === f.sha256 && now.role === f.role), `frozen initial file changed: ${f.path}`);
    const initialSources = initial.frozen.files.filter(f => f.role !== 'test');
    assert(files.filter(f => f.role !== 'test').length === initialSources.length, 'production/config inputs changed');
  }
  const controller = new AbortController();
  const onSignal = () => controller.abort();
  process.once('SIGINT', onSignal); process.once('SIGTERM', onSignal);
  const startedAt = new Date().toISOString(), deadline = Date.now() + campaignMs;
  let report, handle;
  const remaining = () => Math.max(1, Math.min(timeoutMs, deadline - Date.now()));
  const expired = () => controller.signal.aborted || Date.now() >= deadline;
  const execute = (cmd, args, cwd) => runProcess(cmd, args, { cwd, timeoutMs: remaining(), signal: controller.signal, env: cleanEnv(cwd) });
  const save = async () => {
    report.summary = summarize(report.mutations);
    // The descriptor was opened exclusively once; checkpoints cannot replace another file.
    await handle.truncate(0); await handle.write(JSON.stringify(report, null, 2) + '\n', 0, 'utf8'); await handle.sync();
  };
  try {
    await fs.mkdir(path.dirname(output), { recursive: true });
    handle = await fs.open(output, 'wx');
    const frozenFiles = files.map(({ bytes, ...f }) => f);
    report = { version: 1, kind: 'campaign', startedAt, finishedAt: null, status: 'partial', frozen: { files: frozenFiles, projectSha256: hash(canonical(frozenFiles)), manifestSha256: hash(manifestBytes), manifest, seed, matchPath, runnerSha256: await scriptHashes(), tools: {}, toolchainSha256: null }, bounds: { timeoutMs, campaignMs, maxMutations: LIMITS.mutations }, baseline: { valid: false, reason: 'not run', config: null, build: null, test: null, parsed: null }, mutations: manifest.mutations.map(mu => ({ id: mu.id, definitionSha256: hash(canonical(mu)), outcome: 'not-applicable', reason: 'not attempted', mutatedSourceSha256: null, build: null, test: null, parsed: null, assertionTests: [] })), summary: null, error: null };
    await save();
    const toolDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mtq-tools-'));
    let solc;
    try {
      solc = await findSolc(options.solc);
      report.frozen.tools.node = process.version;
      report.frozen.tools.forge = await execute(options.forge || 'forge', ['--version'], toolDir);
      report.frozen.tools.solc = await execute(solc, ['--version'], toolDir);
      report.frozen.tools.solcBinarySha256 = hash(await fs.readFile(solc));
      report.frozen.toolchainSha256 = hash(canonical({ node: process.version, forge: report.frozen.tools.forge.stdout, solc: report.frozen.tools.solc.stdout, solcBinarySha256: report.frozen.tools.solcBinarySha256, seed }));
      await save(); // versions + seed + byte hashes are durable before the baseline starts
      assert(processOK(report.frozen.tools.forge), 'forge version probe failed');
      assert(processOK(report.frozen.tools.solc) && /Version: 0\.8\.24\+/.test(report.frozen.tools.solc.stdout), 'Solidity 0.8.24 version probe failed');
      if (initialReport) {
        assert(initialReport.frozen.toolchainSha256 === report.frozen.toolchainSha256, 'toolchain differs from initial');
      }
    } finally { await fs.rm(toolDir, { recursive: true, force: true }); }
    const forge = options.forge || 'forge';
    const buildArgs = ['build', '--offline', '--use', solc];
    const testArgs = ['test', '--offline', '--use', solc, '--json', '-vv', '--match-path', matchPath, '--fuzz-seed', seed];
    const baseDir = await isolatedCopy(files);
    try {
      assert(!expired(), 'campaign stopped before baseline');
      report.baseline.config = await execute(forge, ['config', '--json'], baseDir);
      assert(processOK(report.baseline.config), 'forge config failed');
      configSafety(JSON.parse(report.baseline.config.stdout), manifest);
      report.baseline.build = await execute(forge, buildArgs, baseDir);
      assert(processOK(report.baseline.build), 'baseline did not compile successfully');
      report.baseline.test = await execute(forge, testArgs, baseDir);
      report.baseline.parsed = parseTests(report.baseline.test);
      assert(processOK(report.baseline.test) && report.baseline.parsed.valid && report.baseline.parsed.executed > 0 && report.baseline.parsed.tests.every(t => t.status !== 'Failure'), 'baseline failed or executed zero tests');
      report.baseline.valid = true; report.baseline.reason = 'successful compile and nonempty passing test selection';
      await save();
    } finally { await fs.rm(baseDir, { recursive: true, force: true }); }
    for (let i = 0; i < manifest.mutations.length; i++) {
      if (expired()) break;
      const mu = manifest.mutations[i], result = report.mutations[i];
      const copy = await isolatedCopy(files);
      try {
        const original = files.find(f => f.path === mu.path).bytes.toString('utf8');
        const mutated = replaceOnce(original, mu);
        await fs.writeFile(path.join(copy, mu.path), mutated);
        result.mutatedSourceSha256 = hash(mutated);
        result.build = await execute(forge, buildArgs, copy);
        if (processOK(result.build) && !expired()) {
          result.test = await execute(forge, testArgs, copy);
          result.parsed = parseTests(result.test);
        }
        Object.assign(result, classify(result.build, result.test, report.baseline.parsed.tests, mu));
      } finally { await fs.rm(copy, { recursive: true, force: true }); }
      await save();
    }
    report.status = report.mutations.every(m => m.build !== null) && !expired() ? 'complete' : 'partial';
    for (const m of report.mutations) if (!m.build) m.reason = 'campaign deadline or interruption before attempt';
  } catch (e) {
    if (!report) throw e;
    report.error = e.message;
    report.status = report.baseline.valid ? 'partial' : 'invalid';
    if (!report.baseline.valid) report.baseline.reason = e.message;
  } finally {
    process.removeListener('SIGINT', onSignal); process.removeListener('SIGTERM', onSignal);
    if (report) { report.finishedAt = new Date().toISOString(); await save(); }
    await handle?.close();
  }
  return report;
}
export function parseArgs(args) {
  const aliases = { '--project': 'project', '--manifest': 'manifest', '--out': 'output', '--match-path': 'matchPath', '--seed': 'seed', '--timeout-ms': 'timeoutMs', '--campaign-ms': 'campaignMs', '--forge': 'forge', '--solc': 'solc', '--baseline': 'baseline' };
  const result = {};
  for (let i = 0; i < args.length; i += 2) {
    const k = aliases[args[i]]; assert(k && args[i + 1] && !Object.hasOwn(result, k), `unknown, missing or duplicate option: ${args[i]}`); result[k] = args[i + 1];
  }
  return result;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const r = await campaign(parseArgs(process.argv.slice(2)));
    console.log(JSON.stringify({ status: r.status, baselineValid: r.baseline.valid, ...r.summary }, null, 2));
    if (r.status !== 'complete' || !r.baseline.valid) process.exitCode = 2;
  } catch (e) { console.error(e.message); process.exitCode = 2; }
}
