# Changelog

## [1.0.0](https://github.com/dkarter/merge-train-action/compare/v0.1.0...v1.0.0) (2026-03-20)


### ⚠ BREAKING CHANGES

* action input github-token is removed; set required input token instead.

### Features

* add bot commit helper for agent branches ([b3fe124](https://github.com/dkarter/merge-train-action/commit/b3fe1243462ad49bdd893fec3cd3a6c6230ae551))
* add configurable PR label trigger eligibility ([991f075](https://github.com/dkarter/merge-train-action/commit/991f0754239be874eadc0b1361931fce0a202b10))
* add merge train PR status comment lifecycle ([558cc94](https://github.com/dkarter/merge-train-action/commit/558cc9444d6f72a41cda2b03c033f58964f2cab3))
* add one-time failed check rerun gate ([5c383c6](https://github.com/dkarter/merge-train-action/commit/5c383c6c759be8d7ece90712654ced39b574ab5a))
* add pause/resume controls for merge train ([328b2d3](https://github.com/dkarter/merge-train-action/commit/328b2d3da89d9ec09f7d7bffb6dccf76eaa391a2))
* add safe-commit fallback for signing failures ([fa18708](https://github.com/dkarter/merge-train-action/commit/fa18708d590fde730601959d7116424eac393142))
* add trust policy gates for merge-train runs ([53f43f8](https://github.com/dkarter/merge-train-action/commit/53f43f8dd190d2d11ea9f8b63580c415021f9e45))
* consolidate token input and bump Node LTS to 24 ([161b934](https://github.com/dkarter/merge-train-action/commit/161b934af046d615feb0d7fe2db56eba01bd1ddc))
* enforce PR quality gates and review checklist ([311130d](https://github.com/dkarter/merge-train-action/commit/311130dd6e38b266f39c02e6632a162a67572de4))
* harden merge idempotency and race handling ([cb66c2f](https://github.com/dkarter/merge-train-action/commit/cb66c2f154bbf2feb61ec2a39fc229e96247688d))
* **merge-train:** add retrigger checkbox in status comment for blocked PRs ([8f6b5a8](https://github.com/dkarter/merge-train-action/commit/8f6b5a803b9d9f94e50f143c452e030f62ba496c))
* **merge-train:** auto-delete source branch after merge ([700a7fe](https://github.com/dkarter/merge-train-action/commit/700a7fea8271533f9235e007c82a8730db0fcaf4))
* orchestrate safe PR update and merge flow ([7c987d4](https://github.com/dkarter/merge-train-action/commit/7c987d4af9f84515c7a6339941c9f89f5bd4e0ca))
* **release:** configure release-please automation ([f55a3d3](https://github.com/dkarter/merge-train-action/commit/f55a3d37cb2c110c4f7ead7c46bcfb6cce83c5c5))
* **tooling:** add lefthook hooks and staged gitleaks scan ([3a687c2](https://github.com/dkarter/merge-train-action/commit/3a687c200efcc82c386bad706565e97885c06736))


### Bug Fixes

* avoid duplicate status comments on transient update misses ([6e7063c](https://github.com/dkarter/merge-train-action/commit/6e7063c23b4d2264da1a6a5ffd78feaee3d13db7))
* **ci:** pin release-please action and prefer release token ([45d7fd4](https://github.com/dkarter/merge-train-action/commit/45d7fd44fece5fc065a963b95e08dd8f09120f82))
* **ci:** restore release PR permissions and gitleaks git history ([ee09fea](https://github.com/dkarter/merge-train-action/commit/ee09feadcd1dc282aa3ac031a6ad1737052cddf3))
* **ci:** run test script in workflow and refresh core actions ([1eaea13](https://github.com/dkarter/merge-train-action/commit/1eaea134c1f86e7c850087672b41dacf71aeda20))
* **ci:** simplify stable major tag workflow condition ([86b1a2b](https://github.com/dkarter/merge-train-action/commit/86b1a2be56201012a363640a870121099fb61bfc))
* **ci:** stabilize dist validation gate ([65f7dc2](https://github.com/dkarter/merge-train-action/commit/65f7dc29d3f9f614423fdf820e251a27a180c7a6))
* deduplicate status comments for PAT-authored runs ([8e0a38d](https://github.com/dkarter/merge-train-action/commit/8e0a38d988cbb27a5f12ba5325f36d4394907ce8))
* fallback reruns for GitHub Actions checks ([f39ec9b](https://github.com/dkarter/merge-train-action/commit/f39ec9b6152d48b524da028f5440b0928c2905dc))
* stabilize vitest mocks and add agent harness ([0caf74e](https://github.com/dkarter/merge-train-action/commit/0caf74e3e8c60dc86a927c042e677fe52bd87407))
* **status-comment:** avoid recreating marker after 404 updates ([cc12c27](https://github.com/dkarter/merge-train-action/commit/cc12c27078899bb543292425e4ba92cff607c55d))
* **status-comment:** dedupe marker comment upserts ([a3fc344](https://github.com/dkarter/merge-train-action/commit/a3fc34427c633c5bba436117187fcaeb91a299f6))
* **status-comment:** handle eventual consistency after 404 updates ([c3670e8](https://github.com/dkarter/merge-train-action/commit/c3670e82ff3e0dc1b745d7fc3d8c00270aa33083))
* **status-comment:** reconcile duplicates after direct updates ([9801b61](https://github.com/dkarter/merge-train-action/commit/9801b6169b93b6d6820a11e849241e4b26afe6a6))
* **status-comment:** satisfy lint on paginated comment scan ([88b4901](https://github.com/dkarter/merge-train-action/commit/88b4901942df7fbd5bb3d3b26fc843dbd5266cc3))
* track required checks on updated head sha ([aa65893](https://github.com/dkarter/merge-train-action/commit/aa65893aedb79e45d52ce084399ea4636b7f6109))
* update one status comment across lifecycle phases ([3696589](https://github.com/dkarter/merge-train-action/commit/3696589e463eef5fffdcd9bfae11c729063c0dba))
