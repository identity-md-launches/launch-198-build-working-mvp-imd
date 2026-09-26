# Mutation definitions and interpretation

`manifests/registry-v1.json` was fixed before the initial pilot. Its raw bytes, the honest source,
initial tests, configuration and versions/seed were hashed before that execution. The public
benchmark and its intentionally weak initial tests were written by the same author. This is a
reproducible demonstration, not an independent, hidden or security evaluation. Honest production
has remained unchanged throughout strengthening. Hashes are in `artifacts/baseline-hashes.json`;
initial evidence survives in `artifacts/history/initial-pilot.json` and the canonical initial replay.

Each mutation is a single unique replacement, applied independently to a fresh copy. No combined
mutants are measured. Relevance signatures were declared in advance. All six are designated
non-equivalent; each has a concrete witness. All six compile and fail an assertion in the final
suite. Their exact byte definitions and per-mutant hashes are in the JSON report.

| ID | Fault | Concrete witness | Initial | Final |
| --- | --- | --- | --- | --- |
| capacity-overflow | `>= CAPACITY` becomes `> CAPACITY` | Insert 1,2,3,4,5: fifth succeeds instead of `Full(4)` | killed | killed |
| unstable-delete | Every shifted slot receives the last entry | Insert 10,20,30,40; remove 20: expected [10,30,40], mutant [10,40,40] | killed | killed |
| wrong-zero-error | Zero insertion emits `Missing(0)` | Insert 0: exact selector differs from `ZeroValue()` | killed | killed |
| full-before-duplicate | Capacity check precedes duplicate check | Fill with 1..4; insert 2: `Full(4)` instead of `AlreadyPresent(2)` | survived | killed |
| stale-membership | Removal keeps presence true | Insert/remove 11: `contains(11)` remains true | killed | killed |
| truncate-128 | Store `uint128(value)` while membership remains uint256 | Insert 2^128+7: `at(0)` returns 7 | survived | killed |

The initial truncation miss is preserved, not rewritten away. The final counterexample logs the
same input and the actual observable output on honest and mutated code; see
`artifacts/counterexample.json`. Final model comparisons also catch ordering, stale membership and
refusal-state regressions across sequences. Every bit boundary is deliberately covered, rather
than just the particular boundary used by this mutation. The naive model has no production imports
or membership map: it uses a fixed-size array, linear search and rebuilds on deletion.

The denominator is explicitly 6 in both campaigns. Initial score is 4/6; final is 6/6. Counts for
compile-error, timeout, infrastructure-error, not-applicable and equivalence-unresolved are each
zero in both benchmark campaigns. Failure-mode Node tests exercise those classifications separately,
including a real looping Foundry mutant. Their failures are not benchmark kills. Per-mutant build
and test exit codes, executed counts, failing assertion names, raw diagnostics, source hashes,
manifest definitions and commands live in `artifacts/measurement.json` and the readable report.

## Separate held-out operator set

An operator seeking an independent measurement must create a separate manifest and baseline
commitment before the test author sees the evaluation. Store it under operator control, with a
revision, raw hash, author/provenance, seed and toolchain identity. Do not call this public set held
out. Select meaningful one-site fault hypotheses from specification risks, not only convenient
syntactic changes. Verify manually that each replacement represents the intended fault and fix
relevant assertion signatures before revealing results. The operator may coordinate test signature
names without disclosing mutant details. All definitions and exclusions must be revealed in the
final independent report after evaluation.

Replay the frozen held-out set against unchanged production and the pinned final test tree using
the same runner under an offline OS sandbox. Keep the original report even if a later issue is
found. If a replacement is missing/ambiguous, provenance changes or the baseline fails, reject that
campaign; prepare a new version and rerun instead of silently dropping the mutation. Never label a
survivor equivalent automatically. Suspected equivalence needs separate analysis and disclosure,
not post-hoc removal from this score. Limit overfitting by withholding further feedback or rotating
a newly committed set; disclose unblinding and any adaptive reruns.
