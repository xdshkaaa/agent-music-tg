## 1. Glass background

- [x] 1.1 Replace `.top-bar` background opacity from 82% to 55% (`color-mix(in srgb, var(--canvas) 55%, transparent)`) — works for both schemes
- [x] 1.2 Update `.top-bar` backdrop-filter from `blur(14px)` to `blur(20px)`
- [x] 1.3 Light mode inherits the same rule via `var(--canvas)` — no separate override needed

## 2. Bottom border

- [x] 2.1 Add `border-bottom: 1px solid var(--hairline)` to `.top-bar` — `--hairline` adapts per scheme
- [x] 2.2 Light mode covered by same rule via `--hairline`

## 3. Wallet pill refinement

- [x] 3.1 Remove `border: 1px solid var(--hairline)` from `.wallet-pill`
- [x] 3.2 Wallet pill uses `var(--card)` background on glass bg — sufficient contrast: `#222224` on ~`#1A1A1C@55%` (dark), `#FFFFFF` on ~`#F7F6F3@55%` (light)

## 4. Verification

- [x] 4.1 Build miniapp: `cd miniapp && bun run build` — CSS changes compile clean; the 3 TS errors are pre-existing (unrelated to header)
- [x] 4.2 Header uses 55% canvas + blur(20px) — content scrolls through visibly blurred
- [x] 4.3 `border-bottom: 1px solid var(--hairline)` gives visible separation in dark mode (`#333336`)
- [x] 4.4 Light mode inherits same rules — 55% `#F7F6F3` + `#EAEAEA` hairline border
- [x] 4.5 Wallet pill: no border, `var(--card)` bg contrasts with glass header in both modes
