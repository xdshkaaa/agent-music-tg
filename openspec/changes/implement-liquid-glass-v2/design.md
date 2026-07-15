## Context

The change imports the Claude Design project file `Liquid Glass v2.dc.html` and implements its visual treatment in the existing frontend. The current project already has visual and component specs, including `visual-foundation` and `component-system`, so Liquid Glass v2 should extend the existing UI foundation rather than introduce a separate parallel styling system.

This is a cross-cutting UI change because the visual treatment may affect shared surfaces, reusable components, and screen-level composition. The implementation should preserve existing behavior and navigation while updating the presentation layer to match the imported design.

## Goals / Non-Goals

**Goals:**

- Import or reference the Claude Design artifact through the `claude_design` MCP during implementation.
- Translate `Liquid Glass v2.dc.html` into reusable frontend styling primitives and component patterns.
- Apply the Liquid Glass v2 treatment consistently to relevant shared surfaces and components.
- Preserve existing functional behavior, routes, data flow, and backend interactions.
- Keep the visual system maintainable by centralizing tokens/utilities for blur, translucency, borders, highlights, depth, and fallback states.
- Add or update verification coverage so the new visual behavior can be validated without relying only on manual inspection.

**Non-Goals:**

- Rebuilding unrelated screens or flows that are not touched by the Liquid Glass v2 design.
- Changing backend APIs, data models, payment flows, admin flows, or deployment behavior.
- Introducing a second independent component library.
- Making broad product UX changes beyond what is required to implement the imported visual artifact.

## Decisions

### Use the existing visual foundation as the integration point

Liquid Glass v2 styling should be expressed through existing visual primitives/tokens where possible, with new tokens or utilities added only when the current foundation cannot represent the imported design.

- Rationale: This keeps the change compatible with the current component system and avoids duplicating styling responsibilities.
- Alternative considered: Implement the imported design as one-off CSS tied to specific screens. This is faster initially but makes the design harder to reuse and maintain.

### Implement glass treatment as reusable surface variants

Shared components that render panels, cards, headers, navigation containers, modals, or controls should expose a Liquid Glass-compatible variant or styling layer rather than duplicating CSS in each screen.

- Rationale: Liquid-glass effects depend on consistent combinations of blur, translucency, border, shadow, highlight, and background layering.
- Alternative considered: Apply visual effects only at the page level. This would miss nested component surfaces and produce inconsistent depth.

### Preserve behavior and structure unless required by the imported design

Implementation should prioritize presentation changes. Structural changes are allowed only where required to faithfully reproduce the imported artifact or to support reusable glass layering.

- Rationale: The proposal does not require backend or functional changes, so keeping behavior stable reduces implementation risk.
- Alternative considered: Refactor affected screens while restyling them. This increases scope and test burden without being necessary for the visual change.

### Provide graceful fallback for performance and platform constraints

Glass effects should remain usable on devices or browsers where heavy blur, transparency, or backdrop filtering is degraded or expensive. Fallbacks should preserve contrast, hierarchy, and readability.

- Rationale: Liquid-glass styling can be performance-sensitive and can reduce accessibility if not controlled.
- Alternative considered: Rely exclusively on advanced blur/backdrop-filter behavior. This risks poor rendering or accessibility failures on constrained environments.

### Treat the Claude Design artifact as source reference, not runtime dependency

The imported `Liquid Glass v2.dc.html` should guide implementation, but the app should not depend on fetching the design artifact at runtime.

- Rationale: Runtime UI should be deterministic, versioned with the codebase, and independent of external design tooling availability.
- Alternative considered: Embed or load the design artifact directly. This would couple app runtime behavior to a design import workflow and make testing/deployment less predictable.

## Risks / Trade-offs

- [Risk] Backdrop blur and layered translucency may hurt rendering performance on low-end devices → Mitigation: centralize effects, limit blur radius/layer count, and provide reduced/fallback styles.
- [Risk] Glass surfaces may reduce text contrast against dynamic backgrounds → Mitigation: define contrast-safe overlays, borders, and text color rules; verify important UI states.
- [Risk] One-off implementation could diverge from the component system → Mitigation: implement reusable variants/tokens first, then apply them to affected screens.
- [Risk] Imported design details may be ambiguous without direct MCP access during planning → Mitigation: keep specs focused on required visual qualities and make implementation verify against the actual imported artifact.
- [Risk] Existing visual regression expectations may need updates → Mitigation: update tests and snapshots only after confirming behavior is unchanged and visual changes are intentional.

## Migration Plan

1. Import or inspect `Liquid Glass v2.dc.html` through the `claude_design` MCP during implementation.
2. Map the design artifact to existing visual primitives and identify missing tokens/utilities.
3. Add Liquid Glass v2 surface primitives and component variants in the shared styling/component layer.
4. Apply the treatment to affected screens/components.
5. Update or add tests for component rendering, accessibility-relevant states, and visual fallback behavior.
6. Validate the app manually against the imported design artifact.

Rollback strategy: keep changes isolated to the Liquid Glass v2 tokens/utilities and component variants where possible so the app can revert to previous visual variants without changing business logic.

## Open Questions

- Which exact screens/components in the app should receive the Liquid Glass v2 treatment after inspecting the imported design artifact?
- Does the imported artifact define responsive/mobile states that must be matched exactly?
- Are there existing visual regression tools in this repo that should be updated for the new treatment?
