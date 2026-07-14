## 1. Extractor — probe method

- [x] 1.1 Add `ProbeResult` type and `probe(uri)` method to `Extractor` interface
- [x] 1.2 Implement `YtDlpExtractor.probe()` using `yt-dlp --dump-json --no-playlist`
- [x] 1.3 Add retry logic (2 retries, 1s delay) for transient probe failures
- [x] 1.4 Add `probe` export to `server/audio/extractor.ts`

## 2. Track verification service

- [x] 2.1 Create `TrackVerificationStatus` type (`pending | checking | verified | unavailable`)
- [x] 2.2 Create `TrackVerificationStore` class — in-memory `Map<uri, TrackVerificationStatus>` with promise-based wait
- [x] 2.3 Implement `verifyTracks(tracks, extractor, store)` with concurrent probe (3 at a time)
- [x] 2.4 Integrate verification start into `startGeneration()` / `resumeGeneration()` in `run-generation.ts`

## 3. Verification polling API

- [x] 3.1 Create `GET /api/tracks/verify?uris=...` endpoint in `audio-routes.ts`
- [x] 3.2 Wire `TrackVerificationStore` into `AudioDeps` and pass through server setup
- [x] 3.3 Add `api.verifyTracks(uris)` client method in `miniapp/src/lib/api.ts`

## 4. Mini App — verification UI

- [x] 4.1 Add verification status polling to `ResultsScreen.tsx` (every 2s, stop when all done)
- [x] 4.2 Show status icon per track: spinner (checking), green check (verified), red warning (unavailable)
- [x] 4.3 Block playback on unavailable tracks with toast "Трек недоступен"

## 5. Telegram bot — skip unavailable tracks

- [x] 5.1 Add verification status check in `deliverAutoAudio()` — skip `unavailable` tracks
- [x] 5.2 Add 30s wait for `pending`/`checking` tracks before delivery decision
- [x] 5.3 Include skipped tracks in delivery summary message
