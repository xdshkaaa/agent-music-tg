## Why

OpenSpec changes produce artifacts (proposal, design, specs, tasks) that live in the `openspec/` directory alongside code. Without automation, these artifacts must be manually staged and committed, leading to inconsistent commit messages, forgotten files, and a gap between planning artifacts and git history. Automating this eliminates friction and keeps the planning trail in sync with code.

## What Changes

- A new `openspec commit` CLI command that stages and commits all files under `openspec/changes/<name>/` with a structured commit message derived from the change name and artifact metadata.
- Integration with `openspec status` so that after all apply-required artifacts are done, the user is prompted to commit.
- Optional `--message` and `--amend` flags for customisation.
- Non-destructive — never force-pushes or amends without explicit flag.

## Capabilities

### New Capabilities
- `git-commit`: Automate staging and committing OpenSpec change artifacts with structured commit messages derived from change metadata and artifact state.

### Modified Capabilities
- None (new capability).

## Impact

- New CLI surface: `openspec commit`
- No existing commands or workflows are modified — pure additive change
- Relies on git being available in the working directory
