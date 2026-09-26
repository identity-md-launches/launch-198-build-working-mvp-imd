#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, OUTCOMES, noSymlinks, relativePath } from './core.mjs';
import { validateReport, compareCampaigns } from './validate.mjs';
export function measurement(initial, final) {
  validateReport(initial); validateReport(final);
  return validateReport({ version: 1, kind: 'measurement', initial, final, comparison: compareCampaigns(initial, final), disclosure: 'Public author-written benchmark and tests. These measurements are self-reported, not independent, hidden, class-1 verified, or proof of security.' });
}
export function markdown(r) {
  const lines = ['# Mutation measurement', '', r.disclosure, '', '| Mutation | Category | Initial | Final |', '| --- | --- | --- | --- |'];
  r.initial.mutations.forEach((m, i) => lines.push(`| ${m.id} | ${r.initial.frozen.manifest.mutations[i].category} | ${m.outcome} | ${r.final.mutations[i].outcome} |`));
  lines.push('', '| Count | Initial | Final |', '| --- | ---: | ---: |');
  for (const key of OUTCOMES) lines.push(`| ${key} | ${r.initial.summary.counts[key]} | ${r.final.summary.counts[key]} |`);
  for (const key of ['total', 'denominator', 'excluded', 'score']) lines.push(`| ${key} | ${r.initial.summary[key]} | ${r.final.summary[key]} |`);
  for (const [label, c] of [['Initial', r.initial], ['Final', r.final]]) {
    lines.push('', `## ${label} evidence`, '', `Status: ${c.status}; baseline valid: ${c.baseline.valid}; executed tests: ${c.baseline.parsed?.executed ?? 0}.`, '', `Project SHA-256: \`${c.frozen.projectSha256}\``, '', `Manifest SHA-256: \`${c.frozen.manifestSha256}\``, '', `Toolchain/seed SHA-256: \`${c.frozen.toolchainSha256}\``, '', `Selection: \`${c.frozen.matchPath}\`; seed: \`${c.frozen.seed}\`.`, '', '| Mutation | Definition SHA-256 | Mutated source SHA-256 | Build/test exit | Tests executed | Assertion evidence |', '| --- | --- | --- | --- | ---: | --- |');
    for (const m of c.mutations) lines.push(`| ${m.id} | ${m.definitionSha256} | ${m.mutatedSourceSha256} | ${m.build?.exitCode}/${m.test?.exitCode} | ${m.parsed?.executed ?? 0} | ${m.assertionTests.join(', ') || m.reason} |`);
  }
  lines.push('', 'Score = killed / (killed + survived). Compile errors, timeouts, infrastructure errors, not-applicable and equivalence-unresolved results are excluded, with counts above. Survivors have not been proved equivalent. Full commands, output, status, test names and counterexamples are embedded in measurement.json.', '');
  return lines.join('\n');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [initialFile, finalFile, jsonFile, mdFile] = process.argv.slice(2);
    assert(initialFile && finalFile && jsonFile && mdFile && process.argv.length === 6, 'usage: node compare.mjs initial.json final.json measurement.json measurement.md');
    const r = measurement(JSON.parse(await fs.readFile(initialFile, 'utf8')), JSON.parse(await fs.readFile(finalFile, 'utf8')));
    for (const f of [jsonFile, mdFile]) { await noSymlinks(path.resolve(f), true); relativePath(path.resolve(f).slice(1)); }
    await fs.writeFile(jsonFile, JSON.stringify(r, null, 2) + '\n', { flag: 'wx' });
    await fs.writeFile(mdFile, markdown(r), { flag: 'wx' });
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
