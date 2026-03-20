# Contributing

Thanks for contributing to `merge-train-action`.

## Prerequisites

- Node.js 20, lefthook, and gitleaks (configured via `mise.toml`)
- Bun

## Setup

```bash
mise install
bun install
```

`mise` postinstall runs `lefthook install`, so git hooks are installed as part of tool setup. If hooks are missing, run `lefthook install` manually.

## Development Checks

Run all local checks before opening a pull request:

```bash
bun run ci
```

Equivalent task alias:

```bash
task ci:all
```

If source changes affect runtime behavior, rebuild the action bundle:

```bash
bun run package
```

`bun run dist:check` is the required dist validation gate. It confirms bundle artifacts exist and are non-empty, and that packaging does not modify tracked files outside `dist/`. It intentionally does not require strict byte-for-byte equality in `dist/index.js`, because `ncc` module-id numbering can vary across environments without changing behavior.

## Automated Releases

This repository uses `release-please` with conventional commits.

- Pushes to `main` trigger `.github/workflows/release-please.yml`.
- `release-please` keeps a single release PR updated with pending release notes and version bumps.
- Merging that release PR creates the GitHub Release, updates `CHANGELOG.md`, and creates the immutable `vX.Y.Z` tag.
- The workflow also moves the stable `v1` tag to the newest `v1.x.x` release commit.

When opening PRs, use conventional commit subjects so release-please can determine semantic version bumps correctly (for example `feat: ...`, `fix: ...`, `chore: ...`).

## Pull Request and Reviewer Expectations

- Use the PR template checklist and complete the author items before requesting review.
- Reviewers should explicitly confirm the quality/security checklist in the PR:
  - required CI checks pass (`lint`, `format`, `test`, `build-dist`, `security`)
  - security scan is clean (`bun run audit` and `bun run secrets:scan` / CI gitleaks job)
  - `dist` validation gate passes (`bun run package` + `bun run dist:check`)

## Agent Branch Commits

- On worktree/feature branches, use `scripts/safe-commit.sh` (or `bun run commit:safe`) for normal commits.
- The safe wrapper runs `git commit "$@"` first and only falls back when stderr matches signing-agent failures (for example: 1Password, GPG signing failure, pinentry, or agent refusal errors).
- Set `MERGE_TRAIN_AUTO_BOT_COMMIT=1` to auto-retry with `scripts/agent-commit.sh` when signing fails.
- Without `MERGE_TRAIN_AUTO_BOT_COMMIT=1`, the wrapper exits with the original commit error and prints exact rerun instructions.
- The helper sets bot identity defaults from `MERGE_TRAIN_BOT_NAME` and `MERGE_TRAIN_BOT_EMAIL` and commits with `--no-gpg-sign`.
- You can override either identity field with environment variables when needed for repository-specific attribution.
- Do not force-push protected branches.

## Required Branch Protection

For the default branch, enable:

- Require a pull request before merging
- Require at least 1 approval
- Dismiss stale pull request approvals when new commits are pushed
- Require status checks to pass before merging
- Require branches to be up to date before merging

Required status checks:

- `lint`
- `format`
- `test`
- `build-dist`
- `security`

## Post-Merge CI Verification Loop

After merge to `main`:

1. Verify the first `main` CI run.
2. If any job fails, open a remediation task immediately.
3. Reproduce locally (prefer `bun run ci`), ship the smallest safe fix with tests, and open a follow-up PR.
