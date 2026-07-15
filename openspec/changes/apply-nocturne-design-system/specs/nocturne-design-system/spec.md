## ADDED Requirements

### Requirement: Nocturne stylesheet is authoritative
The app SHALL consume the provided Nocturne design-system stylesheet as the source of truth for colors, typography, spacing, radii, shadows, component styling, and interaction states. App pages SHALL use Nocturne CSS custom properties and component classes instead of hard-coded visual values when an equivalent token or class exists.

#### Scenario: Pages link Nocturne stylesheet
- **WHEN** inspecting affected HTML pages
- **THEN** each page SHALL link the provided Nocturne `styles.css` file with a valid relative path

#### Scenario: Visual values use tokens
- **WHEN** inspecting app-authored styles in affected files
- **THEN** color, font, spacing, radius, and shadow values SHALL use Nocturne variables where matching tokens exist

### Requirement: Nocturne dark visual direction is applied
The app SHALL present a quiet compact dark interface using the Nocturne near-neutral blue-grey ground, light neutral text, compact density, 8px radius scale, and blurple accent. The accent SHALL be used primarily as a line, outline, short mark, focus ring, subtle tint, or glow rather than as a broad filled surface.

#### Scenario: App uses dark Nocturne ground
- **WHEN** rendering affected app screens
- **THEN** the page ground SHALL use the Nocturne dark background token and text SHALL use the Nocturne text token

#### Scenario: Accent is not flooded
- **WHEN** inspecting primary actions and large sections
- **THEN** the accent SHALL NOT be used as a broad filled background except for sanctioned section-divider or stat-band treatments

### Requirement: Nocturne component classes are used
The app SHALL use Nocturne component patterns for actions, tags, fields, cards, navigation, tables, dialogs, rules, and imagery where those elements appear.

#### Scenario: Common UI maps to component classes
- **WHEN** inspecting buttons, tags, cards, inputs, navigation, tables, dialogs, or content images
- **THEN** the markup SHALL use the relevant Nocturne classes such as `.btn`, `.tag`, `.card`, `.field`, `.input`, `.nav`, `.table`, `.dialog`, or `.lighten`

### Requirement: Nocturne interaction states are preserved
Interactive elements SHALL use Nocturne themed hover, pressed, disabled, selection, and keyboard focus states. Keyboard focus SHALL use an accent `:focus-visible` outline rather than the browser default focus ring.

#### Scenario: Keyboard focus is themed
- **WHEN** a keyboard user focuses an interactive element
- **THEN** the element SHALL show a 2px accent focus-visible outline with an offset consistent with Nocturne guidance

#### Scenario: Disabled controls are subdued
- **WHEN** a control is disabled
- **THEN** it SHALL appear subdued using the Nocturne disabled-state treatment

### Requirement: Nocturne image treatment is applied
Hero and inline content photographs SHALL be wrapped in the Nocturne `.lighten` treatment so dark image values blend into the page ground.

#### Scenario: Content photos use lighten wrapper
- **WHEN** inspecting hero or inline content photographs
- **THEN** each photograph SHALL be inside an element using the `.lighten` class unless the image is purely decorative chrome
