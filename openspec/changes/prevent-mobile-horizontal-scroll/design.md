## Context

The mini app is a Telegram Mini App (always mobile). It uses a single `glass.css` stylesheet, React 18.3, and a simple state-driven navigation system. The root `<body>` already has `overflow-x: hidden`, but users can still trigger horizontal scroll on some screens by swiping — indicating that certain child elements overflow the viewport or have computed widths exceeding 100vw.

Existing intentional horizontal scroll regions: `.segmented`, `.admin-tabs`, `.category-pills` (tab bars / pill lists with `overflow-x: auto`).

## Goals / Non-Goals

**Goals:**
- Eliminate unintended horizontal scroll/swipe on every screen
- Fix all CSS/React layout causes of viewport overflow
- Preserve intentional horizontal scroll on segmented controls, admin tabs, and pill bars
- Work within the existing `glass.css` + inline styles architecture (no CSS-in-JS, no major refactor)

**Non-Goals:**
- No visual redesign or layout restructure
- No changes to screen logic or data flow
- No addition of CSS frameworks or preprocessors

## Decisions

1. **Root-level guard via `.app-shell`:**
   Add `overflow-x: hidden` and `overscroll-behavior-x: none` to `.app-shell` (the top-level layout wrapper) rather than relying solely on `<body>` styling. This creates a definitive clip container for the entire app viewport. The `overscroll-behavior-x: none` prevents swipe-navigation gestures on Chrome Android from pulling the page.

2. **Screen-by-screen audit:**
   Inject a temporary debug outline (`* { outline: 1px solid red }`) on the mini app build, then inspect each screen for elements that exceed the parent width. Common culprits in React mobile apps:
   - Fixed/absolute positioned elements without width constraints
   - Flex children with `flex-shrink: 0` inside a constrained container
   - Elements using `100vw` (does not account for scrollbar in some browsers)
   - Long unbreakable text / words in narrow panels
   - Negative margins that push children beyond bounds
   - `transform: translateX()` animations that overshoot

3. **Explicit width constraint on `.glass-panel`:**
   Add `max-width: 100%; box-sizing: border-box;` to `.glass-panel` to ensure no panel exceeds its container.

4. **Preserve intentional scrolls:**
   `.segmented`, `.admin-tabs`, `.category-pills` already use `overflow-x: auto` with hidden scrollbars. These will be left untouched. The root guard does not affect children with explicit horizontal scroll — they will continue to function.

5. **CSS-only where possible:**
   Prefer CSS fixes over JS. Only resort to `useEffect` / ref-based width calculations if a dynamic layout cannot be fixed with CSS alone.

## Risks / Trade-offs

- **[Regression] Root `overflow-x: hidden` could clip tooltips, popups, or dropdowns** if they render outside the `.app-shell` bounds → Mitigation: test all interactive elements (especially bottom-sheet-style components) after applying the guard.
- **[Missed culprits] Static audit may not catch dynamically-generated content widths** → Mitigation: test with long track titles and varied content lengths across all screens.
- **[Overscroll] `overscroll-behavior-x: none` may feel unexpected on Android Chrome pull-to-refresh** → Mitigation: the app does not use pull-to-refresh, so this is safe.
