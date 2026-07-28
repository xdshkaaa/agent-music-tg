import type { AppDb } from "../db";

/**
 * Remembered cross-platform substitutions: `uri` (what the client asks for)
 * → `alt_uri` (what actually has playable audio, on the other backend).
 *
 * Reads sit on the hot streaming path — every Range request for a substituted
 * track goes through here — so lookups are memoized in process. The table is
 * only ever written by this server, so the mirror can never go stale behind
 * another writer.
 */
const memo = new Map<string, string | null>();
const MAX_MEMO_ENTRIES = 5_000;

function remember(uri: string, altUri: string | null): void {
  if (memo.size >= MAX_MEMO_ENTRIES) {
    const oldest = memo.keys().next().value;
    if (oldest !== undefined) memo.delete(oldest);
  }
  memo.set(uri, altUri);
}

export function getAlternate(db: AppDb, uri: string): string | null {
  const cached = memo.get(uri);
  if (cached !== undefined) return cached;
  const row = db
    .query<{ alt_uri: string }, [string]>(`SELECT alt_uri FROM track_alternates WHERE uri = ?`)
    .get(uri);
  const altUri = row?.alt_uri ?? null;
  remember(uri, altUri);
  return altUri;
}

export function setAlternate(
  db: AppDb,
  uri: string,
  altUri: string,
  meta: { title: string; artist: string },
): void {
  db.run(
    `INSERT INTO track_alternates (uri, alt_uri, title, artist) VALUES (?, ?, ?, ?)
     ON CONFLICT(uri) DO UPDATE SET alt_uri = excluded.alt_uri, title = excluded.title,
       artist = excluded.artist, created_at = unixepoch()`,
    [uri, altUri, meta.title, meta.artist],
  );
  remember(uri, altUri);
}

/** Drops a substitution that stopped working, so the next play re-searches. */
export function clearAlternate(db: AppDb, uri: string): void {
  db.run(`DELETE FROM track_alternates WHERE uri = ?`, [uri]);
  remember(uri, null);
}

/** Test seam: the memo is module-level and would otherwise leak between cases. */
export function __resetAlternatesMemoForTests(): void {
  memo.clear();
}
