export type ShutdownSignal = "SIGTERM" | "SIGINT";

interface ShutdownDeps {
  stopPoller: () => void;
  stopPlategaPoller: () => void;
  stopBot: () => Promise<void>;
  exit: (code: number) => void;
  botStopTimeoutMs?: number;
}

function settleWithin(task: Promise<void>, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    timer.unref?.();
    task
      .catch(() => {})
      .finally(() => {
        clearTimeout(timer);
        resolve();
      });
  });
}

/** Coordinates one bounded shutdown for systemd restarts and local Ctrl-C. */
export function createShutdownHandler({
  stopPoller,
  stopPlategaPoller,
  stopBot,
  exit,
  botStopTimeoutMs = 3_000,
}: ShutdownDeps): (signal: ShutdownSignal) => Promise<void> {
  let shutdown: Promise<void> | null = null;

  return (_signal) => {
    if (shutdown) return shutdown;
    shutdown = (async () => {
      try {
        stopPoller();
      } catch {}
      try {
        stopPlategaPoller();
      } catch {}
      await settleWithin(Promise.resolve().then(stopBot), botStopTimeoutMs);
      exit(0);
    })();
    return shutdown;
  };
}
