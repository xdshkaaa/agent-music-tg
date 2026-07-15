## Why

The `pre-play-track-verification` change already marks unavailable tracks with a red icon, but they still occupy the results list and the user has to spot them manually. The goal is to hide tracks confirmed `unavailable` from the Mini App results list so the user only sees playable tracks.

## What Changes

- Filter the Mini App results list to exclude tracks whose verification status is `unavailable`.
- Keep `checking` / `pending` / `verified` tracks visible (hide only after verification confirms `unavailable`).
- Show an empty state when every track ends up hidden.
- Mini App results list only. The play queue, the «Скачать» button, and Telegram bot messages are unchanged (their handling of unavailable tracks already exists).

## Capabilities

### New Capabilities
<!-- нет новых capability на уровне spec -->

### Modified Capabilities
<!-- существующие spec не меняются -->

## Impact

- `miniapp/src/screens/ResultsScreen.tsx` — фильтрация списка треков по статусу верификации, пустое состояние.
