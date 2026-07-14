## 1. CSS — Action button system

- [x] 1.1 Add `.action-btn` base class in glass.css (40×40px, `var(--card)` background, `var(--hairline)` border, 10px border-radius, flex center, 0.18s transitions)
- [x] 1.2 Add `.action-btn--destructive` modifier (red color + red-tinted background on hover/active)
- [x] 1.3 Add `.action-btn--neutral` modifier (transparent background, no border, smaller footprint)
- [x] 1.4 Add interaction states: hover, active (scale 0.95), disabled (opacity 0.5), focus-visible (accent outline)
- [x] 1.5 Add `.compact-play-btn` class (28×28px, 8px border-radius, `var(--card)` bg, `var(--hairline)` border, accent color on active)

## 2. ProfileScreen — DownloadEntry restructure

- [x] 2.1 Replace retry button from `.icon-btn` to `.action-btn` with `ArrowsClockwise weight="regular"`
- [x] 2.2 Replace delete button from `.icon-btn` to `.action-btn.action-btn--destructive` with `Trash weight="regular"`
- [x] 2.3 Move expand chevron outside the actions flex group to card's right edge as `.action-btn--neutral` with `CaretDown`/`CaretUp weight="regular"`
- [x] 2.4 Restructure DownloadEntry header layout: action group (retry + delete) | expand chevron
- [x] 2.5 Replace `CompactPlayButton` inline styles with `.compact-play-btn` class

## 3. Interaction — Delete confirmation

- [x] 3.1 Add `window.confirm` check in `handleDelete` before proceeding with API call (already present — verify it uses the playlist name)
- [x] 3.2 Ensure delete button `title` attribute describes the action

## 4. Accessibility — Warning tooltips

- [x] 4.1 Ensure warning span on failed tracks has `title` with error message and `aria-label`
