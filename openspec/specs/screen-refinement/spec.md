# screen-refinement Specification

## Purpose
TBD - created by archiving change minimalist-ui-refactor. Update Purpose after archive.
## Requirements
### Requirement: Inline styles extracted to CSS classes in BuyScreen
Repetitive inline `style` props in `BuyScreen.tsx` SHALL be extracted to reusable CSS classes. This includes:
- Offer row layout (`display: flex`, `alignItems: center`, `gap: 12`, `padding: "14px 0"`) → `.offer-row`
- Offer icon container (`width: 38`, `height: 38`, `borderRadius: 12`) → `.offer-icon`
- Offer info text column (`display: flex`, `flexDirection: column`, `minWidth: 0`) → `.offer-info`
- Category filter buttons → use existing `.admin-tab` or new class
- Search input wrapper → `.search-wrap`

#### Scenario: Offer row uses CSS class
- **WHEN** inspecting rendered offer rows in BuyScreen
- **THEN** they SHALL use class name `.offer-row` instead of inline `style`

#### Scenario: Empty state layout uses CSS class
- **WHEN** rendering "ничего не найдено" empty state
- **THEN** the flex column layout SHALL use a CSS class, not inline style

### Requirement: Inline styles extracted in ProfileScreen
Repetitive inline styles in `ProfileScreen.tsx` SHALL be extracted:
- Avatar container → `.profile-avatar` / `.profile-avatar-placeholder`
- Account stats layout → `.profile-stats`
- Download entry layout → `.download-entry`
- Purchase history item → `.purchase-item`
- Track list item in expanded downloads → `.download-track`

#### Scenario: Profile avatar uses CSS class
- **WHEN** rendering the avatar section
- **THEN** it SHALL use `.profile-avatar` classes instead of inline `style`

#### Scenario: Download entry has CSS class
- **WHEN** rendering a `.DownloadEntry` component
- **THEN** the `<li>` SHALL use a class instead of `style={{ padding: "10px 0", borderBottom: "..." }}`

### Requirement: Inline styles extracted in AdminScreen
Repetitive inline styles in `AdminScreen.tsx` SHALL be extracted:
- User rows → `.admin-user-row`
- Row layout (`justifyContent: "space-between"`, `alignItems: "center"`) → `.admin-row-spread`
- Section headings → use existing `h2` styling
- Form layout → use existing `.stack` and `.row` consistently

#### Scenario: Admin user rows use CSS class
- **WHEN** rendering user rows in UsersPanel or IssuancePanel
- **THEN** they SHALL use `.admin-user-row` class instead of inline `style`

### Requirement: Consistent gap and spacing utilities
A small set of spacing utility classes SHALL be defined in `glass.css` to replace the most common inline gap/padding patterns:
- `.gap-8`, `.gap-10`, `.gap-12`, `.gap-16` for flex gaps
- `.p-0`, `.p-4`, `.p-6`, `.p-8` for common padding values (only where used 3+ times)
- `.flex-col`, `.flex-row` for flex direction
- `.items-center`, `.justify-between` for alignment

These SHALL NOT duplicate existing classes (`.stack`, `.row`, `.mt-12`, `.mt-16`, `.wrap` already exist).

#### Scenario: Common gap patterns use utility classes
- **WHEN** `gap: 10px` or `gap: 12px` or `gap: 8px` appears 3+ times inline
- **THEN** it SHALL be replaced with a `.gap-*` utility class

