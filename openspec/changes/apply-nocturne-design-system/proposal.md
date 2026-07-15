## Why

The mini-app currently has an existing liquid/glass visual direction and several UI specs that conflict with the provided Nocturne design system. This change aligns the project to a compact, dark, token-driven interface so implementation can consistently reuse the bundled Nocturne stylesheet, components, and interaction states.

## What Changes

- Apply the Nocturne dark visual language across the mini-app: near-neutral blue-grey ground, Inter medium-weight typography, compact spacing, 8px radii, and blurple accent used primarily as outlines, rules, marks, and glow.
- Replace ad-hoc liquid/glass styling with token-driven styles from the provided Nocturne design-system bundle.
- Use Nocturne component classes and patterns for buttons, tags, cards, navigation, forms, tables, dialogs, rules, and image treatment.
- Ensure interactive states are themed: accent hover/pressed treatments, `:focus-visible` accent outline, selection tint, and disabled opacity.
- Preserve the design-system guidance that large saturated fills are avoided except for sanctioned section/stat-band uses.
- Update existing app files to consume the design-system assets without inventing parallel color, spacing, radius, shadow, or typography tokens.
- **BREAKING**: Existing warm monochrome/minimalist and liquid-glass visual requirements will be superseded for affected screens by the Nocturne dark design-system requirements.

## Capabilities

### New Capabilities
- `nocturne-design-system`: Defines how the app SHALL consume and conform to the provided Nocturne design system, including tokens, components, interaction states, imagery, and visual constraints.

### Modified Capabilities
- `visual-foundation`: Replace the current warm monochrome/minimalist visual foundation with the Nocturne dark token system.
- `component-system`: Require shared UI components to use the Nocturne component classes and tokenized styling.
- `ui-button-system`: Require buttons to follow Nocturne outlined button variants, accent-border treatment, and themed interaction states.
- `shared-ui-components`: Align shared cards, tags, forms, navigation, tables, and dialogs with Nocturne components.
- `glass-header`: Replace glass-header styling with Nocturne navigation/header styling and remove liquid-glass assumptions where they conflict.

## Impact

- Affected app files:
  - `/Users/xdshka/Downloads/updated-liquid-glass-mini-app/project/Current Mini-App.dc.html`
  - `/Users/xdshka/Downloads/updated-liquid-glass-mini-app/project/Liquid Glass v2.dc.html`
  - `/Users/xdshka/Downloads/updated-liquid-glass-mini-app/project/support.js`
  - `/Users/xdshka/Downloads/updated-liquid-glass-mini-app/README.md`
- Affected design-system assets:
  - `/Users/xdshka/Downloads/updated-liquid-glass-mini-app/project/_ds/nocturne-c1d075c4-2a19-446c-be90-64008b081e70/styles.css`
  - `/Users/xdshka/Downloads/updated-liquid-glass-mini-app/project/_ds/nocturne-c1d075c4-2a19-446c-be90-64008b081e70/readme.md`
  - Bundle and manifest files under the same Nocturne design-system directory.
- Affected specs: visual foundation, component system, button system, shared UI components, and header/navigation behavior.
- No API or backend data model changes are expected.
