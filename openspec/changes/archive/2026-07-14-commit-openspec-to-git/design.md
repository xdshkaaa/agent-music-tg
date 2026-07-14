## Context

OpenSpec already has a CLI with subcommands (`new`, `status`, `instructions`, `list`, `show`, `validate`, `archive`, `doctor`, `context`). It knows about change metadata (name, artifacts, paths) and can determine which artifacts exist and their status. However, there is no built-in mechanism to commit change artifacts to git. Currently users must manually `git add openspec/changes/<name>/ && git commit` with a hand-written message.

The toolchain is: create/locate change → work on artifacts → implement → commit. The gap is between completion of artifact work and a structured, consistent commit.

## Goals / Non-Goals

**Goals:**
- Add `openspec commit` subcommand that stages all files under the change directory and creates a git commit
- Derive a structured, deterministic commit message from change metadata (name, schema, timestamps)
- Support `--message` to override the auto-generated message
- Support `--amend` to amend the last commit instead of creating a new one
- Print a clear summary of what was committed (files changed, diff stat)
- Work with any git repository — no assumptions about branch structure or remotes

**Non-Goals:**
- No push, no PR creation, no remote interaction
- No multi-change commits (one commit per change invocation)
- No automatic commit on artifact completion (user triggers explicitly)
- No git hooks or CI integration

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Command surface | `openspec commit` | Follows existing CLI pattern (`new`, `status`, `list`, etc.). Familiar to users. |
| Change selection | `--change <name>` (required) | Matches all other commands that operate on a change. Unambiguous. |
| Default message format | `chore(openspec): <change-name>` with body listing artifact files | Conventional commit style. Machine-parseable, human-readable. |
| Staging strategy | `git add <change-dir>` only | Never stages unrelated files. Safe partial commit. |
| Dry-run | `--dry-run` flag | Print what would be committed without actually committing. Same pattern as other tools. |
| Override message | `--message <string>` | Full custom message. Disables auto-generation. |
| Amend | `--amend` | Single flag, no `--no-edit` — defaults to editing. Same semantics as `git commit --amend`. |

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| User has unstaged changes outside the change directory | `openspec commit` only adds files under `<change-dir>`. Other work is unaffected. |
| Change directory is empty or has no artifacts | Pre-flight check: if no files to add, abort with message. |
| User forgets to provide `--change` | Required flag, no default. Error message lists available changes. |
| Detached HEAD or bare repo | Check `git rev-parse --is-inside-work-tree` before proceeding. |
| Amending when there's no prior commit | `git commit --amend` fails gracefully — surface the error message. |
