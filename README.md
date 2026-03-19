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
    permissions:
      contents: write
      pull-requests: write
      checks: read
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
    permissions:
      contents: write
      pull-requests: write
      checks: read
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
- Failed checks trigger at most one rerun attempt when `rerun-failed-checks` is enabled.
- Action returns `blocked` with failing check names if checks are still failing.
- Successful merge returns `merged`.

Output `status` values: `merged`, `blocked`, `noop`.

## Local Development

```bash
bun install
bun run lint
bun run format:check
bun test
bun run package
```

Optional task aliases are also available:

```bash
task ci:lint
task ci:format:check
task ci:test
task ci:package
```

## Release Strategy

Use immutable semantic tags for each release (for example `v1.2.0`) and maintain a stable major tag (`v1`) that points to the latest compatible `v1.x.x` release.

Typical release flow:

1. Update `dist/` with `bun run package` and commit source + bundle.
2. Create and push a version tag like `v1.0.0`.
3. Move the stable major tag to the same commit: `git tag -fa v1 -m "v1" && git push origin v1 --force-with-lease`.

Consumers should reference `@v1` for stable updates and pin full tags when strict reproducibility is required.
