/** Maps items with at most `limit` concurrent invocations, preserving input order in the result. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i] as T, i);
    }
  });
  await Promise.all(workers);
  return results;
}

export interface Semaphore {
  /** Runs `fn` once a slot is free, releasing it even if `fn` throws. */
  run<T>(fn: () => Promise<T>): Promise<T>;
  /** Slots currently held — for tests and diagnostics. */
  readonly active: number;
}

/**
 * FIFO counting semaphore. Used to cap how many yt-dlp processes can exist at
 * once: both the download pipeline and the streaming proxy spawn them, and a
 * VPS falls over long before either path hits a logical limit of its own.
 */
export function createSemaphore(capacity: number): Semaphore {
  const cap = Math.max(1, capacity);
  const waiters: (() => void)[] = [];
  let running = 0;

  return {
    get active() {
      return running;
    },
    async run<T>(fn: () => Promise<T>): Promise<T> {
      // Loop rather than a single check: a waiter woken by a release must
      // re-test the cap, since another caller can win the slot in between.
      while (running >= cap) {
        await new Promise<void>((resolve) => waiters.push(resolve));
      }
      running++;
      try {
        return await fn();
      } finally {
        running--;
        waiters.shift()?.();
      }
    },
  };
}

/** Resolves with `fallback` if `promise` does not settle within `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
