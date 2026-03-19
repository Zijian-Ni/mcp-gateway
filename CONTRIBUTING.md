# Contributing to mcp-gateway

Thank you for your interest in contributing! This document outlines the contribution process and standards.

## Code of Conduct

This project adheres to the [Contributor Covenant v2.1](CODE_OF_CONDUCT.md). By participating, you agree to uphold this code. Please report unacceptable behavior via GitHub.

## Ways to Contribute

- 🐛 **Bug Reports** — Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md)
- ✨ **Feature Requests** — Use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.md)
- 📝 **Documentation** — Fix typos, improve explanations, add examples
- 🔧 **Code** — Bug fixes, new features, test coverage improvements

## Development Setup

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9

### Clone & Install

```bash
git clone https://github.com/Zijian-Ni/mcp-gateway.git
cd mcp-gateway
npm install
```

### Build

```bash
npm run build       # Compile TypeScript
npm run build:watch # Watch mode
```

### Test

```bash
npm test                # Run all tests
npm run test:watch      # Watch mode
npm run test:coverage   # With coverage report
```

### Lint & Type Check

```bash
npm run lint        # ESLint
npm run lint:fix    # ESLint with auto-fix
npm run typecheck   # TypeScript type checking
```

## Pull Request Process

1. **Fork** the repository
2. **Create a branch** from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   # or
   git checkout -b fix/issue-description
   ```
3. **Make your changes** following the code style guidelines below
4. **Add or update tests** for your changes
5. **Run the full test suite**: `npm test`
6. **Run lint and typecheck**: `npm run lint && npm run typecheck`
7. **Commit** using [Conventional Commits](https://www.conventionalcommits.org/):
   ```
   feat: add WebSocket transport adapter
   fix: correct token bucket refill calculation
   docs: add programmatic usage examples
   test: improve cache LRU eviction coverage
   chore: update dependencies
   ```
8. **Push** your branch and open a **Pull Request**
9. Fill in the [pull request template](.github/PULL_REQUEST_TEMPLATE.md)

## Branch Naming

| Type | Pattern | Example |
|------|---------|---------|
| Feature | `feat/<description>` | `feat/websocket-transport` |
| Bug fix | `fix/<description>` | `fix/rate-limiter-overflow` |
| Documentation | `docs/<description>` | `docs/api-reference` |
| Refactor | `refactor/<description>` | `refactor/router-internals` |
| Tests | `test/<description>` | `test/gateway-integration` |

## Code Style Guidelines

### TypeScript

- Use **strict TypeScript** (no `any` unless absolutely necessary)
- Prefer `interface` over `type` for object shapes
- Explicit return types on public methods
- Use `readonly` where applicable
- No unused variables or imports

### File Organization

- One class/module per file
- Tests alongside source in `src/__tests__/`
- Export public API from `src/index.ts`

### Documentation

- JSDoc comments on all public methods and classes
- Include parameter descriptions and return types
- Add examples for complex functionality

### Error Handling

- Never swallow errors silently — log them
- Throw descriptive `Error` objects with context
- Handle `Promise` rejections

## Testing Guidelines

- Write tests for all new functionality
- Target ≥80% code coverage for new code
- Test edge cases and error paths
- Use `vi.useFakeTimers()` for time-sensitive tests
- Clean up resources (databases, files) in `afterEach`

## Reporting Bugs

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md). Include:

- Clear description of the bug
- Steps to reproduce
- Expected vs actual behavior
- Node.js version, OS
- Relevant config (sanitize secrets!)

## Suggesting Features

Use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.md). Include:

- Problem the feature solves
- Proposed solution
- Alternatives considered
- Whether you'd be willing to implement it

## Commit Signing

We encourage (but don't require) signing your commits with GPG.

## Licensing

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

---

Thank you for helping make mcp-gateway better! 🎉
