## MODIFIED Requirements

### Requirement: Warm monochrome color palette
The system SHALL use the Nocturne dark token palette instead of the previous warm monochrome palette. The canvas SHALL use the Nocturne near-neutral blue-grey ground token (`--color-bg`, `#161826` in the supplied bundle), body text SHALL use `--color-text`, surfaces and borders SHALL come from Nocturne neutral ramp tokens, and accent usage SHALL come from the Nocturne blurple accent ramp.

Pure black and pure white SHALL NOT be introduced as app-authored colors. Large saturated fills SHALL NOT be used except for Nocturne section-divider or stat-band treatments based on `--color-section` tokens.

#### Scenario: CSS custom properties define palette
- **WHEN** inspecting the linked Nocturne `styles.css`
- **THEN** `--color-bg`, `--color-text`, `--color-accent`, `--color-neutral-100` through `--color-neutral-900`, and accent ramp tokens SHALL be available and used for affected screens

#### Scenario: Dark scheme uses Nocturne ground
- **WHEN** rendering affected screens
- **THEN** the page canvas SHALL use the Nocturne dark ground rather than the previous warm off-white canvas

### Requirement: Typography uses system-native premium stack
The system SHALL use Nocturne typography tokens for affected screens. Headings and body text SHALL use Inter through `--font-heading` and `--font-body` as supplied by the Nocturne stylesheet, with heading weight not exceeding the Nocturne medium-weight direction unless the stylesheet defines otherwise.

#### Scenario: Inter font is available through Nocturne
- **WHEN** inspecting affected pages and the Nocturne stylesheet
- **THEN** Inter SHALL be the typography basis through Nocturne font variables

#### Scenario: Body uses Nocturne font variables
- **WHEN** inspecting body or app root typography styles
- **THEN** typography SHALL resolve through `--font-body` or `--font-heading` rather than a conflicting legacy font stack

### Requirement: Shadows are ultra-diffuse or absent
Elevation SHALL use Nocturne shadow tokens (`--shadow-sm`, `--shadow-md`, `--shadow-lg`) and subtle edge treatments tuned for the dark ground. App-authored stacked glass shadows SHALL NOT be used on affected Nocturne surfaces.

#### Scenario: Elevation uses Nocturne shadow tokens
- **WHEN** inspecting elevated cards, dialogs, or panels
- **THEN** shadows SHALL use Nocturne shadow variables or Nocturne elevation utility classes

#### Scenario: Legacy glass shadows are absent
- **WHEN** inspecting affected app-authored CSS
- **THEN** legacy multi-layer glass shadow variables or hard-coded stacked glass shadows SHALL NOT control Nocturne surfaces

### Requirement: Glassmorphism is removed
Affected Nocturne surfaces SHALL NOT rely on liquid/glass styling. `backdrop-filter`, blur, saturate, glass highlight overlays, and glass-specific panel effects SHALL be removed or bypassed where they control app surfaces converted to Nocturne.

#### Scenario: No backdrop-filter in converted surfaces
- **WHEN** inspecting converted Nocturne surfaces
- **THEN** they SHALL NOT use `backdrop-filter` or `-webkit-backdrop-filter`

#### Scenario: Glass highlight is removed
- **WHEN** inspecting converted panels or cards
- **THEN** glass highlight pseudo-elements SHALL NOT be present or SHALL NOT be visible

### Requirement: Border-radius values are constrained
Affected surfaces SHALL use the Nocturne radius scale. Standard cards and controls SHALL use Nocturne radius variables based around the supplied 8px direction. Pill radii SHALL be limited to components that the Nocturne stylesheet intentionally defines as pill-like tags or badges.

#### Scenario: Card border-radius uses Nocturne token
- **WHEN** inspecting converted cards
- **THEN** border radius SHALL use a Nocturne radius variable or a Nocturne card class

#### Scenario: Buttons are not oversized pills
- **WHEN** inspecting converted buttons
- **THEN** buttons SHALL use Nocturne button radius styling rather than legacy `999px` pill styling
