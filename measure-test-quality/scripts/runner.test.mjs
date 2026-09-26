import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { validateManifest, replaceOnce, relativePath, snapshot, runProcess, parseTests, classify, hash } from './core.mjs';
import { campaign, parseArgs, findSolc } from './run.mjs';
import { validateReport, verifyFiles } from './validate.mjs';
import { measurement } from './compare.mjs';
import { schema } from './schema.mjs';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const originalManifest = JSON.parse(await fs.readFile(path.join(repo, 'manifests/registry-v1.json'), 'utf8'));
const clone = obj => structuredClone(obj);
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mtq-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.mkdir(path.join(dir, 'test/initial'), { recursive: true });
  await fs.cp(path.join(repo, 'src'), path.join(dir, 'src'), { recursive: true });
  await fs.copyFile(path.join(repo, 'test/initial/RegistryInitial.t.sol'), path.join(dir, 'test/initial/RegistryInitial.t.sol'));
  await fs.copyFile(path.join(repo, 'foundry.toml'), path.join(dir, 'foundry.toml'));
  const manifest = clone(originalManifest);
  let n = 0;
  const run = async (opts = {}) => {
    const manifestPath = path.join(dir, `manifest-${n}.json`), output = path.join(dir, `report-${n++}.json`);
    await fs.writeFile(manifestPath, JSON.stringify(manifest));
    const result = await campaign({ project: dir, manifest: manifestPath, output, matchPath: 'test/initial/*.t.sol', ...opts });
    validateReport(result);
    assert.deepEqual(JSON.parse(await fs.readFile(output, 'utf8')), result);
    return { result, output, manifestPath };
  };
  return { dir, manifest, run };
}

test('strict manifest fields, bounds, malformed values and CLI options', () => {
  validateManifest(originalManifest);
  const cases = [m => delete m.version, m => m.version = 2, m => m.extra = true, m => m.provenance.createdAt = 'yesterday', m => m.mutations = [], m => m.mutations = Array(33).fill(m.mutations[0]), m => m.mutations[1].id = m.mutations[0].id, m => m.mutations[0].after = m.mutations[0].before, m => m.mutations[0].before = '', m => m.mutations[0].path = 'test/Evil.sol', m => m.mutations[0].path = 'src/Foo.t.sol', m => m.testRoots = ['src'], m => m.mutations[0].relevantTests = [], m => m.mutations[0].command = 'echo bad'];
  for (const change of cases) { const m = clone(originalManifest); change(m); assert.throws(() => validateManifest(m)); }
  for (const p of ['/tmp/a.sol', '../a.sol', 'src/../a.sol', 'src//a.sol', './src/a.sol', 'C:\\bad.sol', 'src\\bad.sol', 'src/.git/x', 'src/.github/x', 'src/.env.local', 'node_modules/a.sol', 'src/a\0.sol']) assert.throws(() => relativePath(p), p);
  assert.throws(() => parseArgs(['--project', '.', '--project', '.']));
  assert.throws(() => parseArgs(['--shell', 'true']));
  assert.throws(() => parseArgs(['--out']));
});

test('single exact replacement rejects missing, ambiguous, overlapping and no-op edits', () => {
  const m = { id: 'x', before: 'aa', after: 'bb' };
  assert.equal(replaceOnce('aax', m), 'bbx');
  assert.throws(() => replaceOnce('x', m), /missing/);
  assert.throws(() => replaceOnce('aaa', m), /ambiguous/);
  assert.throws(() => replaceOnce('aa', { ...m, after: 'aa' }), /no-op/);
});

test('snapshot refuses file/directory symlinks, hardlinks and unsafe mutation paths', async t => {
  const f = await fixture(t);
  await fs.symlink('/tmp', path.join(f.dir, 'src/escape'));
  await assert.rejects(snapshot(f.dir, f.manifest), /symlink/);
  await fs.unlink(path.join(f.dir, 'src/escape'));
  await fs.link(path.join(f.dir, 'src/OrderedRegistry.sol'), path.join(f.dir, 'src/linked.sol'));
  await assert.rejects(snapshot(f.dir, f.manifest), /hard-linked/);
  await fs.unlink(path.join(f.dir, 'src/linked.sol'));
  f.manifest.mutations[0].before = 'not in source';
  await assert.rejects(snapshot(f.dir, f.manifest), /missing replacement/);
});

test('real Foundry: baseline, kills, survivors, source/test/config isolation and report integrity', async t => {
  const f = await fixture(t);
  const before = await snapshot(f.dir, f.manifest);
  const { result: r, manifestPath, output } = await f.run();
  assert.equal(r.status, 'complete');
  assert.equal(r.baseline.parsed.executed, 5);
  assert.equal(r.summary.counts.killed, 4); assert.equal(r.summary.counts.survived, 2);
  assert.equal(r.mutations.at(-1).outcome, 'survived');
  assert.deepEqual(await snapshot(f.dir, f.manifest), before);
  await verifyFiles(r, f.dir, manifestPath);
  assert.deepEqual(measurement(r, r).comparison, { sourceUnchanged: true, initialTestsPreserved: true, manifestUnchanged: true, toolchainUnchanged: true });
  for (const corrupt of [r => r.summary.denominator++, r => r.mutations[0].outcome = 'survived', r => r.baseline.parsed.executed = 0, r => r.mutations[0].assertionTests = [], r => r.frozen.files[0].sha256 = '0'.repeat(64), r => r.frozen.manifest.mutations[0].after += ' ', r => r.frozen.toolchainSha256 = '0'.repeat(64), r => r.extra = true]) {
    const bad = clone(r); corrupt(bad); assert.throws(() => validateReport(bad));
  }
  await assert.rejects(campaign({ project: f.dir, manifest: manifestPath, output }), /EEXIST/);
  const badBaseline = path.join(f.dir, 'tampered-baseline.json');
  const tampered = clone(r); tampered.summary.denominator++;
  await fs.writeFile(badBaseline, JSON.stringify(tampered));
  await assert.rejects(campaign({ project: f.dir, manifest: manifestPath, output: path.join(f.dir, 'bad-comparison.json'), baseline: badBaseline }), /denominator mismatch/);
  await assert.rejects(campaign({ project: f.dir, manifest: manifestPath, output: path.join(f.dir, 'src/evidence.json') }), /frozen input/);
  await fs.symlink(f.dir, path.join(f.dir, 'alias'));
  await assert.rejects(campaign({ project: f.dir, manifest: manifestPath, output: path.join(f.dir, 'alias/evidence.json') }), /symlink/);
  await fs.unlink(path.join(f.dir, 'alias'));
  const initialTest = path.join(f.dir, 'test/initial/RegistryInitial.t.sol');
  await fs.appendFile(initialTest, '\n// edited after initial\n');
  await assert.rejects(campaign({ project: f.dir, manifest: manifestPath, output: path.join(f.dir, 'changed-baseline.json'), baseline: output }), /frozen initial file changed/);
});

test('real Foundry: compiler error is excluded; unexpected revert is unresolved, never killed', async t => {
  const f = await fixture(t);
  f.manifest.mutations = [
    { ...f.manifest.mutations.at(-1), id: 'syntax-break', after: 'entries.push(;' },
    { ...f.manifest.mutations.at(-1), id: 'unexpected-revert', after: 'revert("unexpected");' }
  ];
  const { result: r } = await f.run();
  assert.equal(r.mutations[0].outcome, 'compile-error');
  assert.equal(r.mutations[0].test, null);
  assert.equal(r.mutations[1].outcome, 'equivalence-unresolved');
  assert.equal(r.summary.denominator, 0); assert.equal(r.summary.score, null);
});

test('real Foundry: empty and failing baselines invalidate a campaign', async t => {
  const f = await fixture(t);
  const { result: empty } = await f.run({ matchPath: 'test/nonexistent/*.t.sol' });
  assert.equal(empty.status, 'invalid'); assert.equal(empty.baseline.parsed.executed, 0);
  assert(empty.mutations.every(m => m.build === null));
  const source = path.join(f.dir, 'src/OrderedRegistry.sol');
  await fs.writeFile(source, (await fs.readFile(source, 'utf8')).replace('CAPACITY = 4', 'CAPACITY = 0'));
  const { result: failing } = await f.run();
  assert.equal(failing.status, 'invalid'); assert(failing.baseline.parsed.executed > 0);
  assert(failing.mutations.every(m => m.outcome === 'not-applicable'));
});

test('missing forge and missing solc are recorded as invalid, with no kills', async t => {
  const f = await fixture(t);
  const { result: r } = await f.run({ forge: path.join(f.dir, 'no-forge') });
  assert.equal(r.status, 'invalid'); assert.match(r.frozen.tools.forge.spawnError, /ENOENT/);
  const { result: c } = await f.run({ solc: path.join(f.dir, 'no-solc') });
  assert.equal(c.status, 'invalid'); assert.match(c.error, /not found/);
});

test('real tool campaign deadline leaves honest partial/invalid evidence', async t => {
  const f = await fixture(t);
  const { result: r } = await f.run({ campaignMs: 1, timeoutMs: 1 });
  assert.notEqual(r.status, 'complete'); assert.equal(r.summary.counts.killed, 0);
  assert(r.mutations.some(m => m.reason === 'not attempted'));
});

test('real Foundry: a looping mutant times out and the campaign preserves unattempted work', async t => {
  const f = await fixture(t);
  const toml = path.join(f.dir, 'foundry.toml');
  await fs.writeFile(toml, (await fs.readFile(toml, 'utf8')).replace('ffi = false', 'gas_limit = 9000000000000000\nffi = false'));
  f.manifest.mutations = [
    { ...f.manifest.mutations.at(-1), id: 'infinite-loop', after: 'while (true) { }' },
    f.manifest.mutations[0]
  ];
  const { result: r } = await f.run({ campaignMs: 2000, timeoutMs: 10000 });
  assert.equal(r.baseline.valid, true, r.error);
  assert.equal(r.status, 'partial');
  assert.equal(r.mutations[0].build.exitCode, 0);
  assert.equal(r.mutations[0].outcome, 'timeout');
  assert.equal(r.mutations[0].test.signal, 'SIGKILL');
  assert.equal(r.mutations[1].outcome, 'not-applicable');
  assert.equal(r.mutations[1].build, null);
  assert.equal(r.summary.denominator, 0);
});

test('source edits cannot impersonate assertion markers', async t => {
  const f = await fixture(t);
  f.manifest.mutations.at(-1).after = 'revert("MTQ_ASSERT:fake kill");';
  await assert.rejects(snapshot(f.dir, f.manifest), /reserved for test code/);
});

test('process timeout kills process group including a child; argument arrays do not expand shell syntax', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mtq-process-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const script = 'const {spawn}=require("node:child_process"); const p=spawn(process.execPath,["-e",process.argv[1]],{stdio:"ignore"}); console.log(p.pid); setInterval(()=>{},1000);';
  const childCode = 'setTimeout(()=>require("node:fs").writeFileSync("escaped","bad"),600)';
  const timed = await runProcess(process.execPath, ['-e', script, childCode], { cwd: dir, timeoutMs: 200 });
  assert.equal(timed.timedOut, true); assert.equal(timed.signal, 'SIGKILL');
  assert.match(timed.stdout.trim(), /^\d+$/);
  await new Promise(r => setTimeout(r, 700));
  await assert.rejects(fs.access(path.join(dir, 'escaped')));
  const literal = '$(touch should-not-exist); `touch also-not`';
  const r = await runProcess(process.execPath, ['-e', 'process.stdout.write(process.argv[1])', literal], { cwd: dir, timeoutMs: 2000 });
  assert.equal(r.stdout, literal); assert.deepEqual(await fs.readdir(dir), []);
});

test('output cap, cancellation, crashes and malformed JSON are never assertion kills', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mtq-process-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const r = await runProcess(process.execPath, ['-e', 'process.stdout.write("x".repeat(5000000)); setInterval(()=>{},1000)'], { cwd: dir, timeoutMs: 2000 });
  assert.equal(r.outputLimited, true);
  const ac = new AbortController(); ac.abort();
  const cancelled = await runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { cwd: dir, timeoutMs: 2000, signal: ac.signal });
  assert.equal(cancelled.interrupted, true);
  const crash = await runProcess(process.execPath, ['-e', 'process.kill(process.pid,"SIGKILL")'], { cwd: dir, timeoutMs: 2000 });
  const mu = originalManifest.mutations[0];
  assert.equal(classify(crash, null, [], mu).outcome, 'infrastructure-error');
  assert.equal(classify({ ...crash, timedOut: true }, null, [], mu).outcome, 'timeout');
  assert.equal(parseTests({ stdout: 'not JSON' }).valid, false);
  assert.equal(parseTests({ stdout: '{}' }).executed, 0);
  const good = { ...crash, signal: null, exitCode: 0, stdout: '', stderr: '' };
  assert.equal(classify(good, { ...good, stdout: '{}' }, [], mu).outcome, 'infrastructure-error');
  const parsed = { Suite: { test_results: { 'testCapacity()': { status: 'Failure', reason: 'MTQ_ASSERT:bad' } } } };
  assert.equal(classify(good, { ...good, stdout: JSON.stringify(parsed), exitCode: 2 }, [{ id: 'Suite::testCapacity()', status: 'Success' }], mu).outcome, 'infrastructure-error');
  assert.equal(classify(good, { ...good, stdout: JSON.stringify(parsed), exitCode: 1 }, [], mu).outcome, 'infrastructure-error');
});

test('malformed JSON manifest and unsafe config fail before mutation execution', async t => {
  const f = await fixture(t);
  const manifest = path.join(f.dir, 'broken.json'); await fs.writeFile(manifest, '{');
  await assert.rejects(campaign({ project: f.dir, manifest, output: path.join(f.dir, 'none.json') }));
  const toml = path.join(f.dir, 'foundry.toml');
  await fs.writeFile(toml, (await fs.readFile(toml, 'utf8')).replace('out = "out"', 'out = "../outside"'));
  const { result: r } = await f.run();
  assert.equal(r.status, 'invalid'); assert.match(r.error, /unsafe path/); assert.equal(r.baseline.build, null);
});

test('committed schema is exactly the portable schema exported through the pinned read', async () => {
  const disk = JSON.parse(await fs.readFile(path.join(repo, 'schemas/report-v1.schema.json'), 'utf8'));
  assert.deepEqual(disk, schema);
  assert.equal(hash(JSON.stringify(disk)), hash(JSON.stringify(schema)));
});

test('pinned-read transport works with only non-test sibling scripts', async t => {
  const f = await fixture(t);
  const packageDir = path.join(f.dir, 'pinned-skill/scripts');
  await fs.mkdir(packageDir, { recursive: true });
  const source = path.join(repo, 'measure-test-quality/scripts');
  for (const name of await fs.readdir(source)) if (name.endsWith('.mjs') && !name.endsWith('.test.mjs')) await fs.copyFile(path.join(source, name), path.join(packageDir, name));
  const manifestFile = path.join(f.dir, 'transport-manifest.json');
  f.manifest.mutations = [f.manifest.mutations.at(-1)];
  await fs.writeFile(manifestFile, JSON.stringify(f.manifest));
  const output = path.join(f.dir, 'transport.json');
  const p = await runProcess(process.execPath, [path.join(packageDir, 'run.mjs'), '--project', f.dir, '--manifest', manifestFile, '--out', output, '--solc', await findSolc(), '--match-path', 'test/initial/*.t.sol'], { cwd: f.dir, timeoutMs: 10000 });
  assert.equal(p.exitCode, 0, p.stderr);
  const result = validateReport(JSON.parse(await fs.readFile(output, 'utf8')));
  assert.equal(result.summary.counts.survived, 1);
});
