# Measuring test quality with bounded mutations

Version 1 supports POSIX, dependency-free Node 22, genuine Forge 1.7.1 JSON output, and native
Solidity 0.8.24. Other Forge releases require replaying the runner tests and checking their JSON
format; an unrecognized format is an infrastructure error. Use installed tools; do not install
packages, fetch frameworks, use RPC, broadcast, or supply credentials. This is local development
tooling. Codex and Claude Code run the same Node entrypoints.

Only this reference and non-test `scripts/*.mjs` travel through `skill:measure-test-quality`.
All modules imported by those scripts are siblings and use Node built-ins. `schema.mjs` contains
the entire JSON Schema and can emit it without any additional file. Repository benchmark files
and `*.test.mjs` are authoring tests, not runtime dependencies of the skill.

## Operator inputs and output budget

The caller supplies an existing self-contained Foundry project, an explicit manifest, installed
Forge/solc, and a test selection. Include the whole source, test and required local dependency
folders in the manifest, plus `foundry.toml`. Everything needed for compilation must be ordinary
local files. The MVP requires `src` and `test` configuration to match declared roots. Roots must
be disjoint. Do not include credentials or tool caches. New tests belong under `test/quality/`;
new manifests and immutable reports belong under `artifacts/test-quality/`. These are the skill's
only repository write budgets. New tests may import existing source and test helpers. Production,
configuration and original tests remain frozen. If another layout is required, the caller must
arrange an appropriate skill/budget; this body does not widen it.

Node/Forge output files and temporary project copies are local process work, not delivered source
edits. The operator must allow an OS temporary directory and bound its disk space. Reports use
exclusive creation; choose a new name for each run. The runner never replaces an existing report.
Do not run in a concurrently modified tree. Pin the input manifest outside the worker's control
before starting if the measurement will inform a review decision.

## Manifest version 1

A manifest is strict JSON with these fields (no unknown fields):

```json
{
  "version": 1,
  "provenance": {
    "author": "operator or author identity",
    "origin": "public author-written or separately held-out set and its revision",
    "createdAt": "2026-09-26T00:00:00Z",
    "description": "why these fault hypotheses were selected before measurement"
  },
  "sourceRoots": ["src"],
  "testRoots": ["test"],
  "supportPaths": ["foundry.toml"],
  "mutations": [
    {
      "id": "truncate-store",
      "path": "src/Registry.sol",
      "before": "entries.push(value);",
      "after": "entries.push(uint256(uint128(value)));",
      "rationale": "Test whether callers can observe full-width values unchanged.",
      "category": "truncation",
      "relevantTests": ["testSmallValues()", "testFullWidthCounterexample()"]
    }
  ]
}
```

Use exact test signatures, including argument types, in `relevantTests`. They are the relevant
oracle allowlist, shared by initial and improved suites. Plan signature names before freezing the
manifest. Additional changes to relevance or other definitions require a new manifest version and
a fresh initial campaign; they must not silently rewrite an existing comparison. Provenance is an
operator assertion whose bytes are hashed, not authenticated identity. Keep the original manifest
file and review its SHA-256 separately. JSON object ordering/whitespace affects its byte hash.

Each mutation changes exactly one unique byte substring in a UTF-8 `.sol` production file. This is
not a Solidity parser: comments, string literals and formatting are not interpreted. Manually review
the resulting one-site change. Missing, ambiguous (including overlapping occurrences), empty and
no-op replacements are rejected before any baseline execution. Mutation paths must be relative,
normalized, source-only paths. Absolute paths, dot/traversal components, Windows separators,
protected components, test files, symlinks anywhere in selected paths and multiply hard-linked
files are refused. No mutations to configuration, tests or snapshots are allowed. No source file
or mutation may contain the reserved assertion markers `MTQ_ASSERT:` or `assertion failed`.

## Assertion attribution and outcomes

Use explicit test assertions such as:

```solidity
require(actual == expected, "MTQ_ASSERT:full-width round trip");
```

For refusal tests, call production with a low-level call, then assert the success flag and exact
returned bytes. This distinguishes a test assertion from an unexpected production revert.
Foundry assertion reasons starting `assertion failed` are also recognized. Plain Solidity panic
codes, arbitrary revert messages, setUp failures and custom assertion errors are not automatically
kills; wrap observable comparisons with an explicit recognized assertion. Tests and their oracle
helpers must themselves be reviewed: a marker is a conservative attribution convention, not a
proof of the oracle's correctness. Reserved strings in source/mutations are rejected to reduce
simple counterfeit failures; the runner is not an adversarial proof system or general interpreter.

| Outcome | Required evidence | Score denominator |
| --- | --- | --- |
| killed | Successful build, same nonempty executed test identity set as baseline, exit 1 with a relevant explicit assertion failure | Included |
| survived | Successful build, same nonempty selection, exit 0 and all executed tests successful | Included; equivalence unknown |
| compile-error | Nonzero build with recognized native Solidity diagnostic | Excluded |
| timeout | Build/test exceeded its process or remaining campaign deadline; process group killed | Excluded |
| infrastructure-error | Missing tool, signal/crash, output overflow, invalid/inconsistent JSON, changed or empty selection, or unrecognized build failure | Excluded |
| not-applicable | Not attempted because the baseline was invalid or the campaign stopped | Excluded |
| equivalence-unresolved | Compiled and failed, but no recognized relevant assertion establishes a kill | Excluded; no semantic equivalence claim |

A failed/empty baseline invalidates the entire campaign. Tool discovery/configuration errors are
recorded at campaign level; unattempted mutants remain not-applicable. A survivor is never called
equivalent. Manually suspected equivalent mutants remain visible in the original report; record
follow-up reasoning separately and precommit any new campaign, rather than excluding inconvenient
survivors after observing scores. Score = killed / (killed + survived); zero denominator gives null.
Always give all seven counts, exclusions, campaign status and baseline validity alongside the score.
A completed campaign may still contain excluded errors. A partial score is not a completed result.

## Offline commands

Substitute your explicit paths; the following assume the pinned read was materialized and a reviewed
manifest was created under the skill's artifact budget. The default compiler discovery checks
`~/.local/share/svm/0.8.24/solc-0.8.24`, then `~/.svm/0.8.24/solc-0.8.24`.
Use `--solc /path/to/native/solc-0.8.24` if needed. `--forge /path/to/forge` chooses an installed
Forge binary, never an arbitrary command string. Commands are spawned with argument arrays.

```sh
node .imd/reads/skills/measure-test-quality/scripts/run.mjs \
  --project . --manifest artifacts/test-quality/mutations.json \
  --out artifacts/test-quality/initial.json --match-path 'test/**/*.t.sol' \
  --seed 0x5eed --timeout-ms 30000 --campaign-ms 300000
# Add new tests without changing initial inputs or manifest; then:
node .imd/reads/skills/measure-test-quality/scripts/run.mjs \
  --project . --manifest artifacts/test-quality/mutations.json \
  --out artifacts/test-quality/final.json --match-path 'test/**/*.t.sol' \
  --baseline artifacts/test-quality/initial.json --seed 0x5eed
node .imd/reads/skills/measure-test-quality/scripts/compare.mjs \
  artifacts/test-quality/initial.json artifacts/test-quality/final.json \
  artifacts/test-quality/measurement.json artifacts/test-quality/report.md
node .imd/reads/skills/measure-test-quality/scripts/validate.mjs \
  artifacts/test-quality/measurement.json --project . \
  --manifest artifacts/test-quality/mutations.json
node .imd/reads/skills/measure-test-quality/scripts/schema.mjs \
  > artifacts/test-quality/report-v1.schema.json
```

`run.mjs` exits 0 for a completed campaign (including honest exclusions), 2 for invalid/partial
campaigns or rejected inputs. `validate.mjs` exits 1 for invalid reports; `compare.mjs` exits 1 for
invalid input/comparison. Preserve rejected-input diagnostics too. No file is emitted when manifest
or filesystem preflight rejects inputs. The comparison permits added tests but requires unchanged
original files, production/config input set, manifest, seed and toolchain. It does not require the
initial and final selections to match one another; each mutant must match its own honest baseline.
Tool versions, seed and all selected file hashes are checkpointed before the first baseline build.
Raw build/test stdout, stderr, command argv, exit/signal, elapsed time, parsed test identities,
counts and counterexamples are retained. A fuzz test signature counts as one executed test; fuzz
run counts are additionally available in raw Forge JSON. Absolute compiler paths and wall-clock
fields can differ across machines. Compare digests and outcomes, not timestamps or durations.

## Bounds and containment

Maximums: 32 mutants; 512 input files; 1,024 visited entries; depth 32; 2 MiB per input file; 16 MiB total copied bytes; 4 MiB combined
stdout/stderr per process; 120 seconds per process; 600 seconds per campaign. Defaults are 30 and
300 seconds. Each stage is capped by remaining campaign time. Exceeding output bounds is an
infrastructure error, not a kill. Snapshotting input buffers avoids copying mutable compiler caches.
All baseline/mutant builds occur in fresh private temporary directories; cache and output locations
must stay inside the copy and cannot overlap inputs. Temporary copies are deleted on normal,
error, timeout and handled SIGINT/SIGTERM paths. SIGKILL/power loss can leave a temp directory or
an incomplete JSON checkpoint; preserve it as incomplete, never infer success. Checkpoints are
synced but are not crash-atomic transactions.

Each subprocess is a foreground-awaited POSIX process group. Timeouts and cancellation kill the
whole group with SIGKILL; tests verify an ordinary child cannot finish a delayed write afterward.
The environment omits caller credentials and Foundry/DAPP overrides, uses a temporary home, and
forces offline, FFI disabled and filesystem permissions empty. Configuration rejects external
paths and RPC/fork settings. The runner does not implement an OS sandbox: deliberately malicious
tools, concurrent filesystem replacement, newly detached sessions, or arbitrary network-enabled
cheatcode tests require an operator-enforced sandbox. Use trusted installed binaries and disable
network at the OS/container layer for independent replay. The included benchmark has no such
calls or dependencies. No process is intentionally left in the background.

## Interpreting and independently replaying evidence

write-foundry-tests produces tests; this skill measures whether those tests expose selected faults
and preserves the misses that motivated new oracles. adversarial-review examines assumptions,
attack paths and design failures that finite mutation sets miss. A high score does not replace it.
Neither branch coverage nor a passing build proves behavioral adequacy or security.

For a held-out set, an operator other than the test author selects and pins mutation bytes,
provenance, expected relevance signatures, baseline, seed and toolchain in a separate trusted
record before improvement. Keep the set outside the author's delivery until evaluation. Because
unknown future test signatures may be needed, have the operator fix the assertion plan before
unblinding; do not edit relevance after seeing failures. Replay once against the pinned final tree,
publish exclusions and all attempted outcomes, and disclose any unblinding or later adaptation.
Never describe this package's public author-written demonstration as hidden or independent.

This skill declares `judge: verifier-paths`, `checks: none`; it is class 2 for scope/bytes, not class 1
for mutation correctness. Ordinary network Foundry checks build and test the repository but do
not replay the Node campaign. Independent verification needs a separately reviewed operator-side
job that pins this runner, invokes its Node tests and both campaigns in an offline sandbox,
validates reports against the trusted inputs, checks expected test identities/counts, and retains
signed/attested results. The operator must own that verifier implementation and resource policy;
this skill cannot install or invent a verifier profile. An independent code review is separate,
not satisfied by the author's self-review or these commands. No deployment or catalog registration
is performed by this skill.
