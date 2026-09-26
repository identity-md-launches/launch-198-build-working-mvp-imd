#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { schema } from './schema.mjs';
import { assert, canonical, hash, validateManifest, relativePath, summarize, processOK, parseTests, classify, snapshot, replaceOnce } from './core.mjs';

// Deliberately implements only the keywords used by the bundled, versioned schema.
export function validateShape(value, s = schema, at = '$') {
  if (s.$ref) return validateShape(value, schema.$defs[s.$ref.split('/').at(-1)], at);
  if (s.anyOf) {
    const errors = [];
    for (const branch of s.anyOf) { try { validateShape(value, branch, at); return; } catch (e) { errors.push(e.message); } }
    throw new Error(`${at}: no schema branch matched (${errors.join('; ')})`);
  }
  if ('const' in s) assert(value === s.const, `${at}: wrong constant`);
  if (s.enum) assert(s.enum.includes(value), `${at}: invalid enum`);
  if (s.type) {
    const typeOK = s.type === 'null' ? value === null : s.type === 'array' ? Array.isArray(value) : s.type === 'object' ? value && typeof value === 'object' && !Array.isArray(value) : s.type === 'integer' ? Number.isInteger(value) : typeof value === s.type;
    assert(typeOK, `${at}: expected ${s.type}`);
  }
  if (s.type === 'object') {
    for (const k of s.required || []) assert(Object.hasOwn(value, k), `${at}: missing ${k}`);
    for (const [k, v] of Object.entries(value)) {
      if (s.properties && Object.hasOwn(s.properties, k)) validateShape(v, s.properties[k], `${at}.${k}`);
      else if (s.additionalProperties === false) throw new Error(`${at}: unknown ${k}`);
      else if (typeof s.additionalProperties === 'object') validateShape(v, s.additionalProperties, `${at}.${k}`);
    }
  }
  if (s.type === 'array') {
    assert(value.length >= (s.minItems || 0) && value.length <= (s.maxItems ?? Infinity), `${at}: array bounds`);
    value.forEach((v, i) => validateShape(v, s.items, `${at}[${i}]`));
  }
  if (s.pattern) assert(new RegExp(s.pattern).test(value), `${at}: invalid pattern`);
  if (s.minimum !== undefined) assert(value >= s.minimum, `${at}: below minimum`);
  if (s.maximum !== undefined) assert(value <= s.maximum, `${at}: above maximum`);
}
const equal = (a, b, why) => assert(canonical(a) === canonical(b), why);
export function compareCampaigns(initial, final) {
  assert(initial.baseline.valid && final.baseline.valid, 'comparison requires valid baselines');
  equal(initial.frozen.files.filter(f => f.role !== 'test'), final.frozen.files.filter(f => f.role !== 'test'), 'source or configuration changed');
  for (const f of initial.frozen.files.filter(f => f.role === 'test')) assert(final.frozen.files.some(g => canonical(f) === canonical(g)), `initial test changed: ${f.path}`);
  assert(initial.frozen.manifestSha256 === final.frozen.manifestSha256, 'mutation provenance changed');
  equal(initial.frozen.manifest, final.frozen.manifest, 'mutation definitions changed');
  assert(initial.frozen.toolchainSha256 === final.frozen.toolchainSha256, 'toolchain changed');
  return { sourceUnchanged: true, initialTestsPreserved: true, manifestUnchanged: true, toolchainUnchanged: true };
}
export function validateReport(report) {
  validateShape(report);
  if (report.kind === 'measurement') {
    validateReport(report.initial); validateReport(report.final);
    equal(report.comparison, compareCampaigns(report.initial, report.final), 'invalid comparison');
    return report;
  }
  const { frozen, baseline } = report;
  validateManifest(frozen.manifest);
  assert(new Set(frozen.files.map(f => f.path)).size === frozen.files.length, 'duplicate frozen path');
  frozen.files.forEach(f => relativePath(f.path));
  assert(hash(canonical(frozen.files)) === frozen.projectSha256, 'project hash mismatch');
  if (frozen.toolchainSha256 !== null) {
    assert(frozen.tools.forge && frozen.tools.solc && frozen.tools.node && frozen.tools.solcBinarySha256, 'missing tool evidence');
    equal(frozen.toolchainSha256, hash(canonical({ node: frozen.tools.node, forge: frozen.tools.forge.stdout, solc: frozen.tools.solc.stdout, solcBinarySha256: frozen.tools.solcBinarySha256, seed: frozen.seed })), 'toolchain hash mismatch');
  }
  if (baseline.test) equal(baseline.parsed, parseTests(baseline.test), 'baseline parsed evidence mismatch');
  const valid = processOK(baseline.build) && processOK(baseline.test) && baseline.parsed?.valid && baseline.parsed.executed > 0 && baseline.parsed.tests.every(t => t.status !== 'Failure');
  assert(baseline.valid === Boolean(valid), 'incorrect baseline validity');
  if (baseline.valid) assert(processOK(frozen.tools.forge) && processOK(frozen.tools.solc) && processOK(baseline.config), 'baseline has no working tool/config evidence');
  if (report.status === 'complete') assert(baseline.valid && report.mutations.every(m => m.build), 'complete campaign lacks execution');
  if (report.status === 'invalid') assert(!baseline.valid, 'invalid status on valid baseline');
  assert(report.mutations.length === frozen.manifest.mutations.length, 'mutation count mismatch');
  report.mutations.forEach((m, i) => {
    const definition = frozen.manifest.mutations[i];
    assert(m.id === definition.id && m.definitionSha256 === hash(canonical(definition)), 'mutation definition hash mismatch');
    if (!baseline.valid) assert(m.build === null && m.test === null, 'mutations executed after invalid baseline');
    if (m.build) {
      assert(m.mutatedSourceSha256, 'missing mutated source hash');
      const actual = classify(m.build, m.test, baseline.parsed.tests, definition);
      assert(m.outcome === actual.outcome && m.reason === actual.reason, `classification mismatch: ${m.id}`);
      equal(m.assertionTests, actual.assertionTests || [], 'assertion attribution mismatch');
    } else assert(m.outcome === 'not-applicable' && m.test === null && m.mutatedSourceSha256 === null, 'unexecuted mutant misclassified');
    if (m.test) equal(m.parsed, parseTests(m.test), 'parsed mutation evidence mismatch');
    else assert(m.parsed === null, 'parsed results without process');
  });
  equal(report.summary, summarize(report.mutations), 'counts or denominator mismatch');
  return report;
}
export async function verifyFiles(report, project, manifestPath) {
  for (const r of report.kind === 'measurement' ? [report.initial, report.final] : [report]) {
    const files = await snapshot(path.resolve(project), r.frozen.manifest);
    for (const f of r.frozen.files) assert(files.some(g => g.path === f.path && g.role === f.role && g.sha256 === f.sha256), `delivered file changed: ${f.path}`);
    for (const m of r.mutations) if (m.mutatedSourceSha256) {
      const definition = r.frozen.manifest.mutations.find(d => d.id === m.id);
      const source = files.find(f => f.path === definition.path).bytes.toString('utf8');
      assert(hash(replaceOnce(source, definition)) === m.mutatedSourceSha256, 'mutated source hash mismatch');
    }
    if (manifestPath) assert(hash(await fs.readFile(manifestPath)) === r.frozen.manifestSha256, 'manifest byte hash mismatch');
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [file, ...args] = process.argv.slice(2);
    assert(file, 'usage: node validate.mjs report.json [--project PATH --manifest PATH]');
    const opts = {};
    for (let i = 0; i < args.length; i += 2) { assert(['--project', '--manifest'].includes(args[i]) && args[i + 1] && !opts[args[i]], 'invalid option'); opts[args[i]] = args[i + 1]; }
    const report = validateReport(JSON.parse(await fs.readFile(file, 'utf8')));
    if (opts['--project']) await verifyFiles(report, opts['--project'], opts['--manifest']);
    console.log(`valid report v1: ${file}`);
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
