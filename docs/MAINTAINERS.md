# Maintainer handoff

This package is proposed source, not a registered/live skill. No upstream PR was opened. No catalog
or control plane was changed. Publication to GitHub is pending an authorized destination and channel:
the assignment forbids credentials, external services and touching `.git/`, so the implementing agent
has not authenticated, committed, pushed or created a repository. A maintainer can publish the
prepared source tree/archive after choosing a repository under their control. Do not imply that
local source delivery itself is GitHub publication.

## Review and official validation

Read the code, original initial suite, manifest, preserved pilot and hashes before judging scores.
Run the README's offline commands and review `docs/REVIEW.md`. Arrange the later independent review.
Do not alter the initial evidence to make a rerun agree. A changed toolchain or fault set requires
new versioned reports. No npm/package installation is required for this project.

The authoring reference is pinned to commit
`fa541fd81326b532d315576fa113c78b67b30ca7` in
[Identity-md/identitymd-skill-crafting](https://github.com/Identity-md/identitymd-skill-crafting/tree/fa541fd81326b532d315576fa113c78b67b30ca7).
Read `skill-authoring/SKILL.md`, `skill-authoring/REFERENCE.md`, and **root** `check-skill.mjs`.
The script is not under `skill-authoring/scripts/`. The unchanged checker was available and was
executed; its command, commit, SHA-256 and actual stdout/exit status are in
`artifacts/official-checker.json`. It validates format, not runner safety or mutation accuracy.

For maintainer validation with network access permitted separately from offline campaign execution:

```sh
MTQ_CHECKER_DIR=$(mktemp -d /tmp/mtq-checker.XXXXXX)
curl --fail --location \
  https://raw.githubusercontent.com/Identity-md/identitymd-skill-crafting/fa541fd81326b532d315576fa113c78b67b30ca7/check-skill.mjs \
  --output "$MTQ_CHECKER_DIR/check-skill.mjs"
sha256sum "$MTQ_CHECKER_DIR/check-skill.mjs"
node "$MTQ_CHECKER_DIR/check-skill.mjs" measure-test-quality
```

Compare the hash against `artifacts/official-checker.json`. Run the downloaded checker unchanged;
if unavailable, record official validation as pending and retain the failure. It is intentionally
not fetched during a build, test, campaign or skill invocation. This project does not redistribute
the upstream checker or depend on its repository at runtime.

## Publish and merge

The maintainer owns repository selection, permission to publish and GitHub authentication. Publish
ordinary source files, benchmark, manifests, schemas, docs and evidence. Exclude generated `out/`,
`cache/`, scratch work, credentials and tool caches. Do not introduce submodules or dependency
fetching. Use the maintainer's normal authenticated Git workflow outside this bounded assignment;
retain the resulting public URL and source commit in a follow-up publication record.

For the target IMD catalog, prepare a human-reviewed change containing `skills/measure-test-quality/`
with SKILL.md, REFERENCE.md and scripts. Tests stay in the authoring repository; only non-test `.mjs`
files travel. Add a row describing the distinction from write-foundry-tests and adversarial-review.
Use the real target repository's existing catalog commands: `pnpm skills:generate`, then
`pnpm skills:check` and its control-plane skill tests. Commit the generated catalog alongside the
source. These are maintainer integration steps in that repository, not commands or dependencies
provided by this standalone project. Inspect the generated pinned read to ensure every imported
module and the schema travels. Keep the version at 1 for initial release; bump it on later guidance
changes. Do not modify the judge or fabricate a verifier profile to imply full replay.

After independent review and approval, the maintainer merges through the target repository's normal
process. A catalog merge alone does not make a skill live: an authorized operator must rebuild and
deploy the control plane with the generated catalog. Confirm skill discovery and a dry run under
both Codex and Claude Code, pinned-read digests and the scoped write budget. Record the catalog
revision and deployed revision. This handoff neither authorizes nor performs that deployment.

## Independent verifier integration and operations

Ordinary network Foundry checks do not run the Node campaign. An operator must implement and review
a separate full-replay job, pin runner/manifest/toolchain and baseline hashes, enforce offline OS
network/process/filesystem limits, run Node tests and both campaigns, validate JSON against trusted
bytes and compare every outcome. Preserve all diagnostics including partial and rejected runs.
Only the operator may integrate a supported verifier profile; no such profile is claimed here.
Resource defaults are 32 mutants, 30 seconds per process and 300 seconds per campaign, with hard
maxima 120/600 seconds. Monitor temporary disk usage and cleanup after externally killed jobs.
Review permissions, tool upgrades, provenance retention and held-out sets as operational duties.
There are no chain deployment settings, private keys, funds, administrative roles or broadcasts.
