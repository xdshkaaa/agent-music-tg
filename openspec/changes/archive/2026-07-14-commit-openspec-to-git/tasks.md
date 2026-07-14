## 1. Scaffold the commit command

- [x] 1.1 Create `scripts/openspec-commit.ts` script with `--change <name>` required flag
- [x] 1.2 Add `--message`, `--amend`, `--dry-run` optional flags
- [x] 1.3 Add `"openspec:commit"` npm script in package.json

## 2. Implement change directory resolution

- [x] 2.1 Implement function to resolve change directory path from change name (read openspec/changes/<name>)
- [x] 2.2 Add error handling: abort with available changes list if change does not exist
- [x] 2.3 Add pre-flight check: verify inside git working tree before proceeding

## 3. Implement file staging

- [x] 3.1 Implement `git add` of all files under the resolved change directory
- [x] 3.2 Add dry-run mode that prints staged file list without executing git commands
- [x] 3.3 Add pre-flight check: abort if change directory has no files to stage

## 4. Implement commit message generation

- [x] 4.1 Implement auto-generated subject: `chore(openspec): <change-name>`
- [x] 4.2 Implement auto-generated body listing artifact files and metadata (schema, creation date)
- [x] 4.3 Wire `--message` flag to override auto-generated message entirely

## 5. Implement commit execution

- [x] 5.1 Run `git commit` with the generated or custom message
- [x] 5.2 Wire `--amend` flag to use `git commit --amend`
- [x] 5.3 Print commit summary after successful execution (files changed, diff stat)

## 6. Error handling

- [x] 6.1 Handle missing git binary gracefully
- [x] 6.2 Surface git command errors clearly to user
- [x] 6.3 Ensure non-zero exit codes on all error paths

## 7. Tests

- [x] 7.1 Unit test: message generation formats
- [x] 7.2 Unit test: change listing and metadata detection
- [x] 7.3 Unit test: artifact listing
- [x] 7.4 Dry-run confirmed working (manual verification)
