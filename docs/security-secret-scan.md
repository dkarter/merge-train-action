# RMS-52 Secret Scan Report

- Scan date/time (UTC): 2026-03-20T03:56:21Z
- Repository: `merge-train-action`

## Commands Used

```bash
bun run secrets:scan
gitleaks dir . --redact --no-banner
```

## Result Summary

- `gitleaks git` (history scan): no leaks found.
- `gitleaks dir` (working tree scan): no leaks found.
- Overall status: no potential secrets detected by this scan.
