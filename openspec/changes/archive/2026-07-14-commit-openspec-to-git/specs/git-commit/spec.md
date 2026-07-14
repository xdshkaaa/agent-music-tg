## ADDED Requirements

### Requirement: Commit OpenSpec change artifacts to git

The system SHALL provide an `openspec commit` subcommand that stages and commits all files under a specific change directory with a structured commit message.

#### Scenario: Basic commit of a change's artifacts
- **WHEN** user runs `openspec commit --change <name>`
- **THEN** the system stages all files under `openspec/changes/<name>/`
- **AND** the system creates a git commit with an auto-generated message
- **AND** the system prints a summary of committed files

#### Scenario: Commit with custom message
- **WHEN** user runs `openspec commit --change <name> --message "custom commit message"`
- **THEN** the system uses the provided message instead of auto-generating one
- **AND** the system does NOT include the auto-generated body

#### Scenario: Dry-run shows what would be committed
- **WHEN** user runs `openspec commit --change <name> --dry-run`
- **THEN** the system prints the list of files that would be staged
- **AND** the system prints the commit message that would be used
- **AND** the system does NOT stage any files or create any commit

#### Scenario: Amend last commit with change artifacts
- **WHEN** user runs `openspec commit --change <name> --amend`
- **THEN** the system stages all files under the change directory
- **AND** the system amends the last commit with a combined message

#### Scenario: Abort when change directory has no files
- **WHEN** user runs `openspec commit --change <name>`
- **AND** the change directory contains no tracked or untracked files
- **THEN** the system prints an error message
- **AND** the system exits with a non-zero code

#### Scenario: Abort when outside a git repository
- **WHEN** user runs `openspec commit` outside a git working tree
- **THEN** the system prints an error message
- **AND** the system exits with a non-zero code

### Requirement: Auto-generated commit message format

The auto-generated commit message SHALL follow conventional commit format with structured body content.

#### Scenario: Default message structure
- **WHEN** the system auto-generates a commit message
- **THEN** the subject line SHALL be `chore(openspec): <change-name>`
- **AND** the body SHALL list each artifact file path with a brief status indicator

#### Scenario: Message contains change metadata
- **WHEN** the system auto-generates a commit message
- **THEN** the body SHALL include the schema name
- **AND** the body SHALL include the change creation date

### Requirement: Detection of change directory

The system SHALL resolve the change directory using the same path resolution logic as `openspec status --change <name>`.

#### Scenario: Change exists
- **WHEN** the specified change name resolves to an existing directory
- **THEN** the system proceeds with the commit operation

#### Scenario: Change does not exist
- **WHEN** the specified change name does not resolve to an existing directory
- **THEN** the system prints an error message listing available changes
- **AND** the system exits with a non-zero code
