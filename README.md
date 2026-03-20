# merge-train-action

Reusable GitHub Action for safely updating and merging labeled pull requests.

## Status

This repository is bootstrapped with a production-ready TypeScript-based JavaScript action foundation:

- Node 24 action runtime (`action.yml`)
- TypeScript source in `src/` bundled to committed `dist/` output
- Lint, format, and unit tests wired for local development and CI
- Safe PR branch update via GitHub `update-branch` semantics (no rebase/force-push)
- Merge orchestration that waits for required checks/check runs before merging

## Usage

### Install and wire the workflow

1. Copy this workflow to `.github/workflows/merge-train.yml` in your repository.
2. Replace `your-org/merge-train-action@v1` with your published action reference.
3. Keep branch protection enabled for the base branch so required checks gate merge.
4. Apply the merge-train label (`ready-to-merge` by default) to eligible pull requests.

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
      issues: write
      checks: write
      statuses: read
    steps:
      - uses: actions/checkout@v4
      - name: Run merge train action
        uses: your-org/merge-train-action@v1
        with:
          token: ${{ github.token }}
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
      issues: write
      checks: write
      statuses: read
    steps:
      - uses: actions/checkout@v4
      - name: Run merge train action
        uses: your-org/merge-train-action@v1
        with:
          token: ${{ github.token }}
          label-name: ship-it
          wait-timeout-seconds: '600'
          poll-interval-seconds: '15'
          rerun-failed-checks: 'false' # optional, defaults to true
          pause: 'false' # optional, defaults to false
          pause-reason: '' # optional, logged when pause=true
```

### Pause and resume controls

Use `pause: 'true'` to force a safe no-op run (no branch update, no rerun request, no merge attempt).

```yaml
with:
  token: ${{ github.token }}
  label-name: ready-to-merge
  pause: 'true'
  pause-reason: 'maintenance window: GitHub incident #1234'
```

When paused, the action logs an explicit pause message and returns output `status: noop`.

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
- `pause: 'true'` always returns clean `noop` and skips all update/merge side effects.
- PRs that lose the merge-train label during execution return clean `noop`.
- Head SHA changes detected before merge restart the check loop to avoid stale merges.
- Failed checks trigger at most one rerun attempt when `rerun-failed-checks` is enabled.
- Action returns `blocked` with failing check names if checks are still failing.
- Successful merge returns `merged`.

Output `status` values: `merged`, `blocked`, `noop`.

### Migration note (`github-token` -> `token`)

- The action now accepts a single required auth input: `token`.
- Replace any existing `with.github-token` usage with `with.token`.
- No fallback to `GITHUB_TOKEN` env var is applied by the action; pass `token` explicitly.

### PR status comment lifecycle

For every eligible run, the action creates or updates a single bot comment on the PR and reuses it across reruns. The comment explicitly names the target base branch and tracks merge-train progress.

Sample comment format:

```markdown
## Merge Train Status: Waiting for CI / required checks

Pull request #42 is in the merge train for base branch `main`.
This PR will be automatically updated/rebased as needed and merged when the required checks are green.

<details>
<summary>Progress context</summary>

- Target base branch: `main`
- Merge-train label: `ready-to-merge`
- Current phase: **Waiting for CI / required checks**
- Current context: Waiting for required checks on `abc123` for base branch `main`.

### Lifecycle

- [x] Waiting for CI / required checks
- [ ] Updating / rebasing branch
- [ ] Merging
- [ ] Merged
</details>
```

The same comment is updated as the run transitions through:

- Waiting for CI/required checks
- Updating/rebasing branch
- Merging
- Merged
- Blocked (for example, failed required checks)

## Troubleshooting

### `status=blocked` with failing checks

Symptoms:

- Logs show `required checks still failing`.
- Action output is `status: blocked`.

What to do:

1. Open the PR checks tab and fix the failing required checks.
2. Re-run CI if needed (the action requests only one rerun for failed required check-runs when enabled).
3. Push a fix commit or retrigger with a `synchronize` event.

### Action does nothing (`status=noop`)

Symptoms:

- Logs indicate pull request is closed, already merged, not mergeable, paused, or missing label.

What to do:

1. Confirm the PR has the configured label (default `ready-to-merge`).
2. Confirm workflow is triggered on `pull_request` events including `labeled` and `synchronize`.
3. If `pause: 'true'` is configured, set `pause: 'false'` (or remove pause inputs).

### Branch update does not happen

Symptoms:

- PR stays behind base branch.
- Logs show permission or update-branch failure.

What to do:

1. Verify workflow job permissions include `pull-requests: write` and `contents: write`.
2. Ensure branch protection allows GitHub's update-branch operation.
3. Re-run after permissions are corrected.

### Permission errors when rerunning failed checks

Symptoms:

- Logs show the action cannot request check-rerun.

What to do:

1. Keep `rerun-failed-checks: 'false'` if you do not want rerun behavior.
2. Otherwise grant `checks: write` to the job permissions.

## Operational Playbook

- Planned maintenance window: set `pause: 'true'` and provide `pause-reason` in workflow configuration.
- Incident response: set `pause: 'true'` immediately to prevent any merge-train mutations while triaging.
- Resume: set `pause: 'false'` (or remove pause inputs) to restore normal deterministic processing.
- Verification after resume: trigger a labeled PR event (`synchronize` or `labeled`) and confirm action logs show normal transition flow.

## Permissions and Safety

Use the minimum job permissions below for this action:

- `contents: write` to create the merge commit when GitHub accepts merge.
- `pull-requests: write` to read PR state, update branch, and call merge API.
- `issues: write` to create/update the PR status lifecycle comment.
- `checks: write` when `rerun-failed-checks` is enabled (default) so the action can request one failed-check rerun.
- `checks: read` is sufficient only when `rerun-failed-checks: 'false'`.
- `statuses: read` to evaluate required status contexts.

Token guidance:

- `github.token` usually works for same-repository PR flows when the workflow job permissions above are granted.
- For cross-repository or restricted environments, pass a fine-grained PAT via `with.token`.
- Fine-grained PAT should include repository permissions: Contents (Read and write), Pull requests (Read and write), Issues (Read and write), Commit statuses (Read), and Checks (Read and write when `rerun-failed-checks` is enabled).

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

This set enforces linting, formatting, tests, action bundle validation, and lightweight security scanning on every PR.

`build-dist` validation details:

- CI still runs `bun run package` to ensure bundling succeeds.
- CI then runs `bun run dist:check`, which verifies required `dist/` artifacts exist, are non-empty, and packaging did not modify tracked files outside `dist/`.
- We intentionally avoid strict byte-for-byte `git diff` checks for `dist/index.js` because `ncc` module-id numbering can vary across environments/reruns without changing runtime behavior.

Security gate details:

- `bun run audit` executes `npm audit --audit-level=critical` (CI-friendly dependency gate).
- `security` job also runs gitleaks to detect committed secrets.

## Local Development

This repository is Bun-first for local development and CI commands.

- Use `bun run ...` for all documented local tasks.
- Use `task ci:*` aliases only as optional wrappers around Bun commands.
- Node 24 is required because GitHub Actions executes published JavaScript actions on the Node runtime defined in `action.yml` (`runs.using: node24`).

Install toolchain and dependencies:

```bash
mise install
bun install
```

`mise` postinstall runs `lefthook install`, so git hooks are installed automatically when tool setup runs. If you need to reinstall hooks manually, run:

```bash
lefthook install
```

Run local checks:

```bash
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

Release operator runbook:

- See `docs/release-runbook.md` for step-by-step release creation, validation, and stable tag verification.
