## Context

The Profile screen's `DownloadEntry` component uses `.icon-btn` for three action buttons (repeat, delete, expand) and inline styles for compact play buttons. The `.icon-btn` class enforces 44×44px minimum touch targets with white-on-dark opaque styling — originally designed for track rows in ResultsScreen where high contrast is justified for primary playback actions. In the download history card, these same oversized buttons sit next to content, creating visual clutter and making delete too prominent.

All three buttons use identical styling despite different semantic roles (safe retry, destructive delete, neutral expand). Icon weights vary between `regular` and `fill`. The card header has no visual grouping for actions, and the delete action fires immediately without confirmation.

## Goals / Non-Goals

**Goals:**
- Reduce visual weight of action buttons in `DownloadEntry` to de-emphasize them relative to playlist info
- Differentiate delete as destructive (red hover/active state)
- Demote expand/collapse to a small chevron alongside the card, not a full button
- Reduce compact play button from inline styles to a CSS class; keep 28×28px size
- Add CSS interaction states (hover, active, disabled, focus-visible) for action buttons
- Add a delete confirmation before removing a record
- Move warning tooltip to use native `title` attribute (already done) — enhance with accessible label
- Normalize icon weights to `regular` across action buttons

**Non-Goals:**
- No changes to ResultsScreen track rows or `.icon-btn` global class (those are used in a different context and are fine)
- No changes to `glass-button` or `.primary` button styles
- No backend changes
- No touch target size reduction below 40×40px for primary actions (accessibility minimum)

## Decisions

### 1. Scoped CSS classes instead of modifying `.icon-btn` globally
`.icon-btn` is shared with ResultsScreen where 44×44px is appropriate. Adding semantic variants to `.icon-btn` would couple unrelated uses. Instead, introduce `.action-btn`, `.action-btn--destructive`, and `.action-btn--icon` scoped via the component or a new `profile.css` section.

### 2. Delete gets a two-step confirmation
Use `window.confirm` for simplicity (already partially implemented). The confirmation text should name the playlist being deleted. This is a low-risk pattern — no complex state management needed.

### 3. Expand chevron moves to the card right edge, outside the flex row
Currently chevron is the third `.icon-btn`. Move it outside the title+actions row, positioned as a standalone icon at the card's right edge. This visually separates expand from mutative actions.

### 4. Action button surfaces match card background
Current `.icon-btn` has no background set, so it inherits from the `button` element default or from the generic button reset. New `.action-btn` uses `var(--card)` background with a subtle border (`var(--hairline)`) and hover state reveals a lighter background.

### 5. Button layout: retry · delete | expand
Use a visual divider (extra gap + subtle separator) between retry/delete and the expand chevron. Destructive actions (delete) are grouped together with safe retry for proximity, but visually distinct via color.

### 6. Icon weight normalized to `regular` across all action buttons
`ArrowsClockwise`, `Trash` use `regular` weight. `CaretDown`/`CaretUp` stay at `regular` (they're already lighter). This eliminates the fill/regular mix.

## Risks / Trade-offs

- **Risk:** Reducing icon-btn size could violate touch target guidelines on mobile → **Mitigation:** Action buttons stay at minimum 40×40px (only slightly below current 44×44px), well within WCAG 2.2 touch target guidance. CompactPlayButton stays at 28×28px which is acceptable for secondary inline controls.
- **Risk:** Scoped CSS may not be as discoverable as a global class → **Mitigation:** Co-locate the new CSS near the component or add a clearly named section in glass.css.
- **Risk:** Browser `window.confirm` is blocking and ugly → **Mitigation:** It's used only for delete, a rare action. A custom modal would be overengineering for this scope.
