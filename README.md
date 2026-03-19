# merge-train-action

Reusable GitHub Action for safely updating and merging labeled pull requests.

## Status

This repository is bootstrapped with a production-ready TypeScript-based JavaScript action foundation:

- Node 20 action runtime (`action.yml`)
- TypeScript source in `src/` bundled to committed `dist/` output
- Lint, format, and unit tests wired for local development and CI

## Usage

```yaml
name: Merge Train

on:
  pull_request:
    types: [labeled]

jobs:
  merge-train:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
      - name: Run merge train action
        uses: your-org/merge-train-action@v1
        with:
          label: merge-train
```

## Local Development

```bash
npm ci
npm run lint
npm run format:check
npm test
npm run package
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

1. Update `dist/` with `npm run package` and commit source + bundle.
2. Create and push a version tag like `v1.0.0`.
3. Move the stable major tag to the same commit: `git tag -fa v1 -m "v1" && git push origin v1 --force-with-lease`.

Consumers should reference `@v1` for stable updates and pin full tags when strict reproducibility is required.
