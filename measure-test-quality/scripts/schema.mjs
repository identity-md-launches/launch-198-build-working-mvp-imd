#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OUTCOMES } from './core.mjs';
const str = { type: 'string' }, num = { type: 'number', minimum: 0 }, integer = { type: 'integer', minimum: 0 }, bool = { type: 'boolean' }, nil = { type: 'null' };
const sha = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const nullable = s => ({ anyOf: [s, nil] });
const arr = items => ({ type: 'array', items });
const ref = name => ({ $ref: '#/$defs/' + name });
const obj = (properties, required = Object.keys(properties), extra = false) => ({ type: 'object', properties, required, additionalProperties: extra });
const counts = obj(Object.fromEntries(OUTCOMES.map(s => [s, integer])));
export const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'urn:imd:measure-test-quality:report:1',
  title: 'measure-test-quality report version 1',
  anyOf: [ref('campaign'), ref('measurement')],
  $defs: {
    process: obj({ command: { ...arr(str), minItems: 1 }, cwd: { const: '$ISOLATED_PROJECT' }, exitCode: nullable({ type: 'integer' }), signal: nullable(str), timedOut: bool, interrupted: bool, outputLimited: bool, spawnError: nullable(str), durationMs: num, stdout: str, stderr: str }),
    test: obj({ id: str, name: str, status: { enum: ['Success', 'Failure', 'Skipped'] }, reason: nullable(str), counterexample: {} }),
    parsed: obj({ valid: bool, executed: integer, tests: arr(ref('test')), error: nullable(str) }),
    file: obj({ path: str, role: { enum: ['source', 'test', 'support'] }, sha256: sha }),
    frozen: obj({ files: { ...arr(ref('file')), minItems: 1 }, projectSha256: sha, manifestSha256: sha, manifest: { type: 'object' }, seed: str, matchPath: str, runnerSha256: { type: 'object', additionalProperties: sha }, tools: obj({ node: str, forge: ref('process'), solc: ref('process'), solcBinarySha256: sha }, [], false), toolchainSha256: nullable(sha) }),
    summary: obj({ counts, total: integer, denominator: integer, excluded: integer, score: nullable({ type: 'number', minimum: 0, maximum: 1 }), formula: { const: 'killed / (killed + survived)' }, limitation: str }),
    mutant: obj({ id: str, definitionSha256: sha, outcome: { enum: OUTCOMES }, reason: str, mutatedSourceSha256: nullable(sha), build: nullable(ref('process')), test: nullable(ref('process')), parsed: nullable(ref('parsed')), assertionTests: arr(str) }),
    campaign: obj({ version: { const: 1 }, kind: { const: 'campaign' }, startedAt: str, finishedAt: nullable(str), status: { enum: ['complete', 'partial', 'invalid'] }, frozen: ref('frozen'), bounds: obj({ timeoutMs: { type: 'integer', minimum: 1, maximum: 120000 }, campaignMs: { type: 'integer', minimum: 1, maximum: 600000 }, maxMutations: { const: 32 } }), baseline: obj({ valid: bool, reason: str, config: nullable(ref('process')), build: nullable(ref('process')), test: nullable(ref('process')), parsed: nullable(ref('parsed')) }), mutations: { ...arr(ref('mutant')), minItems: 1, maxItems: 32 }, summary: ref('summary'), error: nullable(str) }),
    measurement: obj({ version: { const: 1 }, kind: { const: 'measurement' }, initial: ref('campaign'), final: ref('campaign'), comparison: obj({ sourceUnchanged: { const: true }, initialTestsPreserved: { const: true }, manifestUnchanged: { const: true }, toolchainUnchanged: { const: true } }), disclosure: str })
  }
};
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(schema, null, 2));
