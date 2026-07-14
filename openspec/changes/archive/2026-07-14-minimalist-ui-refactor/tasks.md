## 1. Visual Foundation — CSS custom properties & glass removal

- [x] 1.1 Define warm monochrome palette: `--canvas`, `--card`, `--hairline`, `--text-primary`, `--text-secondary`, `--border` in `:root` and `[data-scheme="light"]`
- [x] 1.2 Define muted pastel accent variables: `--accent-blue`, `--accent-green`, `--accent-red`, `--accent-yellow` (background + text pairs)
- [x] 1.3 Remove `--glass-shadow`, `--glass-shadow-active`, `--glass-shadow-indicator` and all their scheme variants
- [x] 1.4 Remove all `backdrop-filter`, `blur`, `saturate` properties from every class
- [x] 1.5 Remove `.glass-panel::before` highlight gradient
- [x] 1.6 Replace `--font-display` (Inter Tight) with system-native stack; remove `--font-body` redundant variable
- [x] 1.7 Replace text colors: body `--text-dark`/`--text-light` → `--text-primary: #2F3437` / `--text-secondary: #787774`
- [x] 1.8 Remove accent purple `--accent: #a855f7`; keep it as fallback or remove entirely
- [x] 1.9 Normalize all `border-radius` values in CSS (cards 12px, buttons 6px, inputs 6px)
- [x] 1.10 Update `.app-shell` background gradient to use muted pastel accent instead of purple
- [x] 1.11 Remove Inter Tight preload/load from `index.html`
- [x] 1.12 Add scroll-entry IntersectionObserver hook or keep existing CSS reveal with note

## 2. Component System — Flat class overrides

- [x] 2.1 Rewrite `.glass-panel`: flat background, 12px radius, no shadow, no backdrop, no highlight
- [x] 2.2 Rewrite `.glass-button` (default): transparent bg, `1px solid var(--hairline)`, 6px radius, no shadow
- [x] 2.3 Rewrite `.glass-button.primary`: `#111111` bg, white text, 6px radius, no shadow, hover `#333`
- [x] 2.4 Rewrite `.glass-input`: flat bg, 6px radius, no backdrop, no shadow, focus with accent border
- [x] 2.5 Rewrite `.dock`: 12px radius (not 999px), flat bg, no shadow
- [x] 2.6 Rewrite `.dock-tab.active`: use muted pastel background instead of purple
- [x] 2.7 Rewrite `.wallet-pill`: 6px radius (not 999px), flat bg
- [x] 2.8 Rewrite `.segmented`: flat bg, 8px radius, no backdrop-filter; indicator uses muted pastel
- [x] 2.9 Rewrite `.track-row`: 8px radius, subtle flat hover
- [x] 2.10 Rewrite `.action-btn`, `.compact-play-btn`: flat styling, consistent with button system
- [x] 2.11 Rewrite `.player-bar`: flat, 12px radius, no shadow
- [x] 2.12 Rewrite `.player-screen`: flat, no glass shadow, 12px top radius
- [x] 2.13 Rewrite `.player-screen-play-btn`: 6px radius, flat bg

## 3. Emoji → Icon Migration

- [x] 3.1 Replace emoji in `App.tsx` (⚠️ in error, etc.)
- [x] 3.2 Replace emoji in `ResultsScreen.tsx` (⚠️ in download error)
- [x] 3.3 Replace emoji in `BuyScreen.tsx` (⚠️, 💳, 🎁, ⭐)
- [x] 3.4 Replace emoji in `ProfileScreen.tsx` (⚠️, 🎁, 📤, ⭐, etc.)
- [x] 3.5 Replace emoji in `AdminScreen.tsx` (all: ⚠️, 🟢, ⚪️, 🔑, ❌, ➕, ➖, 📅, 🚫, 👑, 👤, 🔴, ✎)
- [x] 3.6 Update `IconOrEmoji.tsx` to handle Phosphor icon components in addition to emoji strings

## 4. Screen Refinement — Inline style extraction

- [x] 4.1 Extract offer row layout styles in `BuyScreen.tsx` → `.offer-row`, `.offer-icon`, `.offer-info` classes
- [x] 4.2 Extract empty state layout in `BuyScreen.tsx` → `.empty-state` class
- [x] 4.3 Extract profile avatar/layout in `ProfileScreen.tsx` → `.profile-avatar`, `.profile-stats` classes
- [x] 4.4 Extract download entry styles in `ProfileScreen.tsx` → `.download-entry` class
- [x] 4.5 Extract admin row styles in `AdminScreen.tsx` → `.admin-user-row`, `.admin-row-spread` classes
- [x] 4.6 Add spacing utility classes (`.gap-8`, `.gap-10`, `.gap-12`, `.gap-16`, `.flex-col`, `.items-center`) where patterns repeat 3+
- [x] 4.7 Clean up unused/redundant inline styles across all screens

## 5. Verification

- [x] 5.1 Build miniapp (`cd miniapp && npm run build`) — no TypeScript errors
- [x] 5.2 Verify light scheme renders correctly with warm palette
- [x] 5.3 Verify dark scheme renders correctly with warm dark tones
- [x] 5.4 Verify no emoji remains in rendered DOM
- [x] 5.5 Verify all buttons, inputs, cards are flat (no backdrop-filter, no heavy shadows)
- [x] 5.6 Verify dock is not pill-shaped (12px radius)
- [x] 5.7 Verify no Inter Tight references in built CSS
