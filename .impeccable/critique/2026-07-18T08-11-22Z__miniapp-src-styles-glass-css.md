---
target: miniapp typography
total_score: 32
p0_count: 1
p1_count: 1
timestamp: 2026-07-18T08-11-22Z
slug: miniapp-src-styles-glass-css
---
# Typography Critique — "Quiet Glass" Mini App

## Method
Dual-agent: A (design review) and B (deterministic scan synthesis) ran isolated.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Loading/empty/error all have real text |
| 2 | Match System / Real World | 4 | Russian voice is native and direct |
| 3 | User Control and Freedom | 4 | Undo/rename/escape all present |
| 4 | Consistency and Standards | 2 | Type ramp inconsistent; "section title" is 12/15/22/26 px depending on selector |
| 5 | Error Prevention | 3 | Inputs constrained (maxLength) |
| 6 | Recognition Rather Than Recall | 3 | Modes + recent searches labeled |
| 7 | Flexibility and Efficiency | 3 | Enter-to-submit present |
| 8 | Aesthetic and Minimalist | 3 | Calm at rest, busy under activity |
| 9 | Error Recovery | 3 | Inline error rows with text |
| 10 | Help and Documentation | 3 | Suggestions + empty-state hints |
| **Total** | | **32/40** | **Good — dragged down by typographic inconsistency, not function** |

## Anti-Patterns Verdict

**LLM assessment:** Not slop. Opinionated, internally coherent, Signal Rule enforced, no gradient text, real Cyrillic display face, honest glass fallbacks. Failings are craft-level inconsistencies, not template tells.

**Deterministic scan:** 110 findings (56 font-size, 33 radius, 21 color). All 21 color findings are TRUE signal — undocumented Tailwind-style status hues (#4ade80 green, #ef4444/#fca5a5/#b91c1c red family, #f59e0b/#d97706 amber family, #e7e9ee off-palette neutral) entering the "One Room Rule" neutral stack. Radius findings are mostly a methodology artifact: the documented 28/20/999px exist only as `var()` tokens invisible to the literal scanner; the flagged literals are genuine secondary component radii the 3-token scale omits. Font-size findings reveal the headline problem: DESIGN.md's ramp has DIVERGED from reality — the documented Display (28–32) and Title (17–20) bands have zero literal representation in glass.css, while a finer 10–15px label band and 22/26px sub-display sizes are used with no documentation.

## Overall Impression
A genuinely good, calm system that quietly breaks its own rules. Hero is warm and anchored; the moment a user acts (search mode, results + player overlay) the typographic hierarchy fractures into competing display headings and a missing Title tier. DESIGN.md is stale relative to the shipped CSS — the source of truth is wrong, which is why the detector fires 56 times.

## What's Working
1. Signal Rule disciplined — Accent Rose only on interactive/active.
2. Clean display/body split — Golos Text reserved for real headlines, system-ui body.
3. Honest glass fallbacks for `backdrop-filter` and reduced-transparency.

## Priority Issues

**[P0] Competing display headings violate the One Headline Rule**
What: `.prompt-hero h1` (clamp 28–34), `h1` (26px), `.playlist-name-input` (26px), `.player-screen-title` (22px), `.app-top-brand`/`.logo-chip` (14–15px display 700/800) all use `--font-display` at display scale. Results + player overlay = two display headings visible.
Why: Dilutes the one anchor the brand promises.
Fix: Demote `.player-screen-title` to Title band; demote `.app-top-brand`/`.logo-chip` to Label band with `--font-body`; keep one display element per screen.

**[P1] Muted & placeholder contrast fails WCAG AA in both schemes**
What: Dark placeholder rgba(242,243,245,0.45) on #242428 ≈ 2.9:1; light rgba(13,13,16,0.42) ≈ 3.4:1 — both below 4.5:1. `--text-muted-dark` is 0.6 while `--lg-v2-muted`/DESIGN say 0.62.
Why: Direct violation of PRODUCT/DESIGN spec; placeholders are first text read in empty field.
Fix: Dark placeholder → rgba(242,243,245,0.6); light → rgba(13,13,16,0.55); unify muted to 0.62.

**[P2] No real type scale — sizes scattered, Title tier missing**
What: Display band spans 22/26/28–34; Title band (17–20) has zero selectors; section titles are 12–15px (Label/Body territory). 11px `.player-artist` below Label floor.
Why: Flat undifferentiated middle; cognitive-load fail.
Fix: Add `--fs-display/title/body/label` tokens; promote `.search-section-title` to 17px/600; delete 11px.

**[P3] Display letter-spacing too tight for Cyrillic**
What: -0.02em at 800 weight crowds Cyrillic bowls (Ч, Щ, Д, Ж).
Fix: Relax display tracking to -0.01em for Cyrillic.

**[P3] Undocumented status colors leak into neutral stack**
What: 21 color findings — Tailwind reds/ambers/greens instead of documented #f87171/#34d399.
Fix: Reconcile DESIGN.md (document them) OR replace with documented palette.

## Persona Red Flags
**Casey (mobile TG):** 12px muted search section titles blur together while scrolling; 11px player artist borderline.
**Jordan (first-timer):** 26px playlist name reads as hero but is also editable field — rename discoverability weak; empty-state 13px list reads as plain text.
**Sam (a11y):** Two h1-level elements when player overlay opens over Results; `.search-section-title` is h2 at 12px (inverted size/semantics); placeholder faintness hurts low-vision zoom.

## Minor Observations
- Three button text sizes for same weight (13/14/15px).
- h2 15px/600 vs search-section-title h2 12px/700 — inconsistent heading semantics.
- Inline `style={{fontSize:13}}` bypasses scale (4+ times).
- Results track title uses nowrap+overflow:hidden with NO ellipsis — hard clip vs search rows' ellipsis.

## Questions
1. Is the brand wordmark a "headline" or a label — have you shipped two headlines per screen all along?
2. DESIGN promises a 17–20px Title tier, but no CSS lives there. Designed or forgotten?
3. Rose word inside the hero — signal the user can act on, or the one decorative exception breaking your Signal Rule?
