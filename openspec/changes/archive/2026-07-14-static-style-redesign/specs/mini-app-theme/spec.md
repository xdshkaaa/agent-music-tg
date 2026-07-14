## ADDED Requirements

### Requirement: Purple accent and near-black canvas
The Mini App SHALL replace the green Spotify-style accent with a purple accent (`--accent: #A855F7`, `--accent-deep: #7C3AED`) on a near-black canvas (`--bg: #0A0A0B`) and SHALL render a soft purple radial-glow nebula emanating from the upper-left of the app shell that fades to pure black across the rest of the surface.

#### Scenario: Dark-mode canvas renders the purple nebula
- **WHEN** the Mini App loads on a client whose color scheme is dark
- **THEN** the app shell background is `#0A0A0B` with a purple radial glow (`rgba(168,85,247,0.22)`) rooted at the upper-left and fades to pure black by 55% of the viewport
- **AND** the green accent value `#1ed760` is no longer present anywhere in `miniapp/src/styles/glass.css`

#### Scenario: Light-mode is retained but retuned to purple
- **WHEN** the client's color scheme is light
- **THEN** the app shell background is a soft gray radial with the same `#A855F7` accent tokens
- **AND** the `data-scheme="light"` overrides block still exists in `glass.css`

### Requirement: Dark card surface with hairline border
Each `glass-panel` surface SHALL use the dark card color `#141416` on a `1px solid #232326` hairline border with a 20px corner radius, and preserve a softened (not removed) top-edge inset highlight so existing reveal entrance animations keep perceived depth.

#### Scenario: Cards use the STATICA dark card surface
- **WHEN** any screen renders a `glass-panel`
- **THEN** the panel's `background` resolves to `#141416`, its `border` is a `1px solid #232326` hairline, and its `border-radius` is `20px`
- **AND** the existing `::before` tilted highlight is present at reduced opacity (≤ 0.2)

### Requirement: Primary button is solid white pill with black text
The primary `glass-button.primary` SHALL be a solid white (`#FFFFFF`) pill with bold black text, and SHALL gain a purple-glow `box-shadow` on hover/active for dark-mode clients (`rgba(168,85,247,*)`), superseding the previous green glow.

#### Scenario: Primary CTA reads as the STATICA white pill
- **WHEN** a screen renders a `glass-button.primary`
- **THEN** the button background is solid white, its text color is black, and hovering it (on a pointer device) renders a purple-tinted glow shadow rather than a green one

### Requirement: Uppercase letterspaced section labels with thin rule
The theme SHALL provide a `.section-label` utility class that renders text UPPERCASE with wide letter-spacing and a thin horizontal rule extending to the right of the label (the STATICA `КАТАЛОГ ────` motif), so screens can label content groups without custom CSS.

#### Scenario: Section label renders the STATICA rule motif
- **WHEN** any screen applies `.section-label` to an element containing the text `ПАКЕТЫ`
- **THEN** the text renders UPPERCASE, letterspaced by at least `0.16em`, colored `#8A8A8E`
- **AND** a 1px horizontal line in the `--hairline` color extends from the end of the word to fill the remaining inline width

### Requirement: Sharp grotesk display typeface
The Mini App SHALL use Inter Tight (or an equivalent condensed grotesk) as the display font (`--font-display`) loaded via a standard `<link>` tag in `miniapp/index.html`, replacing Manrope, with a native system-stack fallback chain.

#### Scenario: Display font swaps from Manrope to Inter Tight
- **WHEN** the Mini App loads
- **THEN** the `--font-display` CSS variable resolves to `"Inter Tight", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
- **AND** `miniapp/index.html` contains a `<link>` that fetches Inter Tight
- **AND** no reference to Manrope remains in `miniapp/src/styles/glass.css`