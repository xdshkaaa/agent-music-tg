import type { CSSProperties, ReactNode } from "react";
import { ARTWORK_ROW, artworkUrl } from "../lib/artwork";

/**
 * Shared visual shell for every clickable track/playlist/download row across
 * the app: artwork (or icon fallback) + title/meta block + a trailing slot
 * for whatever action buttons that screen needs. Each screen keeps its own
 * download/save/playlist-add logic — this only kills the repeated markup.
 *
 * The artwork/title/meta block is its own `<button>` rather than a role="button"
 * wrapper around everything: `trailing` carries real buttons (download, the
 * kebab menu), and a button can't nest other buttons — screen readers flatten
 * the row and the inner controls become unreachable.
 */
export function TrackRow({
  onClick,
  className,
  style,
  artwork,
  fallbackIcon,
  title,
  meta,
  metaClassName = "fs-label",
  artworkBadge,
  trailing,
  ariaExpanded,
}: {
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  artwork?: string | null;
  fallbackIcon?: ReactNode;
  title: ReactNode;
  meta: ReactNode;
  metaClassName?: string;
  artworkBadge?: ReactNode;
  trailing?: ReactNode;
  ariaExpanded?: boolean;
}) {
  const body = (
    <>
      <div className="track-artwork-wrap">
        {artwork ? (
          <img
            className="track-artwork"
            src={artworkUrl(artwork, ARTWORK_ROW)}
            alt=""
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className={fallbackIcon ? "track-artwork track-artwork--icon" : "track-artwork"}>{fallbackIcon}</div>
        )}
        {artworkBadge && <span className="track-artwork-badge">{artworkBadge}</span>}
      </div>
      <div className="track-row-copy">
        <p className="search-row-title">{title}</p>
        <p className={`text-muted ${metaClassName}`}>{meta}</p>
      </div>
    </>
  );

  return (
    <div className={["track-row", className].filter(Boolean).join(" ")} style={style}>
      {onClick ? (
        <button type="button" className="track-row-main" aria-expanded={ariaExpanded} onClick={onClick}>
          {body}
        </button>
      ) : (
        <div className="track-row-main">{body}</div>
      )}
      {trailing}
    </div>
  );
}
