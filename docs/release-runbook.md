# Release Runbook

This runbook documents how to cut and verify releases for `merge-train-action`.

## Release Model

- Releases are managed by `release-please` from conventional commits merged to `main`.
- Immutable tags (`vX.Y.Z`) identify each release commit.
- Stable major tag `v1` is moved to the latest `v1.x.x` release commit.
- Consumers should normally reference `@v1`.

## Prerequisites

- `main` branch protection is enabled and required CI checks are green.
- `release-please` workflow exists at `.github/workflows/release-please.yml`.
- Repository has a token with permission to open/update release PRs (`RELEASE_PLEASE_TOKEN` or `GITHUB_TOKEN`).
- Local tools installed for verification: `bun`, `gh`, `git`.

## Standard Release Flow

1. Merge conventional-commit PRs into `main` (`feat:`, `fix:`, `chore:`, and so on).
2. Wait for the `Release Please` workflow to open or update the release PR.
3. Review release PR contents:
   - version bump is correct for commit types
   - `CHANGELOG.md` entries are accurate
   - CI checks pass
4. Merge the release PR.
5. Wait for post-merge `Release Please` workflow completion.

## Verification Checklist

Run these commands after release PR merge:

```bash
gh run list --workflow "Release Please" --branch main --limit 5
gh release view --json tagName,name,publishedAt,url
git fetch --tags
git rev-parse v1
git rev-parse "$(gh release view --json tagName --jq .tagName)"
```

Expected results:

- The newest `Release Please` workflow run is `completed` and `success`.
- GitHub Release exists for the new semver tag.
- `v1` resolves to the same commit SHA as the latest `v1.x.x` tag.

## Failure Handling

If the release workflow fails:

1. Open the failed workflow run and capture the failing step.
2. Reproduce locally where possible (`bun run ci` for quality-gate failures).
3. Ship the smallest safe fix in a new PR.
4. Merge fix PR and let release-please regenerate/update the release PR.

If the stable `v1` tag does not move:

1. Confirm release tag is `v1.x.x` (stable tag update runs only for `v1.*`).
2. Confirm `update-stable-major-tag` job ran in `release-please.yml`.
3. Verify workflow token has `contents: write`.
4. Re-run the workflow after fixing permissions.

## Local Preflight Before Merging Important Release-Related Changes

```bash
bun run ci
```

This validates lint, format, tests, dist packaging checks, audit, and secrets scanning before merge.
