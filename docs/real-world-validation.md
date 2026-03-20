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
