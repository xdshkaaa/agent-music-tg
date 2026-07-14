## Context

The `OffersPanel` component in `AdminScreen.tsx` declares a `confirmDeleteId` state variable intended for a delete-confirmation flow. However, the current implementation never reads its value (`confirmDeleteId` is unused, causing a TS6133 error). The `setConfirmDeleteId` setter is used, which satisfies the no-unused-locals check for the setter but not for the state value.

## Goals / Non-Goals

**Goals:**
- Fix the TS6133 build error by removing the unused state variable
- Preserve the delete-offer functionality

**Non-Goals:**
- No behavior changes beyond removing the unused variable
- No UI/UX changes

## Decisions

1. **Remove `confirmDeleteId` state entirely** — the variable is unused. The `remove()` function can be called directly without a prior confirmation toggle, which is already the case in the current code path.

2. **Keep the delete confirmation as a future concern** — if a confirmation dialog is desired later, it should be implemented properly (not left as dead code that blocks the build).

## Risks / Trade-offs

- **Low risk**: removing the unused state variable has no runtime impact since its value is never read. The delete function already executes immediately.
