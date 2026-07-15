## ADDED Requirements

### Requirement: Liquid Glass v2 visual primitives
The system SHALL define Liquid Glass v2 visual primitives for translucent surfaces, blur-capable backdrops, saturation, hairline borders, highlight overlays, soft depth, and fallback backgrounds.

#### Scenario: Liquid glass tokens are available
- **WHEN** inspecting the shared visual foundation styles
- **THEN** Liquid Glass v2 tokens or utilities SHALL exist for surface background, backdrop blur, saturation, border, highlight, shadow, and fallback treatment

#### Scenario: Fallback primitives preserve readability
- **WHEN** advanced glass effects are unavailable or reduced
- **THEN** fallback visual primitives SHALL preserve content readability and surface hierarchy

### Requirement: Liquid Glass v2 compatibility with existing palette
The system SHALL integrate Liquid Glass v2 styling with the existing visual palette without introducing unreadable foreground/background combinations.

#### Scenario: Glass styling uses approved foreground colors
- **WHEN** Liquid Glass v2 surfaces render text or icons
- **THEN** foreground colors SHALL maintain readable contrast against the active glass or fallback surface

#### Scenario: Existing theme modes remain supported
- **WHEN** the app renders in supported light or dark theme modes
- **THEN** Liquid Glass v2 primitives SHALL provide appropriate values for that theme mode
