## Summary

Describe what changed and why.

## Quality Checks (Author)

- [ ] `bun run lint`
- [ ] `bun run format:check`
- [ ] `bun test`
- [ ] `bun run package`
- [ ] `bun run dist:check`
- [ ] `bun run audit`
- [ ] `bun run secrets:scan`

## Security Notes

- [ ] No secrets or tokens added
- [ ] Dependency changes reviewed for risk

## Reviewer Confirmation

- [ ] Required CI checks passed (`lint`, `format`, `test`, `build-dist`, `security`)
- [ ] Security checks reviewed (`bun run audit` + gitleaks)
- [ ] `dist` validation gate is green (`bun run package` + `bun run dist:check`)
- [ ] Change is safe to merge under branch protection rules
