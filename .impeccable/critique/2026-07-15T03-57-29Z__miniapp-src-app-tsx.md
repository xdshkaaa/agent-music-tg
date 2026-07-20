---
target: whole miniapp app
total_score: 30
p0_count: 0
p1_count: 2
timestamp: 2026-07-15T03-57-29Z
slug: miniapp-src-app-tsx
---
Method: dual-agent (A: a6043cbc451544ed8 · B: ac648ca12e6ed0884)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | No "checking payment" state after crypto redirect — silent poll up to 15s |
| 2 | Match System / Real World | 4 | Plain direct Russian copy, no jargon |
| 3 | User Control and Freedom | 3 | Tab-switch collapses nav history to length 1 — no cross-tab back |
| 4 | Consistency and Standards | 3 | Track-row art has no fallback glyph; player-bar art does |
| 5 | Error Prevention | 3 | Delete-download has inline confirm; buy/submit guards solid |
| 6 | Recognition Rather Than Recall | 3 | Clarify options are visible buttons, but list is unbounded |
| 7 | Flexibility and Efficiency | 2 | No shortcuts, no re-edit of a clarify answer without full restart |
| 8 | Aesthetic and Minimalist Design | 4 | One accent, terse copy, no decorative filler |
| 9 | Error Recovery | 3 | ErrorBanner auto-dismisses in 10s with no retry when `onRetry` absent |
| 10 | Help and Documentation | 2 | No inline help; crypto vs Stars distinction unexplained |
| **Total** | | **30/40** | **Good — solid foundation, real gaps not surface slop** |

## Anti-Patterns Verdict

**LLM assessment**: Not AI slop. The glass system shows real craft — self-colored borders, tonal shadows, genuine `backdrop-filter` + saturate stack, `@supports`/`prefers-reduced-transparency` fallbacks, one desaturated violet accent used tonally. Two structural tells survive: ResultsScreen's filled-primary-next-to-outline-secondary button pair (`Скачать` / `Новый плейлист`), and heavy reliance on the pill/chip vocabulary across category filters, admin tabs, and the dock (cohesive, but componentized rather than composed).

**Deterministic scan**: `detect.mjs --json miniapp/src` — exit 2, 62 findings, all in `glass.css`:
- `design-system-font-size` ×31 (11-26px values off the documented type ramp)
- `design-system-radius` ×13 (2/4/8/9/10/12/14/16/18/24px off the documented `panel:28px / input:20px / pill:999px` scale)
- `design-system-color` ×18, concentrated in an amber/red warning-card block (glass.css:2586-2688: `#fde68a #92400e #f59e0b #d97706 #fca5a5 #b91c1c`) plus a red danger block (1139-1147: `#ef4444`, `rgba(239,68,68,.15)`)

Manual grep corroborated and added: no `lucide-react` usage (no icon-in-tile risk); no `background-clip:text` gradient-text anywhere; one confirmed "ghost card" pattern (glass.css:2585-2690 — 16px radius + 36px-blur box-shadow + 8 rogue hexes, all in the same warning-card block the detector flagged); 7 transitions running 350-1400ms against the project's stated 150-250ms motion budget (two of those are infinite-loop shimmer/spinner, which may be a reasonable exception); 11 `prefers-reduced-motion` blocks — solid coverage, no gap.

**Browser evidence**: Skipped — no browser automation tool exposed in this session (no dev server was running). No visual overlay was generated; do not treat this critique as visually verified.

## Overall Impression

This is a professionally built glass system with real engineering care in the state machinery (verification polling with a hard poll cap and `document.hidden` pause, reduced-motion/reduced-transparency handled thoroughly, disabled-state guards). It is not AI slop. The gap between "solid" and "excellent" is concentrated in one file (`glass.css`'s amber/red status-card block) and one moment (the payment flow), not spread across the system. Fix those two things and this clears 34+/40.

## What's Working

1. **Reduced-motion / reduced-transparency handling** (glass.css:446-480, 514-524, 732-736, 1313-1317, 2555-2566) — comprehensive and correct, including a real CSS fallback panel and `@supports not (backdrop-filter)`. Most projects skip this; this one didn't.
2. **The verification-polling pattern** (ResultsScreen.tsx:27-62) — pauses on `document.hidden`, hard `MAX_POLLS` cap, per-row status icons. This is exactly the "states are first-class" principle from PRODUCT.md, executed.
3. **Amber (not red) error toast with gated technical detail** (glass.css:2568-2701) — a deliberate, reasoned choice, not a default. Ironically the same block is where most of the detector's color/shadow findings concentrate — the idea is right, the execution drifted from tokens.

## Priority Issues

**[P1] Silent gap during crypto payment confirmation**
- **Why it matters**: Highest-stakes moment in the app (real money); user leaves the Mini App for CryptoBot, returns, sees nothing for up to 15s of polling. Directly violates the project's own "states are first-class... reassurance at high-stakes moments" principle.
- **Fix**: Show a "Проверяем платёж…" pending state the instant the app regains focus after redirect, not just a toast on success.
- **Suggested command**: `$impeccable harden`

**[P1] ErrorBanner auto-dismisses in 10s with no retry when `onRetry` is absent** (ErrorBanner.tsx:26-34)
- **Why it matters**: Applies to BuyScreen purchase errors — a payment failure message can vanish before a distracted (Casey-persona) user reads it, with no way to recover it.
- **Fix**: Don't auto-dismiss errors that lack a retry handler; require explicit dismissal, or always attach a retry/dismiss action to payment-adjacent errors.
- **Suggested command**: `$impeccable harden`

**[P2] Amber/red status-card block is the one place the design system drifted from tokens** (glass.css:2585-2690, 1139-1147)
- **Why it matters**: 8+ rogue hexes plus a 16px-radius/36px-blur "ghost card" shadow pairing, all in one block — both the detector and manual grep independently converged here. It's the single concentration of every mechanical finding in the whole app.
- **Fix**: Fold amber/red warning and danger states into the documented token set (add `--warning`, `--danger` tokens derived from the existing palette) and align that block's radius/shadow to the documented scale.
- **Suggested command**: `$impeccable polish`

**[P2] `ClarifyScreen` renders an unbounded `options.map()` with no cap** (ClarifyScreen.tsx:19-32)
- **Why it matters**: Violates the project's own ≤4 minimal-choices cognitive-load rule if the AI ever returns 5+ options — no code-level guard exists today.
- **Fix**: Cap rendered options (e.g. slice to 4) or add a scrollable/wrapped container with a visible "more" affordance.
- **Suggested command**: `$impeccable clarify`

**[P2] Broken CSS custom property reference** (ResultsScreen.tsx:80-82, `var(--text-muted)`)
- **Why it matters**: `--text-muted` isn't defined anywhere in glass.css (only `--text-muted-dark`/`--text-muted-light` exist) — the verification spinner's color silently falls back to `inherit` instead of the intended muted tone. Likely introduced in the recent "polish miniapp UI defects" pass.
- **Fix**: Replace with `var(--text-muted-dark)` + light-scheme override, or reuse the existing `.text-muted` class.
- **Suggested command**: `$impeccable polish`

## Persona Red Flags

**Jordan (First-Timer)**: PromptScreen is immediately legible on open — good. If a clarify question returns many options, Jordan hits an unbounded list with no indication of how many there are (P2 above) — a first-run confusion risk right at the start of the flow.

**Casey (Distracted Mobile)**: The 10s error auto-dismiss (P1 above) is the sharpest risk — glancing away mid-purchase and returning to a vanished error with no retry button is a classic "did it work?" moment, worst-case during payment.

**Sam (Accessibility)**: Focus-visible outlines are consistently applied and touch targets mostly clear 44px, but `.dock-tab` computes to roughly 40px (padding 7px + 18px icon + 2px gap + ~13px label) — borderline under the project's own 44px bar. Several small captions (11-12px at 60-68% opacity ink — `.player-artist`, `.offer-label`, `.trial-card-label`, `.admin-settings-bar-label`) are a plausible sub-4.5:1 contrast risk in light mode against `--lg-v2-bg: #EEEEF3`, unconfirmed without a rendered-page check (no browser was available this run).

## Minor Observations

- `TAB_ORDER` in App.tsx (lines 47-55) maps "create" and "prompt"/"clarify"/"results" as separate keys to the same value — redundant, fragile if a new screen kind is added and forgotten here.
- Volume slider disappears entirely below 359px viewport width (glass.css:1848-1852) with no alternative control — silent feature removal.
- `hiResArtwork()` (PlayerScreen.tsx) string-replaces on two heuristics with no fallback comment noting the silent no-op if neither pattern matches.
- 7 transitions run 350ms-1.4s against the stated 150-250ms motion budget; two are infinite-loop shimmer/spinner (arguably a different category) but the rest (screen-enter/morph at 350ms, reveal at 500ms) are worth checking against the "one motion vocabulary" principle.
- `track-row` (ResultsScreen) lacks the "♪" fallback glyph that `player-bar-thumbnail` has for missing artwork — inconsistent empty-image treatment.

## Questions to Consider

- Is the "leave the app for CryptoBot and poll blind" flow intentional, or could the existing Telegram Stars flow become the default so purchases stay in-app with real-time status?
- Should the AI backend itself be constrained to return ≤4 clarify options, rather than relying on the frontend to defensively cap an unbounded list?
- PromptScreen uses the same glass-card treatment as every other screen — given "the prompt is the product," is there room to make it visually more confident/distinct so the IA principle shows up in the visual hierarchy too?
