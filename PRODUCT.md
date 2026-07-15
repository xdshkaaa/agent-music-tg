# Product

## Register

product

## Platform

web

## Users

A small allowlist of Russian-speaking friends and insiders, using the Telegram Mini App (WebView) on their phones. They arrive with a mood or a vibe in mind and want a real playlist out of it with minimal friction — type a prompt, get tracks, listen or download. Admins (a subset) additionally manage offers, broadcasts, and the AI provider / music backend.

## Product Purpose

Turns a free-form mood/request into a playable playlist via an AI agent, sourced from YouTube Music or SoundCloud with no account linking. Success: a user gets a playlist they actually listen to (in-app or downloaded to their bot chat) in under a minute of interaction, with payments and history working invisibly around that core loop.

## Positioning

The fastest path from "I'm in a mood" to music playing — no accounts, no OAuth, no browsing, just a sentence in Telegram.

## Brand Personality

Calm minimal utility. The interface stays quiet and gets out of the way: speed and clarity over decoration. The existing Liquid Glass visual language is the substrate, not the point — glass effects should recede so the prompt, the tracks, and the player carry the screen. Russian-language voice: direct, friendly, unceremonious.

## Anti-references

- Not a Spotify clone — no green-on-black borrowed identity, no imitation of Spotify's browsing-first layout.
- Not a cheap Telegram bot UI — no default-webview look, unstyled lists, or emoji-as-design.

## Design Principles

- The prompt is the product: every screen either gets the user to a playlist or back to the prompt in one tap.
- Decoration recedes, content advances — glass and blur serve legibility and hierarchy, never spectacle.
- One motion vocabulary: short (150–250 ms), state-conveying transitions; nothing choreographed.
- Trust the phone: system fonts, native scrolling, Telegram theme awareness; the app should feel like it belongs in Telegram.
- States are first-class: loading, empty, error, and offline are designed, not defaulted.

## Accessibility & Inclusion

WCAG AA: body text ≥4.5:1 contrast against its (glass) background in both dark and light schemes; large text ≥3:1. All animation respects `prefers-reduced-motion` with crossfade or instant alternatives. Touch targets ≥44px in the dock and player controls.
