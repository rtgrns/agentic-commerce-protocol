# Contributing to Agentic Commerce Protocol (ACP)

Thank you for your interest in contributing! We welcome improvements, bug fixes, and new ideas. Please read these guidelines to help maintain a high-quality, consistent, and collaborative project.

---

## Branching Model

- **main**: The stable, released branch. All production-ready code lives here.
- **feature branches**: For new features, bug fixes, or documentation updates, create a branch from `main`:
  - Name your branch descriptively, e.g., `feature/add-webhook-support` or `fix/typo-in-rfc`.
- **Pull Requests (PRs)**: All changes must be submitted via PR. Never commit directly to `main`.

## Pull Request Guidelines

- **Scope**: Keep PRs focused and minimal. Separate unrelated changes.
- **Description**: Clearly describe the problem, solution, and any context.
- **Tests**: If applicable, include or update tests/examples.
- **Review**: At least one maintainer must review and approve before merging.
- **Status Checks**: Ensure all CI checks pass before requesting review.
- **Linked Issues**: Reference any related issues or RFCs in the PR description.

## Spec Versioning & Review Process

- **Versioning**: All breaking changes or new features to the protocol/specs must increment the version (e.g., `2025-09-29` → `2025-10-01`).
- **Compatibility**: Maintain backward compatibility where possible. Document any breaking changes clearly in the changelog.
- **Review**: Major changes (especially to RFCs, OpenAPI, or JSON Schemas) require:
  - Discussion in a PR or issue
  - Approval from at least one lead maintainer (see `MAINTAINERS.md`)

## Required Updates for All Changes

Every PR **must** include, as appropriate:

- **OpenAPI / JSON Schema**: Update or add to `spec/openapi/` and `spec/json-schema/` as needed.
- **Examples**: Add or update sample requests/responses in `examples/`.
- **Changelog**: Add an entry to `changelog/unreleased.md` describing your change.
- **Documentation**: Update `README.md` or relevant RFCs if behavior or usage changes.

## Code of Conduct

- Be respectful and constructive in all communications.
- Assume good intent and work collaboratively.
- Report unacceptable behavior to the maintainers listed in `MAINTAINERS.md`.

## Getting Help

- For questions, open a GitHub Discussion or Issue.
- For urgent matters, contact a lead maintainer (see `MAINTAINERS.md`).

---

Thank you for helping make ACP better!
