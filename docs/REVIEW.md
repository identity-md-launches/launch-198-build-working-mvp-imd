# Review record and remaining review

This is a concrete self-review by the implementing agent, not an independent audit. No second
agent or outside reviewer has evaluated this package. All tests were executed locally and have
no independent authority. Final command evidence is in `artifacts/verification.json`.

## Self-review findings and repairs

| Area inspected | Finding and action | Evidence |
| --- | --- | --- |
| Freeze and isolation | Input bytes are read before execution; copies omit original build caches. Initial source, tests and config hashes are retained. Added validation of reference baseline reports before accepting `--baseline`. | Real campaign tests compare byte snapshots; edits to frozen tests and a tampered baseline are rejected. |
| Path boundaries | Reject traversal, absolute mutation paths, Windows separators, protected components, symlinks and hardlinks. Output creation is exclusive and cannot target copied input roots. Added directory traversal bounds alongside byte/file limits. | Unsafe-path, link, output-overlap, malformed-config and ambiguity tests. |
| Attribution | A nonzero exit alone cannot be a kill. Compare exact non-skipped test identities against the honest baseline and require a relevant explicit assertion. Reject reserved assertion strings introduced in production to reduce counterfeit markers. | Real compiler error, unexpected revert, empty/failing baseline, survivor and assertion-kill cases; fake marker rejection. |
| Timeout handling | Each child has a POSIX process group and a remaining-deadline cap; kill the group, retain partial results and clean copies. | A real infinite-loop Foundry mutant is timed out, with the next mutant not attempted. Separate child-process delayed-write test confirms group termination. |
| Evidence | Validate raw Forge parsing, outcome attribution, definition hashes and all score counts. Capture witness logs with Forge `-vv`. Check installed versions and seed before baseline. | Report corruption tests and schema equality test; actual high-bit counterexample logs. |
| Benchmark compilation | A new model method used Solidity's reserved word `apply`; renamed it to `transition` before campaigns. Honest registry/initial tests were unchanged. | Root build and test pass. |
| Test scaffolding | First process-tree test had incorrectly escaped nested JavaScript; passed child code as a literal argv instead. Timeout fixture used an out-of-range TOML integer; changed it to a valid large gas bound. | Real subprocess and Foundry timeout tests now pass; no compiler/crash failure counted as a kill. |

Initial baseline evidence was not regenerated to hide these repairs. The pilot remains archived;
its runner digest records the earlier version, and its original input hash commitment is unchanged.
Canonical initial/final reports were subsequently executed with the final runner. Root production
code and initial suite continue to match the original commitment. The pilot is historical evidence,
not a claim that the old runner is the current package or independently reviewed. Its exact two
script files are archived under `artifacts/history/runner-v0/`, verified against the original hashes,
and the historical replay command reproduces its input/tool/runner hashes and outcomes locally.

## Known boundaries

The runner is not an OS sandbox, a Solidity parser, or proof of oracle correctness. Operator-selected
source roots, manifest provenance and assertion relevance need human review. An attacker could
construct misleading oracles or logs; the validator proves consistency, not authenticity. Trusted
Forge/solc/Node binaries and stable, exclusively used project paths are assumptions. Tests that
create separate sessions or invoke arbitrary network cheatcodes need OS-level containment, even
though ordinary processes, FFI and filesystem access are bounded/disabled here. No network is used
by the delivered campaigns. Power loss/SIGKILL can leave temp data or a truncated checkpoint;
such results must be treated as incomplete. The snapshot traversal has explicit depth/count limits,
but this MVP does not impose total OS RAM/CPU/disk quotas; operators own those quotas.

Supported assertion reasons are deliberately conservative. A custom assertion error, out-of-gas,
setUp failure or unexpected production revert is not automatically a kill. Equivalent mutations
are never inferred. Zero executed tests invalidates the baseline, and changed test identity sets
invalidate mutant attribution. Test count means signatures, not fuzz iterations. This protocol is
scoped to Forge 1.7.1's JSON shape; a different tool release needs validation and a new campaign.

## Independent-review checklist (later task)

- [ ] Review classification from successful compile through exact test selection and assertion origin;
  attempt false kills via compiler failures, panic/custom errors, skipped tests, bad JSON and signals.
- [ ] Trace every filesystem read/write, including symlink/hardlink checks, output files, caller paths,
  compiler imports, configuration remappings and source/test separation; assess concurrent replacement.
- [ ] Review POSIX group termination, cancellation and cleanup; test descendant behavior, large output,
  hung tools, campaign expiry between build/test and interruption during checkpoint writes.
- [ ] Independently verify manifest provenance and input commitments before execution; compare actual
  tool binaries/versions, seed and delivered script digests against the trusted record.
- [ ] Replay the Node suite and both campaigns offline in an operator-controlled sandbox with quotas;
  inspect raw diagnostics for every kill/exclusion and verify witness logs, baseline validity and counts.
- [ ] Evaluate model independence and the adequacy of exact refusal/state assertions; seek additional
  defects outside the six public hypotheses using a separately precommitted held-out set.
- [ ] Verify skill frontmatter, pinned-read completeness, caller write budgets, official checker version,
  catalog registration process and declared class-2 verification limits.
- [ ] Record reviewer identity, reviewed source revision, findings and independently reproduced evidence.
  Do not mark this checklist complete merely because author-side tests pass.
