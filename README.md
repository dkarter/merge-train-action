# merge-train-action

Reusable GitHub Action for safely updating and merging labeled pull requests.

## Status

This repository is bootstrapped with a production-ready TypeScript-based JavaScript action foundation:

- Node 20 action runtime (`action.yml`)
- TypeScript source in `src/` bundled to committed `dist/` output
- Lint, format, and unit tests wired for local development and CI
- Safe PR branch update via GitHub `update-branch` semantics (no rebase/force-push)
- Merge orchestration that waits for required checks/check runs before merging

## Usage

### Default label (`ready-to-merge`)

```yaml
name: Merge Train

on:
  pull_request:
    types: [opened, reopened, synchronize, labeled]

jobs:
  merge-train:
    runs-on: ubuntu-latest
    concurrency:
      group: merge-train-${{ github.repository }}-${{ github.event.pull_request.number }}-${{ github.event.pull_request.head.ref }}
      cancel-in-progress: true
    permissions:
      contents: write
      pull-requests: write
      checks: write
      statuses: read
    steps:
      - uses: actions/checkout@v4
      - name: Run merge train action
        uses: your-org/merge-train-action@v1
        with:
          github-token: ${{ github.token }}
          label-name: ready-to-merge
```

### Custom label

```yaml
name: Merge Train (Custom Label)

on:
  pull_request:
    types: [opened, reopened, synchronize, labeled]

jobs:
  merge-train:
    runs-on: ubuntu-latest
    concurrency:
      group: merge-train-${{ github.repository }}-${{ github.event.pull_request.number }}-${{ github.event.pull_request.head.ref }}
      cancel-in-progress: true
    permissions:
      contents: write
      pull-requests: write
      checks: write
      statuses: read
    steps:
      - uses: actions/checkout@v4
      - name: Run merge train action
        uses: your-org/merge-train-action@v1
        with:
          github-token: ${{ github.token }}
          label-name: ship-it
          wait-timeout-seconds: '600'
          poll-interval-seconds: '15'
          rerun-failed-checks: 'false' # optional, defaults to true
```

The action is eligible when:

- the pull request payload already contains `label-name`
- a `pull_request` `labeled` event adds `label-name`

For eligible pull requests the action orchestrates:

1. Fetch current PR state.
2. If PR is behind base, call GitHub Update Branch API equivalent to preserve review approvals.
3. Read required branch protection checks.
4. Poll required status contexts and check runs until success/failure/timeout.
5. If required check-runs fail and rerun is enabled, request one rerun attempt.
6. Merge only when checks are green and PR is mergeable.

Deterministic behavior:

- Closed, merged, or not-mergeable PRs return clean `noop` with logs.
- PRs that lose the merge-train label during execution return clean `noop`.
- Head SHA changes detected before merge restart the check loop to avoid stale merges.
- Failed checks trigger at most one rerun attempt when `rerun-failed-checks` is enabled.
- Action returns `blocked` with failing check names if checks are still failing.
- Successful merge returns `merged`.

Output `status` values: `merged`, `blocked`, `noop`.

## Permissions and Safety

Use the minimum job permissions below for this action:

- `contents: write` to create the merge commit when GitHub accepts merge.
- `pull-requests: write` to read PR state, update branch, and call merge API.
- `checks: write` when `rerun-failed-checks` is enabled (default) so the action can request one failed-check rerun.
- `checks: read` is sufficient only when `rerun-failed-checks: 'false'`.
- `statuses: read` to evaluate required status contexts.

Safety guardrails in this action:

- Uses optimistic SHA merge (`pulls.merge` with `sha`) to prevent stale-head merges.
- Re-checks PR state and label before merge; exits `noop` if state changed.
- Treats already-merged/closed or otherwise non-actionable PRs as idempotent no-op outcomes.
- Failed checks can rerun once when enabled; no repeated rerun loops.

## Branch Protection (Required)

To enforce merge quality gates, configure branch protection for your default branch with these settings:

- Require a pull request before merging.
- Require approvals (at least 1) and dismiss stale approvals when new commits are pushed.
- Require status checks to pass before merging.
- Require branches to be up to date before merging.

Required CI checks from this repository's `CI` workflow:

- `lint`
- `format`
- `test`
- `build-dist`
- `security`

This set enforces linting, formatting, tests, action bundle + committed `dist/` freshness, and lightweight security scanning on every PR.

Security gate details:

- `bun run audit` executes `npm audit --audit-level=critical` (CI-friendly dependency gate).
- `security` job also runs gitleaks to detect committed secrets.

## Local Development

```bash
bun install
bun run lint
bun run format:check
bun test
bun run package
bun run dist:check
bun run audit
bun run secrets:scan
```

Optional task aliases are also available:

```bash
task ci:lint
task ci:format:check
task ci:test
task ci:package
task ci:dist:check
task ci:audit
task ci:secrets:scan
task ci:security
task ci:all
```

## Release Strategy

Releases are automated with `release-please` from conventional commits merged into `main`.

Release behavior:

1. A push to `main` triggers `.github/workflows/release-please.yml`.
2. `release-please` opens or updates a release PR that batches unreleased conventional commits.
3. Merging the release PR creates a GitHub Release, a changelog update, and an immutable semantic tag (for example `v1.2.0`).

Tagging strategy:

- Immutable semver tags (`vX.Y.Z`) are the source of truth for each release.
- Stable major tag `v1` is automatically force-updated to the latest `v1.x.x` release commit.
- Consumers should use `@v1` for stable updates and pin full tags for strict reproducibility.
