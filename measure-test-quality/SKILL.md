---
id: measure-test-quality
version: 1
description: Measure Foundry tests with a bounded and provenance-pinned mutation campaign, preserve their misses, and add tests that expose concrete behavioral defects.
role: tests
kind: code
judge: verifier-paths
checks: none
requires:
variables:
  - objective
objective: "{{objective}}"
acceptanceCriteria:
  - artifacts/test-quality/measurement.json validates with the pinned scripts/validate.mjs and records baseline validity, tool versions, hashes, per-mutation execution evidence, exclusions and the score denominator
  - artifacts/test-quality/report.md preserves initial misses and concrete counterexamples, compares the final campaign, and states all incomplete checks and verification limits
  - Honest production source and original tests retain their initial hashes and every claimed kill has a successful compile and a relevant failing assertion
  - New tests under test/quality pass on honest production code and the report includes exact offline reproduction commands for both campaigns
writes:
  - test/quality/**
  - artifacts/test-quality/**
mustProduce:
  - artifacts/test-quality/measurement.json
  - artifacts/test-quality/report.md
reads:
  - skill:measure-test-quality
---

Measure the objective using the self-contained guide and tools at
`.imd/reads/skills/measure-test-quality/REFERENCE.md` and `scripts/*.mjs`.
This package works under Codex and Claude Code with the same commands.

1. Read the objective's project path, manifest provenance and test selection. Open the pinned
   reference, then confirm the installed offline toolchain before starting a campaign.
2. Freeze the source, existing tests, manifest, seed and tool identity. Run the honest baseline
   first and retain its evidence. A failing or empty baseline invalidates measurement.
3. Run the bounded initial campaign in temporary copies. Preserve its files and any misses.
   Add tests only within the granted paths, using caller-visible counterexamples and an
   independent model where useful. Run the final campaign against unchanged production code.
4. Validate and compare the reports. Explain each exclusion, surviving defect and uncompleted
   step in the final account. Report counts and denominator, not only a percentage.

**Keep the original evidence.** Do not weaken an assertion, edit production code, rewrite initial
measurements, or revise the manifest to improve a score. Changed provenance starts a new campaign.
The manifest fixes relevant test signatures; use the guide's assertion convention and retain
ordinary revert failures as unresolved when the runner cannot attribute an assertion.

**Measure the stated mutations.** Public author-written mutants are demonstrations, not an
independent evaluation. This complements write-foundry-tests by measuring fault detection and
adversarial-review by finding missing test oracles; it replaces neither test design nor review.

**State the verification boundary.** This skill uses verifier-paths with checks none. Local
campaigns are self-reported evidence. Ordinary network Foundry checks do not replay the Node
campaign. No security guarantee, class-1 mutation verification, or separate reviewer is implied.

**Finish within the assignment.** There are no background jobs or live guidance fetches. If a tool,
permission or baseline prevents completion, preserve partial evidence and name the precise failure;
do not fill missing measurements with estimates. The skill grants no tools or network access.
