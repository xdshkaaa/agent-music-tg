import { useEffect, useState } from "react";
import { X, MusicNotesPlus, Plus, Check, CircleNotch, Sparkle } from "@phosphor-icons/react";
import { api, PlaylistLimitReachedError, type Playlist } from "../lib/api";
import { openStarsInvoice } from "../lib/telegram";
import { useDialog } from "../lib/useDialog";
import { OPEN_ADD_TO_PLAYLIST_EVENT, type AddToPlaylistRequest } from "./AddToPlaylistButton";

type RowState =
  | { kind: "idle" }
  | { kind: "adding"; done: number; total: number }
  | { kind: "added"; added: number }
  | { kind: "duplicate" };

const IDLE: RowState = { kind: "idle" };

/**
 * Global bottom sheet for the Add-to-Playlist flow — mounted once in App so any
 * screen can trigger it via requestAddToPlaylist() without prop drilling.
 */
export function AddToPlaylistSheet() {
  const [request, setRequest] = useState<AddToPlaylistRequest | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [rowState, setRowState] = useState<Record<number, RowState>>({});
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [limitPrompt, setLimitPrompt] = useState<{ starsPrice: number } | null>(null);
  const [buyBusy, setBuyBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent<AddToPlaylistRequest>).detail;
      setRequest(detail);
      setPlaylists(null);
      setRowState({});
      setCreating(false);
      setNewName(detail.suggestedName ?? "");
      setLimitPrompt(null);
      setError(null);
      api.playlists().then((r) => setPlaylists(r.playlists)).catch((e) => setError(e instanceof Error ? e.message : String(e)));
    }
    window.addEventListener(OPEN_ADD_TO_PLAYLIST_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_ADD_TO_PLAYLIST_EVENT, onOpen);
  }, []);

  function close() {
    setRequest(null);
  }

  // This component stays mounted for the app's whole lifetime and toggles its
  // own visibility, so `active` (not just mount/unmount) is what re-arms the
  // focus trap on each open — see useDialog's doc comment.
  const dialogRef = useDialog<HTMLDivElement>(!!request, close);

  if (!request) return null;

  /**
   * Sequential rather than parallel: the whole set can be a shared playlist,
   * and firing a dozen writes at once for one tap is a burst the row-order
   * (`position`) depends on not having.
   */
  async function addTo(playlistId: number) {
    if (!request) return;
    const tracks = request.tracks;
    setRowState((s) => ({ ...s, [playlistId]: { kind: "adding", done: 0, total: tracks.length } }));
    let added = 0;
    try {
      for (const [i, track] of tracks.entries()) {
        const { duplicate } = await api.addTrackToPlaylist(playlistId, track);
        if (!duplicate) added += 1;
        setRowState((s) => ({ ...s, [playlistId]: { kind: "adding", done: i + 1, total: tracks.length } }));
      }
      setRowState((s) => ({ ...s, [playlistId]: added === 0 ? { kind: "duplicate" } : { kind: "added", added } }));
      setPlaylists((prev) =>
        prev && added > 0 ? prev.map((p) => (p.id === playlistId ? { ...p, trackCount: p.trackCount + added } : p)) : prev,
      );
      setTimeout(close, added > 0 ? 900 : 700);
    } catch (e) {
      setRowState((s) => ({ ...s, [playlistId]: IDLE }));
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function createAndAdd() {
    const name = newName.trim();
    if (!name || !request) return;
    setCreateBusy(true);
    setError(null);
    try {
      const { playlist } = await api.createPlaylist(name);
      setPlaylists((prev) => [{ ...playlist }, ...(prev ?? [])]);
      await addTo(playlist.id);
    } catch (e) {
      if (e instanceof PlaylistLimitReachedError) {
        setLimitPrompt({ starsPrice: e.starsPrice });
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setCreateBusy(false);
    }
  }

  async function buySlot() {
    setBuyBusy(true);
    try {
      const { payUrl } = await api.buyPlaylistSlots(1);
      openStarsInvoice(payUrl, (status) => {
        setBuyBusy(false);
        if (status === "paid") setLimitPrompt(null);
      });
    } catch (e) {
      setBuyBusy(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="sbp-overlay" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="sbp-sheet" ref={dialogRef} role="dialog" aria-modal="true" aria-label="Добавить в плейлист">
        <div className="sbp-sheet-head">
          <span className="sbp-sheet-title">
            <MusicNotesPlus size={18} weight="bold" aria-hidden="true" /> Добавить в плейлист
          </span>
          <button type="button" className="sbp-close" aria-label="Закрыть" onClick={close}>
            <X size={18} weight="bold" />
          </button>
        </div>

        <p className="sbp-sheet-body" style={{ marginBottom: 10 }}>
          {request.label}
        </p>

        {error && <p role="alert" className="text-danger fs-micro" style={{ marginBottom: 8 }}>{error}</p>}

        {limitPrompt ? (
          <div className="add-to-playlist-limit">
            <p className="sbp-sheet-body">
              Лимит плейлистов исчерпан. Докупите слот за <strong>{limitPrompt.starsPrice}⭐</strong>, чтобы создать ещё один.
            </p>
            <button type="button" className="glass-button primary sbp-pay-btn" disabled={buyBusy} onClick={() => void buySlot()}>
              {buyBusy ? <CircleNotch size={16} className="spin" /> : <Sparkle size={16} weight="fill" />} Купить слот
            </button>
            <button type="button" className="sbp-cancel" onClick={() => setLimitPrompt(null)}>Отмена</button>
          </div>
        ) : (
          <>
            {playlists === null && (
              <p className="text-muted fs-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <CircleNotch size={16} className="spin" /> Загружаю плейлисты…
              </p>
            )}

            {playlists !== null && (
              <div className="add-to-playlist-list">
                {playlists.map((p) => {
                  const state = rowState[p.id] ?? IDLE;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className="add-to-playlist-row"
                      disabled={state.kind !== "idle"}
                      onClick={() => void addTo(p.id)}
                    >
                      <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                        <span className="add-to-playlist-row-name">{p.name}</span>
                        <span className="text-muted fs-micro"> · {p.trackCount} тр.</span>
                      </span>
                      {state.kind === "adding" && (
                        <>
                          <CircleNotch size={16} className="spin" />
                          {state.total > 1 && (
                            <span className="text-muted fs-micro">{state.done}/{state.total}</span>
                          )}
                        </>
                      )}
                      {state.kind === "added" && (
                        <>
                          <Check size={16} weight="bold" className="text-success" />
                          {state.added > 1 && <span className="text-muted fs-micro">+{state.added}</span>}
                        </>
                      )}
                      {state.kind === "duplicate" && <span className="text-muted fs-micro">уже есть</span>}
                    </button>
                  );
                })}

                {creating ? (
                  <div className="add-to-playlist-create-row">
                    <input
                      className="add-to-playlist-input"
                      placeholder="Название плейлиста"
                      aria-label="Название плейлиста"
                      value={newName}
                      autoFocus
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void createAndAdd();
                      }}
                    />
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Создать и добавить"
                      disabled={createBusy || newName.trim().length === 0}
                      onClick={() => void createAndAdd()}
                    >
                      {createBusy ? <CircleNotch size={18} className="spin" /> : <Check size={18} weight="bold" />}
                    </button>
                  </div>
                ) : (
                  <button type="button" className="add-to-playlist-row add-to-playlist-row--new" onClick={() => setCreating(true)}>
                    <Plus size={16} weight="bold" /> Создать плейлист
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
