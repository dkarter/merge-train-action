# AGENTS Execution Harness

This file is the persistent execution memory for agent-driven tasks in this repository.

## Required Workflow For Every Agent Task

1. Implement requested changes.
2. Run task-level validation (tests, lint, build, or targeted checks based on scope).
3. Run `/simplify` on all changed code before finalizing.
4. Apply improvements found by simplify.
5. Re-run validation for impacted areas.
6. Finalize only when validation passes.

## Pre-Merge Quality Gates (Do Not Bypass)

- Keep `.github/workflows/ci.yml` required checks intact.
- Run full local CI before merge: `bun run ci`.
- Confirm no skipped quality gates: lint, format check, test, package, dist check, audit, and secrets scan.
- Do not merge if any gate fails.

## Bot Identity Commit Path (Agent Branches)

- On worktree/feature branches, use `scripts/agent-commit.sh` when signing prompts block automation.
- Helper uses bot identity defaults (`MERGE_TRAIN_BOT_NAME`, `MERGE_TRAIN_BOT_EMAIL`) and runs `git commit --no-gpg-sign`.
- Override defaults with env vars if a repository requires specific bot attribution.
- Do not force-push protected branches.

## Post-Merge CI Verification And Remediation Loop

1. Verify the first `main` CI run after merge.
2. If any job fails, open a remediation task immediately.
3. Reproduce locally with the closest command (prefer `bun run ci`).
4. Ship the smallest safe fix with tests.
5. Re-run local CI.
6. Open follow-up PR and track to green `main`.

## PR Review Checklist

- Scope matches ticket and acceptance criteria.
- Tests cover happy path and regression path.
- New behavior is reflected in docs or runbooks if needed.
- No weakening of CI quality gates or required checks.
- Risky areas called out with rollback/remediation plan.

## Linear Update Checklist

- Move issue to the correct workflow state when work starts.
- Post implementation summary with PR link.
- Add test evidence (`bun run ci`) and notable outputs.
- Record simplify pass and any cleanup changes.
- Update final status after merge and after post-merge CI verification.
