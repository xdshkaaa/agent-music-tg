## Context

The change applies the provided Nocturne design system to an existing mini-app currently named and structured around a liquid/glass visual direction. The relevant implementation files live outside the repo-local OpenSpec planning root under `/Users/xdshka/Downloads/updated-liquid-glass-mini-app/`, while the planning artifacts are scoped to `/Users/xdshka/Desktop/Projects/spotify-harness-tg/openspec/changes/apply-nocturne-design-system`.

The Nocturne bundle provides the authoritative design-system source: `styles.css`, `readme.md`, manifest/bundle metadata, and example component guidance. Implementation should consume those assets rather than recreate parallel CSS tokens or hard-code colors, spacing, fonts, radii, or shadows.

Existing OpenSpec specs include visual and component requirements for warm monochrome, minimalist, and glass-oriented behavior. This change intentionally supersedes those requirements where they conflict with Nocturne: dark neutral-blue ground, Inter typography, compact spacing, 8px radius scale, tokenized tonal ramps, outlined accent actions, and non-glass surfaces.

## Goals / Non-Goals

**Goals:**

- Make the mini-app visually conform to the provided Nocturne design system.
- Use Nocturne tokens and component classes as the implementation source of truth.
- Replace liquid/glass visual assumptions with dark, compact, token-driven surfaces and components.
- Ensure interaction states are consistently themed: hover, pressed, keyboard focus, selection, and disabled states.
- Keep styling maintainable by linking or importing the Nocturne stylesheet instead of duplicating large parts of it.
- Preserve app behavior while changing presentation and component markup as needed.

**Non-Goals:**

- No backend, API, authentication, payment, or data model changes.
- No redesign beyond the provided Nocturne direction.
- No new design-system palette or component language.
- No change to the OpenSpec storage model or CLI workflow.
- No attempt to support both the previous glass theme and Nocturne as equal runtime themes unless the existing app already requires theme switching.

## Decisions

### Use the bundled Nocturne stylesheet as the visual source of truth

Implementation should link to the provided `styles.css` and use its custom properties and component classes.

- Rationale: The design-system guidance explicitly states that every page should link one stylesheet and take color, font, spacing, radius, and shadow from its variables.
- Alternative considered: Copy selected variables into the app stylesheet. This risks drift from the supplied bundle and makes adherence harder to validate.
- Alternative considered: Translate Nocturne into existing liquid/glass variables. This preserves old abstractions that conflict with Nocturne and weakens the change.

### Refactor markup toward Nocturne component classes

Existing buttons, cards, tags, inputs, navigation, tables, dialogs, and image wrappers should be mapped to `.btn`, `.tag`, `.field`, `.input`, `.card`, `.nav`, `.table`, `.dialog`, `.lighten`, and related variants where applicable.

- Rationale: The readme positions component classes as reusable patterns and discourages inventing parallel ones.
- Alternative considered: Keep old class names and restyle them to look similar. This can work for compatibility wrappers, but primary implementation should use Nocturne classes where markup edits are practical.

### Keep accent usage constrained

Use the blurple accent as outline, border, rule, mark, focus, glow, and subtle state tint. Do not use it as a broad filled background except for explicitly sanctioned section/stat-band uses.

- Rationale: Nocturne relies on tonal ramps and low chroma for contrast, not saturated floods.
- Alternative considered: Convert primary CTAs to filled accent buttons. This conflicts with the design direction that primary actions are outlined, not solid-filled.

### Remove conflicting liquid/glass effects

Presentation should avoid backdrop-filter glass panels, heavy blur/saturation effects, oversized pill radii, and stacked glass shadows where they conflict with Nocturne.

- Rationale: Nocturne uses soft dark surfaces, subtle borders, tonal ramps, and tuned shadows rather than glassmorphism.
- Alternative considered: Layer Nocturne colors over the existing glass system. This would produce inconsistent contrast and fail to express the quiet compact dark interface.

### Treat imagery through the `.lighten` wrapper

Hero and content photographs should be wrapped with `.lighten` when present.

- Rationale: The design system uses `mix-blend-mode: lighten` so dark photo backgrounds fall away into the page ground.
- Alternative considered: Leave images unwrapped. This can create rectangular dark blocks that do not blend with the page.

## Risks / Trade-offs

- [Risk] Existing app scripts may depend on old class names for event delegation or DOM lookup. → Mitigation: Preserve required behavioral hooks with separate data attributes or compatibility classes while adding Nocturne visual classes.
- [Risk] The Nocturne stylesheet path may be wrong from one or more HTML files. → Mitigation: Use relative paths from each HTML file to the design-system directory and verify rendered pages load the stylesheet.
- [Risk] Applying component classes wholesale may alter layout density or spacing more than expected. → Mitigation: Prefer Nocturne spacing variables and adjust structure minimally, validating major screens after each conversion.
- [Risk] Existing specs still describe previous warm monochrome/glass behavior. → Mitigation: Add change specs that explicitly supersede conflicting requirements for this change.
- [Risk] Hard-coded legacy colors may remain in inline styles or scripts. → Mitigation: Search the app files for hex values, font names, shadows, blur filters, and border radii after implementation and replace with tokens where possible.

## Migration Plan

1. Link the Nocturne `styles.css` from each affected HTML page using the correct relative path.
2. Audit existing markup and identify visual components: navigation/header, buttons, cards, tags, forms, tables, dialogs, images, and layout sections.
3. Replace or augment legacy classes with Nocturne component classes while preserving JavaScript hooks.
4. Remove or neutralize conflicting liquid/glass CSS, inline styles, and hard-coded visual values.
5. Wrap content/hero photographs with `.lighten` where applicable.
6. Verify keyboard focus, hover, pressed, selection, and disabled states use Nocturne styling.
7. Update README or project notes to document that the mini-app now consumes the Nocturne design system.

Rollback strategy: remove the Nocturne stylesheet links and revert the markup/CSS edits from the implementation commit. Because this is presentation-only, rollback should not require data migration.

## Open Questions

- Should both `Current Mini-App.dc.html` and `Liquid Glass v2.dc.html` remain as separate variants, or should one become the canonical Nocturne version?
- Should the design-system assets be copied into the app root for simpler paths, or should the current `_ds/nocturne-...` directory remain the linked source?
- Are there visual regression screenshots or acceptance captures expected for this mini-app after implementation?
