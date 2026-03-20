# RMS-60 Status Comment Dedupe Validation

Date: 2026-03-20

## Scope

- Repository under test: `dkarter/merge-train-action` branch `rms-60-status-dedupe`
- Sandbox: `https://github.com/dkarter/merge-train-sandbox`
- Marker under test: `merge-train-status-comment:v1`

## What Was Validated

1. Unit-level race/concurrency behavior in `src/github-client.ts`.
2. Real sandbox behavior with pull-request events that rapidly transition (`opened` + `labeled`) and with cancel-in-progress concurrency.

## Local Regression Results

- Added and expanded regression coverage in `test/github-client.test.ts` for:
  - parallel upserts for the same PR
  - duplicate-marker cleanup selecting one authoritative comment
  - direct update-by-id path preventing duplicate creation on `404`
- Test command: `bun run test test/github-client.test.ts test/merge-train.test.ts`
- Result: pass

## Sandbox Evidence

### Baseline Reproduction (action `@main`)

- PR: `https://github.com/dkarter/merge-train-sandbox/pull/10`
- Merge-train runs:
  - `https://github.com/dkarter/merge-train-sandbox/actions/runs/23330725726` (cancelled)
  - `https://github.com/dkarter/merge-train-sandbox/actions/runs/23330727551` (success)
- Marker comment IDs observed over time:
  - `4095756864` (05:43:14Z)
  - `4095756949` (05:43:16Z)
  - `4095757034` (05:43:18Z)

### Branch/SHA Validation Runs

- PR using branch ref: `https://github.com/dkarter/merge-train-sandbox/pull/11`
- PR using pinned SHA `9033658b1ec44808c3231d0f2a80e9a82fe1eec3`: `https://github.com/dkarter/merge-train-sandbox/pull/14`
- PR using pinned SHA `c29f597520909ca4e26145faf9284b38c63c51af`: `https://github.com/dkarter/merge-train-sandbox/pull/15`

Representative run URLs:

- `https://github.com/dkarter/merge-train-sandbox/actions/runs/23330970448` (success, PR 14)
- `https://github.com/dkarter/merge-train-sandbox/actions/runs/23330968084` (cancelled, PR 14)
- `https://github.com/dkarter/merge-train-sandbox/actions/runs/23331026154` (success, PR 15)

Marker comment IDs observed on PR 15 over time:

- `4095805613` (05:57:02Z)
- `4095805670` (05:57:03Z)
- `4095806384` (05:57:15Z)
- `4095806483` (05:57:17Z)

## Findings

- Local regression tests pass for dedupe and race scenarios.
- In sandbox, rapid lifecycle runs still produce multiple marker comments in a short window, including when pinned to latest branch SHA.
- Current branch materially improves deterministic selection and duplicate cleanup behavior in the client implementation, but sandbox evidence indicates additional cross-run race hardening is still required to enforce a strict single-comment invariant under real GitHub event timing.
