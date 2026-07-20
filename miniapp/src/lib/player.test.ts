import { describe, expect, test } from "bun:test";
import {
  PlaybackFeedbackTracker,
  configureMediaSessionActions,
  syncMediaSessionPosition,
} from "./player";

describe("system media controls", () => {
  test("an external player can seek to an exact playback position", () => {
    const handlers = new Map<MediaSessionAction, MediaSessionActionHandler | null>();
    const mediaSession = {
      setActionHandler(action: MediaSessionAction, handler: MediaSessionActionHandler | null) {
        handlers.set(action, handler);
      },
    } as unknown as MediaSession;
    let soughtTo: number | undefined;

    configureMediaSessionActions(mediaSession, {
      play() {},
      pause() {},
      nextTrack() {},
      previousTrack() {},
      seekTo(positionSeconds) {
        soughtTo = positionSeconds;
      },
    });

    const seekTo = handlers.get("seekto");
    expect(seekTo).toBeFunction();
    seekTo!({ action: "seekto", seekTime: 73 } as MediaSessionActionDetails);
    expect(soughtTo).toBe(73);
  });

  test("publishes a valid timeline for the system scrubber", () => {
    let positionState: MediaPositionState | undefined;
    const mediaSession = {
      setPositionState(state?: MediaPositionState) {
        positionState = state;
      },
    } as unknown as MediaSession;

    syncMediaSessionPosition(mediaSession, 240, 73);

    expect(positionState).toEqual({ duration: 240, position: 73, playbackRate: 1 });
  });
});

describe("playback recommendation feedback", () => {
  const first = { uri: "ytm:first", title: "First", artist: "Artist" };
  const second = { uri: "ytm:second", title: "Second", artist: "Artist" };

  test("deduplicates start and completion events for one session", () => {
    const events: string[] = [];
    const tracker = new PlaybackFeedbackTracker((event) => events.push(event));
    tracker.switchTo(first);
    tracker.markPlaying();
    tracker.markPlaying();
    tracker.updateProgress(80, 100);
    tracker.updateProgress(95, 100);
    tracker.markEnded();
    expect(events).toEqual(["play_started", "play_completed"]);
  });

  test("marks an early track switch as one skip", () => {
    const events: string[] = [];
    const tracker = new PlaybackFeedbackTracker((event) => events.push(event));
    tracker.switchTo(first);
    tracker.markPlaying();
    tracker.updateProgress(10, 100);
    tracker.switchTo(second);
    tracker.switchTo(second);
    expect(events).toEqual(["play_started", "skipped"]);
  });

  test("feedback transport failures never escape into player control flow", () => {
    const tracker = new PlaybackFeedbackTracker(() => {
      throw new Error("offline");
    });
    expect(() => {
      tracker.switchTo(first);
      tracker.markPlaying();
      tracker.updateProgress(90, 100);
      tracker.switchTo(second);
    }).not.toThrow();
  });
});
