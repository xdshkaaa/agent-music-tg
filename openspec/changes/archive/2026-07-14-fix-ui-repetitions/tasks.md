## 1. Shared UI Components

- [x] 1.1 Create `VolumeControl.tsx` — reusable volume slider + mute button, used by PlayerBar and PlayerScreen
- [x] 1.2 Create `EmptyState.tsx` — reusable empty state with icon, label, optional action button
- [x] 1.3 Create `ErrorBanner.tsx` — dismissible error with auto-hide (8s), close button, optional retry
- [x] 1.4 Add debounce/min-duration to `TrackSkeleton.tsx` (200ms delay, 400ms min)
- [x] 1.5 Replace inline volume controls in PlayerBar with VolumeControl
- [x] 1.6 Replace inline volume controls in PlayerScreen with VolumeControl
- [x] 1.7 Replace duplicate empty states in ProfileScreen and BuyScreen with EmptyState
- [x] 1.8 Replace error banners in App.tsx and BuyScreen with ErrorBanner

## 2. Interaction & Feedback Fixes

- [x] 2.1 Add spinner to ClarifyScreen buttons when busy
- [x] 2.2 Add retry button to ResultsScreen download error
- [x] 2.3 Add retry button to BuyScreen when offers fail to load
- [x] 2.4 Replace `window.confirm` in ProfileScreen (delete download) with inline confirm

## 3. AdminScreen: Inline Forms

- [x] 3.1 Replace `prompt()` in UsersPanel (grant credits) with inline number input + button
- [x] 3.2 Replace `prompt()` in UsersPanel (extend subscription) with inline number input + button
- [x] 3.3 Replace `prompt()` in AccessPanel (add user) with inline form (chat ID + admin toggle)
- [x] 3.4 Replace `prompt()` in UnifiedSettingsPanel (edit setting) with inline editor
- [x] 3.5 Replace `window.confirm` in all admin panels with inline confirm dialog

## 4. BuyScreen Cleanup

- [x] 4.1 Remove localStorage `am_last_paid_count` tracking
- [x] 4.2 Replace with useRef-based comparison of invoice count for success notification

## 5. CSS Cleanup

- [x] 5.1 Merge `.player-progress` and `.player-screen-progress` into shared rules
- [x] 5.2 Verify no regressions in light/dark scheme after CSS merge
