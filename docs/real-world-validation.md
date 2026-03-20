# RMS-26 Real-World Validation

Date: 2026-03-20

## Target Repository Setup

- Sandbox repository: `https://github.com/dkarter/merge-train-sandbox`
- Action install: `.github/workflows/merge-train.yml` uses `dkarter/merge-train-action@main`
- Required checks configured on `main` branch protection:
  - `lightweight-ci`
  - `strict: true` (branch must be up to date)
- Lightweight CI check implemented in `.github/workflows/ci.yml` with `.ci-mode` control:
  - `pass`
  - `flaky` (fails first attempt, passes on rerun)
  - `fail`

## Scenario Matrix

| Scenario                                  | PR                                                    | Outcome             | Evidence                                                                                                                                                                 |
| ----------------------------------------- | ----------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Label already present on PR               | https://github.com/dkarter/merge-train-sandbox/pull/1 | Merged              | CI: https://github.com/dkarter/merge-train-sandbox/actions/runs/23304041063, Merge Train: https://github.com/dkarter/merge-train-sandbox/actions/runs/23304041050        |
| Label added after PR creation             | https://github.com/dkarter/merge-train-sandbox/pull/2 | Merged              | CI: https://github.com/dkarter/merge-train-sandbox/actions/runs/23327313677, Merge Train: https://github.com/dkarter/merge-train-sandbox/actions/runs/23327313744        |
| Failing checks then rerun once success    | https://github.com/dkarter/merge-train-sandbox/pull/4 | Blocked (defect)    | CI failed: https://github.com/dkarter/merge-train-sandbox/actions/runs/23327622587, Merge Train: https://github.com/dkarter/merge-train-sandbox/actions/runs/23327622582 |
| Failing checks remain failing after rerun | https://github.com/dkarter/merge-train-sandbox/pull/5 | Blocked as expected | CI failed: https://github.com/dkarter/merge-train-sandbox/actions/runs/23327909528, Merge Train: https://github.com/dkarter/merge-train-sandbox/actions/runs/23327909530 |

## Defect Found

### Defect

- When required checks are GitHub Actions check-runs, `checks.rerequestRun` returns:
  - `422: This check run is not rerequestable`
- This prevents automatic one-time rerun and blocks PRs that should recover on rerun.

### Evidence

- Scenario 3 merge-train log:
  - `Transition: skipped rerun for check-runs [67852173939 (422:This check run is not rerequestable ...)]`
  - `Transition: Blocked: required checks still failing after one-time rerun [lightweight-ci].`
- Scenario 4 merge-train log:
  - `Transition: skipped rerun for check-runs [67853009889 (422:This check run is not rerequestable ...)]`
  - `Transition: Blocked: required checks still failing after one-time rerun [lightweight-ci].`

### Fix Implemented In This Repository

- Added fallback rerun path in `src/github-client.ts`:
  - If `checks.rerequestRun` returns `422`, fetch check-run details.
  - Parse workflow run ID from `details_url`.
  - Call `actions.reRunWorkflowFailedJobs` once per workflow run.
- Added tests in `test/github-client.test.ts`:
  - Native rerequest path.
  - `422` fallback to workflow failed-jobs rerun path.
- Updated `README.md` permissions guidance:
  - `checks: write` required when `rerun-failed-checks` is enabled.

## Notes

- Scenario 3 is blocked on `@main` until this defect fix is released from this repository.

---

# RMS-61 Real-World Validation

Date: 2026-03-20

## Feature: Auto-delete source branch after merge

### Implementation Summary

Added new action input `auto-delete-source-branch` (default: `false`) that, when enabled:

1. After successful merge, announces planned deletion in status comment
2. Performs safety checks before deletion:
   - Same-repository branch (not fork)
   - Branch still exists
   - Token has permission (push/admin/maintain)
3. Announces deletion start in status comment
4. Attempts deletion via GitHub `deleteRef` API
5. Updates status comment with final state: `deleted successfully`, `skipped (reason)`, or `failed (reason)`

### Files Changed

- `action.yml`: Added `auto-delete-source-branch` input
- `src/main.ts`: Added input parsing and pass-through
- `src/merge-train.ts`: Added branch deletion workflow with status comment lifecycle
- `src/github-client.ts`: Added `canDeleteBranch`, `branchExists`, `deleteBranch` methods
- `test/main.test.ts`: Added test for input passthrough
- `test/merge-train.test.ts`: Added 3 tests: success, skipped (permission), failed (API error)
- `README.md`: Added documentation with security caveats

### Security Caveats (documented in README)

- Deletion is attempted only for same-repository PR heads (fork branches are skipped)
- Deletion is skipped when the head ref no longer exists
- Deletion is skipped when token repository permissions do not include push/admin/maintain
- Deletion can still fail (e.g., protected/default branch restrictions); failure reason is written to PR status comment

### Sandbox Validation Steps

To validate in sandbox:

1. Update `.github/workflows/merge-train.yml` in `dkarter/merge-train-sandbox` to use this branch:
   ```yaml
   uses: dkarter/merge-train-action@rms-61-auto-delete
   ```
2. Add `auto-delete-source-branch: 'true'` input to the workflow
3. Create a test PR with a fresh branch (e.g., `test/rms-61-delete`)
4. Apply the merge-train label (`ready-to-merge`)
5. Wait for merge to complete
6. Verify status comment shows:
   - "Source branch auto-delete is enabled; planning deletion for `test/rms-61-delete`."
   - "Source branch deletion is starting for `test/rms-61-delete`."
   - "Source branch deletion state: deleted successfully (`test/rms-61-delete`)."
7. Verify branch is deleted in repo branches list

### Test Evidence

Unit tests verify:

- Branch deletion succeeds when all safety checks pass
- Deletion is skipped when token lacks permission
- Deletion fails gracefully when GitHub API rejects the delete
- Status comment is updated at each lifecycle phase
