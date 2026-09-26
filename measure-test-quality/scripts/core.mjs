import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

export const OUTCOMES = ['killed', 'survived', 'compile-error', 'timeout', 'infrastructure-error', 'not-applicable', 'equivalence-unresolved'];
export const LIMITS = Object.freeze({ mutations: 32, fileBytes: 2 * 1024 * 1024, totalBytes: 16 * 1024 * 1024, files: 512, outputBytes: 4 * 1024 * 1024, timeoutMs: 120000, campaignMs: 600000 });
export const hash = data => createHash('sha256').update(data).digest('hex');
export const canonical = value => JSON.stringify(value); // insertion order is fixed by this implementation
export function assert(ok, message) { if (!ok) throw new Error(message); }
export function relativePath(p) {
  assert(typeof p === 'string' && p.length > 0 && p.length < 512 && !/[\\\x00-\x1f:]/.test(p), `unsafe path: ${p}`);
  const parts = p.split('/');
  assert(!path.isAbsolute(p) && parts.every(x => x && x !== '.' && x !== '..' && !['.git', '.github', 'node_modules', '.agents', '.codex', '.imd'].includes(x) && !x.startsWith('.env')), `unsafe path: ${p}`);
  return p;
}
export const beneath = (file, root) => file === root || file.startsWith(root + '/');
export async function noSymlinks(absolute, allowMissing = false) {
  const resolved = path.resolve(absolute);
  let cursor = path.parse(resolved).root;
  for (const part of resolved.slice(cursor.length).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    try { assert(!(await fs.lstat(cursor)).isSymbolicLink(), `symlink forbidden: ${cursor}`); }
    catch (e) { if (allowMissing && e.code === 'ENOENT') return; throw e; }
  }
}
function keys(obj, allowed, required = allowed) {
  assert(obj && typeof obj === 'object' && !Array.isArray(obj), 'expected object');
  assert(Object.keys(obj).every(k => allowed.includes(k)), 'unknown field');
  assert(required.every(k => Object.hasOwn(obj, k)), 'missing field');
}
function string(s, name) { assert(typeof s === 'string' && s.trim().length > 0 && s.length <= 65536, `invalid ${name}`); }
export function validateManifest(m) {
  keys(m, ['version', 'provenance', 'sourceRoots', 'testRoots', 'supportPaths', 'mutations']);
  assert(m.version === 1, 'manifest version must be 1');
  keys(m.provenance, ['author', 'origin', 'createdAt', 'description']);
  for (const [k, v] of Object.entries(m.provenance)) string(v, k);
  assert(/^\d{4}-\d{2}-\d{2}T/.test(m.provenance.createdAt) && Number.isFinite(Date.parse(m.provenance.createdAt)), 'invalid provenance date');
  const roots = [];
  for (const name of ['sourceRoots', 'testRoots', 'supportPaths']) {
    assert(Array.isArray(m[name]) && m[name].length > 0 && m[name].length <= 16, `invalid ${name}`);
    for (const p of m[name]) { relativePath(p); roots.push(p); }
  }
  assert(roots.every((p, i) => roots.every((q, j) => i === j || (!beneath(p, q) && !beneath(q, p)))), 'overlapping project paths');
  assert(m.supportPaths.includes('foundry.toml'), 'foundry.toml must be included');
  // Conventional test/config/dependency paths can never be disguised as mutation roots.
  for (const p of m.sourceRoots) assert(!/^(test|tests|lib|script|scripts|artifacts|docs|cache|out)(\/|$)/.test(p) && !p.endsWith('.toml'), 'protected mutation root');
  assert(Array.isArray(m.mutations) && m.mutations.length > 0 && m.mutations.length <= LIMITS.mutations, 'campaign requires 1..32 mutations');
  const ids = new Set();
  for (const mu of m.mutations) {
    keys(mu, ['id', 'path', 'before', 'after', 'rationale', 'category', 'relevantTests']);
    assert(typeof mu.id === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(mu.id) && !ids.has(mu.id), 'invalid/duplicate mutation ID');
    ids.add(mu.id); relativePath(mu.path);
    assert(mu.path.endsWith('.sol') && m.sourceRoots.some(r => beneath(mu.path, r)), 'mutation must target a source Solidity file');
    assert(!/(^|\/)(test|tests|script|scripts)(\/|$)/.test(mu.path) && !mu.path.endsWith('.t.sol'), 'mutation cannot target tests');
    for (const k of ['before', 'after', 'rationale', 'category']) string(mu[k], k);
    assert(mu.before !== mu.after, 'no-op mutation');
    assert(Array.isArray(mu.relevantTests) && mu.relevantTests.length > 0 && mu.relevantTests.every(x => typeof x === 'string' && /^test[^\s]*\([^\n]*\)$/.test(x)), 'relevantTests must contain exact test signatures');
  }
  return m;
}
export function replaceOnce(source, mu) {
  const first = source.indexOf(mu.before);
  assert(first !== -1, `missing replacement: ${mu.id}`);
  assert(source.indexOf(mu.before, first + 1) === -1, `ambiguous replacement: ${mu.id}`);
  assert(mu.before !== mu.after, `no-op mutation: ${mu.id}`);
  return source.slice(0, first) + mu.after + source.slice(first + mu.before.length);
}
export async function snapshot(project, manifest) {
  await noSymlinks(project);
  const files = []; let total = 0, entries = 0;
  async function walk(rel, role) {
    relativePath(rel);
    assert(++entries <= 1024 && rel.split('/').length <= 32, 'project directory traversal limit');
    const full = path.join(project, rel);
    await noSymlinks(full);
    const st = await fs.lstat(full);
    if (st.isDirectory()) {
      for (const entry of (await fs.readdir(full)).sort()) await walk(rel + '/' + entry, role);
    } else {
      assert(st.isFile() && st.nlink === 1, `non-regular or hard-linked file: ${rel}`);
      assert(!rel.endsWith('.vy'), 'MVP supports Solidity only, not Vyper');
      assert(st.size <= LIMITS.fileBytes && files.length < LIMITS.files, 'project file limit');
      const bytes = await fs.readFile(full);
      total += bytes.length; assert(total <= LIMITS.totalBytes, 'project size limit');
      files.push({ path: rel, role, sha256: hash(bytes), bytes });
    }
  }
  for (const [field, role] of [['sourceRoots', 'source'], ['testRoots', 'test'], ['supportPaths', 'support']]) {
    for (const root of manifest[field]) await walk(root, role);
  }
  files.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  for (const mu of manifest.mutations) {
    const f = files.find(f => f.path === mu.path && f.role === 'source');
    assert(f, `missing source: ${mu.path}`);
    const text = f.bytes.toString('utf8');
    assert(Buffer.from(text).equals(f.bytes), 'source must be UTF-8');
    const mutated = replaceOnce(text, mu);
    assert(!/MTQ_ASSERT:|assertion failed/.test(mutated), 'assertion markers are reserved for test code');
  }
  for (const f of files.filter(f => f.role === 'source')) assert(!/MTQ_ASSERT:|assertion failed/.test(f.bytes.toString('utf8')), 'assertion markers are reserved for test code');
  return files;
}
export async function isolatedCopy(files) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mtq-'));
  for (const file of files) {
    const dest = path.join(dir, file.path);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, file.bytes, { flag: 'wx' });
  }
  return dir;
}
export function cleanEnv(home) {
  return { PATH: process.env.PATH || '/usr/bin:/bin', HOME: home, XDG_CONFIG_HOME: path.join(home, '.config'), XDG_CACHE_HOME: path.join(home, '.cache'), LANG: 'C', LC_ALL: 'C', TERM: 'dumb', NO_COLOR: '1', RAYON_NUM_THREADS: '1', FOUNDRY_OFFLINE: 'true', FOUNDRY_FFI: 'false', FOUNDRY_FS_PERMISSIONS: '[]' };
}
export async function runProcess(command, args, { cwd, timeoutMs, signal, env = cleanEnv(cwd) }) {
  assert(process.platform !== 'win32', 'MVP requires POSIX process groups');
  const started = Date.now();
  return new Promise(resolve => {
    let stdout = '', stderr = '', bytes = 0, timedOut = false, outputLimited = false, spawnError = null, interrupted = false;
    const child = spawn(command, args, { cwd, env, shell: false, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const kill = () => { if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch (e) { if (e.code !== 'ESRCH') spawnError = e.message; } } };
    const abort = () => { interrupted = true; kill(); };
    const timer = setTimeout(() => { timedOut = true; kill(); }, Math.max(1, timeoutMs));
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    for (const [stream, name] of [[child.stdout, 'stdout'], [child.stderr, 'stderr']]) {
      stream.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > LIMITS.outputBytes) { outputLimited = true; kill(); return; }
        if (name === 'stdout') stdout += chunk.toString(); else stderr += chunk.toString();
      });
    }
    child.on('error', e => { spawnError = `${e.code || 'ERROR'}: ${e.message}`; });
    child.on('close', (exitCode, exitSignal) => {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      // Also reap same-group descendants that outlived their parent.
      kill();
      resolve({ command: [command, ...args], cwd: '$ISOLATED_PROJECT', exitCode, signal: exitSignal, timedOut, interrupted, outputLimited, spawnError, durationMs: Date.now() - started, stdout, stderr });
    });
  });
}
export const processOK = p => p && p.exitCode === 0 && !p.signal && !p.spawnError && !p.timedOut && !p.interrupted && !p.outputLimited;
export function parseTests(process) {
  let json;
  try { json = JSON.parse(process.stdout); } catch { return { valid: false, executed: 0, tests: [], error: 'forge stdout is not a single JSON result' }; }
  if (!json || Array.isArray(json) || typeof json !== 'object') return { valid: false, executed: 0, tests: [], error: 'invalid forge JSON shape' };
  const tests = [];
  for (const [suite, result] of Object.entries(json)) {
    if (!result || typeof result.test_results !== 'object' || result.test_results === null) return { valid: false, executed: 0, tests: [], error: 'unrecognized suite result' };
    for (const [name, t] of Object.entries(result.test_results)) {
      if (!t || !['Success', 'Failure', 'Skipped'].includes(t.status) || (t.reason !== null && typeof t.reason !== 'string')) return { valid: false, executed: 0, tests: [], error: 'unrecognized test result' };
      tests.push({ id: `${suite}::${name}`, name, status: t.status, reason: t.reason, counterexample: t.counterexample ?? null });
    }
  }
  return { valid: true, executed: tests.filter(t => t.status !== 'Skipped').length, tests, error: null };
}
export function classify(build, test, baselineTests, mu) {
  const abnormal = p => p?.spawnError || p?.signal || p?.outputLimited || p?.interrupted;
  if (build.timedOut || test?.timedOut) return { outcome: 'timeout', reason: 'process deadline exceeded' };
  if (abnormal(build)) return { outcome: 'infrastructure-error', reason: 'abnormal compiler process' };
  if (!processOK(build)) {
    // A nonzero exit alone is NOT evidence of a compiler diagnostic.
    const diagnostic = /Error \(\d+\):|(?:Parser|Type|Declaration|Syntax|Compiler)Error:/.test(build.stdout + build.stderr);
    return { outcome: diagnostic ? 'compile-error' : 'infrastructure-error', reason: diagnostic ? 'Solidity compiler diagnostic' : 'build failed without recognized Solidity diagnostic' };
  }
  if (!test || abnormal(test)) return { outcome: 'infrastructure-error', reason: 'test process missing or abnormal' };
  const parsed = parseTests(test);
  if (!parsed.valid || parsed.executed === 0) return { outcome: 'infrastructure-error', reason: parsed.error || 'zero executed tests' };
  const expected = baselineTests.filter(t => t.status !== 'Skipped').map(t => t.id).sort();
  const actual = parsed.tests.filter(t => t.status !== 'Skipped').map(t => t.id).sort();
  if (canonical(expected) !== canonical(actual)) return { outcome: 'infrastructure-error', reason: 'test selection differs from passing baseline' };
  const failures = parsed.tests.filter(t => t.status === 'Failure');
  if (processOK(test) && failures.length === 0) return { outcome: 'survived', reason: 'all baseline-selected tests passed; equivalence not assessed' };
  if (test.exitCode !== 1 || !failures.length) return { outcome: 'infrastructure-error', reason: 'inconsistent test exit/results' };
  const relevant = failures.filter(t => mu.relevantTests.includes(t.name) && /^(?:MTQ_ASSERT:|assertion failed(?:[:\s]|$))/.test(t.reason || ''));
  if (relevant.length) return { outcome: 'killed', reason: 'relevant explicit assertion failure', assertionTests: relevant.map(t => t.id) };
  return { outcome: 'equivalence-unresolved', reason: 'failing tests lack a recognized relevant assertion; no semantic equivalence claim' };
}
export function summarize(mutations) {
  const counts = Object.fromEntries(OUTCOMES.map(x => [x, 0]));
  for (const m of mutations) counts[m.outcome]++;
  const denominator = counts.killed + counts.survived;
  return { counts, total: mutations.length, denominator, excluded: mutations.length - denominator, score: denominator ? counts.killed / denominator : null, formula: 'killed / (killed + survived)', limitation: 'Evidence about the declared mutations only; not proof of security or semantic equivalence.' };
}
