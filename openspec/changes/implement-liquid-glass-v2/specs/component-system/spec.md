## ADDED Requirements

### Requirement: Liquid Glass v2 component variants
Reusable UI components SHALL support Liquid Glass v2 variants for surfaces where the imported design calls for glass treatment, while preserving existing component APIs and behavior unless a visual-only prop or class is required.

#### Scenario: GlassPanel supports Liquid Glass v2
- **WHEN** rendering a shared panel or card with the Liquid Glass v2 variant
- **THEN** the component SHALL apply the shared liquid-glass surface primitives rather than one-off component-specific styles

#### Scenario: Existing component behavior remains unchanged
- **WHEN** a component adopts Liquid Glass v2 styling
- **THEN** click handlers, form behavior, navigation behavior, disabled states, and accessibility semantics SHALL remain unchanged

### Requirement: Liquid Glass v2 controls remain usable
Buttons, inputs, segmented controls, navigation tabs, and related interactive controls using Liquid Glass v2 styling SHALL preserve visible states for default, hover, active, focused, selected, and disabled interactions.

#### Scenario: Interactive states are visually distinct
- **WHEN** a Liquid Glass v2 control changes interaction state
- **THEN** the state SHALL be visually distinguishable without relying only on motion or transparency

#### Scenario: Focus state is preserved
- **WHEN** a keyboard user focuses a Liquid Glass v2 control
- **THEN** the focus indicator SHALL remain visible against the glass or fallback surface
