# Contributing

Thanks for contributing to `merge-train-action`.

## Prerequisites

- Node.js 20 (configured via `mise.toml`)
- Bun

## Setup

```bash
bun install
```

## Development Checks

Run all local checks before opening a pull request:

```bash
bun run ci
```

If source changes affect runtime behavior, refresh the action bundle and include updated `dist/` in your commit:

```bash
bun run package
```
