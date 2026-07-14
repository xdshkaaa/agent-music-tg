## Why

TypeScript build (`tsc --noEmit`) fails with error TS6133: `confirmDeleteId` is declared but its value is never read in `AdminScreen.tsx`. This blocks the Mini App build pipeline.

## What Changes

- Remove the unused `confirmDeleteId` state variable from the `OffersPanel` component
- Simplify the delete-offer flow to remove the confirmation step, or implement it properly by using the state

## Capabilities

### New Capabilities

_(none — this is a bugfix, not a new capability)_

### Modified Capabilities

_(none — no spec-level requirement changes)_

## Impact

- `miniapp/src/screens/AdminScreen.tsx` — `OffersPanel` component
- Build pipeline — unblocks `tsc --noEmit` and `vite build`
