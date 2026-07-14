# glass-header Specification

## Purpose
TBD - created by archiving change premium-glass-header. Update Purpose after archive.
## Requirements
### Requirement: Glass background with visible blur

The top-bar background SHALL use `--glass-bg-dark` in dark scheme and `--glass-bg-light` in light scheme instead of opaque color-mix. The `backdrop-filter: blur` value SHALL be at least 14px and at most 20px.

#### Scenario: Dark scheme glass background
- **WHEN** `data-scheme` attribute on `<html>` is `"dark"` or absent
- **THEN** `.top-bar` background SHALL be `var(--glass-bg-dark)` and `backdrop-filter` SHALL be `blur(20px)`

#### Scenario: Light scheme glass background
- **WHEN** `data-scheme` attribute on `<html>` is `"light"`
- **THEN** `.top-bar` background SHALL be `var(--glass-bg-light)` and `backdrop-filter` SHALL be `blur(20px)`

#### Scenario: Content visible through header
- **WHEN** content scrolls under the sticky top-bar
- **THEN** the content SHALL be visibly blurred through the header background, confirming glass transparency

### Requirement: Bottom hairline border

The top-bar SHALL have a bottom border that visually separates it from page content. In dark scheme the border SHALL use `--glass-border-dark`. In light scheme the border SHALL use a semi-transparent dark color.

#### Scenario: Dark scheme bottom border
- **WHEN** `data-scheme` is `"dark"` or absent
- **THEN** `.top-bar` SHALL have `border-bottom: 1px solid var(--glass-border-dark)`

#### Scenario: Light scheme bottom border
- **WHEN** `data-scheme` is `"light"`
- **THEN** `.top-bar` SHALL have `border-bottom: 1px solid rgba(0, 0, 0, 0.08)`

### Requirement: Wallet pill integrated styling

The `.wallet-pill` SHALL use a subtle background without a visible border, to appear as part of the glass surface rather than a separate element.

#### Scenario: Wallet pill appearance
- **WHEN** the wallet pill is rendered in the top-bar
- **THEN** it SHALL have no visible `border` and SHALL use `background: var(--card)` with optional inset shadow for depth

### Requirement: Logo chip legibility

The `.logo-chip` text SHALL remain fully legible against the glass background in both color schemes.

#### Scenario: Logo text readability
- **WHEN** `.logo-chip` is rendered on the glass background
- **THEN** the text color SHALL use `var(--text-dark)` in dark scheme and `var(--text-light)` in light scheme, with sufficient contrast ratio (WCAG AA minimum)

### Requirement: Backward compatibility

The header changes SHALL NOT break existing functionality — sticky positioning, wallet pill balance display, logo chip with IconOrEmoji, and dock navigation SHALL remain unchanged.

#### Scenario: Sticky positioning preserved
- **WHEN** the page is scrolled
- **THEN** `.top-bar` SHALL remain sticky at `top: 0` with `z-index: 10`

#### Scenario: Wallet pill functionality
- **WHEN** the user's credit balance is loaded
- **THEN** `.wallet-pill` SHALL display the balance with the Wallet icon, identical to current behavior

#### Scenario: Admin settings bar unaffected
- **WHEN** the admin screen is rendered
- **THEN** `AdminSettingsBar` SHALL retain its existing glass-panel styling and position above the admin tabs

