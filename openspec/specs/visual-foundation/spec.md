# visual-foundation Specification

## Purpose
TBD - created by archiving change minimalist-ui-refactor. Update Purpose after archive.
## Requirements
### Requirement: Warm monochrome color palette
The system SHALL use a warm monochrome palette with muted pastel accents. Pure black SHALL NOT be used for text. Canvas SHALL be warm off-white `#F7F6F3` or pure white `#FFFFFF`. Cards SHALL use `#FFFFFF` or `#F9F9F8`. Structural borders SHALL use `#EAEAEA` (`rgba(0,0,0,0.06)`).

Accent colors SHALL be washed-out pastels only:
- Pale Red: `#FDEBEC` (Text: `#9F2F2D`)
- Pale Blue: `#E1F3FE` (Text: `#1F6C9F`)
- Pale Green: `#EDF3EC` (Text: `#346538`)
- Pale Yellow: `#FBF3DB` (Text: `#956400`)

Dark scheme SHALL desaturate/warm the canvas rather than use near-black `#0a0a0b`.

#### Scenario: CSS custom properties define palette
- **WHEN** inspecting `:root` in `glass.css`
- **THEN** `--canvas`, `--card`, `--hairline`, `--text-primary`, `--text-secondary`, `--accent-red`, `--accent-blue`, `--accent-green`, `--accent-yellow` SHALL be defined with the warm monochrome values

#### Scenario: Light and dark schemes use appropriate variants
- **WHEN** `data-scheme="light"` is set
- **THEN** canvas SHALL be `#F7F6F3` or `#FFFFFF`
- **WHEN** `data-scheme="dark"` is set
- **THEN** canvas SHALL be a warm dark tone (not `#0a0a0b`)

### Requirement: Typography uses system-native premium stack
The system SHALL use `font-family: 'SF Pro Display', 'Geist Sans', 'Helvetica Neue', 'Switzer', sans-serif` for body/UI. Inter, Roboto, and Open Sans SHALL NOT be used. Google Fonts preloads for Inter SHALL be removed.

Hero headings SHALL use editorial serif: `font-family: 'Newsreader', 'Playfair Display', 'Instrument Serif', serif` with `letter-spacing: -0.02em` and `line-height: 1.1`.

Text colors: primary `#2F3437`, secondary `#787774`. Absolute black `#000000` SHALL NOT be used.

#### Scenario: Inter font is removed from HTML
- **WHEN** inspecting `index.html`
- **THEN** there SHALL be no `<link>` or `<preload>` for Inter or Inter Tight

#### Scenario: Body uses system-native font stack
- **WHEN** inspecting `body` CSS
- **THEN** `font-family` SHALL start with `'SF Pro Display'` or `'Geist Sans'`, not `'Inter'`

### Requirement: Shadows are ultra-diffuse or absent
Box shadows SHALL have opacity `< 0.05` when present. The multi-layer glass shadow system SHALL be removed. Cards SHALL have no shadow or a single ultra-light layer: `0 1px 3px rgba(0,0,0,0.04)`.

#### Scenario: Glass shadow variables are removed
- **WHEN** inspecting `glass.css`
- **THEN** `--glass-shadow`, `--glass-shadow-active`, `--glass-shadow-indicator` SHALL NOT exist

#### Scenario: Cards have no visible shadow
- **WHEN** rendering a `.glass-panel`
- **THEN** `box-shadow` SHALL be `none` or `0 1px 3px rgba(0,0,0,0.04)`

### Requirement: Glassmorphism is removed
`backdrop-filter`, `blur`, and `saturate` SHALL NOT be used on any surface. The `.glass`, `.glass-panel`, `.glass-button`, `.glass-input` classes SHALL have flat backgrounds and no glass highlight overlays. The `::before` highlight gradient on `.glass-panel` SHALL be removed.

#### Scenario: No backdrop-filter in CSS
- **WHEN** searching `glass.css` for `backdrop-filter`
- **THEN** no rule SHALL contain `backdrop-filter` or `-webkit-backdrop-filter`

#### Scenario: Glass panel highlight is removed
- **WHEN** inspecting `.glass-panel::before`
- **THEN** it SHALL NOT exist or SHALL have `display: none`

### Requirement: Border-radius values are constrained
Cards and large containers SHALL use max `12px`. Buttons SHALL use `4px` to `6px`. The dock (bottom navigation) SHALL NOT use `999px` — use `12px` or `16px`. Pill shapes (`border-radius: 9999px`) SHALL only appear on tag/badge elements, not containers or buttons.

#### Scenario: Card border-radius is within limits
- **WHEN** inspecting `.glass-panel`
- **THEN** `border-radius` SHALL be `12px` or less

#### Scenario: Dock is not a pill
- **WHEN** inspecting `.dock`
- **THEN** `border-radius` SHALL NOT be `999px` or `9999px`

#### Scenario: Primary button has subtle radius
- **WHEN** inspecting `.glass-button`
- **THEN** `border-radius` SHALL be `6px` or less

### Requirement: Scroll-entry animations via IntersectionObserver
Elements SHALL fade in with `translateY(12px)` → `opacity: 1` over `600ms` using `cubic-bezier(0.16, 1, 0.3, 1)`. Entry SHALL be triggered by `IntersectionObserver`, not by mount-only CSS animation. Staggered children SHALL use `animation-delay: calc(var(--index) * 80ms)`. `prefers-reduced-motion` SHALL be respected.

#### Scenario: Reveal animation is observer-driven
- **WHEN** a `.reveal` element enters the viewport
- **THEN** it SHALL animate from `opacity: 0; transform: translateY(12px)` to `opacity: 1; transform: none`

#### Scenario: Reduced motion is respected
- **WHEN** `prefers-reduced-motion: reduce` is set
- **THEN** all animations SHALL be disabled via `transition-duration: 0.01ms`

