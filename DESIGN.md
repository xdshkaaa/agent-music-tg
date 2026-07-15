---
name: agent-music-tg Mini App
description: Quiet Liquid Glass UI for a Telegram Mini App that turns moods into playlists
colors:
  electric-violet: "#a855f7"
  violet-deep: "#7C3AED"
  night-bg: "#050508"
  glass-text: "#f2f3f5"
  glass-muted: "#f2f3f59e"
  panel-dark: "#1a1c2466"
  hairline: "#ffffff1a"
  day-bg: "#EEEEF3"
  ink: "#0d0d10"
typography:
  display:
    fontFamily: "Golos Text, -apple-system, BlinkMacSystemFont, sans-serif"
    fontWeight: 700
    lineHeight: 1.1
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.45
rounded:
  panel: "28px"
  input: "20px"
  pill: "999px"
spacing:
  sm: "8px"
  md: "12px"
  lg: "16px"
components:
  button-primary:
    backgroundColor: "{colors.electric-violet}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
  button-glass:
    backgroundColor: "{colors.panel-dark}"
    textColor: "{colors.glass-text}"
    rounded: "{rounded.pill}"
  input-glass:
    backgroundColor: "#ffffff0d"
    textColor: "{colors.glass-text}"
    rounded: "{rounded.input}"
---

# Design System: agent-music-tg Mini App

## 1. Overview

**Creative North Star: "Quiet Glass"**

Glass exists but recedes. The app is a calm, near-black room inside Telegram where frosted panels float just enough to organize content — the prompt, the tracks, the player — and never enough to become the show. Blur, specular insets, and translucency are structural material, not decoration: every glass surface earns its place by separating a layer of hierarchy. The personality is calm minimal utility: fast, direct, unceremonious, Russian-language voice.

The system explicitly rejects the Spotify-clone look (green-on-black, browsing-first density) and the cheap default-Telegram-bot look (unstyled lists, emoji-as-design).

**Key Characteristics:**
- Near-black base (`#050508`) with dual light scheme (`#EEEEF3`), driven by Telegram theme.
- One accent — Electric Violet — reserved for primary actions and active state.
- Glass panels with structural blur (22–24px) and specular top-edge insets.
- System fonts for UI; Golos Text only for display headings.
- Short, state-conveying motion (0.18s ease; 0.35s morph for layout shifts).

## 2. Colors

Restrained strategy: two neutral schemes plus a single violet voice.

### Primary
- **Electric Violet** (#a855f7): primary buttons, active nav state, selection indicators, focus tint. Interactive-only — violet on a surface means "you can act here".
- **Deep Violet** (#7C3AED): pressed/hover depth of the primary action.

### Neutral
- **Night** (#050508): dark-scheme app background.
- **Day** (#EEEEF3): light-scheme app background.
- **Glass Text** (#f2f3f5) / **Ink** (#0d0d10): body text per scheme.
- **Muted** (62% alpha of text color): secondary labels, hints, timestamps.
- **Panel** (rgba(26,28,36,.4) dark / rgba(255,255,255,.5) light): glass surface fill.
- **Hairline** (rgba(255,255,255,.1) dark / rgba(13,13,16,.08) light): dividers, panel borders.

### Named Rules
**The Signal Rule.** Violet appears only on interactive or active elements — never as ambient decoration, background wash, or gradient text.
**The One Room Rule.** All surfaces derive from the scheme's base plus white/black alpha. No third hue family enters the neutral stack.

## 3. Typography

**Display Font:** Golos Text (with -apple-system fallback)
**Body Font:** system-ui stack (SF Pro Text on iOS)

**Character:** Native-feeling and quiet. Body text is the platform's own voice; Golos Text appears only where a screen needs one strong headline — a distinctly Cyrillic-native grotesque, not the Inter-family default.

### Hierarchy
- **Display** (700, ~28–32px, 1.1): screen hero headings (prompt screen) only.
- **Title** (600, 17–20px): panel and section titles.
- **Body** (400, 16px, 1.45): prompts, track titles, descriptions.
- **Label** (500, 13–14px): muted metadata, nav labels, chips.

### Named Rules
**The One Headline Rule.** At most one display-size heading per screen; everything else stays in the body/title band.

## 4. Elevation

Structural glass layering: depth *is* hierarchy. Each surface pairs a backdrop blur with a specular inset (light top edge, dark bottom edge) and a soft drop shadow; the deeper the shadow tier, the higher the layer floats. Where `backdrop-filter` is unavailable or `prefers-reduced-transparency` is set, opaque fallback fills (`--lg-v2-fallback-*`) replace transparency.

### Shadow Vocabulary
- **sm** (`inset 0 1px 0 rgba(255,255,255,.12), inset 0 -1px 0 rgba(0,0,0,.15), 0 2px 8px rgba(0,0,0,.2)`): chips, small controls.
- **md** (`… 0 4px 16px rgba(0,0,0,.3), 0 1px 3px rgba(0,0,0,.15)`): panels, cards.
- **lg / float** (`… 0 8px 32px rgba(0,0,0,.4)` / `0 10px 30px rgba(0,0,0,.4)`): dock, player bar, floating overlays.
- **active** (`inset 0 1px 2px rgba(0,0,0,.25) …`): pressed state — the surface sinks.

### Named Rules
**The Three Layers Rule.** A screen has at most three depth tiers: background, panels, floating chrome (dock/player). Nothing floats above the chrome except the OS.

## 5. Components

Refined and restrained: controls are pills and soft panels that respond by sinking, not bouncing.

### Buttons
- **Shape:** full pill (999px).
- **Primary:** Electric Violet fill, white text; deepens to #7C3AED on press.
- **Glass:** panel fill + hairline border + specular inset; text color of scheme.
- **Focus:** visible `:focus-visible` box-shadow ring; **Active:** `--glass-shadow-active` sink.
- **Disabled:** reduced opacity, no shadow response.

### Chips (prompt suggestions, top-bar chips)
- **Style:** `liquid-glass-v2-chip` — white 7% fill, 9% border, pill shape; hover 12% fill (hover-capable devices only).

### Cards / Containers
- **Corner Style:** softly rounded (28px).
- **Background:** glass panel fill + backdrop blur (22px) + saturation 130%.
- **Shadow Strategy:** md tier; lg only for floating chrome.
- **Border:** 1px hairline.
- **Internal Padding:** 16px.

### Inputs
- **Style:** white 5% fill (60% light), 20px radius, hairline border.
- **Focus:** border/box-shadow shift on `:focus-visible`; no color flood.

### Navigation (bottom dock)
- **Style:** floating glass dock (58px), pill indicator morphs between tabs (0.35s spring-ish cubic-bezier), active tab in Electric Violet, labels 13px.

### Player Bar (signature)
Floating mini-player above the dock: artwork thumbnail, title/artist stack, transport controls; lg-tier shadow; syncs with the full-screen player.

## 6. Do's and Don'ts

### Do:
- **Do** reserve Electric Violet (#a855f7) for interactive/active elements (The Signal Rule).
- **Do** ship opaque fallbacks for every glass surface (`prefers-reduced-transparency`, missing `backdrop-filter`).
- **Do** honor `prefers-reduced-motion` on every transition — crossfade or instant.
- **Do** keep body text ≥4.5:1 against the *effective* glass background in both schemes.
- **Do** keep transitions at 0.18s ease; 0.35s only for layout morphs.

### Don't:
- **Don't** imitate Spotify — no green-on-black identity, no browsing-first layouts.
- **Don't** regress to a cheap Telegram bot UI — no unstyled lists, no emoji-as-design.
- **Don't** add glass-on-glass nesting (a glass card inside a glass panel) — one glass layer per depth tier.
- **Don't** use violet as ambient decoration, gradient text, or background wash.
- **Don't** exceed three depth tiers on a screen.
