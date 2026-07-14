## Context

The miniapp frontend uses `glass.css` with glassmorphism (backdrop-filter, multi-layer inset shadows, highlight gradients), a vivid `#a855f7` purple accent, Inter Tight font, and pervasive emoji. All of this needs to be replaced with the Premium Utilitarian Minimalism system: warm monochrome flat palette, muted pastel accents, system-native font stack, and icon-only semantics.

The change touches only the miniapp frontend (`miniapp/src/`). No server or backend changes.

## Goals / Non-Goals

**Goals:**
- Replace glassmorphism with flat utilitarian surfaces
- Replace `#a855f7` purple with muted pastel accents (blue, green, red, yellow)
- Remove Inter Tight; use SF Pro Display / Geist Sans stack
- Replace all emoji with Phosphor Bold/Fill icons
- Normalize border-radius: cards 12px, buttons 6px, no pills on containers
- Remove heavy shadows; use ultra-diffuse or none
- Extract repetitive inline styles into CSS classes
- Keep motion system (animations already match spec)

**Non-Goals:**
- No behavior/functionality changes — visual only
- No new dependencies — Phosphor already installed
- No server/bot/payment changes
- No restructuring of React component tree or props
- No dark mode redesign beyond desaturating the palette

## Decisions

1. **CSS-only approach for glass removal** — Instead of rewriting components, we update `glass.css` variables and class definitions. The existing `.glass-panel`, `.glass-button`, `.glass-input` class names stay; their visual properties change. This minimizes diff and risk.

2. **CSS custom properties for palette** — Define `--accent-blue`, `--accent-green`, `--accent-red`, `--accent-yellow` as muted pastels. Replace `--accent: #a855f7` usage across components with semantic accent variables. Each pastel pair has a background and text color.

3. **No IntersectionObserver library** — Protocol recommends it, but the current mount-based `.reveal` CSS animation works reliably in the Telegram mini app WebView. We keep the CSS approach (which respects reduced-motion) and avoid adding an observer dependency. The motion spec is met by the existing implementation.

4. **Inline style extraction as needed, not exhaustive** — We extract styles that appear 3+ times across files. One-off customizations stay inline. The goal is reducing repetition, not eliminating all inline styles.

5. **Phosphor weight migration** — Existing icons use `weight="regular"`. Migration to `weight="bold"` or `weight="fill"` happens alongside emoji replacement in each file. This is one pass per file, not two.

## Risks / Trade-offs

- **[Risk] Dark scheme appearance** — Removing `#0a0a0b` near-black for a warm dark tone may look less premium in Telegram's dark mode. *Mitigation: use a warm charcoal `#1a1a1c` instead of pure black, keeping the dark aesthetic but adding warmth.*
- **[Risk] Accent color ambiguity** — Using 4 pastel accents (red/blue/green/yellow) instead of one purple may reduce visual consistency. *Mitigation: use blue (`#E1F3FE`/`#1F6C9F`) as the primary interactive accent; other colors are semantic (green=success, red=error/destructive, yellow=warning).*
- **[Risk] Button flatness feels cheap** — Removing all shadow from buttons may make them look flat and unbounded. *Mitigation: use `border: 1px solid var(--hairline)` on default buttons and `background: #111111` solid on primary for clear affordance.*
- **[Risk] Inline style extraction scope creep** — Could spend too long chasing every inline style. *Mitigation: target only patterns repeated 3+ times. Leave one-off inline styles untouched.*
