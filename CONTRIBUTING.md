# Contributing

Thanks for contributing to `merge-train-action`.

## Prerequisites

- Node.js 20 (configured via `mise.toml`)
- Bun

## Setup

```bash
bun install
```

## Development Checks

Run all local checks before opening a pull request:

```bash
bun run ci
```

Equivalent task alias:

```bash
task ci:all
```

If source changes affect runtime behavior, refresh the action bundle and include updated `dist/` in your commit:

```bash
bun run package
```

## Pull Request and Reviewer Expectations

- Use the PR template checklist and complete the author items before requesting review.
- Reviewers should explicitly confirm the quality/security checklist in the PR:
  - required CI checks pass (`lint`, `format`, `test`, `build-dist`, `security`)
  - security scan is clean (`bun run audit` and `bun run secrets:scan` / CI gitleaks job)
  - `dist/` output is fresh for action runtime changes

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
