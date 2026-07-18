import { useEffect, useState } from "react";
import { X, MusicNotesPlus, Plus, Check, CircleNotch, Sparkle } from "@phosphor-icons/react";
import { api, PlaylistLimitReachedError, type Playlist } from "../lib/api";
import { openStarsInvoice } from "../lib/telegram";
import { OPEN_ADD_TO_PLAYLIST_EVENT, type AddToPlaylistTrack } from "./AddToPlaylistButton";

type RowState = "idle" | "adding" | "added" | "duplicate";

/**
 * Global bottom sheet for the Add-to-Playlist flow — mounted once in App so any
 * screen can trigger it via requestAddToPlaylist() without prop drilling.
 */
export function AddToPlaylistSheet() {
  const [track, setTrack] = useState<AddToPlaylistTrack | null>(null);
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
      const detail = (e as CustomEvent<AddToPlaylistTrack>).detail;
      setTrack(detail);
      setPlaylists(null);
      setRowState({});
      setCreating(false);
      setNewName("");
      setLimitPrompt(null);
      setError(null);
      api.playlists().then((r) => setPlaylists(r.playlists)).catch((e) => setError(e instanceof Error ? e.message : String(e)));
    }
    window.addEventListener(OPEN_ADD_TO_PLAYLIST_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_ADD_TO_PLAYLIST_EVENT, onOpen);
  }, []);

  if (!track) return null;

  function close() {
    setTrack(null);
  }

  async function addTo(playlistId: number) {
    if (!track) return;
    setRowState((s) => ({ ...s, [playlistId]: "adding" }));
    try {
      const { duplicate } = await api.addTrackToPlaylist(playlistId, track);
      setRowState((s) => ({ ...s, [playlistId]: duplicate ? "duplicate" : "added" }));
      setPlaylists((prev) =>
        prev && !duplicate ? prev.map((p) => (p.id === playlistId ? { ...p, trackCount: p.trackCount + 1 } : p)) : prev,
      );
      setTimeout(close, 700);
    } catch (e) {
      setRowState((s) => ({ ...s, [playlistId]: "idle" }));
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function createAndAdd() {
    const name = newName.trim();
    if (!name || !track) return;
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
    <div className="sbp-overlay" role="dialog" aria-modal="true" aria-label="Добавить в плейлист" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="sbp-sheet">
        <div className="sbp-sheet-head">
          <span className="sbp-sheet-title">
            <MusicNotesPlus size={18} weight="bold" aria-hidden="true" /> Добавить в плейлист
          </span>
          <button type="button" className="sbp-close" aria-label="Закрыть" onClick={close}>
            <X size={18} weight="bold" />
          </button>
        </div>

        <p className="sbp-sheet-body" style={{ marginBottom: 10 }}>
          «{track.title}» — {track.artist}
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
                  const state = rowState[p.id] ?? "idle";
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className="add-to-playlist-row"
                      disabled={state === "adding" || state === "added" || state === "duplicate"}
                      onClick={() => void addTo(p.id)}
                    >
                      <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                        <span className="add-to-playlist-row-name">{p.name}</span>
                        <span className="text-muted fs-micro"> · {p.trackCount} тр.</span>
                      </span>
                      {state === "adding" && <CircleNotch size={16} className="spin" />}
                      {state === "added" && <Check size={16} weight="bold" className="text-success" />}
                      {state === "duplicate" && <span className="text-muted fs-micro">уже есть</span>}
                    </button>
                  );
                })}

                {creating ? (
                  <div className="add-to-playlist-create-row">
                    <input
                      className="add-to-playlist-input"
                      placeholder="Название плейлиста"
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
