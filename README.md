# measure-test-quality MVP

A reusable IMD skill and dependency-free mutation runner for local Solidity/Foundry projects.
The public benchmark's preserved initial suite kills **4/6** declared mutants; the improved final
suite kills **6/6**. Both honest baselines pass. There are **zero exclusions** in either delivered
campaign. These are author-produced measurements on a deliberately weak author-written initial
suite, not a hidden or independent evaluation and not proof of security.

The concrete preserved miss: after inserting `2**128 + 7`, the truncation mutant returns `7` from
`at(0)`. The honest contract returns `340282366920938463463374607431768211463`.
The initial suite passes that mutant. [Captured logs](artifacts/counterexample.json) and
[the full report](artifacts/measurement.md) document the executed counterexample and final kill.
The original source, initial tests, configuration, manifest and toolchain commitments are in
[baseline-hashes.json](artifacts/baseline-hashes.json).

This adds fault-detection measurement to `write-foundry-tests`: it identifies defects a passing
suite fails to notice. It complements `adversarial-review` with concrete missing-oracle evidence;
it does not replace independent analysis of design, assumptions or attack paths.

## Layout

| Path | Purpose |
| --- | --- |
| `measure-test-quality/SKILL.md` | IMD v1 entrypoint, narrow test/artifact writes, class 2 scope/bytes judge |
| `measure-test-quality/REFERENCE.md` | Self-contained runtime instructions and boundaries |
| `measure-test-quality/scripts/*.mjs` | Runner, schema, validator, comparison tool; only built-in Node modules |
| `measure-test-quality/scripts/runner.test.mjs` | Node tests, including real native Forge executions |
| `src/OrderedRegistry.sol` | Honest, unchanged benchmark contract |
| `test/initial/RegistryInitial.t.sol` | Frozen five-test initial suite |
| `test/final/RegistryFinal.t.sol` | Seven improved tests, including two fuzz tests |
| `test/support/NaiveRegistryModel.sol` | Independent array/search model; no production imports |
| `manifests/registry-v1.json` | Six preselected, single-site mutation definitions and provenance |
| `schemas/report-v1.schema.json` | Versioned JSON Schema emitted by portable `scripts/schema.mjs` |
| `artifacts/initial.json`, `final.json`, `measurement.json` | Full process commands, outputs, hashes and results |
| `artifacts/history/initial-pilot.json` | Original execution before final tests existed; never overwritten |
| `scripts/reproduce.mjs` | Reconstruct frozen initial project, execute both campaigns, compare and validate |
| `docs/MUTATIONS.md` | Fault hypotheses, counters and held-out-set procedure |
| `docs/REVIEW.md`, `docs/MAINTAINERS.md` | Self-review, later independent-review checklist and catalog handoff |

## Offline reproduction

Recorded toolchain: **Node v22.22.2**, **Forge 1.7.1**, commit
`4072e48705af9d93e3c0f6e29e93b5e9a40caed8`, and native **Solidity
0.8.24+commit.e11b9ed9.Linux.g++**. POSIX process groups are required; Windows is not supported by
this MVP. No npm dependencies, forge-std, package downloads, RPC, secrets or network are needed.
The installed Solidity binary is discovered in the normal SVM locations. `solc` need not be on
PATH. `foundry.toml` pins 0.8.24 and offline mode. Use `--solc` with the generic runner if your
installation differs; install the documented compiler before entering an offline verifier.

Run from this repository root:

```sh
forge build
forge test
forge fmt --check
node --test measure-test-quality/scripts/*.test.mjs
node measure-test-quality/scripts/validate.mjs artifacts/measurement.json \
  --project . --manifest manifests/registry-v1.json

# A fresh output directory preserves all previously recorded evidence.
MTQ_REPLAY_PARENT=$(mktemp -d /tmp/mtq-replay.XXXXXX)
node scripts/reproduce.mjs --out "$MTQ_REPLAY_PARENT/results"
node measure-test-quality/scripts/validate.mjs "$MTQ_REPLAY_PARENT/results/measurement.json" \
  --project . --manifest manifests/registry-v1.json
```

Expected: 12 Foundry tests pass (5 preserved initial + 7 final); 64 runs per fuzz signature,
seed `0x5eed`; Node tests pass; initial campaign 4 kills/2 survivors; final campaign 6 kills.
The final campaign selects **only** the seven final tests, so it demonstrates each mutant fails
the improved suite itself. Every baseline and mutant build runs in a fresh isolated copy.
The script reconstructs initial inputs from the frozen commitment, verifies their SHA-256 hashes,
and executes initial before final. No existing source, initial test, config or report is rewritten.
The initial pilot retained in history used an earlier runner revision and less verbose Forge JSON;
its input commitment and 4/6 result remain preserved. Canonical reports use the delivered runner. Exact historical runner bytes are retained under
`artifacts/history/runner-v0/`; they match the pilot's script hashes and are only for historical replay.

To reproduce the archived pilot with its original runner bytes, also offline:

```sh
node scripts/replay-pilot.mjs --out "$MTQ_REPLAY_PARENT/pilot-replay.json"
```

The exact generic runner invocations implemented by the helper are:

```sh
# INITIAL_PROJECT is a temporary tree containing precisely the files in baseline-hashes.json.
node measure-test-quality/scripts/run.mjs --project "$INITIAL_PROJECT" \
  --manifest manifests/registry-v1.json --out "$MTQ_REPLAY_PARENT/initial.json" \
  --match-path 'test/initial/*.t.sol' --seed 0x5eed
node measure-test-quality/scripts/run.mjs --project . \
  --manifest manifests/registry-v1.json --out "$MTQ_REPLAY_PARENT/final.json" \
  --match-path 'test/final/*.t.sol' --seed 0x5eed --baseline "$MTQ_REPLAY_PARENT/initial.json"
node measure-test-quality/scripts/compare.mjs \
  "$MTQ_REPLAY_PARENT/initial.json" "$MTQ_REPLAY_PARENT/final.json" \
  "$MTQ_REPLAY_PARENT/measurement.json" "$MTQ_REPLAY_PARENT/measurement.md"
```

`INITIAL_PROJECT` above explains the helper's reconstructed input; the first block is the complete,
copyable replay command sequence. See the skill reference for arbitrary operator manifests. The
runner accepts explicit project/manifest paths, does not parse Solidity, and never edits production
in place. Scores include only killed and survived mutants; all seven outcome counts and exclusions
are displayed. `run.mjs` exit 0 means the campaign finished, not that every mutant was killed or
that no exclusions occurred. A baseline failure, missing tool or zero tests invalidates measurement.

The schema validator checks structural and semantic consistency, including classifications against
raw process evidence, baseline test identities, counts and hashes. `--project` and `--manifest`
also verify current bytes. It cannot prove that untrusted logs were honestly generated; independent
re-execution is required. Timestamps, durations, gas details and local compiler paths can differ.
Expected deterministic comparisons are input/tool digests, test selection, statuses, counts and
counterexample values. Changed tool versions require a new campaign, not relabeling prior evidence.

## Benchmark behavior and assumptions

Any caller may insert or remove a nonzero `uint256`. Capacity is exactly four. Values are unique,
retain full width, and enumerate in insertion order. Removal keeps the remaining order; reinsertion
appends. No constructor arguments, funds, owner, upgrade mechanism or deployment/broadcast scripts
exist. This contract is a local benchmark, with no chain deployment parameters to configure.

| Operation | Refusal, in precedence order |
| --- | --- |
| `insert(value)` | `ZeroValue()`; `AlreadyPresent(value)`; `Full(4)` |
| `remove(value)` | `Missing(value)` when absent, including zero |
| `at(index)` | `IndexOutOfBounds(index, length)` when index >= length |

`CAPACITY`, `length`, `at`, `values` and `contains` are observable. Final tests compare every live
entry and index, full ordering, all touched membership queries (including removed values), chosen
absent values, and out-of-range reads. Refusal tests compare exact bytes and resulting state.
The exhaustive bit test checks each power `2**bit` for bit 0..255 and both neighbors, plus max
uint256; fuzz tests use the full 256-bit input domain and mixed operation histories. No finite
suite exhausts all histories or all mapping queries. Permissionless cross-caller removal is tested.

## Verification and publication status

[Local verification records](artifacts/verification.json) include build, tests, formatting, Node,
report validation, campaign replay and the unchanged official authoring checker. The checker was
read from [the pinned authoring reference](https://github.com/Identity-md/identitymd-skill-crafting/tree/fa541fd81326b532d315576fa113c78b67b30ca7).
Its exact source URL, commit and SHA-256 are recorded in
[official-checker.json](artifacts/official-checker.json). It is not a build dependency.

The ordinary network Foundry profile does **not** replay the Node mutation campaign. This proposed
skill declares `judge: verifier-paths`, `checks: none`; mutation measurements are self-reported,
not class-1 verified. Passing compilation is not test-quality evidence. No separate agent audited
this package. [The concrete self-review and independent checklist](docs/REVIEW.md) distinguish
completed local checks from the later review. An operator must separately review and install an
offline full-campaign replay job, pin inputs and toolchain, and retain independent results before
relying on mutation evidence.

The package is **not registered or live**. No upstream PR, catalog merge, deployment or broadcast
has been made. GitHub publication remains pending: this assignment supplies no destination or
publishing route and prohibits credentials, external services and touching `.git/`. Source and a
publication-ready archive are prepared locally. [Maintainer instructions](docs/MAINTAINERS.md)
cover publishing, official validation, review, merge, catalog generation and later deployment.
