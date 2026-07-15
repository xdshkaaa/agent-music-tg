## Why

The project needs to import and implement the provided Claude Design artifact `Liquid Glass v2.dc.html` so the app can adopt the updated liquid-glass visual treatment as an actionable, testable UI change. Capturing this as an OpenSpec change creates a clear contract for the visual behavior before implementation begins.

## What Changes

- Import the Claude Design project from `https://claude.ai/design/p/d273da77-ef23-4a9c-af67-371c4083eebe?file=Liquid+Glass+v2.dc.html` using the `claude_design` MCP.
- Implement the `Liquid Glass v2.dc.html` design in the project UI.
- Update the app's visual foundation to support the Liquid Glass v2 styling, including glass surfaces, translucency, blur, highlights, borders, and depth treatment.
- Ensure affected screens/components preserve existing behavior while adopting the new visual treatment.
- Keep implementation scoped to UI styling and component integration unless the imported design explicitly requires structural changes.

## Capabilities

### New Capabilities

- `liquid-glass-visual-system`: Defines the imported Liquid Glass v2 visual treatment and how it should be applied across relevant UI surfaces and components.

### Modified Capabilities

- `visual-foundation`: Updates visual requirements to include Liquid Glass v2 styling primitives and rendering expectations.
- `component-system`: Updates component-level requirements so reusable UI components can express the new Liquid Glass v2 treatment consistently.

## Impact

- Affected code: shared UI components, visual styling primitives/tokens, screen-level layouts using shared glass or surface components, and any design import/integration code needed to consume the Claude Design artifact.
- Affected specs: new `liquid-glass-visual-system` spec plus deltas for `visual-foundation` and `component-system`.
- Dependencies: requires access to the `claude_design` MCP and the referenced Claude Design project/file during implementation.
- APIs: no backend API changes expected.
- Systems: frontend rendering and visual regression/test coverage for affected UI surfaces.
